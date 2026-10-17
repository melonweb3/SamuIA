import { describe, it, expect } from 'vitest';
import {
  ReactionDirector,
  SportsReactionScheduler,
  CameraDirector,
} from '../packages/core/src/index';
import { MatchManager } from '../packages/football-engine/src/index';
import { defaultSettings } from '../packages/shared/src/index';
const now = 1e6;
describe('SportsReactionScheduler', () => {
  it('prioriza eventos simultáneos y respeta cooldown', () => {
    const manager = new MatchManager(),
      s = new SportsReactionScheduler();
    for (const [matchId, type] of [
      ['liverpool-arsenal', 'yellow'],
      ['barcelona-atletico', 'penalty'],
      ['celta-madrid', 'goal'],
    ] as const) {
      const m = manager.get(matchId);
      m.subscription.reactions.events.yellow = true;
      s.enqueue(manager.receiveEvent(matchId, type, 'home', now), m, 5, defaultSettings);
    }
    expect(s.sportsEventQueue.map((i) => i.event.type)).toEqual(['goal', 'penalty', 'yellow']);
    expect(s.take(manager, defaultSettings, now)?.event.type).toBe('goal');
    expect(s.take(manager, defaultSettings, now + 1)).toBeUndefined();
    expect(s.take(manager, defaultSettings, now + 5000)?.event.type).toBe('penalty');
  });
  it('agrupa menores, respeta pausa, filtros y límite por minuto', () => {
    const manager = new MatchManager(),
      s = new SportsReactionScheduler(),
      m = manager.get('celta-madrid');
    const settings = { ...defaultSettings, maxReactionsPerMinute: 1, reactionCooldown: 0 };
    m.subscription.reactions.events.yellow = true;
    for (let i = 0; i < 3; i++)
      s.enqueue(manager.receiveEvent(m.id, 'yellow', 'home', now + i), m, 5, settings);
    expect(s.sportsEventQueue[0].groupedCount).toBe(3);
    expect(s.take(manager, settings, now + 1)).toBeUndefined();
    expect(s.take(manager, settings, now + 4000)?.groupedCount).toBe(3);
    s.enqueue(manager.receiveEvent(m.id, 'goal', 'home', now + 5000), m, 5, settings);
    expect(s.take(manager, settings, now + 5000)).toBeUndefined();
    m.subscription.reactions.paused = true;
    expect(s.enqueue(manager.receiveEvent(m.id, 'red', 'home', now + 5001), m, 5, settings)).toBe(
      false,
    );
  });
});
describe('ReactionDirector', () => {
  it('reacciona a gol Celta y regresa al estado normal', () => {
    const d = new ReactionDirector(now, false);
    d.command({ type: 'event', matchId: 'celta-madrid', eventType: 'goal', side: 'home' }, now);
    expect(d.state).toBe('REACTING');
    expect(d.decision.say).toBe('GOOOOOL! Iepaaa meu!');
    expect(d.decision.energy).toBe(100);
    expect(d.camera.current).toBe('primer_plano');
    d.tick(d.until + 1);
    expect(d.state).toBe('COOLDOWN');
    expect(d.decision.scene).toBe('futbol');
    expect(d.camera.current).toBe('streamer');
  });
  it('no interrumpe el chat, procesa goles antes que penaltis y vuelve al principal', () => {
    const d = new ReactionDirector(now, false);
    const msg = d.chat.add('P', '¿Cómo ves al Celta?', d.manager.followed(), now);
    d.command({ type: 'respond', id: msg.id }, now);
    d.tick(now + 300);
    const text = d.decision.say,
      end = d.until;
    d.command(
      { type: 'event', matchId: 'celta-madrid', eventType: 'goal', side: 'home' },
      now + 500,
    );
    d.command(
      { type: 'event', matchId: 'barcelona-atletico', eventType: 'penalty', side: 'home' },
      now + 501,
    );
    expect(d.decision.say).toBe(text);
    d.tick(end + 1);
    expect(msg.status).toBe('answered');
    d.tick(d.until + 1);
    expect(d.decision.scene).toBe('celebracion');
    d.tick(d.until + 1);
    d.tick(d.until + 1);
    expect(d.manager.currentMatchId).toBe('barcelona-atletico');
    d.tick(d.until + 1);
    expect(d.manager.currentMatchId).toBe('celta-madrid');
  });
  it('reserva el chat durante una reacción sin marcarlo respondido antes de tiempo', () => {
    const d = new ReactionDirector(now, false);
    d.command({ type: 'event', matchId: 'liverpool-arsenal', eventType: 'red', side: 'away' }, now);
    const m = d.chat.add('P', '¿Cómo va el Liverpool?', d.manager.followed(), now);
    d.command({ type: 'respond', id: m.id }, now + 1);
    d.tick(d.until + 1);
    expect(m.status).toBe('selected');
    d.tick(d.until + 1);
    d.tick(d.until + 1);
    expect(d.decision.say).toContain('Liverpool');
    expect(m.status).toBe('selected');
    d.tick(d.until + 1);
    expect(m.status).toBe('answered');
  });
  it('Callar es una cancelación explícita; otros controles esperan', () => {
    const d = new ReactionDirector(now, false);
    d.command({ type: 'control', action: 'angry' }, now);
    const text = d.decision.say;
    d.command({ type: 'control', action: 'celebrate' }, now + 1);
    expect(d.decision.say).toBe(text);
    d.tick(d.until + 1);
    d.tick(d.until + 1);
    expect(d.decision.scene).toBe('celebracion');
    d.command({ type: 'control', action: 'silence' }, d.until - 1);
    expect(d.decision.say).toBe('');
    expect(d.state).toBe('COOLDOWN');
  });
  it('registra eventos aunque las reacciones estén pausadas y limpia partidos borrados', () => {
    const d = new ReactionDirector(now, false);
    d.settings.autoReactions = false;
    d.command({ type: 'event', matchId: 'liverpool-arsenal', eventType: 'red', side: 'away' }, now);
    expect(d.history).toHaveLength(0);
    expect(d.alerts[0].secondary).toBe(true);
    expect(d.context.get('liverpool-arsenal').personalityMemory.memorableMoments).toHaveLength(1);
    d.command({ type: 'match-remove', matchId: 'liverpool-arsenal' }, now + 1);
    expect(d.scheduler.sportsEventQueue).toHaveLength(0);
    expect(d.context.contexts.has('liverpool-arsenal')).toBe(false);
  });
  it('publica una opinión real y configura el perfil sin alterar probabilidades', () => {
    const d = new ReactionDirector(now, false);
    const before = structuredClone(d.manager.get('celta-madrid').probabilities);
    d.command({ type: 'profile', patch: { name: 'Samu', rivalryLevel: 70 } }, now);
    d.command({ type: 'comment', matchId: 'celta-madrid', kind: 'analysis' }, now);
    expect(d.context.get('celta-madrid').personalityMemory.previousOpinions).toHaveLength(1);
    expect(d.profile.name).toBe('Samu');
    expect(d.manager.get('celta-madrid').probabilities).toEqual(before);
  });
});
it('CameraDirector respeta cooldown y se puede restablecer', () => {
  const c = new CameraDirector();
  c.receive('primer_plano', now, 3);
  expect(c.receive('tres_cuartos', now + 1000, 3)).toBe('primer_plano');
  expect(c.receive('tres_cuartos', now + 3000, 3)).toBe('tres_cuartos');
  c.reset();
  expect(c.current).toBe('streamer');
});
