import {
  id,
  normalize,
  type ChatMessage,
  type MatchState,
  type Scene,
} from '../../shared/src/index';
export function relatedMatch(text: string, matches: MatchState[]) {
  const normalized = ` ${normalize(text).replace(/[^a-z0-9]+/g, ' ')} `;
  return matches
    .map((match) => ({
      match,
      score: Math.max(
        0,
        ...[...match.home.aliases, ...match.away.aliases].map((alias) => {
          const a = normalize(alias).replace(/[^a-z0-9]+/g, ' ');
          return normalized.includes(` ${a} `) ? a.length : 0;
        }),
      ),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.match;
}
export function topic(text: string, matches: MatchState[]): Scene {
  const t = normalize(text);
  if (
    relatedMatch(text, matches) ||
    /partido|futbol|gol|interesante|igualado|empate|encuesta|comunidad|opina el chat|predic/.test(t)
  )
    return 'futbol';
  if (/gaming|videojuego|jugar/.test(t)) return 'gaming';
  if (/tecnolog|\bia\b|inteligencia artificial/.test(t)) return 'tecnologia';
  return 'charlando';
}
export function chatPriority(
  message: string,
  matches: MatchState[],
  repeated = false,
  regular = false,
  answered = false,
) {
  return (
    (/samu|\?/.test(normalize(message)) ? 40 : 0) +
    (relatedMatch(message, matches) ? 30 : 0) +
    (/regalo|donacion/.test(normalize(message)) ? 40 : 0) +
    (message.length > 15 ? 20 : 0) +
    (regular ? 10 : 0) -
    (repeated ? 30 : 0) -
    (/(.)\1{8,}|https?:\/\/|compra seguidores/i.test(message) ? 100 : 0) -
    (answered ? 80 : 0)
  );
}
export class ChatQueue {
  messages: ChatMessage[] = [];
  mutedUsers = new Set<string>();
  selectedId: string | null = null;
  get(messageId: string) {
    const m = this.messages.find((m) => m.id === messageId);
    if (!m) throw new Error('Comentario no encontrado');
    return m;
  }
  add(
    username: string,
    message: string,
    matches: MatchState[],
    now = Date.now(),
    matchId?: string,
  ) {
    const m: ChatMessage = {
      id: id(),
      username,
      message,
      platform: 'simulator',
      timestamp: now,
      priority: chatPriority(
        message,
        matches,
        this.messages.some((m) => normalize(m.message) === normalize(message)),
        this.messages.filter((m) => normalize(m.username) === normalize(username)).length > 2,
      ),
      status: this.mutedUsers.has(normalize(username)) ? 'muted' : 'pending',
      detectedTopic: topic(message, matches),
      relatedMatchId: relatedMatch(message, matches)?.id ?? matchId,
    };
    this.messages.push(m);
    if (this.messages.length > 300) {
      const selected = this.messages.filter((m) => m.status === 'selected');
      this.messages = [
        ...selected,
        ...this.pending().slice(0, 250 - selected.length),
        ...this.messages.filter((m) => !['pending', 'selected'].includes(m.status)).slice(-50),
      ];
    }
    return m;
  }
  pending() {
    return this.messages
      .filter((m) => m.status === 'pending')
      .sort((a, b) => b.priority - a.priority || a.timestamp - b.timestamp);
  }
  select(messageId: string) {
    const m = this.get(messageId);
    if (m.status !== 'pending' || this.selectedId)
      throw new Error('Ya hay un comentario seleccionado o este ya se ha procesado');
    m.status = 'selected';
    this.selectedId = m.id;
    return m;
  }
  finish() {
    if (this.selectedId) {
      const m = this.get(this.selectedId);
      m.status = 'answered';
      m.priority -= 80;
      this.selectedId = null;
    }
  }
  skip(messageId: string) {
    const m = this.get(messageId);
    if (m.status === 'selected') throw new Error('Usa Callar para detener la frase');
    m.status = 'skipped';
  }
  mute(messageId: string) {
    const username = normalize(this.get(messageId).username);
    this.mutedUsers.add(username);
    for (const m of this.messages)
      if (normalize(m.username) === username && m.status === 'pending') m.status = 'muted';
  }
  silence() {
    if (this.selectedId) this.get(this.selectedId).status = 'skipped';
    this.selectedId = null;
  }
}
