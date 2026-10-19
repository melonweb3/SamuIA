import {
  type MatchEvent,
  type MatchState,
  type StudioSettings,
  type SportsEventQueueItem,
} from '../../shared/src/index';
import type { MatchManager } from '../../football-engine/src/index';
const weights = {
  kickoff: 70,
  second_half: 70,
  goal: 100,
  penalty: 90,
  red: 90,
  var: 80,
  chance: 60,
  missed_chance: 60,
  fulltime: 60,
  halftime: 30,
  yellow: 20,
  substitution: 10,
};
export class SportsReactionScheduler {
  sportsEventQueue: SportsEventQueueItem[] = [];
  recentReactions: number[] = [];
  lastReactionAt = -Infinity;
  enqueue(event: MatchEvent, match: MatchState, importance: number, settings: StudioSettings) {
    const subscription = match.subscription;
    if (
      !subscription.tracking ||
      subscription.reactions.paused ||
      !subscription.reactions.events[event.type]
    )
      return false;
    const favorite =
      settings.reactToFavorites &&
      settings.favoriteTeams.some((t) => [match.home.name, match.away.name].includes(t));
    const score =
      weights[event.type] +
      { ALTA: 30, MEDIA: 15, BAJA: 0 }[subscription.priority] +
      importance +
      (favorite ? 5 : 0) +
      (settings.favoriteLeagues.includes(match.leagueId) ? 3 : 0) -
      (match.lastReaction && event.timestamp - match.lastReaction.at < 10000 ? 15 : 0);
    const group = this.sportsEventQueue.find(
      (i) =>
        i.event.matchId === match.id &&
        weights[i.event.type] <= 20 &&
        weights[event.type] <= 20 &&
        event.timestamp - i.event.timestamp < 15000,
    );
    if (group) {
      group.groupedCount++;
      group.reactionPriorityScore = Math.max(group.reactionPriorityScore, score) + 2;
    } else
      this.sportsEventQueue.push({
        id: event.id,
        event,
        reactionPriorityScore: score,
        groupedCount: 1,
      });
    this.sportsEventQueue.sort(
      (a, b) =>
        b.reactionPriorityScore - a.reactionPriorityScore || a.event.timestamp - b.event.timestamp,
    );
    this.sportsEventQueue = this.sportsEventQueue.slice(0, 100);
    return true;
  }
  take(manager: MatchManager, settings: StudioSettings, now: number) {
    this.recentReactions = this.recentReactions.filter((t) => now - t < 60000);
    this.sportsEventQueue = this.sportsEventQueue.filter((i) => {
      const m = manager.activeMatches.find((m) => m.id === i.event.matchId);
      return (
        m &&
        m.subscription.tracking &&
        !m.subscription.reactions.paused &&
        m.subscription.reactions.events[i.event.type] &&
        manager.leagues.some((l) => l.id === m.leagueId && l.enabled) &&
        now - i.event.timestamp < (weights[i.event.type] <= 20 ? 20000 : 180000)
      );
    });
    if (
      !settings.autoReactions ||
      now - this.lastReactionAt < settings.reactionCooldown * 1000 ||
      this.recentReactions.length >= settings.maxReactionsPerMinute
    )
      return;
    const index = this.sportsEventQueue.findIndex(
      (i) => weights[i.event.type] > 20 || now - i.event.timestamp >= 3000,
    );
    if (index < 0) return;
    const [item] = this.sportsEventQueue.splice(index, 1);
    this.lastReactionAt = now;
    this.recentReactions.push(now);
    return item;
  }
  removeMatch(matchId: string) {
    this.sportsEventQueue = this.sportsEventQueue.filter((i) => i.event.matchId !== matchId);
  }
}
