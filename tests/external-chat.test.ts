import { describe, it, expect, vi } from 'vitest';
import { generateKeyPairSync, sign } from 'node:crypto';
import {
  YouTubeChatProvider,
  TwitchChatProvider,
  parseTwitchMessage,
  TikTokChatProvider,
  ExternalChatManager,
  type ExternalChatProvider,
} from '../packages/external-chat/src/index';
import { createMultiplatform } from '../apps/server/src/multiplatform-config';
describe('external chat adapters', () => {
  it('normalizes YouTube text messages and respects provider polling interval and cursor', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          nextPageToken: 'next',
          pollingIntervalMillis: 7000,
          items: [
            {
              id: 'm',
              snippet: {
                type: 'textMessageEvent',
                publishedAt: new Date().toISOString(),
                textMessageDetails: { messageText: 'Vamos' },
              },
              authorDetails: { channelId: 'u', displayName: 'Ana' },
            },
          ],
        }),
      ),
    );
    try {
      const provider = new YouTubeChatProvider('live-chat', 'private-test-token');
      const batch = await provider.poll(new AbortController().signal);
      expect(batch.pollAfterMs).toBe(7000);
      expect(batch.messages[0]).toMatchObject({
        platform: 'youtube',
        id: 'm',
        liveId: 'live-chat',
        userId: 'u',
        message: 'Vamos',
      });
      expect(batch.messages[0]).not.toHaveProperty('token');
    } finally {
      fetch.mockRestore();
    }
  });
  it('parses Twitch message IDs, user identity, timestamp and reply tags', () => {
    const m = parseTwitchMessage(
      '@id=m1;user-id=u1;tmi-sent-ts=1000000;room-id=r1;display-name=Ana;reply-parent-msg-id=parent :ana!ana@ana.tmi.twitch.tv PRIVMSG #samu :¿Qué opinas?',
      'samu',
      1000000,
      'broadcast-1',
    );
    expect(m).toMatchObject({
      platform: 'twitch',
      id: 'm1',
      userId: 'u1',
      liveId: 'broadcast-1',
      replyTo: { id: 'parent' },
      timestamp: 1000000,
    });
    expect(parseTwitchMessage('PING :tmi.twitch.tv', 'samu')).toBeNull();
  });
  it('negotiates official Twitch tags, answers PING and preserves a reply on the live connection', async () => {
    class Socket extends EventTarget {
      readyState = 0;
      sent: string[] = [];
      send(text: string) {
        this.sent.push(text);
      }
      close() {
        this.readyState = 3;
        this.dispatchEvent(new Event('close'));
      }
      open() {
        this.readyState = 1;
        this.dispatchEvent(new Event('open'));
      }
      message(text: string) {
        this.dispatchEvent(new MessageEvent('message', { data: text }));
      }
    }
    const socket = new Socket();
    const provider = new TwitchChatProvider(
      'samu',
      'justinfan123456',
      '',
      'broadcast-1',
      () => socket as unknown as WebSocket,
    );
    const pending = provider.poll(new AbortController().signal);
    socket.open();
    expect(socket.sent).toContain('CAP REQ :twitch.tv/tags twitch.tv/commands');
    expect(socket.sent).toContain('JOIN #samu');
    socket.message(':samu!samu@samu.tmi.twitch.tv JOIN #samu\r\n');
    await pending;
    socket.message('PING :tmi.twitch.tv\r\n');
    expect(socket.sent).toContain('PONG :tmi.twitch.tv');
    socket.message(
      '@id=m;user-id=u;tmi-sent-ts=1000000;display-name=Ana;reply-parent-msg-id=parent :ana!ana@ana.tmi.twitch.tv PRIVMSG #samu :Vamos Celta\r\n',
    );
    const batch = await provider.poll(new AbortController().signal);
    expect(batch.messages[0]).toMatchObject({
      id: 'm',
      liveId: 'broadcast-1',
      replyTo: { id: 'parent' },
    });
    provider.close();
  });
  it('degrades restricted TikTok access without a guessed private or scraped endpoint', () => {
    const provider = new TikTokChatProvider();
    expect(provider.configured).toBe(false);
    expect(provider.restricted).toBe(true);
    const manager = new ExternalChatManager([provider], () => {});
    manager.enable('tiktok', true);
    expect(manager.snapshot()[0].status).toBe('restricted');
    manager.stop();
  });
  it('isolates provider errors and ignores responses after OFF', async () => {
    let resolve!: (v: { messages: never[]; pollAfterMs: number }) => void;
    const slow: ExternalChatProvider = {
      platform: 'youtube',
      configured: true,
      description: 'slow',
      poll: () =>
        new Promise((r) => {
          resolve = r;
        }),
      close: vi.fn(),
    };
    const healthy: ExternalChatProvider = {
      platform: 'twitch',
      configured: true,
      description: 'healthy',
      poll: async () => ({ messages: [], pollAfterMs: 3000 }),
      close: vi.fn(),
    };
    const receive = vi.fn(),
      manager = new ExternalChatManager([slow, healthy], receive);
    manager.enable('youtube', true, 1000);
    manager.enable('twitch', true, 1000);
    manager.tick(1000);
    manager.enable('youtube', false, 1001);
    resolve({ messages: [], pollAfterMs: 1000 });
    await new Promise((r) => setTimeout(r, 0));
    expect(manager.snapshot()[0].status).toBe('disabled');
    expect(manager.snapshot()[1].status).toBe('connected');
    expect(receive).not.toHaveBeenCalled();
    manager.stop();
  });
  it('verifies Kick webhook signatures and refuses forged/replayed-old bodies', () => {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const receive = vi.fn();
    const services = createMultiplatform(receive, {
      FFMPEG_PATH: 'missing-ffmpeg-for-test',
      KICK_LIVE_ID: 'live-kick',
      KICK_WEBHOOK_PUBLIC_KEY: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    });
    services.chats.enable('kick', true);
    const now = Date.now(),
      timestamp = new Date(now).toISOString(),
      id = 'delivery1',
      body = Buffer.from(
        JSON.stringify({
          message_id: 'm',
          content: 'Vamos Celta',
          created_at: timestamp,
          sender: { user_id: 1, username: 'Ana' },
        }),
      );
    const signature = sign(
      'RSA-SHA256',
      Buffer.concat([Buffer.from(`${id}.${timestamp}.`), body]),
      privateKey,
    ).toString('base64');
    const headers = {
      'kick-event-message-id': id,
      'kick-event-message-timestamp': timestamp,
      'kick-event-signature': signature,
      'kick-event-type': 'chat.message.sent',
    };
    expect(services.receiveKick(headers, body, now)).toBe(true);
    expect(services.receiveKick({ ...headers, 'kick-event-signature': 'fake' }, body, now)).toBe(
      false,
    );
    expect(services.receiveKick(headers, body, now + 600000)).toBe(false);
    services.chats.stop();
    services.broadcast.stop();
  });
});
