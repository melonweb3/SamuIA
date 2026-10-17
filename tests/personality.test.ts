import { describe, it, expect } from 'vitest';
import { MatchManager } from '../packages/football-engine/src/index';
import {
  LiveMatchContextService,
  CommentaryEngine,
  SamuIABrain,
} from '../packages/samuia-brain/src/index';
import { ChatQueue, relatedMatch, chatPriority } from '../packages/chat-engine/src/index';
import { defaultProfile, type CommentaryDraft, normalDecision } from '../packages/shared/src/index';
const now = 1e6;
function setup() {
  const manager = new MatchManager(),
    context = new LiveMatchContextService(),
    engine = new CommentaryEngine(context);
  return { manager, context, engine, match: manager.get('celta-madrid') };
}
describe('memoria verificable por partido', () => {
  it('no guarda una predicción sin publicarla, ni la genera sin ocasiones', () => {
    const { context, engine, match } = setup();
    const draft = engine.analyze(match, defaultProfile, 'prediction');
    expect(draft.prediction).toBeUndefined();
    expect(context.get(match.id).personalityMemory.predictions).toHaveLength(0);
  });
  it('guarda la predicción solo al publicar y comprueba un gol real posterior', () => {
    const { manager, context, engine, match } = setup();
    for (let i = 0; i < 2; i++) manager.receiveEvent(match.id, 'chance', 'home', now + i);
    const draft = engine.analyze(match, defaultProfile, 'prediction');
    expect(draft.prediction?.side).toBe('home');
    expect(context.pending(match.id)).toBeUndefined();
    context.publish(match, draft, now + 10);
    const p = context.pending(match.id)!;
    expect(p.timestamp).toBe(now + 10);
    expect(p.sourceIds).toHaveLength(2);
    const goal = manager.receiveEvent(match.id, 'goal', 'home', now + 100);
    context.observe(match, goal);
    expect(p.status).toBe('success');
    const reaction = engine.event(match, goal, defaultProfile);
    expect(reaction.decision.say).toContain('Os lo dije');
    expect(reaction.recallIds).toContain(p.id);
    context.publish(match, reaction, now + 101);
    expect(p.acknowledged).toBe(true);
  });
  it('nunca dice que había avisado sin una predicción publicada', () => {
    const { manager, context, engine, match } = setup();
    const goal = manager.receiveEvent(match.id, 'goal', 'home', now);
    context.observe(match, goal);
    const reaction = engine.event(match, goal, defaultProfile);
    expect(reaction.decision.say).not.toMatch(/os lo dije|ya avisé/i);
    expect(reaction.recallIds).toHaveLength(0);
    const forged: CommentaryDraft = {
      decision: { ...normalDecision(), say: 'Os lo dije' },
      matchId: match.id,
      recallIds: [],
      sourceIds: [],
    };
    expect(() => context.publish(match, forged, now)).toThrow(/predicción/);
  });
  it('reconoce una predicción fallida sin apropiarse del gol rival', () => {
    const { manager, context, engine, match } = setup();
    for (let i = 0; i < 2; i++) manager.receiveEvent(match.id, 'chance', 'home', now + i);
    context.publish(match, engine.analyze(match, defaultProfile, 'prediction'), now + 10);
    const goal = manager.receiveEvent(match.id, 'goal', 'away', now + 20);
    context.observe(match, goal);
    const draft = engine.event(match, goal, defaultProfile);
    expect(draft.decision.say).toContain('predicción envejeció regular');
    expect(draft.decision.say).not.toContain('Os lo dije');
    expect(context.get(match.id).personalityMemory.failedPredictions).toHaveLength(1);
  });
  it('caduca predicciones, las conserva y reconoce el fallo al analizar', () => {
    const { manager, context, engine, match } = setup();
    for (let i = 0; i < 2; i++) manager.receiveEvent(match.id, 'chance', 'home', now + i);
    context.publish(match, engine.analyze(match, defaultProfile, 'prediction'), now + 10);
    match.minute = 16;
    context.refresh(match, now + 20);
    expect(context.pending(match.id)).toBeUndefined();
    const analysis = engine.analyze(match, defaultProfile);
    expect(analysis.decision.say).toContain('me equivoqué');
    expect(analysis.recallIds).toHaveLength(1);
  });
  it('aísla las memorias y no admite recuerdos de otro encuentro', () => {
    const { manager, context, engine, match } = setup();
    context.publish(match, engine.analyze(match, defaultProfile), now);
    const opinion = context.get(match.id).personalityMemory.previousOpinions[0];
    const other = manager.get('liverpool-arsenal');
    expect(context.get(other.id).personalityMemory.previousOpinions).toHaveLength(0);
    const forged = engine.analyze(other, defaultProfile);
    forged.recallIds = [opinion.id];
    expect(() => context.publish(other, forged, now)).toThrow(/verificable/);
  });
  it('reconoce cambios de opinión apoyados por nuevas estadísticas', () => {
    const { manager, context, engine, match } = setup();
    manager.receiveEvent(match.id, 'chance', 'home', now);
    context.publish(match, engine.analyze(match, defaultProfile), now + 1);
    for (let i = 0; i < 3; i++) manager.receiveEvent(match.id, 'chance', 'away', now + 2 + i);
    const next = engine.analyze(match, defaultProfile);
    expect(next.decision.say).toContain('cambio de opinión');
    expect(next.decision.say).toContain('Madrid');
    expect(next.recallIds).toHaveLength(1);
  });
  it('no inventa jugadores ni tendencias en una banda sin datos', () => {
    const { context, engine, match } = setup();
    context.publish(match, engine.analyze(match, defaultProfile), now);
    const mem = context.get(match.id).personalityMemory;
    expect(mem.playersPraised).toHaveLength(0);
    expect(mem.playersCriticized).toHaveLength(0);
    expect(mem.previousOpinions[0].content).not.toMatch(/izquierda|Aspas/);
  });
});
describe('comunidad y tono', () => {
  it('el partido de contexto no secuestra conversaciones de gaming o tecnología', () => {
    const { manager, engine } = setup();
    const brain = new SamuIABrain(engine),
      queue = new ChatQueue();
    const gaming = queue.add(
      'P',
      'Hablemos de videojuegos',
      manager.followed(),
      now,
      'celta-madrid',
    );
    expect(brain.respond(gaming, manager, defaultProfile).decision.scene).toBe('gaming');
    const tech = queue.add('P', 'Hablemos de IA', manager.followed(), now, 'celta-madrid');
    expect(brain.respond(tech, manager, defaultProfile).decision.scene).toBe('tecnologia');
  });
  it('no finge leer comentarios ni da porcentajes sin muestra suficiente', () => {
    const { context, engine, match } = setup();
    expect(engine.analyze(match, defaultProfile, 'community').decision.say).toContain(
      'Todavía no tengo respuestas',
    );
    context.publish(match, engine.analyze(match, defaultProfile, 'question'), now);
    const q = new ChatQueue();
    const add = (user: string, text: string, t: number) =>
      context.receiveCommunity(match, q.add(user, text, [match], now + t, match.id));
    add('Ana', 'Sí', 1);
    add('ANA', 'No', 2);
    expect(engine.analyze(match, defaultProfile, 'community').decision.say).not.toContain('%');
    add('Brais', 'Sí', 3);
    add('Carlos', 'Sí', 4);
    const summary = engine.analyze(match, defaultProfile, 'community');
    expect(summary.decision.say).toContain('67%');
    expect(summary.decision.say).toContain('2 de 3');
    expect(context.community(match.id)?.total).toBe(3);
  });
  it('ignora respuestas anteriores a la pregunta y usuarios silenciados', () => {
    const { context, engine, match } = setup();
    const q = new ChatQueue();
    context.receiveCommunity(match, q.add('P', 'Sí', [match], now - 1, match.id));
    context.publish(match, engine.analyze(match, defaultProfile, 'question'), now);
    const message = q.add('P', 'Sí', [match], now + 1, match.id);
    message.status = 'muted';
    context.receiveCommunity(match, message);
    expect(context.community(match.id)?.total).toBe(0);
  });
  it('una afinidad editorial no impide reconocer al rival ni cambia probabilidades', () => {
    const { manager, engine, match } = setup();
    manager.receiveEvent(match.id, 'chance', 'away', now);
    const before = structuredClone(match.probabilities);
    const p = { ...defaultProfile, communityTeams: { [match.id]: 'home' as const } };
    expect(engine.analyze(match, p).decision.say).toContain('reconocer');
    expect(match.probabilities).toEqual(before);
  });
  it('aplica intensidad decisiva, humor configurable y expresiones prohibidas', () => {
    const { manager, context, engine, match } = setup();
    match.minute = 94;
    const goal = manager.receiveEvent(match.id, 'goal', 'home', now);
    context.observe(match, goal);
    expect(context.get(match.id).intensity).toBe(5);
    expect(engine.event(match, goal, defaultProfile).decision.say).toContain('94');
    const p = {
      ...defaultProfile,
      catchphrases: ['apuesta segura'],
      prohibitedExpressions: ['apuesta segura'],
    };
    const analyzed = engine.analyze(match, p);
    expect(analyzed.decision.say).not.toContain('apuesta segura');
    const quiet = engine.analyze(match, {
      ...defaultProfile,
      humorLevel: 0,
      emojiFrequency: 0,
      galicianLevel: 0,
      catchphrases: [],
    });
    expect(quiet.joke).toBeUndefined();
    expect(quiet.decision.say).not.toMatch(/🔥|👀/);
  });
  it('interpreta consultas globales y alias específicos', () => {
    const { manager, engine } = setup();
    expect(relatedMatch('¿Cómo va el Atlético de Madrid?', manager.activeMatches)?.id).toBe(
      'barcelona-atletico',
    );
    const brain = new SamuIABrain(engine),
      queue = new ChatQueue();
    const ask = (s: string) =>
      brain.respond(queue.add('P', s, manager.followed()), manager, defaultProfile).decision.say;
    expect(ask('¿Cómo van todos?')).toContain('Liverpool');
    expect(ask('¿Cuál está más interesante?')).toContain('radar');
    expect(ask('Insulta a esa afición')).toContain('no personal');
  });
});
describe('ChatQueue', () => {
  it('prioriza preguntas, penaliza spam y permite responder, saltar y silenciar', () => {
    const manager = new MatchManager();
    expect(chatPriority('Samu, ¿cómo ves al Celta?', manager.activeMatches)).toBeGreaterThan(
      chatPriority('hola', []),
    );
    expect(chatPriority('https://spam.example', [])).toBeLessThan(0);
    const q = new ChatQueue(),
      m = q.add('P', 'hola', []);
    q.select(m.id);
    q.finish();
    expect(m.status).toBe('answered');
    const b = q.add('B', 'hola', []);
    q.skip(b.id);
    expect(b.status).toBe('skipped');
    const c = q.add('P', 'otra', []);
    q.mute(c.id);
    expect(q.add('p', 'otra', []).status).toBe('muted');
  });
  it('no elimina un comentario seleccionado al llenar la cola', () => {
    const q = new ChatQueue(),
      m = q.add('P', 'primero', []);
    q.select(m.id);
    for (let i = 0; i < 350; i++) q.add('U' + i, 'Mensaje ' + i, []);
    expect(q.messages.length).toBeLessThanOrEqual(300);
    expect(q.get(m.id).status).toBe('selected');
    q.finish();
    expect(m.status).toBe('answered');
  });
});
