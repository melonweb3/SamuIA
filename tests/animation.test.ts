import { describe, expect, it } from 'vitest';
import { AvatarAnimationController, textVisemes } from '../packages/avatar-animation/src/index';
import {
  avatarAnimations,
  directiveForAnimation,
  defaultProfile,
} from '../packages/shared/src/index';
import { ReactionDirector } from '../packages/core/src/index';
import { CommentaryEngine, LiveMatchContextService } from '../packages/samuia-brain/src/index';
import { MatchManager } from '../packages/football-engine/src/index';
import { commandSchema } from '../apps/server/src/commands';

describe('AvatarAnimationController y reloj de habla', () => {
  it('ofrece los trece estados, sin depender de imágenes o motores gráficos', () => {
    const controller = new AvatarAnimationController(0);
    for (const animation of avatarAnimations) {
      const speaking =
        animation === 'idle' ? null : { id: animation, text: 'aaaa', durationMs: 8000 };
      controller.play(directiveForAnimation(animation, 0.8), 1000, speaking);
      const state = controller.frame(1100);
      expect(state.animation).toBe(animation);
      expect(state.intensity).toBe(0.8);
      expect(state.clipId).toBeGreaterThan(0);
      expect(state.speaking).toBe(animation !== 'idle');
    }
  });
  it('separa reacción, expresión, habla y reposo, y permite repetir la misma reacción', () => {
    const c = new AvatarAnimationController(0);
    c.play(directiveForAnimation('goal', 1), 1000, {
      id: 'a',
      text: 'Un gol con comentario largo',
      durationMs: 10000,
    });
    expect(c.frame(1500)).toMatchObject({ animation: 'goal', expression: 'happy', speaking: true });
    expect(c.frame(4000)).toMatchObject({ animation: 'talking', speaking: true });
    expect(c.frame(11001)).toMatchObject({
      animation: 'idle',
      speaking: false,
      mouth: { open: 0, viseme: 'sil' },
    });
    const old = c.frame(11001).clipId;
    c.play(directiveForAnimation('goal'), 12000);
    const first = c.frame(12001).clipId;
    c.play(directiveForAnimation('goal'), 12500);
    expect(c.frame(12501).clipId).toBeGreaterThan(first);
    expect(first).toBeGreaterThan(old);
    expect(c.frame(12502).transitions.map((t) => t.to)).toContain('talking');
  });
  it('genera parpadeo, pequeños movimientos, mirada y visemas simulados con silencio en pausas', () => {
    const c = new AvatarAnimationController(1000);
    expect(c.frame(4200).blink).toBeCloseTo(1);
    expect(c.frame(1100).head).not.toEqual(c.frame(2100).head);
    c.lookAt('chat');
    expect(c.frame(2200).gaze).toMatchObject({ target: 'chat', x: 0.7 });
    c.play(directiveForAnimation('talking'), 5000, { id: 'speech', text: 'a a', durationMs: 3000 });
    expect(c.frame(5500).mouth.open).toBeGreaterThan(0.5);
    expect(c.frame(6500).mouth.open).toBe(0);
    expect(textVisemes('... !', 1000).every((cue) => cue.viseme === 'sil')).toBe(true);
  });
  it('cancela boca y habla al interrumpir y rechaza callbacks antiguos o tiempos inválidos', () => {
    const c = new AvatarAnimationController(0);
    c.play(directiveForAnimation('talking'), 1000, { id: 'old', text: 'Hola', durationMs: 5000 });
    expect(
      c.updateSpeechTiming(
        'old',
        0,
        [{ atMs: 0, durationMs: 2000, viseme: 'O', weight: 1 }],
        2000,
        1200,
      ),
    ).toBe(true);
    expect(c.frame(2200)).toMatchObject({ mouth: { viseme: 'O', open: 1 }, speaking: true });
    c.stop(2300);
    expect(c.updateSpeechTiming('old', 1000, [], 4000, 2400)).toBe(false);
    expect(c.finishSpeech('old', 2400)).toBe(false);
    expect(c.frame(2400)).toMatchObject({ animation: 'idle', speaking: false, mouth: { open: 0 } });
    c.play(directiveForAnimation('talking'), 2500, { id: 'new', text: 'Hola', durationMs: 3000 });
    expect(
      c.updateSpeechTiming(
        'new',
        0,
        [{ atMs: 0, durationMs: -1, viseme: 'aa', weight: 1 }],
        3000,
        2600,
      ),
    ).toBe(false);
    expect(c.updateSpeechTiming('new', NaN, [], 3000, 2600)).toBe(false);
  });
});

