import { CommunityAnalyzer } from '../../community/src/index';
import { relatedMatch } from '../../chat-engine/src/index';
import type { ExternalChatMessage } from '../../shared/src/index';
import { AppCommunityCommentProvider } from '../../live-data/src/contracts';
import { VoiceController, type VoiceProvider } from '../../voice/src/index';
import {
  voiceEmotion,
  priorityRank,
  type ReactionEvent,
  type SpeechPriority,
} from '../../voice/src/contracts';
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
  type MatchState,
  type LiveMatchRecord,
  type LiveIncident,
  type DataMode,
  type MatchEvent,
} from '../../shared/src/index';
import { createMatch, MatchManager } from '../../football-engine/src/index';
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
  dataMode: DataMode = 'SIMULATION';
  dataFresh = true;
  animation: AvatarAnimationController;
  manager = new MatchManager();
  context = new LiveMatchContextService();
  commentary = new CommentaryEngine(this.context);
  brain = new SamuIABrain(this.commentary);
  chat = new ChatQueue();
  community = new AppCommunityCommentProvider();
  communityAnalyzer = new CommunityAnalyzer();
  scheduler = new SportsReactionScheduler();
  camera = new CameraDirector();
  scenes = new SceneManager();
  voice: VoiceProvider = new MockVoiceProvider();
  playback = new VoiceController();
  private externalVoiceClock = false;
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
  private activeReaction: ReactionEvent | null = null;
  interruptVoiceEnabled = false;
  private lastMinuteAt: number;
  constructor(
    now = Date.now(),
    seed = true,
    private options: { matches?: MatchState[]; advanceMinutes?: boolean } = {},
  ) {
    if (options.matches) this.manager = new MatchManager(options.matches);
    this.animation = new AvatarAnimationController(now);
    this.lastMinuteAt = now;
    for (const m of this.manager.activeMatches) this.context.get(m.id).lastCommentAt = now;
    if (this.manager.currentMatchId) this.manager.focus(this.manager.currentMatchId, now);
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
    const reaction: ReactionEvent = draft.reaction ?? {
      id: id(),
      source,
      matchId: draft.matchId,
      text: draft.decision.say,
      emotion: voiceEmotion(draft.decision),
      intensity: draft.decision.energy / 100,
      priority: sports ? 'HIGH' : 'NORMAL',
      interruptible: true,
      timestamp: now,
    };
    const memoryIds = draft.matchId
      ? this.context.publish(this.manager.get(draft.matchId), draft, now)
      : [];
    this.activeReaction = reaction;
    this.decision = draft.decision;
    this.state = sports ? 'REACTING' : 'SPEAKING';
    this.scenes.receive(draft.decision.scene);
    this.camera.receive(draft.decision.camera, now, this.settings.cameraCooldown);
    const durationMs = this.voice.durationMs(draft.decision.say);
    this.until = now + durationMs;
    const utteranceId = id();
    this.externalVoiceClock = false;
    this.animation.play(
      directiveForDecision(draft.decision),
      now,
      reaction.reactOnly
        ? null
        : {
            id: utteranceId,
            text: draft.decision.say,
            durationMs,
          },
      reaction,
    );
    if (reaction.reactOnly) {
      this.playback.react(reaction);
      this.until = this.animation.frame(now).reactionUntil;
    } else
      this.playback.start(
        this.voice,
        {
          id: utteranceId,
          text: draft.decision.say,
          emotion: draft.decision.emotion,
          energy: draft.decision.energy,
          durationMs,
          reaction,
        },
        now,
      );
    this.syncVoice(now);
    this.history.unshift({
      id: id(),
      at: now,
      source,
      decision: structuredClone(draft.decision),
      matchId: draft.matchId,
      memoryIds,
      sourceIds: [...draft.sourceIds],
    });
    this.history = this.history.slice(0, 100);
  }
  private reset(now: number) {
    this.activeReaction = null;
    this.animation.stop(now);
    this.decision = normalDecision();
    this.scenes.receive('futbol');
    this.camera.reset();
    if (this.manager.mainMatchId) this.manager.focus(this.manager.mainMatchId, now);
  }
  command(cmd: StudioCommand, now = Date.now()) {
    switch (cmd.type) {
      case 'avatar-settings':
        this.animation.configure(cmd.patch);
        this.settings.avatarEngine = structuredClone(this.animation.settings);
        return;
      case 'reaction-upsert':
        this.animation.library.upsert(cmd.asset);
        return;
      case 'reaction-remove':
        this.animation.library.remove(cmd.id);
        return;
      case 'avatar-stop':
        this.animation.stop(now);
        return;
      case 'avatar-manual':
        this.operator(cmd.reaction, cmd.interrupt, now);
        return;
      case 'data-mode':
        throw new Error('El modo de datos se cambia en el coordinador de la sesión');
      case 'avatar-gaze':
        this.animation.lookAt(cmd.target);
        return;
      case 'avatar-simulate': {
        this.playback.cancel();
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
        const input = this.community.process(
          {
            id: cmd.clientId ?? id(),
            username: cmd.username,
            message: cmd.message,
            matchId: cmd.matchId ?? this.manager.currentMatchId ?? 'studio',
            timestamp: now,
          },
          now,
        );
        if (!input) break;
        if (cmd.matchId) this.manager.get(cmd.matchId);
        const message = this.chat.add(
          input.username,
          input.message,
          this.manager.followed(),
          now,
          cmd.matchId ?? this.manager.currentMatchId ?? undefined,
        );
        this.communityAnalyzer.ingest(
          {
            id: message.id,
            platform: 'simulator',
            liveId: 'studio',
            userId: message.username,
            username: message.username,
            message: message.message,
            timestamp: now,
            matchId: message.relatedMatchId,
            simulated: true,
          },
          now,
          false,
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
          this.playback.cancel();
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
          this.commentary.analyze(
            m,
            this.outputProfile,
            cmd.kind,
            cmd.kind === 'community' ? this.communityTrend(m.id, now) : undefined,
          ),
          `Comentario · ${cmd.kind}`,
          now,
        );
        break;
      }
    }
    this.tick(now);
  }
  tick(now = Date.now()) {
    this.playback.tick(now);
    this.syncVoice(now);
    const current = this.activeReaction ?? this.playback.snapshot().reaction;
    if (
      this.busy &&
      (this.interruptVoiceEnabled ||
        (current?.source === 'Operador · Reaction Studio' &&
          this.animation.settings.avatarEnabled)) &&
      current?.priority !== 'CRITICAL' &&
      current?.interruptible !== false &&
      this.settings.autoReactions
    ) {
      const critical = this.scheduler.sportsEventQueue.find((i) =>
        ['goal', 'red'].includes(i.event.type),
      );
      if (critical) {
        const item = this.scheduler.take(
          this.manager,
          { ...this.settings, reactionCooldown: 0 },
          now,
          true,
        );
        if (item) {
          this.playback.cancel();
          if (this.speakingChatId) {
            this.chat.silence();
            this.speakingChatId = null;
          }
          this.startSports(item, now);
          return;
        }
      }
    }
    if (this.options.advanceMinutes !== false && now - this.lastMinuteAt >= 15000) {
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
    if (this.busy && (this.playback.active || now < this.until)) return;
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
      this.startSports(item, now);
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
      this.dataFresh &&
      this.profile.commentaryFrequency > 0 &&
      this.scheduler.recentReactions.length < this.settings.maxReactionsPerMinute
    ) {
      const c = this.context.get(match.id),
        interval = 120000 - this.profile.commentaryFrequency * 1000;
      if (now - c.lastCommentAt >= interval) {
        const recent = match.events.filter(
          (e) =>
            ['chance', 'shot', 'save', 'missed_chance'].includes(e.type) &&
            match.minute - e.minute <= 10,
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
    let draft = this.brain.respond(message, this.manager, this.outputProfile);
    if (
      /sentimiento|tendencia|opina.*(twitch|youtube|kick|tiktok)|resum.*chat/i.test(message.message)
    ) {
      const match = this.manager.activeMatches.find((m) => m.id === message.relatedMatchId);
      if (match)
        draft = this.commentary.analyze(
          match,
          this.outputProfile,
          'community',
          this.communityTrend(match.id, now),
        );
      else {
        draft.decision.say = this.communityAnalyzer.describe(undefined, now);
        draft.sourceIds = this.communityAnalyzer.sourceIds(undefined, now);
      }
    }
    draft.sourceIds = [...new Set([...draft.sourceIds, message.id])];
    this.perform(draft, `Chat · ${message.username}`, now);
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
    this.playback.cancel();
    this.externalVoiceClock = true;
    this.until = now + Math.max(0, durationMs - positionMs);
    return true;
  }
  voiceEnded(utteranceId: string, now = Date.now()): boolean {
    if (!this.animation.finishSpeech(utteranceId, now)) return false;
    this.playback.finish(utteranceId);
    this.playback.cancel();
    this.until = now;
    this.tick(now);
    return true;
  }
  private communityTrend(matchId: string, now: number) {
    const summary = this.communityAnalyzer.summary(matchId, now);
    return {
      text: this.communityAnalyzer.describe(matchId, now),
      sourceIds: this.communityAnalyzer.sourceIds(matchId, now),
      appendToPoll: summary.platforms.some((p) => p.platform !== 'simulator'),
    };
  }
  receiveExternalChat(input: ExternalChatMessage, now = Date.now()) {
    const matchId =
      relatedMatch(input.message, this.manager.followed())?.id ??
      this.manager.currentMatchId ??
      undefined;
    const canonicalId = JSON.stringify([input.platform, input.liveId, input.id]);
    const identity = JSON.stringify([input.platform, input.liveId, input.userId]);
    if (this.chat.mutedUsers.has(identity)) return false;
    if (
      !this.communityAnalyzer.ingest({ ...input, id: canonicalId, matchId }, now, true, input.isBot)
    )
      return false;
    const message = this.chat.add(
      input.username,
      input.message,
      this.manager.followed(),
      input.timestamp,
      matchId,
    );
    message.id = canonicalId;
    message.platform = input.platform;
    message.external = { ...input };
    message.status = 'pending';
    if (/[?¿]/.test(input.message)) message.priority += 15;
    if (message.relatedMatchId)
      this.context.receiveCommunity(this.manager.get(message.relatedMatchId), message);
    return true;
  }
  applyLiveMatch(record: LiveMatchRecord, now: number) {
    let match = this.manager.activeMatches.find((m) => m.id === record.id);
    if (!match) {
      match = createMatch(record.league.id, record.home, record.away, record.id);
      for (const type of Object.keys(match.subscription.reactions.events))
        match.subscription.reactions.events[type as MatchEvent['type']] = true;
      this.manager.activeMatches.push(match);
      if (!this.manager.currentMatchId)
        this.manager.currentMatchId = this.manager.mainMatchId = match.id;
      this.context.get(match.id).lastCommentAt = now;
    }
    if (match.liveData && record.updatedAt < match.liveData.updatedAt) return false;
    if (!this.manager.leagues.some((l) => l.id === record.league.id))
      this.manager.leagues.push({ ...record.league, enabled: true, importance: 5 });
    match.home = record.home;
    match.away = record.away;
    match.minute = record.minute;
    match.score = { ...record.score };
    match.status = record.status;
    for (const side of ['home', 'away'] as const)
      match.statistics[side] = { ...match.statistics[side], ...record.statistics[side] };
    match.liveData = {
      provider: record.incidents[0]?.provider ?? 'LIVE',
      updatedAt: record.updatedAt,
      receivedAt: now,
      availableStatistics: {
        home: Object.keys(record.statistics.home),
        away: Object.keys(record.statistics.away),
      },
      lineups: record.lineups,
      incidents: match.liveData?.incidents ?? [],
    };
    return true;
  }
  receiveLiveIncident(incident: LiveIncident, announce: boolean, now: number) {
    const match = this.manager.get(incident.matchId);
    match.liveData!.incidents.push(incident);
    match.liveData!.incidents = match.liveData!.incidents.slice(-300);
    const event: MatchEvent = {
      id: `${incident.provider}:${incident.matchId}:${incident.channel}:${incident.id}`,
      matchId: match.id,
      type: incident.kind,
      side: incident.side ?? 'home',
      minute: incident.minute,
      timestamp:
        incident.timestampQuality === 'estimated' ? incident.receivedAt : incident.timestamp,
      relatedPlayer: incident.player,
      live: incident,
    };
    match.events.push(event);
    match.events = match.events.slice(-300);
    this.context.observe(match, event);
    if (!incident.side) {
      const moment = this.context.get(match.id).personalityMemory.memorableMoments.at(-1)!;
      moment.relatedTeam = null;
      moment.content = `${incident.kind}: partido (${match.score.home}-${match.score.away})`;
    }
    this.manager.refresh(now);
    if (announce) this.queueLiveIncident(incident);
  }
  queueLiveIncident(incident: LiveIncident) {
    const match = this.manager.get(incident.matchId);
    const event = match.events.find((e) => e.live === incident);
    if (!event || this.alerts.some((a) => a.id === event.id)) return;
    event.type = incident.kind;
    event.relatedPlayer = incident.player;
    const moment = this.context
      .get(match.id)
      .personalityMemory.memorableMoments.find((m) => m.id === event.id);
    if (moment) {
      moment.content = `${incident.kind}: ${incident.side ? match[incident.side].shortName : 'partido'} (${match.score.home}-${match.score.away})`;
      moment.relatedPlayer = incident.player ?? null;
      moment.sourceIds = [...new Set([event.id, ...incident.sourceIds])];
    }
    if (this.manager.leagues.some((l) => l.id === match.leagueId && l.enabled)) {
      // Use receipt time for queue expiry; occurrence time remains intact in the event and memory.
      const queued = this.scheduler.enqueue(
        event,
        match,
        this.manager.leagues.find((l) => l.id === match.leagueId)?.importance ?? 5,
        this.settings,
      );
      this.alerts.unshift({
        id: event.id,
        event,
        label: `${eventLabels[event.type].toUpperCase()} · ${match.home.shortName} – ${match.away.shortName}`,
        secondary: match.id !== this.manager.mainMatchId,
        disposition: queued ? 'queued' : 'alert-only',
      });
      this.alerts = this.alerts.slice(0, 60);
    }
  }
  setVoiceProvider(provider: VoiceProvider, now = Date.now()) {
    const speech = this.animation.frame(now).speech;
    if (speech) this.voiceEnded(speech.id, now);
    else this.playback.cancel();
    this.voice = provider;
  }
  operator(reaction: ReactionEvent, interrupt = false, now = Date.now()) {
    if (reaction.matchId) this.manager.get(reaction.matchId);
    if (
      this.history.some((h) => h.sourceIds.includes(reaction.id)) ||
      this.controls.some((d) => d.reaction?.id === reaction.id)
    )
      return false;
    const draft = this.brain.operator(reaction);
    const active = this.activeReaction ?? this.playback.snapshot().reaction;
    const mayInterrupt =
      (this.interruptVoiceEnabled || reaction.source === 'Operador · Reaction Studio') &&
      (interrupt || (reaction.priority === 'CRITICAL' && active?.priority !== 'CRITICAL')) &&
      active?.interruptible !== false;
    if (!this.busy || mayInterrupt) {
      this.playback.cancel();
      if (this.speakingChatId) {
        this.chat.silence();
        this.speakingChatId = null;
      }
      this.perform(draft, reaction.source, now);
    } else {
      this.controls.push(draft);
      this.controls.sort(
        (a, b) =>
          priorityRank[b.reaction?.priority ?? 'NORMAL'] -
          priorityRank[a.reaction?.priority ?? 'NORMAL'],
      );
      this.controls = this.controls.slice(0, 50);
    }
    return true;
  }
  private startSports(item: import('../../shared/src/index').SportsEventQueueItem, now: number) {
    const m = this.manager.get(item.event.matchId);
    this.manager.focus(m.id, now);
    const draft = this.commentary.event(m, item.event, this.outputProfile, item.groupedCount);
    const priority: SpeechPriority = ['goal', 'red'].includes(item.event.type)
      ? 'CRITICAL'
      : ['penalty', 'var', 'chance', 'missed_chance', 'save'].includes(item.event.type)
        ? 'HIGH'
        : 'NORMAL';
    draft.reaction = {
      id: item.event.id,
      source: `match:${item.event.type}`,
      matchId: m.id,
      text: draft.decision.say,
      emotion: voiceEmotion(draft.decision),
      intensity: draft.decision.energy / 100,
      priority,
      interruptible: priority !== 'CRITICAL',
      timestamp: now,
    };
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
  }
  pauseVoice(now = Date.now()) {
    this.playback.pause(now);
    this.syncVoice(now);
  }
  resumeVoice(now = Date.now()) {
    this.playback.resume(now);
    this.syncVoice(now);
  }
  private syncVoice(now: number) {
    if (this.externalVoiceClock) return;
    const voice = this.playback.snapshot();
    if (!voice.utteranceId || this.animation.frame(now).speech?.id !== voice.utteranceId) return;
    if (this.playback.active) {
      if (voice.sync === 'audio-amplitude')
        this.animation.updateSpeechAmplitude(
          voice.utteranceId,
          voice.audioLevel ?? 0,
          voice.audioLevelAt ?? now,
        );
      if (voice.sync === 'audio-visemes')
        this.animation.updateSpeechTiming(
          voice.utteranceId,
          voice.positionMs,
          voice.cues,
          voice.durationMs,
          now,
        );
      this.animation.setPlayback(
        voice.utteranceId,
        voice.status as 'preparing' | 'playing' | 'paused',
        voice.positionMs,
        voice.durationMs,
        now,
      );
    } else if (
      voice.status === 'ended' ||
      voice.status === 'error' ||
      voice.status === 'cancelled'
    ) {
      this.animation.finishSpeech(voice.utteranceId, now);
      this.until = now;
    }
  }
  snapshot(now = Date.now()): StudioSnapshot {
    if (this.settings.avatarEngine) this.animation.configure(this.settings.avatarEngine);
    const animation = this.animation.frame(now);
    return structuredClone({
      mode: 'DEMO',
      dataMode: this.dataMode,
      community: this.communityAnalyzer.summary(undefined, now),
      voice: {
        ...this.playback.snapshot(),
        queueLength: (this.playback.snapshot().queueLength ?? 0) + this.controls.length,
      },
      state: this.state,
      decision: this.decision,
      camera: this.camera.current,
      animation,
      reactionLibrary: this.animation.library.snapshot(),
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
