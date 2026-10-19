import { AvatarAnimationController } from '../../avatar-animation/src/index';
import {
  id,
  directiveForDecision,
  directiveForAnimation,
  normalDecision,
  defaultSettings,
  defaultProfile,
  eventLabels,
  type StudioCommand,
  type StudioSettings,
  type AICommentatorProfile,
  type CommentaryDraft,
  type DirectorState,
  type StudioSnapshot,
  type SportsAlert,
  type VisemeCue,
} from '../../shared/src/index';
import { MatchManager } from '../../football-engine/src/index';
import { ChatQueue } from '../../chat-engine/src/index';
import {
  LiveMatchContextService,
  CommentaryEngine,
  SamuIABrain,
} from '../../samuia-brain/src/index';
import { SportsReactionScheduler } from './scheduler';
import { CameraDirector, SceneManager, MockVoiceProvider } from './visual';
export { SportsReactionScheduler, CameraDirector, SceneManager, AvatarAnimationController };
export class ReactionDirector {
  animation: AvatarAnimationController;
  manager = new MatchManager();
  context = new LiveMatchContextService();
  commentary = new CommentaryEngine(this.context);
  brain = new SamuIABrain(this.commentary);
  chat = new ChatQueue();
  scheduler = new SportsReactionScheduler();
  camera = new CameraDirector();
  scenes = new SceneManager();
  voice = new MockVoiceProvider();
  settings: StudioSettings = structuredClone(defaultSettings);
  profile: AICommentatorProfile = structuredClone(defaultProfile);
  state: DirectorState = 'IDLE';
  decision = normalDecision();
  alerts: SportsAlert[] = [];
  history: StudioSnapshot['history'] = [];
  until = 0;
  pendingChatId: string | null = null;
  private speakingChatId: string | null = null;
  private controls: CommentaryDraft[] = [];
  private lastMinuteAt: number;
  constructor(now = Date.now(), seed = true) {
    this.animation = new AvatarAnimationController(now);
    this.lastMinuteAt = now;
    for (const m of this.manager.activeMatches) this.context.get(m.id).lastCommentAt = now;
    this.manager.focus('celta-madrid', now);
    if (seed) {
      this.chat.add('Pedro', 'Samu, ¿cómo ves al Celta?', this.manager.followed(), now);
      this.chat.add('Lucía', '¿Cuál está más interesante?', this.manager.followed(), now + 1);
      this.chat.add('Brais', '¿Cómo va el Liverpool?', this.manager.followed(), now + 2);
    }
  }
  get busy() {
    return ['THINKING', 'SPEAKING', 'REACTING'].includes(this.state);
  }
  private get outputProfile(): AICommentatorProfile {
    return this.settings.safeMode
      ? {
          ...this.profile,
          rivalryLevel: Math.min(50, this.profile.rivalryLevel),
          specialRules: this.profile.specialRules.map((rule) => ({
            ...rule,
            rivalryLevel: Math.min(50, rule.rivalryLevel),
          })),
        }
      : this.profile;
  }
  private perform(draft: CommentaryDraft, source: string, now: number, sports = false) {
    const memoryIds = draft.matchId
      ? this.context.publish(this.manager.get(draft.matchId), draft, now)
      : [];
    this.decision = draft.decision;
    this.state = sports ? 'REACTING' : 'SPEAKING';
    this.scenes.receive(draft.decision.scene);
    this.camera.receive(draft.decision.camera, now, this.settings.cameraCooldown);
    const durationMs = this.voice.durationMs(draft.decision.say);
    this.until = now + durationMs;
    this.animation.play(directiveForDecision(draft.decision), now, {
      id: id(),
      text: draft.decision.say,
      durationMs,
    });
    this.history.unshift({
      id: id(),
      at: now,
      source,
      decision: structuredClone(draft.decision),
      matchId: draft.matchId,
      memoryIds,
    });
    this.history = this.history.slice(0, 100);
  }
  private reset(now: number) {
    this.animation.stop(now);
    this.decision = normalDecision();
    this.scenes.receive('futbol');
    this.camera.reset();
    if (this.manager.mainMatchId) this.manager.focus(this.manager.mainMatchId, now);
  }
  command(cmd: StudioCommand, now = Date.now()) {
    switch (cmd.type) {
      case 'avatar-gaze':
        this.animation.lookAt(cmd.target);
        return;
      case 'avatar-simulate': {
        this.voice.stop();
        this.chat.silence();
        this.pendingChatId = null;
        this.speakingChatId = null;
        this.controls = [];
        const avatar = directiveForAnimation(cmd.animation, cmd.intensity, cmd.gaze);
        this.perform(
          {
            decision: {
              ...normalDecision(),
              say: cmd.text,
              energy: Math.round(cmd.intensity * 100),
              avatar,
            },
            recallIds: [],
            sourceIds: [],
          },
          'SIMULATION · avatar',
          now,
        );
        if (!cmd.text) this.until = now + 3000;
        return;
      }
      case 'event': {
        const event = this.manager.receiveEvent(cmd.matchId, cmd.eventType, cmd.side, now),
          m = this.manager.get(cmd.matchId);
        this.context.observe(m, event);
        const queued =
          this.manager.leagues.some((l) => l.id === m.leagueId && l.enabled) &&
          this.scheduler.enqueue(
            event,
            m,
            this.manager.leagues.find((l) => l.id === m.leagueId)?.importance ?? 5,
            this.settings,
          );
        const secondary = m.id !== this.manager.mainMatchId;
        if (!secondary || this.settings.showSecondaryAlerts)
          this.alerts.unshift({
            id: event.id,
            event,
            label: `${eventLabels[event.type].toUpperCase()} · ${m[event.side].shortName} · ${m.score.home}–${m.score.away}`,
            secondary,
            disposition: queued ? 'queued' : 'alert-only',
          });
        this.alerts = this.alerts.slice(0, 60);
        break;
      }
      case 'chat': {
        if (cmd.matchId) this.manager.get(cmd.matchId);
        const message = this.chat.add(
          cmd.username,
          cmd.message,
          this.manager.followed(),
          now,
          cmd.matchId ?? this.manager.currentMatchId ?? undefined,
        );
        if (message.relatedMatchId)
          this.context.receiveCommunity(this.manager.get(message.relatedMatchId), message);
        break;
      }
      case 'respond':
        if (this.pendingChatId || this.chat.selectedId)
          throw new Error('Ya hay una respuesta reservada');
        this.chat.select(cmd.id);
        this.pendingChatId = cmd.id;
        if (!this.busy) {
          this.state = 'THINKING';
          this.until = now + 200;
          this.animation.play(directiveForAnimation('thinking', 0.45, 'chat'), now);
        }
        break;
      case 'skip':
        this.chat.skip(cmd.id);
        break;
      case 'mute':
        this.chat.mute(cmd.id);
        break;
      case 'control':
        if (cmd.action === 'silence') {
          this.voice.stop();
          this.chat.silence();
          this.pendingChatId = null;
          this.speakingChatId = null;
          this.controls = [];
          this.reset(now);
          this.state = 'COOLDOWN';
          this.until = now + this.settings.reactionCooldown * 1000;
          this.scheduler.lastReactionAt = now;
        } else {
          const decision =
            cmd.action === 'angry'
              ? {
                  ...normalDecision(),
                  say: 'Nah, meu… hoy venís buscando pique. Pero aquí todo con cariño.',
                  scene: 'enfado' as const,
                  emotion: 'enfadado_leve' as const,
                  camera: 'primer_plano' as const,
                  energy: 82,
                }
              : cmd.action === 'celebrate'
                ? {
                    ...normalDecision(),
                    say: '¡Buena esa! ¡Vamos allá, meu!',
                    scene: 'celebracion' as const,
                    emotion: 'risa' as const,
                    camera: 'primer_plano' as const,
                    gesture: 'celebracion' as const,
                    energy: 100,
                  }
                : { ...normalDecision(), say: 'Volvemos al lío, con calma.' };
          this.controls.push({ decision, recallIds: [], sourceIds: [] });
          this.controls = this.controls.slice(-10);
        }
        break;
      case 'main':
        this.manager.setMain(cmd.matchId, now);
        break;
      case 'focus':
        this.manager.focus(cmd.matchId, now);
        break;
      case 'subscription':
        this.manager.subscribe(cmd.matchId, cmd.patch);
        break;
      case 'match-add': {
        const m = this.manager.add(cmd.leagueId, cmd.home, cmd.away, cmd.status, cmd.contextType);
        this.context.get(m.id).lastCommentAt = now;
        break;
      }
      case 'match-remove':
        this.manager.remove(cmd.matchId);
        this.context.remove(cmd.matchId);
        this.scheduler.removeMatch(cmd.matchId);
        this.alerts = this.alerts.filter((a) => a.event.matchId !== cmd.matchId);
        this.controls = this.controls.filter((d) => d.matchId !== cmd.matchId);
        break;
      case 'match-status': {
        const m = this.manager.get(cmd.matchId);
        m.status = cmd.status;
        this.manager.refresh(now);
        this.context.refresh(m, now);
        break;
      }
      case 'league': {
        const league = this.manager.leagues.find((l) => l.id === cmd.id);
        if (!league) throw new Error('Liga no encontrada');
        league.enabled = cmd.enabled;
        break;
      }
      case 'league-add':
        if (this.manager.leagues.some((l) => normalizeName(l.name) === normalizeName(cmd.name)))
          throw new Error('Esa competición ya existe');
        this.manager.leagues.push({ id: id(), name: cmd.name, importance: 5, enabled: true });
        break;
      case 'settings':
        this.settings = { ...this.settings, ...cmd.patch };
        break;
      case 'profile':
        this.profile = { ...this.profile, ...cmd.patch };
        break;
      case 'comment': {
        const m = this.manager.get(cmd.matchId);
        if (!['live', 'halftime'].includes(m.status))
          throw new Error('El comentario requiere un partido activo');
        if (this.busy || this.state === 'COOLDOWN')
          throw new Error('Espera al final de la frase y del cooldown');
        this.perform(
          this.commentary.analyze(m, this.outputProfile, cmd.kind),
          `Comentario · ${cmd.kind}`,
          now,
        );
        break;
      }
    }
    this.tick(now);
  }
  tick(now = Date.now()) {
    if (now - this.lastMinuteAt >= 15000) {
      const elapsed = Math.floor((now - this.lastMinuteAt) / 15000);
      this.lastMinuteAt += elapsed * 15000;
      for (const m of this.manager.followed())
        if (m.status === 'live') m.minute = Math.min(95, m.minute + elapsed);
    }
    this.manager.refresh(now);
    for (const m of this.manager.activeMatches) this.context.refresh(m, now);
    if (this.state === 'THINKING' && now >= this.until) {
      this.startChat(now);
      return;
    }
    if (this.busy && now < this.until) return;
    if (this.state === 'SPEAKING' || this.state === 'REACTING') {
      if (this.speakingChatId) {
        this.chat.finish();
        this.speakingChatId = null;
      }
      this.reset(now);
      this.state = 'COOLDOWN';
      this.until = now + this.settings.reactionCooldown * 1000;
      this.scheduler.lastReactionAt = now;
      return;
    }
    if (this.state === 'COOLDOWN' && now < this.until) return;
    this.state = 'IDLE';
    const control = this.controls.shift();
    if (control) {
      this.perform(control, 'Control manual', now);
      return;
    }
    if (this.pendingChatId) {
      this.state = 'THINKING';
      this.until = now + 200;
      this.animation.play(directiveForAnimation('thinking', 0.45, 'chat'), now);
      return;
    }
    const item = this.scheduler.take(this.manager, this.settings, now);
    if (item) {
      const m = this.manager.get(item.event.matchId);
      this.manager.focus(m.id, now);
      const draft = this.commentary.event(m, item.event, this.outputProfile, item.groupedCount);
      m.lastReaction = { at: now, say: draft.decision.say };
      for (const a of this.alerts)
        if (
          a.id === item.id ||
          (item.groupedCount > 1 &&
            a.event.matchId === m.id &&
            ['yellow', 'substitution'].includes(a.event.type) &&
            a.disposition === 'queued')
        )
          a.disposition = 'reacted';
      this.perform(draft, `${eventLabels[item.event.type]} · ${m.home.shortName}`, now, true);
      return;
    }
    for (const alert of this.alerts)
      if (
        alert.disposition === 'queued' &&
        !this.scheduler.sportsEventQueue.some(
          (i) =>
            i.event.matchId === alert.event.matchId && (i.id === alert.id || i.groupedCount > 1),
        )
      )
        alert.disposition = 'ignored';
    this.manager.suggest(this.settings, now);
    const match = this.manager.followed().find((m) => m.id === this.manager.currentMatchId);
    if (
      match &&
      this.settings.autoReactions &&
      this.profile.commentaryFrequency > 0 &&
      this.scheduler.recentReactions.length < this.settings.maxReactionsPerMinute
    ) {
      const c = this.context.get(match.id),
        interval = 120000 - this.profile.commentaryFrequency * 1000;
      if (now - c.lastCommentAt >= interval) {
        const recent = match.events.filter(
          (e) => e.type === 'chance' && match.minute - e.minute <= 10,
        );
        const choice = (c.publishedCount * 31 + 7) % 100;
        const kind =
          recent.length >= 2 && choice < this.profile.predictionFrequency
            ? 'prediction'
            : choice < this.profile.communityInteractionLevel &&
                !c.personalityMemory.communityQuestions.some((q) => !q.closed)
              ? 'question'
              : 'analysis';
        this.scheduler.recentReactions.push(now);
        this.perform(
          this.commentary.analyze(match, this.outputProfile, kind),
          'Comentario automático',
          now,
        );
      }
    }
  }
  private startChat(now: number) {
    if (!this.pendingChatId) {
      this.state = 'IDLE';
      return;
    }
    const message = this.chat.get(this.pendingChatId);
    this.pendingChatId = null;
    this.speakingChatId = message.id;
    if (
      message.relatedMatchId &&
      this.manager.activeMatches.some((m) => m.id === message.relatedMatchId)
    )
      this.manager.focus(message.relatedMatchId, now);
    this.perform(
      this.brain.respond(message, this.manager, this.outputProfile),
      `Chat · ${message.username}`,
      now,
    );
  }
  /** Connect real TTS playback callbacks here; the same clock drives speech and animation. */
  updateVoiceTiming(
    utteranceId: string,
    positionMs: number,
    durationMs: number,
    cues: VisemeCue[],
    now = Date.now(),
  ): boolean {
    if (!this.animation.updateSpeechTiming(utteranceId, positionMs, cues, durationMs, now))
      return false;
    this.until = now + Math.max(0, durationMs - positionMs);
    return true;
  }
  voiceEnded(utteranceId: string, now = Date.now()): boolean {
    if (!this.animation.finishSpeech(utteranceId, now)) return false;
    this.until = now;
    this.tick(now);
    return true;
  }
  snapshot(now = Date.now()): StudioSnapshot {
    const animation = this.animation.frame(now);
    return structuredClone({
      mode: 'DEMO',
      state: this.state,
      decision: this.decision,
      camera: this.camera.current,
      animation,
      avatar: {
        emotion: this.decision.emotion,
        gesture: this.decision.gesture,
        energy: this.decision.energy,
        speaking: animation.speaking,
      },
      activeMatches: this.manager.activeMatches,
      leagues: this.manager.leagues,
      mainMatchId: this.manager.mainMatchId,
      currentMatchId: this.manager.currentMatchId,
      nextSuggestedMatch: this.manager.nextSuggestedMatch,
      lastVisitedMatch: this.manager.lastVisitedMatch,
      sportsEventQueue: this.scheduler.sportsEventQueue,
      alerts: this.alerts,
      chat: this.chat.messages,
      selectedChatId: this.chat.selectedId,
      mutedUsers: [...this.chat.mutedUsers],
      settings: this.settings,
      profile: this.profile,
      contexts: [...this.context.contexts.values()],
      history: this.history,
      now,
    });
  }
}
const normalizeName = (s: string) => s.trim().toLocaleLowerCase();
