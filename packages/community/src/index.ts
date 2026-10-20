import { normalize, type CommunitySummary, type ExternalChatMessage } from '../../shared/src/index';
export interface CommunitySample {
  id: string;
  platform: ExternalChatMessage['platform'] | 'simulator';
  liveId: string;
  userId: string;
  username: string;
  message: string;
  timestamp: number;
  matchId?: string;
  simulated?: boolean;
}
const topicRules: [string, RegExp][] = [
  ['penalti', /penal|penalty/],
  ['VAR', /\bvar\b|arbitro|robo/],
  ['gol', /\bgol|go+al/],
  ['cambios', /cambio|banquillo|substitut/],
  ['predicciones', /predic|mojate|proximo gol/],
  ['rendimiento', /juega|jugando|partido|ocasion|portero/],
];
export class CommunityAnalyzer {
  private samples: CommunitySample[] = [];
  private seen = new Map<string, number>();
  private rates = new Map<string, number[]>();
  private rejected: Record<string, number> = {};
  constructor(
    private options: { windowMs?: number; blockedWords?: string[]; bots?: string[] } = {},
  ) {}
  private reject(reason: string) {
    this.rejected[reason] = (this.rejected[reason] ?? 0) + 1;
    return false;
  }
  ingest(message: CommunitySample, now = Date.now(), moderate = true, isBot = false) {
    const windowMs = this.options.windowMs ?? 120000;
    this.samples = this.samples.filter((m) => now - m.timestamp <= windowMs);
    for (const [key, at] of this.seen) if (now - at > 900000) this.seen.delete(key);
    for (const [key, times] of this.rates)
      if (!times.some((t) => now - t < 10000)) this.rates.delete(key);
    if (
      !message.id ||
      !message.liveId ||
      !message.userId ||
      !message.username.trim() ||
      !message.message.trim() ||
      message.id.length > 1024 ||
      message.userId.length > 200 ||
      message.liveId.length > 200 ||
      message.username.length > 100 ||
      message.message.length > 2000 ||
      !Number.isFinite(message.timestamp) ||
      now - message.timestamp > 600000 ||
      message.timestamp > now + 60000
    )
      return this.reject('invalid');
    const id = JSON.stringify([message.platform, message.liveId, message.id]);
    if (this.seen.has(id)) return this.reject('duplicate');
    this.seen.set(id, now);
    while (this.seen.size > 10000) this.seen.delete(this.seen.keys().next().value!);
    const text = normalize(message.message);
    const user = JSON.stringify([message.platform, message.liveId, message.userId]);
    if (moderate) {
      if (isBot || this.options.bots?.some((bot) => normalize(bot) === normalize(message.username)))
        return this.reject('bot');
      if (
        /(.)\1{9,}|compra seguidores|buy followers|free viewers|gana dinero|https?:.*https?:/i.test(
          text,
        )
      )
        return this.reject('spam');
      const words = ['racista', 'matarte', 'hijo de puta', ...(this.options.blockedWords ?? [])];
      if (words.some((word) => text.includes(normalize(word)))) return this.reject('inappropriate');
      const recent = (this.rates.get(user) ?? []).filter((t) => now - t < 10000);
      if (recent.length >= 4) return this.reject('rate-limit');
      this.rates.set(user, [...recent, now]);
      if (
        this.samples.some(
          (m) =>
            m.platform === message.platform &&
            m.liveId === message.liveId &&
            m.userId === message.userId &&
            normalize(m.message) === text &&
            now - m.timestamp < 30000,
        )
      )
        return this.reject('repetition');
    }
    this.samples.push({ ...message });
    this.samples = this.samples.slice(-1000);
    return true;
  }
  summary(matchId?: string, now = Date.now()): CommunitySummary {
    const windowMs = this.options.windowMs ?? 120000;
    const samples = this.samples.filter(
      (m) => now - m.timestamp <= windowMs && (!matchId || m.matchId === matchId),
    );
    const byPlatform = [...new Set(samples.map((m) => m.platform))].map((platform) => {
      const subset = samples.filter((m) => m.platform === platform);
      const sentiment = (s: string) => {
        const n = normalize(s);
        const positive =
          /vamos|grande|bien|correcto|si era|\bjusto\b|brutal|golazo|buen|feliz|😂|🔥|👏/.test(n);
        const negative = /no era|no es|mal|robo|fatal|enfad|verguenza|horrible|injust|😡|😤/.test(
          n,
        );
        return positive === negative ? 0 : positive ? 1 : -1;
      };
      const users = new Map<string, CommunitySample>();
      for (const m of subset) users.set(`${m.liveId}:${m.userId}`, m);
      const voters = [...users.values()];
      const positive = voters.filter((m) => sentiment(m.message) > 0).length;
      const negative = voters.filter((m) => sentiment(m.message) < 0).length;
      return {
        platform,
        total: subset.length,
        users: users.size,
        positive,
        negative,
        neutral: users.size - positive - negative,
        divided:
          positive >= 2 &&
          negative >= 2 &&
          Math.min(positive, negative) / Math.max(1, positive + negative) >= 0.3,
        simulated: subset.every((m) => m.simulated || m.platform === 'simulator'),
      };
    });
    const topics = byPlatform
      .flatMap((p) =>
        topicRules.flatMap(([topic, pattern]) => {
          const messages = samples.filter(
            (m) => m.platform === p.platform && pattern.test(normalize(m.message)),
          );
          const users = new Set(messages.map((m) => `${m.liveId}:${m.userId}`)).size;
          return users >= 2 ? [{ topic, total: messages.length, users, platform: p.platform }] : [];
        }),
      )
      .sort((a, b) => b.users - a.users);
    return {
      sampleSize: samples.length,
      windowMs,
      filtered: { ...this.rejected },
      platforms: byPlatform,
      topics,
      questions: samples
        .filter((m) => /[?¿]|\b(opinas|como ves|por que|que piensas)\b/.test(normalize(m.message)))
        .slice(-10)
        .reverse()
        .map((m) => ({ id: m.id, username: m.username, platform: m.platform, message: m.message })),
    };
  }
  describe(matchId?: string, now = Date.now()) {
    const summary = this.summary(matchId, now),
      names: Record<string, string> = {
        youtube: 'YouTube',
        twitch: 'Twitch',
        kick: 'Kick',
        tiktok: 'TikTok',
        simulator: 'el chat de prueba',
      };
    if (!summary.sampleSize)
      return 'Todavía no hay mensajes recientes suficientes para resumir el chat.';
    const comments = summary.platforms
      .filter((p) => p.users >= 3)
      .map((p) => {
        const name = names[p.platform],
          prefix = p.simulated ? 'En la muestra simulada de ' : 'En ';
        const topic = summary.topics.find((t) => t.platform === p.platform);
        if (p.divided)
          return `${prefix}${name} hay división${topic ? ` sobre ${topic.topic}` : ''}: ${p.positive} participantes positivos y ${p.negative} críticos.`;
        if (p.positive / p.users >= 0.6)
          return `${prefix}${name} os estáis viniendo arriba${topic ? ` con ${topic.topic}` : ''}: ${p.positive} de ${p.users} participantes muestran entusiasmo.`;
        if (p.negative / p.users >= 0.6)
          return `${prefix}${name} se está calentando el debate${topic ? ` sobre ${topic.topic}` : ''}: ${p.negative} de ${p.users} participantes muestran descontento. Con respeto, meu.`;
        return `${prefix}${name} estoy leyendo ${p.total} mensajes de ${p.users} participantes${topic ? `; se repite ${topic.topic}` : ''}.`;
      });
    return comments.length
      ? comments.join(' ')
      : `Estoy leyendo ${summary.sampleSize} mensajes recientes; todavía son pocos participantes para atribuir una tendencia a cada plataforma.`;
  }
  sourceIds(matchId?: string, now = Date.now()) {
    return this.samples
      .filter(
        (m) =>
          now - m.timestamp <= (this.options.windowMs ?? 120000) &&
          (!matchId || m.matchId === matchId),
      )
      .map((m) => m.id);
  }
}