describe('CommentaryEngine → texto/emoción/intensidad/animación', () => {
  it.each([
    ['goal', 'goal', 'happy'],
    ['var', 'var', 'thinking'],
    ['penalty', 'penalty', 'shock'],
    ['chance', 'shock', 'shock'],
    ['missed_chance', 'frustrated', 'frustrated'],
    ['red', 'shock', 'shock'],
    ['yellow', 'angry', 'angry'],
  ] as const)('%s emite %s y expresión %s', (eventType, animation, expression) => {
    const manager = new MatchManager(),
      context = new LiveMatchContextService(),
      engine = new CommentaryEngine(context);
    const event = manager.receiveEvent('celta-madrid', eventType, 'home', 1000),
      match = manager.get(event.matchId);
    context.observe(match, event);
    const draft = engine.event(match, event, defaultProfile);
    expect(draft.decision.say.length).toBeGreaterThan(0);
    expect(draft.decision.avatar).toMatchObject({ animation, expression, gaze: 'match' });
    expect(draft.decision.avatar?.intensity).toBeGreaterThanOrEqual(0);
    expect(draft.decision.avatar?.intensity).toBeLessThanOrEqual(1);
  });
  it.each(['win', 'loss'] as const)(
    'el final solo muestra %s con afinidad configurada y resultado conocido',
    (result) => {
      const m = new MatchManager(),
        context = new LiveMatchContextService(),
        engine = new CommentaryEngine(context);
      const match = m.get('celta-madrid');
      match.score = { home: result === 'win' ? 1 : 0, away: result === 'loss' ? 1 : 0 };
      const event = m.receiveEvent(match.id, 'fulltime', 'home', 1000);
      const profile = { ...defaultProfile, communityTeams: { [match.id]: 'home' as const } };
      expect(engine.event(match, event, profile).decision.avatar?.animation).toBe(result);
      expect(engine.event(match, event, defaultProfile).decision.avatar?.animation).toBe(
        'thinking',
      );
    },
  );
  it('la ocasión fallada no incrementa el marcador ni los tiros a puerta', () => {
    const manager = new MatchManager();
    manager.receiveEvent('celta-madrid', 'missed_chance', 'home', 1000);
    expect(manager.get('celta-madrid').score.home).toBe(0);
    expect(manager.get('celta-madrid').statistics.home.shots).toBe(1);
    expect(manager.get('celta-madrid').statistics.home.shotsOnTarget).toBe(0);
  });
});

describe('Director, simulación y voz intercambiable', () => {
  it('mantiene la cola mientras habla, y Callar cancela la animación y visemas', () => {
    const d = new ReactionDirector(1000, false);
    d.command({ type: 'event', matchId: 'celta-madrid', eventType: 'goal', side: 'home' }, 1100);
    expect(d.snapshot(1200).animation).toMatchObject({
      animation: 'goal',
      expression: 'happy',
      speaking: true,
    });
    const utterance = d.snapshot(1200).animation.speech!.id;
    d.command({ type: 'event', matchId: 'celta-madrid', eventType: 'var', side: 'home' }, 1300);
    expect(d.snapshot(1400).animation.animation).toBe('goal');
    expect(d.snapshot(1400).sportsEventQueue).toHaveLength(1);
    d.command({ type: 'control', action: 'silence' }, 1500);
    expect(d.snapshot(1600).animation).toMatchObject({
      animation: 'idle',
      speaking: false,
      mouth: { open: 0 },
    });
    expect(d.updateVoiceTiming(utterance, 0, 4000, [], 1700)).toBe(false);
  });
  it('muestra thinking y mirada al chat cuando una respuesta reservada sale de espera', () => {
    const d = new ReactionDirector(1000, false);
    d.command({ type: 'settings', patch: { reactionCooldown: 0 } }, 1000);
    d.command({ type: 'event', matchId: 'celta-madrid', eventType: 'goal', side: 'home' }, 1100);
    d.command({ type: 'chat', username: 'Prueba', message: 'Hola Samu' }, 1200);
    const message = d.snapshot(1200).chat[0];
    d.command({ type: 'respond', id: message.id }, 1300);
    const end = d.until;
    d.tick(end);
    d.tick(end + 1);
    expect(d.snapshot(end + 1).animation).toMatchObject({
      animation: 'thinking',
      gaze: { target: 'chat' },
    });
    d.tick(end + 202);
    expect(d.snapshot(end + 202).animation.speaking).toBe(true);
  });
  it('previsualiza sin modificar partidos ni memoria y valida los comandos HTTP', () => {
    const d = new ReactionDirector(1000, false),
      before = d.snapshot(1000);
    for (const animation of avatarAnimations) {
      const command = {
        type: 'avatar-simulate' as const,
        animation,
        intensity: 0.75,
        text: animation === 'idle' ? '' : 'Una frase de prueba',
        gaze: 'camera' as const,
      };
      expect(commandSchema.safeParse(command).success).toBe(true);
      d.command(command, 1200);
      expect(d.snapshot(1250).animation.animation).toBe(animation);
    }
    expect(d.snapshot(1300).activeMatches).toEqual(before.activeMatches);
    expect(d.snapshot(1300).contexts).toEqual(before.contexts);
    expect(
      commandSchema.safeParse({
        type: 'avatar-simulate',
        animation: 'unknown',
        intensity: 1,
        text: '',
        gaze: 'camera',
      }).success,
    ).toBe(false);
    expect(
      commandSchema.safeParse({
        type: 'avatar-simulate',
        animation: 'goal',
        intensity: 5,
        text: '',
        gaze: 'camera',
      }).success,
    ).toBe(false);
  });
  it('adopta el reloj de voz real y termina la frase sin aceptar un fin tardío de otra voz', () => {
    const d = new ReactionDirector(1000, false);
    d.command(
      {
        type: 'avatar-simulate',
        animation: 'talking',
        intensity: 0.5,
        text: 'Hola',
        gaze: 'camera',
      },
      1100,
    );
    const utterance = d.snapshot(1100).animation.speech!.id;
    expect(
      d.updateVoiceTiming(
        utterance,
        0,
        10000,
        [{ atMs: 0, durationMs: 10000, viseme: 'aa', weight: 1 }],
        1200,
      ),
    ).toBe(true);
    d.tick(6000);
    expect(d.snapshot(6200).animation.speaking).toBe(true);
    expect(d.snapshot(6200).animation.speech?.source).toBe('audio-visemes');
    expect(d.voiceEnded('old-id', 6300)).toBe(false);
    expect(d.voiceEnded(utterance, 6400)).toBe(true);
    expect(d.snapshot(6500).animation.speaking).toBe(false);
    expect(d.snapshot(6500).state).toBe('COOLDOWN');
  });
});
