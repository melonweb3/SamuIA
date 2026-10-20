import { verify } from 'node:crypto';
import { BroadcastOutputManager } from '../../../packages/broadcast/src/index';
import {
  ExternalChatManager,
  YouTubeChatProvider,
  TwitchChatProvider,
  KickChatProvider,
  TikTokChatProvider,
} from '../../../packages/external-chat/src/index';
import type { ExternalChatMessage } from '../../../packages/shared/src/index';
import {
  FFmpegEncoder,
  ffmpegAvailable,
  ffmpegSupportsFlite,
  YouTubeBroadcastOutput,
  TwitchBroadcastOutput,
  KickBroadcastOutput,
  TikTokBroadcastOutput,
} from './broadcast-encoder';
import { BroadcastVoiceProvider } from './broadcast-voice';
export function createMultiplatform(
  receive: (message: ExternalChatMessage) => void,
  env: NodeJS.ProcessEnv = process.env,
) {
  const binary = env.FFMPEG_PATH || 'ffmpeg',
    available = ffmpegAvailable(binary);
  const kick = new KickChatProvider(
    !!env.KICK_WEBHOOK_PUBLIC_KEY && !!env.KICK_LIVE_ID,
    env.KICK_LIVE_ID ?? '',
  );
  const twitch = new TwitchChatProvider(
    env.TWITCH_CHANNEL ?? '',
    env.TWITCH_CHAT_USERNAME || undefined,
    env.TWITCH_CHAT_TOKEN ?? '',
    env.TWITCH_LIVE_ID ?? '',
  );
  const chats = new ExternalChatManager(
    [
      new YouTubeChatProvider(
        env.YOUTUBE_LIVE_CHAT_ID ?? '',
        env.YOUTUBE_ACCESS_TOKEN ?? '',
        env.YOUTUBE_VIDEO_ID || env.YOUTUBE_LIVE_CHAT_ID || '',
      ),
      twitch,
      kick,
      new TikTokChatProvider(env.TIKTOK_CHAT_RELAY_URL ?? '', env.TIKTOK_CHAT_RELAY_TOKEN ?? ''),
    ],
    receive,
  );
  const output = (prefix: string) => ({
    url: env[`${prefix}_RTMP_URL`],
    streamKey: env[`${prefix}_STREAM_KEY`],
    token: env[`${prefix}_ACCESS_TOKEN`],
    clientId: env[`${prefix}_CLIENT_ID`],
    channelId: env[`${prefix}_CHANNEL_ID`],
    videoId: env[`${prefix}_VIDEO_ID`],
  });
  const voice =
    available && env.BROADCAST_TTS === 'flite' && ffmpegSupportsFlite(binary)
      ? new BroadcastVoiceProvider(binary)
      : null;
  const broadcast = new BroadcastOutputManager(
    new FFmpegEncoder(binary),
    [
      new YouTubeBroadcastOutput(output('YOUTUBE'), binary),
      new TwitchBroadcastOutput(output('TWITCH'), binary),
      new KickBroadcastOutput(output('KICK'), binary),
      new TikTokBroadcastOutput(output('TIKTOK'), binary),
    ],
    available,
    !!voice,
  );
  const receiveKick = (
    headers: Record<string, string | string[] | undefined>,
    body: Buffer,
    now = Date.now(),
  ) => {
    if (
      !env.KICK_WEBHOOK_PUBLIC_KEY ||
      !chats.snapshot().find((s) => s.platform === 'kick')?.enabled
    )
      return false;
    const id = headers['kick-event-message-id'],
      timestamp = headers['kick-event-message-timestamp'],
      signature = headers['kick-event-signature'];
    if (
      typeof id !== 'string' ||
      typeof timestamp !== 'string' ||
      typeof signature !== 'string' ||
      Math.abs(now - Date.parse(timestamp)) > 300000 ||
      !Number.isFinite(Date.parse(timestamp))
    )
      return false;
    const key = env.KICK_WEBHOOK_PUBLIC_KEY.replace(/\\n/g, '\n');
    try {
      if (
        !verify(
          'RSA-SHA256',
          Buffer.concat([Buffer.from(`${id}.${timestamp}.`), body]),
          key,
          Buffer.from(signature, 'base64'),
        )
      )
        return false;
      if (headers['kick-event-type'] !== 'chat.message.sent') return true;
      kick.receive(JSON.parse(body.toString('utf8')), now);
      return true;
    } catch {
      return false;
    }
  };
  return { chats, broadcast, voice, receiveKick };
}
