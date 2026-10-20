import {
  platforms,
  type ExternalChatMessage,
  type ExternalChatStatus,
  type Platform,
} from '../../shared/src/index';
export interface ExternalChatBatch {
  messages: ExternalChatMessage[];
  pollAfterMs: number;
  listening?: boolean;
}
export interface ExternalChatProvider {
  readonly platform: Platform;
  readonly configured: boolean;
  readonly restricted?: boolean;
  readonly description: string;
  poll(signal: AbortSignal): Promise<ExternalChatBatch>;
  close(): void;
}
export function validateExternalMessage(
  value: unknown,
  platform: Platform,
  now = Date.now(),
): ExternalChatMessage {
  if (!value || typeof value !== 'object') throw new Error('Mensaje externo inválido');
  const m = value as ExternalChatMessage;
  for (const key of ['id', 'liveId', 'userId', 'username', 'message'] as const)
    if (
      typeof m[key] !== 'string' ||
      !m[key].trim() ||
      m[key].length > (key === 'message' ? 2000 : 200)
    )
      throw new Error('Mensaje externo inválido');
  if (!Number.isFinite(m.timestamp)) throw new Error('Timestamp externo inválido');
  if (m.replyTo && (typeof m.replyTo.id !== 'string' || m.replyTo.id.length > 200))
    throw new Error('Reply externo inválido');
  return {
    platform,
    id: m.id,
    liveId: m.liveId,
    userId: m.userId,
    username: m.username,
    message: m.message,
    timestamp: m.timestamp,
    receivedAt: now,
    ...(m.replyTo
      ? { replyTo: { id: m.replyTo.id, userId: m.replyTo.userId, username: m.replyTo.username } }
      : {}),
    isBot: m.isBot === true,
  };
}
export class ChatProviderError extends Error {
  constructor(
    public code: string,
    public retryAfterMs = 0,
  ) {
    super(code);
  }
}
export async function chatJson(
  url: string,
  headers: Record<string, string>,
  signal: AbortSignal,
): Promise<unknown> {
  const response = await fetch(url, { headers, signal, redirect: 'error' });
  if (!response.ok)
    throw new ChatProviderError(
      `http-${response.status}`,
      Math.min(300000, Number(response.headers.get('retry-after') ?? 0) * 1000 || 0),
    );
  const reader = response.body?.getReader();
  if (!reader) throw new ChatProviderError('chat-empty-response');
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 1024 * 1024) throw new ChatProviderError('chat-response-too-large');
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
export class YouTubeChatProvider implements ExternalChatProvider {
  readonly platform = 'youtube';
  readonly description = 'YouTube Data API · liveChatMessages.list';
  readonly configured: boolean;
  private pageToken: string | undefined;
  constructor(
    private liveChatId: string,
    private token: string,
    private broadcastId = liveChatId,
  ) {
    this.configured = !!liveChatId && !!token;
  }
  async poll(signal: AbortSignal): Promise<ExternalChatBatch> {
    if (!this.configured) throw new ChatProviderError('youtube-oauth-and-live-chat-required');
    const url = new URL('https://www.googleapis.com/youtube/v3/liveChat/messages');
    url.search = new URLSearchParams({
      liveChatId: this.liveChatId,
      part: 'snippet,authorDetails',
      maxResults: '200',
      ...(this.pageToken ? { pageToken: this.pageToken } : {}),
    }).toString();
    const payload = (await chatJson(
      url.toString(),
      { Authorization: `Bearer ${this.token}` },
      signal,
    )) as {
      nextPageToken?: string;
      pollingIntervalMillis?: number;
      items?: {
        id: string;
        snippet: {
          type: string;
          publishedAt: string;
          displayMessage?: string;
          textMessageDetails?: { messageText: string };
        };
        authorDetails: { channelId: string; displayName: string };
      }[];
    };
    if (!Array.isArray(payload.items)) throw new ChatProviderError('youtube-response-invalid');
    const messages = payload.items
      .filter((i) => i.snippet?.type === 'textMessageEvent')
      .map((i) =>
        validateExternalMessage(
          {
            id: i.id,
            liveId: this.broadcastId,
            userId: i.authorDetails.channelId,
            username: i.authorDetails.displayName,
            message: i.snippet.textMessageDetails?.messageText ?? i.snippet.displayMessage,
            timestamp: Date.parse(i.snippet.publishedAt),
          },
          'youtube',
        ),
      );
    this.pageToken = payload.nextPageToken;
    return { messages, pollAfterMs: Math.max(1000, Number(payload.pollingIntervalMillis) || 5000) };
  }
  close() {
    /* Cursor survives temporary reconnects; deduplication also survives. */
  }
}
export function parseTwitchMessage(
  line: string,
  channel: string,
  now = Date.now(),
  liveId = channel,
): ExternalChatMessage | null {
  const match = line.match(/^@([^ ]+) :([^!]+)![^ ]+ PRIVMSG #([^ ]+) :(.*)$/);
  if (!match || match[3].toLowerCase() !== channel.toLowerCase()) return null;
  const unescape = (s: string) =>
    s.replace(
      /\\([s:rn\\])/g,
      (_, c: string) => ({ s: ' ', ':': ';', r: '\r', n: '\n', '\\': '\\' })[c] ?? c,
    );
  const tags = Object.fromEntries(
    match[1].split(';').map((tag) => {
      const at = tag.indexOf('=');
      return [tag.slice(0, at), unescape(tag.slice(at + 1))];
    }),
  );
  if (!tags.id || !tags['user-id'] || !tags['tmi-sent-ts']) return null;
  return validateExternalMessage(
    {
      id: tags.id,
      liveId,
      userId: tags['user-id'],
      username: tags['display-name'] || match[2],
      message: match[4],
      timestamp: Number(tags['tmi-sent-ts']),
      ...(tags['reply-parent-msg-id']
        ? {
            replyTo: {
              id: tags['reply-parent-msg-id'],
              userId: tags['reply-parent-user-id'],
              username: tags['reply-parent-display-name'],
            },
          }
        : {}),
    },
    'twitch',
    now,
  );
}
export class TwitchChatProvider implements ExternalChatProvider {
  readonly platform = 'twitch';
  readonly description = 'Twitch IRC por WebSocket oficial · solo lectura';
  readonly configured: boolean;
  private socket: WebSocket | null = null;
  private messages: ExternalChatMessage[] = [];
  private failure = false;
  constructor(
    private channel: string,
    private nick = `justinfan${Math.floor(100000 + Math.random() * 900000)}`,
    private token = '',
    private liveId = '',
    private factory = (url: string) => new WebSocket(url),
  ) {
    this.configured = /^[a-z0-9_]{1,40}$/i.test(channel) && !!liveId;
  }
  async poll(signal: AbortSignal): Promise<ExternalChatBatch> {
    if (!this.configured) throw new ChatProviderError('twitch-channel-required');
    if (this.failure) {
      this.close();
      this.failure = false;
      throw new ChatProviderError('twitch-connection-lost');
    }
    if (!this.socket || this.socket.readyState !== 1) {
      await new Promise<void>((resolve, reject) => {
        const socket = this.factory('wss://irc-ws.chat.twitch.tv:443');
        this.socket = socket;
        const abort = () => {
          socket.close();
          reject(new ChatProviderError('twitch-timeout'));
        };
        signal.addEventListener('abort', abort, { once: true });
        socket.addEventListener('open', () => {
          if (this.socket !== socket) return;
          socket.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
          if (this.token) socket.send(`PASS oauth:${this.token.replace(/^oauth:/, '')}`);
          socket.send(`NICK ${this.nick}`);
          socket.send(`JOIN #${this.channel}`);
        });
        socket.addEventListener('message', (event) => {
          if (this.socket !== socket) return;
          for (const line of String(event.data).split('\r\n')) {
            if (line.startsWith('PING ')) socket.send(line.replace(/^PING/, 'PONG'));
            if (line.includes(' 366 ') || line.includes(` JOIN #${this.channel}`)) {
              signal.removeEventListener('abort', abort);
              resolve();
            }
            if (/ RECONNECT|Login authentication failed|Improperly formatted auth/.test(line)) {
              this.failure = true;
              socket.close();
            }
            try {
              const message = parseTwitchMessage(line, this.channel, Date.now(), this.liveId);
              if (message) {
                this.messages.push(message);
                this.messages = this.messages.slice(-500);
              }
            } catch {
              /* Invalid wire messages never enter the analyzer. */
            }
          }
        });
        socket.addEventListener('error', () => {
          if (this.socket !== socket) return;
          this.failure = true;
          signal.removeEventListener('abort', abort);
          reject(new ChatProviderError('twitch-socket-error'));
        });
        socket.addEventListener('close', () => {
          if (this.socket !== socket) return;
          this.failure = true;
          signal.removeEventListener('abort', abort);
          reject(new ChatProviderError('twitch-socket-closed'));
        });
      });
    }
    return { messages: this.messages.splice(0), pollAfterMs: 1000, listening: true };
  }
  close() {
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    this.messages = [];
  }
}
/** A signed webhook receiver on the server supplies Kick messages through this queue. */
export class KickChatProvider implements ExternalChatProvider {
  readonly platform = 'kick';
  readonly description = 'Kick · webhook oficial chat.message.sent firmado';
  private messages: ExternalChatMessage[] = [];
  constructor(
    readonly configured: boolean,
    private liveId: string,
  ) {}
  receive(payload: unknown, now = Date.now()) {
    const body = payload as {
      message_id?: string;
      id?: string;
      content?: string;
      created_at?: string;
      sender?: { user_id: number; username: string };
      replies_to?: { message_id: string; sender?: { user_id: number; username: string } };
    };
    const sender = body?.sender;
    const message = validateExternalMessage(
      {
        id: body.message_id ?? body.id,
        liveId: this.liveId,
        userId: String(sender?.user_id ?? ''),
        username: sender?.username,
        message: body.content,
        timestamp: Date.parse(body.created_at ?? ''),
        ...(body.replies_to
          ? {
              replyTo: {
                id: body.replies_to.message_id,
                userId: String(body.replies_to.sender?.user_id ?? ''),
                username: body.replies_to.sender?.username,
              },
            }
          : {}),
      },
      'kick',
      now,
    );
    this.messages.push(message);
    this.messages = this.messages.slice(-500);
  }
  async poll(): Promise<ExternalChatBatch> {
    return { messages: this.messages.splice(0), pollAfterMs: 1000, listening: true };
  }
  close() {
    this.messages = [];
  }
}
export class TikTokChatProvider implements ExternalChatProvider {
  readonly platform = 'tiktok';
  readonly restricted = true;
  readonly description = 'TikTok LIVE · requiere fuente oficial autorizada/relay aprobado';
  readonly configured: boolean;
  private cursor: string | undefined;
  constructor(
    private url = '',
    private token = '',
  ) {
    this.configured = !!url && !!token;
  }
  async poll(signal: AbortSignal): Promise<ExternalChatBatch> {
    if (!this.configured) throw new ChatProviderError('tiktok-approved-chat-access-required');
    const url = new URL(this.url);
    if (this.cursor) url.searchParams.set('cursor', this.cursor);
    const payload = (await chatJson(
      url.toString(),
      { Authorization: `Bearer ${this.token}` },
      signal,
    )) as { messages: unknown[]; cursor?: string; pollAfterMs?: number };
    if (!Array.isArray(payload.messages) || payload.messages.length > 500)
      throw new ChatProviderError('tiktok-relay-invalid');
    const messages = payload.messages.map((m) => validateExternalMessage(m, 'tiktok'));
    this.cursor = payload.cursor;
    return { messages, pollAfterMs: Math.max(1000, Number(payload.pollAfterMs) || 5000) };
  }
  close() {}
}
interface Slot {
  provider: ExternalChatProvider;
  state: ExternalChatStatus;
  busy: boolean;
  generation: number;
  abort?: AbortController;
  failures: number;
}
export class ExternalChatManager {
  private slots: Slot[];
  constructor(
    providers: ExternalChatProvider[],
    private receive: (message: ExternalChatMessage) => void,
  ) {
    this.slots = providers.map((provider) => ({
      provider,
      state: {
        platform: provider.platform,
        enabled: false,
        status: !provider.configured
          ? provider.restricted
            ? 'restricted'
            : 'unconfigured'
          : 'disabled',
        message: provider.description,
        received: 0,
        lastMessageAt: null,
        nextRetryAt: null,
      },
      busy: false,
      generation: 0,
      failures: 0,
    }));
  }
  enable(platform: Platform, enabled: boolean, now = Date.now()) {
    const slot = this.slots.find((s) => s.provider.platform === platform);
    if (!slot) throw new Error('Plataforma desconocida');
    slot.generation++;
    slot.abort?.abort();
    slot.provider.close();
    slot.state.enabled = enabled;
    slot.state.status = !slot.provider.configured
      ? slot.provider.restricted
        ? 'restricted'
        : 'unconfigured'
      : enabled
        ? 'connecting'
        : 'disabled';
    slot.state.nextRetryAt = enabled && slot.provider.configured ? now : null;
  }
  tick(now = Date.now()) {
    for (const slot of this.slots)
      if (
        slot.state.enabled &&
        slot.provider.configured &&
        !slot.busy &&
        now >= (slot.state.nextRetryAt ?? 0)
      )
        void this.poll(slot, now);
  }
  private async poll(slot: Slot, now: number) {
    slot.busy = true;
    const generation = slot.generation,
      controller = new AbortController();
    slot.abort = controller;
    let timeout: ReturnType<typeof setTimeout>;
    const aborted = new Promise<never>((_, reject) => {
      controller.signal.addEventListener(
        'abort',
        () => reject(new ChatProviderError('chat-timeout')),
        { once: true },
      );
      timeout = setTimeout(() => controller.abort(), 10000);
    });
    try {
      const batch = await Promise.race([slot.provider.poll(controller.signal), aborted]);
      if (generation !== slot.generation) return;
      for (const raw of batch.messages.slice(0, 500)) {
        const message = validateExternalMessage(raw, slot.provider.platform, now);
        this.receive(message);
        slot.state.received++;
        slot.state.lastMessageAt = now;
      }
      slot.failures = 0;
      slot.state.status = batch.messages.length
        ? 'connected'
        : batch.listening
          ? 'listening'
          : 'connected';
      slot.state.message = slot.provider.description;
      slot.state.nextRetryAt = now + Math.min(300000, Math.max(1000, batch.pollAfterMs));
    } catch (error) {
      if (generation !== slot.generation) return;
      slot.provider.close();
      slot.failures++;
      slot.state.status = 'reconnecting';
      slot.state.message =
        error instanceof ChatProviderError ? error.code : 'chat-provider-unavailable';
      slot.state.nextRetryAt =
        now +
        Math.max(
          Math.min(60000, 1000 * 2 ** Math.min(6, slot.failures - 1)),
          error instanceof ChatProviderError ? error.retryAfterMs : 0,
        );
    } finally {
      clearTimeout(timeout!);
      slot.busy = false;
    }
  }
  snapshot() {
    return structuredClone(this.slots.map((s) => s.state));
  }
  stop() {
    for (const p of platforms)
      if (this.slots.some((s) => s.provider.platform === p)) this.enable(p, false);
  }
}
