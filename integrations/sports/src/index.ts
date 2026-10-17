import type { SportsDataProvider } from '../../contracts';
import type { MatchEvent } from '../../../packages/shared/src/index';
import { MatchManager } from '../../../packages/football-engine/src/index';
export class MockSportsDataProvider implements SportsDataProvider {
  listeners = new Map<string, (event: MatchEvent) => void>();
  constructor(public manager = new MatchManager()) {}
  async getLeagues() {
    return structuredClone(this.manager.leagues);
  }
  async getMatches() {
    return structuredClone(this.manager.activeMatches);
  }
  async getMatchState(id: string) {
    return structuredClone(this.manager.get(id));
  }
  async getEvents(id: string) {
    return structuredClone(this.manager.get(id).events);
  }
  async getStatistics(id: string) {
    return structuredClone(this.manager.get(id).statistics);
  }
  async subscribeToMatch(id: string, listener: (event: MatchEvent) => void) {
    this.manager.get(id);
    this.listeners.set(id, listener);
  }
  async unsubscribeFromMatch(id: string) {
    this.listeners.delete(id);
  }
  emit(event: MatchEvent) {
    this.listeners.get(event.matchId)?.(event);
  }
}
