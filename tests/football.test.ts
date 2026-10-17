import { describe, it, expect } from 'vitest';
import {
  MatchManager,
  calculateProbabilities,
  excitementScore,
} from '../packages/football-engine/src/index';
import { defaultSettings } from '../packages/shared/src/index';
describe('MatchManager', () => {
  it('mantiene cuatro encuentros independientes y permite añadir y eliminar', () => {
    const m = new MatchManager();
    expect(m.activeMatches).toHaveLength(4);
    m.receiveEvent('celta-madrid', 'goal', 'home');
    expect(m.get('celta-madrid').score.home).toBe(1);
    expect(m.get('liverpool-arsenal').score.home).toBe(0);
    const added = m.add('serie-a', 'Inter', 'Juventus', 'upcoming');
    m.setMain(added.id);
    m.remove(added.id);
    expect(m.mainMatchId).toBeNull();
    expect(m.currentMatchId).not.toBe(added.id);
  });
  it('actualiza estadísticas, descanso y final; no acepta goles después del final', () => {
    const m = new MatchManager();
    m.receiveEvent('celta-madrid', 'chance', 'home');
    m.receiveEvent('celta-madrid', 'red', 'away');
    const state = m.get('celta-madrid');
    expect(state.statistics.home.xG).toBeCloseTo(0.22);
    expect(state.statistics.home.corners).toBe(1);
    expect(state.statistics.away.red).toBe(1);
    expect(state.statistics.home.possession + state.statistics.away.possession).toBe(100);
    m.receiveEvent(state.id, 'halftime', 'home');
    expect(state.minute).toBe(45);
    expect(() => m.receiveEvent(state.id, 'goal', 'home')).toThrow();
    m.receiveEvent(state.id, 'fulltime', 'home');
    expect(state.minute).toBe(90);
    expect(() => m.receiveEvent(state.id, 'goal', 'home')).toThrow();
  });
  it('respeta seguimiento y ligas y rechaza equipos duplicados', () => {
    const m = new MatchManager();
    m.leagues.find((l) => l.id === 'laliga')!.enabled = false;
    expect(m.followed().some((m) => m.leagueId === 'laliga')).toBe(false);
    expect(() => m.add('laliga', 'Celta', 'Celta')).toThrow();
    expect(() => m.add('unknown', 'Uno', 'Dos')).toThrow();
  });
});
describe('probabilidades simuladas', () => {
  it('son deterministas, suman 100 y varían con marcador, minuto y expulsiones', () => {
    const m = new MatchManager().get('celta-madrid');
    const initial = calculateProbabilities(m);
    expect(Object.values(initial).reduce((a, b) => a + b)).toBeCloseTo(100);
    expect(calculateProbabilities(m)).toEqual(initial);
    m.score.home = 1;
    const early = calculateProbabilities(m).home;
    expect(early).toBeGreaterThan(initial.home);
    m.minute = 85;
    expect(calculateProbabilities(m).home).toBeGreaterThan(early);
    m.minute = 0;
    m.score.home = 0;
    m.statistics.home.red = 1;
    expect(calculateProbabilities(m).home).toBeLessThan(initial.home);
  });
  it('los favoritos no sesgan los datos y el final refleja el resultado', () => {
    const manager = new MatchManager();
    const m = manager.get('celta-madrid');
    const initial = calculateProbabilities(m);
    m.subscription.priority = 'BAJA';
    manager.suggest({ ...defaultSettings, favoriteTeams: [m.away.name] }, Date.now());
    expect(calculateProbabilities(m)).toEqual(initial);
    m.status = 'finished';
    expect(calculateProbabilities(m)).toEqual({ home: 0, draw: 100, away: 0 });
    m.score.away = 1;
    expect(calculateProbabilities(m)).toEqual({ home: 0, draw: 0, away: 100 });
  });
});
describe('Radar y carrusel', () => {
  it('aumenta con eventos, decae y está acotado', () => {
    const manager = new MatchManager();
    const now = 1e6,
      m = manager.get('celta-madrid');
    const before = excitementScore(m, 5, now);
    manager.receiveEvent(m.id, 'penalty', 'home', now);
    const hot = excitementScore(m, 5, now);
    expect(hot).toBeGreaterThan(before);
    expect(excitementScore(m, 5, now + 121000)).toBeLessThan(hot);
    for (let i = 0; i < 20; i++) manager.receiveEvent(m.id, 'goal', 'home', now);
    expect(excitementScore(m, 5, now)).toBeLessThanOrEqual(100);
    m.status = 'finished';
    expect(excitementScore(m, 5, now)).toBe(0);
  });
  it('cambia por relevancia y no solo por tiempo, respetando el principal', () => {
    const manager = new MatchManager();
    manager.setMain(null);
    manager.focus('celta-madrid', 1000);
    const settings = { ...defaultSettings, carouselEnabled: true };
    manager.suggest(settings, 100000);
    expect(manager.currentMatchId).toBe('celta-madrid');
    manager.receiveEvent('liverpool-arsenal', 'penalty', 'home', 100000);
    manager.receiveEvent('liverpool-arsenal', 'var', 'home', 100000);
    manager.suggest(settings, 100000);
    expect(manager.currentMatchId).toBe('liverpool-arsenal');
    manager.setMain('celta-madrid');
    manager.suggest(settings, 200000);
    expect(manager.currentMatchId).toBe('celta-madrid');
  });
});
