import { ReactionDirector } from '../../core/src/index';
import { MockVoiceProvider } from '../../core/src/visual';
import { createMatch } from '../../football-engine/src/index';
import {
  eventTypes,
  type EventType,
  type Side,
  type StudioCommand,
  type StudioSnapshot,
} from '../../shared/src/index';

type Action =
  | { kind: 'event'; event: EventType; side: Side }
  | { kind: 'comment'; comment: 'analysis' | 'prediction' | 'question' | 'community' }
  | { kind: 'chat'; username: string; text: string };
export type MatchSimulationStep = { id: string; label: string; minute: number; action: Action };
const event = (
  id: string,
  label: string,
  minute: number,
  event: EventType,
  side: Side = 'home',
): MatchSimulationStep => ({ id, label, minute, action: { kind: 'event', event, side } });
const comment = (
  id: string,
  label: string,
  minute: number,
  comment: 'prediction' | 'question' | 'community',
): MatchSimulationStep => ({ id, label, minute, action: { kind: 'comment', comment } });
export const matchSimulationSteps: MatchSimulationStep[] = [
  event('start', 'Inicio del partido', 0, 'kickoff'),
  event('chance-1', 'Primera ocasión del Celta', 5, 'chance'),
  event('chance-2', 'Segunda ocasión del Celta', 8, 'chance'),
  comment('predict-1', 'Publicar una predicción con datos', 9, 'prediction'),
  event('success', 'Gol que confirma la predicción', 12, 'goal'),
  {
    id: 'chat',
    label: 'Pregunta de Ana al comentarista',
    minute: 15,
    action: { kind: 'chat', username: 'Ana', text: 'Samu, ¿cómo ves al Celta?' },
  },
  event('yellow', 'Tarjeta amarilla al Dépor', 20, 'yellow', 'away'),
  event('penalty', 'Penalti para el Celta', 26, 'penalty'),
  event('var', 'Revisión del VAR', 27, 'var'),
  event('change', 'Cambio en el Dépor', 32, 'substitution', 'away'),
  comment('poll', 'Pregunta a la comunidad', 36, 'question'),
  {
    id: 'vote-1',
    label: 'Brais responde sí',
    minute: 37,
    action: { kind: 'chat', username: 'Brais', text: 'Sí' },
  },
  {
    id: 'vote-2',
    label: 'Lucía responde no',
    minute: 38,
    action: { kind: 'chat', username: 'Lucía', text: 'No' },
  },
  {
    id: 'vote-3',
    label: 'Pedro responde sí',
    minute: 38,
    action: { kind: 'chat', username: 'Pedro', text: 'Sí' },
  },
  comment('community', 'Leer las respuestas de la comunidad', 39, 'community'),
  event('halftime', 'Descanso', 45, 'halftime'),
  event('resume', 'Comienzo de la segunda parte', 45, 'second_half'),
  event('chance-3', 'Nueva ocasión del Celta', 52, 'chance'),
  event('chance-4', 'El Celta vuelve a llegar', 54, 'chance'),
  comment('predict-2', 'Publicar una segunda predicción', 55, 'prediction'),
  event('failed', 'Gol rival: la predicción falla', 59, 'goal', 'away'),
  event('missed', 'Ocasión fallada', 67, 'missed_chance'),
  event('winner', 'Segundo gol del Celta', 78, 'goal'),
  event('end', 'Final del partido', 90, 'fulltime'),
];
class SimulationVoice extends MockVoiceProvider {
  constructor(private fast: () => boolean) {
    super();
  }
  override durationMs(text: string) {
    return this.fast()
      ? Math.max(1000, Math.min(3500, super.durationMs(text) / 3))
      : super.durationMs(text);
  }
}
export class MatchSimulationSession {
  director: ReactionDirector;
  readonly matchId = 'simulation-celta-depor';
  running = false;
  manual = false;
  fast = true;
  autoReply = true;
  index = 0;
  error = '';
  private active: {
    step: MatchSimulationStep;
    sourceId?: string;
    historyId?: string;
    sentAt: number;
  } | null = null;
  private lastNow: number;
  completed: { id: string; commentId: string; minute: number }[] = [];
  constructor(now = Date.now()) {
    const match = createMatch(
      'laliga',
      {
        id: 'celta',
        name: 'Celta de Vigo',
        shortName: 'Celta',
        aliases: ['Celta', 'Celta de Vigo'],
      },
      {
        id: 'depor',
        name: 'Deportivo de La Coruña',
        shortName: 'Dépor',
        aliases: ['Dépor', 'Deportivo'],
      },
      this.matchId,
    );
    match.status = 'upcoming';
    match.contextType = 'derby';
    for (const type of eventTypes) match.subscription.reactions.events[type] = true;
    this.director = new ReactionDirector(now, false, { matches: [match], advanceMinutes: false });
    this.director.settings = {
      ...this.director.settings,
      reactionCooldown: 0.5,
      maxReactionsPerMinute: 30,
    };
    this.director.profile = {
      ...this.director.profile,
      commentaryFrequency: 0,
      communityInteractionLevel: 0,
      communityTeams: { [this.matchId]: 'home' },
    };
    this.director.voice = new SimulationVoice(() => this.fast);
    this.lastNow = now;
  }
  private get ready() {
    return this.director.readyForIntervention;
  }
  get canAdvance() {
    return !this.manual && !this.active && this.ready && !this.done;
  }
  get activeStep() {
    return this.active?.step ?? null;
  }
  get done() {
    return this.index >= matchSimulationSteps.length && !this.active;
  }
  snapshot(now = this.lastNow): StudioSnapshot {
    return this.director.snapshot(now);
  }
  tick(now = Date.now()) {
    this.lastNow = now;
    this.director.tick(now);
    if (this.active) {
      if (!this.active.historyId && this.active.sourceId)
        this.active.historyId = this.director.history.find((h) =>
          h.sourceIds.includes(this.active!.sourceId!),
        )?.id;
      if (this.active.historyId && this.ready) {
        this.completed.push({
          id: this.active.step.id,
          commentId: this.active.historyId,
          minute: this.active.step.minute,
        });
        this.active = null;
        this.index++;
      }
    }
    if (this.autoReply && this.director.respondToPendingChat(now)) return;
    if (this.running && !this.active && this.ready && !this.done) {
      try {
        this.next(now);
      } catch (e) {
        this.error = e instanceof Error ? e.message : 'Error de simulación';
        this.running = false;
      }
    }
    if (this.done) this.running = false;
  }
  next(now = Date.now()) {
    if (this.manual)
      throw new Error(
        'Inicia un nuevo partido para repetir el recorrido guiado después del modo manual.',
      );
    if (this.active || !this.ready)
      throw new Error('Espera a que termine el comentario o termina la lectura simulada.');
    const step = matchSimulationSteps[this.index];
    if (!step) return;
    const match = this.director.manager.get(this.matchId);
    match.minute = Math.max(match.minute, step.minute);
    this.director.context.refresh(match, now);
    const action = step.action;
    this.active = { step, sentAt: now };
    try {
      if (action.kind === 'event') {
        this.director.command(
          { type: 'event', matchId: this.matchId, eventType: action.event, side: action.side },
          now,
        );
        this.active.sourceId = match.events.at(-1)!.id;
      } else if (action.kind === 'comment') {
        this.director.command(
          { type: 'comment', matchId: this.matchId, kind: action.comment },
          now,
        );
        this.active.historyId = this.director.history[0].id;
      } else {
        this.director.command(
          { type: 'chat', username: action.username, message: action.text, matchId: this.matchId },
          now,
        );
        this.active.sourceId = this.director.chat.messages.at(-1)!.id;
        this.director.command({ type: 'respond', id: this.active.sourceId }, now);
      }
    } catch (e) {
      this.active = null;
      throw e;
    }
  }
  command(command: StudioCommand, now = Date.now()) {
    this.lastNow = now;
    this.director.command(command, now);
    if (command.type === 'comment') this.manual = true;
  }
  event(type: EventType, side: Side, now = Date.now()) {
    if (this.running || this.active)
      throw new Error('Pausa y espera al final del paso guiado para añadir eventos manuales.');
    this.command({ type: 'event', matchId: this.matchId, eventType: type, side }, now);
    this.manual = true;
  }
  setMinute(minute: number, now = Date.now()) {
    const match = this.director.manager.get(this.matchId);
    if (this.active || this.running || !this.ready)
      throw new Error('Espera al final del paso o comentario.');
    if (!Number.isInteger(minute) || minute < match.minute || minute > 95)
      throw new Error('El minuto solo puede avanzar hasta el 95.');
    this.manual = true;
    match.minute = minute;
    this.director.manager.refresh(now);
    this.director.context.refresh(match, now);
  }
  resolvePrediction(success: boolean, now = Date.now()) {
    const prediction = this.director.context.pending(this.matchId);
    if (!prediction) throw new Error('Publica primero una predicción basada en ocasiones.');
    if (prediction.side === null && !success) {
      this.setMinute(prediction.expiresMinute, now);
      this.command({ type: 'comment', matchId: this.matchId, kind: 'analysis' }, now);
    } else
      this.event(
        'goal',
        success ? (prediction.side ?? 'home') : prediction.side === 'home' ? 'away' : 'home',
        now,
      );
  }
  useSimulatedVoice(now = Date.now()) {
    this.director.setVoiceProvider(new SimulationVoice(() => this.fast), now);
  }
  finishReading(now = Date.now()) {
    const speech = this.snapshot(now).animation.speech;
    if (speech) this.director.voiceEnded(speech.id, now);
  }
}
