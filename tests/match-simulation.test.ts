import { describe, it, expect } from 'vitest';
import {
  MatchSimulationSession,
  matchSimulationSteps,
} from '../packages/match-simulation/src/index';
import { ReactionDirector } from '../packages/core/src/index';
import { defaultSettings } from '../packages/shared/src/index';

function run(session: MatchSimulationSession, now = 1000) {
  session.running = true;
  for (let i = 0; i < 1600 && !session.done && !session.error; i++) {
    now += 250;
    session.tick(now);
  }
  return now;
}
function settle(session: MatchSimulationSession, now: number) {
  for (let i = 0; i < 80; i++) {
    now += 250;
    session.tick(now);
  }
  return now;
}
describe('Partido completo con motores existentes', () => {
  it('recorre inicio a final, publica cada comentario y verifica predicciones y conversación', () => {
    const session = new MatchSimulationSession(1000);
    const now = run(session),
      state = session.snapshot(now),
      m = state.activeMatches[0],
      mem = state.contexts[0].personalityMemory;
    expect(session.error).toBe('');
    expect(session.done).toBe(true);
    expect(session.completed.map((s) => s.id)).toEqual(matchSimulationSteps.map((s) => s.id));
    expect(m).toMatchObject({ status: 'finished', minute: 90, score: { home: 2, away: 1 } });
    expect(m.events).toHaveLength(16);
    expect(mem.memorableMoments).toHaveLength(16);
    expect(state.history).toHaveLength(24);
    expect(state.contexts[0].publishedCount).toBe(24);
    expect(mem.successfulPredictions).toHaveLength(1);
    expect(mem.failedPredictions).toHaveLength(1);
    for (const prediction of mem.predictions) {
      const goal = m.events.find((e) => e.id === prediction.resolvedBy)!;
      expect(goal.type).toBe('goal');
      expect(goal.timestamp).toBeGreaterThan(prediction.timestamp);
      expect(goal.side === prediction.side).toBe(prediction.status === 'success');
      expect(prediction.acknowledged).toBe(true);
      expect(prediction.sourceIds.length).toBeGreaterThan(0);
    }
    expect(mem.communityResponses).toHaveLength(3);
    expect(state.chat.every((c) => c.status === 'answered')).toBe(true);
    expect(
      state.history.some(
        (h) => h.decision.say.includes('67%') && h.decision.say.includes('2 de 3'),
      ),
    ).toBe(true);
    expect(state.history.some((h) => h.decision.say.includes('envejeció regular'))).toBe(true);
    expect(state.history[0].decision.avatar?.animation).toBe('win');
    expect(
      state.history.find((h) => h.sourceIds.includes(mem.failedPredictions[0].resolvedBy!))
        ?.decision.avatar?.animation,
    ).toBe('frustrated');
    for (const entry of session.completed)
      expect(state.history.some((h) => h.id === entry.commentId)).toBe(true);
  });
  it('no modifica los partidos, preferencias o chat del estudio existente', () => {
    const studio = new ReactionDirector(1000),
      before = studio.snapshot(1000),
      settings = structuredClone(defaultSettings);
    const trial = new MatchSimulationSession(1000);
    run(trial);
    expect(studio.snapshot(1000)).toEqual(before);
    expect(defaultSettings).toEqual(settings);
    expect(trial.snapshot().activeMatches).toHaveLength(1);
    expect(trial.snapshot().chat.map((c) => c.username)).not.toContain('Tú');
  });
  it('espera la lectura, pausa sin perder el paso y continúa una sola vez', () => {
    const s = new MatchSimulationSession(1000);
    s.running = true;
    s.tick(1100);
    expect(s.activeStep?.id).toBe('start');
    expect(() => s.next(1200)).toThrow();
    s.running = false;
    let now = settle(s, 1200);
    expect(s.completed).toHaveLength(1);
    expect(s.index).toBe(1);
    now = settle(s, now);
    expect(s.completed).toHaveLength(1);
    s.next(now + 1);
    now = settle(s, now + 2);
    expect(s.completed).toHaveLength(2);
  });
  it('rechaza fases inválidas sin inventar inicio, segunda parte ni predicciones', () => {
    const s = new MatchSimulationSession(1000);
    expect(() => s.resolvePrediction(true, 1100)).toThrow(/primero/);
    expect(() => s.event('second_half', 'home', 1200)).toThrow(/descanso/);
    expect(s.snapshot(1300).activeMatches[0].events).toHaveLength(0);
    expect(s.manual).toBe(false);
    const fresh = new MatchSimulationSession(1000);
    fresh.event('kickoff', 'home', 1100);
    expect(() => fresh.event('kickoff', 'home', 1200)).toThrow(/pendiente/);
    expect(() => fresh.next(1300)).toThrow(/manual/);
    const before = fresh.snapshot(1300).activeMatches[0].minute;
    expect(() => fresh.setMinute(before - 1, 2000)).toThrow();
  });
  it('responde mensajes manuales mientras el guion conserva la cola y las fuentes', () => {
    const s = new MatchSimulationSession(1000);
    s.next(1100);
    s.command(
      { type: 'chat', username: 'Eva', message: '¿Cómo va el Celta?', matchId: s.matchId },
      1200,
    );
    const now = settle(s, 1300),
      state = s.snapshot(now),
      message = state.chat[0];
    expect(message.status).toBe('answered');
    expect(state.history.some((h) => h.sourceIds.includes(message.id))).toBe(true);
    expect(state.activeMatches[0].score).toEqual({ home: 0, away: 0 });
    expect(s.completed).toHaveLength(1);
  });
});
