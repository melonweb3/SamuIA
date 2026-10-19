import type { LiveIncident, LiveMatchRecord } from '../../shared/src/index';
export interface MatchDataProvider {
  readonly name: string;
  getMatches(signal: AbortSignal): Promise<LiveMatchRecord[]>;
}
export interface LiveCommentaryProvider {
  readonly name: string;
  getCommentary(matches: LiveMatchRecord[], signal: AbortSignal): Promise<LiveIncident[]>;
}
export interface CommunityInput {
  id: string;
  username: string;
  message: string;
  matchId: string;
  timestamp: number;
}
export interface CommunityCommentProvider {
  readonly name: string;
  process(input: CommunityInput, now: number): CommunityInput | null;
}
/** Own-app messages only. No outbound messages and no social-network credentials. */
export class AppCommunityCommentProvider implements CommunityCommentProvider {
  readonly name = 'Comunidad de SamuIA';
  private seen = new Map<string, number>();
  process(input: CommunityInput, now: number) {
    for (const [key, at] of this.seen) if (now - at > 600000) this.seen.delete(key);
    if (
      !input.id ||
      !input.matchId ||
      !input.username.trim() ||
      !input.message.trim() ||
      input.username.length > 40 ||
      input.message.length > 500 ||
      !Number.isFinite(input.timestamp)
    )
      throw new Error('Comentario de comunidad inválido');
    const key = `${input.matchId}:${input.id}`;
    if (this.seen.has(key)) return null;
    this.seen.set(key, now);
    while (this.seen.size > 5000) this.seen.delete(this.seen.keys().next().value!);
    return { ...input, username: input.username.trim(), message: input.message.trim() };
  }
}
