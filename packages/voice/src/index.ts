import type { Emotion, VisemeCue } from '../../shared/src/index';
import { priorityRank, type ReactionEvent } from './contracts';
export * from './contracts';

export type VoiceStatus =
  'idle' | 'preparing' | 'playing' | 'paused' | 'ended' | 'cancelled' | 'error';
export interface VoiceRequest {
  id: string;
  text: string;
  emotion: Emotion;
  energy: number;
  durationMs: number;
  reaction?: ReactionEvent;
  rate?: number;
}
export interface VoiceEvents {
  started(now: number): void;
  timing(
    positionMs: number,
    durationMs: number,
    cues: VisemeCue[],
    now: number,
    sync?: 'text-simulation' | 'audio-visemes' | 'audio-amplitude',
  ): void;
  ended(now: number): void;
  failed(message: string, now: number): void;
  level?(level: number, now: number): void;
  provider?(name: string, audible: boolean, voice?: string): void;
  buffered?(): void;
}
export interface VoicePlayback {
  cancel(): void;
  pause(): void;
  resume(): void;
}
/** Providers own audio; the controller owns lifecycle, clock and stale callback protection. */
export interface VoiceProvider {
  readonly name: string;
  readonly audible: boolean;
  readonly preparationTimeoutMs?: number;
  durationMs(text: string): number;
  play(request: VoiceRequest, events: VoiceEvents, now: number): VoicePlayback;
}
export interface VoiceSnapshot {
  provider: string;
  audible: boolean;
  status: VoiceStatus;
  utteranceId: string | null;
  text: string;
  positionMs: number;
  durationMs: number;
  sync: 'text-simulation' | 'audio-visemes' | 'audio-amplitude';
  cues: VisemeCue[];
  error: string | null;
  reaction?: ReactionEvent;
  queueLength?: number;
  audioLevel?: number;
  audioLevelAt?: number;
  isSpeaking?: boolean;
  currentText?: string;
  currentReaction?: ReactionEvent;
  currentEmotion?: import('./contracts').VoiceEmotion;
  currentIntensity?: number;
  currentVoice?: string;
  currentProvider?: string;
  speechProgress?: number;
  engineStatus?: 'idle' | 'generating' | 'buffering' | 'speaking' | 'interrupted' | 'error';
}
export class SimulatedVoiceProvider implements VoiceProvider {
  readonly name = 'Simulación local';
  readonly audible = false;
  durationMs(text: string) {
    return Math.max(1800, Math.min(18000, text.length * 38));
  }
  play(_request: VoiceRequest, events: VoiceEvents, now: number): VoicePlayback {
    void _request;
    events.started(now);
    return { cancel() {}, pause() {}, resume() {} };
  }
}
export class VoiceController {
  private value: VoiceSnapshot = {
    provider: 'Simulación local',
    audible: false,
    status: 'idle',
    utteranceId: null,
    text: '',
    positionMs: 0,
    durationMs: 0,
    sync: 'text-simulation',
    cues: [],
    error: null,
  };
  private handle: VoicePlayback | null = null;
  private generation = 0;
  private lastAt = 0;
  private startedAt = 0;
  private playingMs = 0;
  private activeSince = 0;
  private queue: { provider: VoiceProvider; request: VoiceRequest }[] = [];
  private seen = new Map<string, number>();
  private interruptEnabled = true;
  private preparationTimeoutMs = 10000;
  private buffered = false;
  get active() {
    return ['preparing', 'playing', 'paused'].includes(this.value.status);
  }
  snapshot(): VoiceSnapshot {
    return structuredClone({
      ...this.value,
      queueLength: this.queue.length,
      isSpeaking: this.value.status === 'playing',
      currentText: this.value.text,
      currentReaction: this.value.reaction,
      currentEmotion: this.value.reaction?.emotion ?? 'neutral',
      currentIntensity: this.value.reaction?.intensity ?? 0,
      currentProvider: this.value.provider,
      speechProgress: Math.min(1, this.value.positionMs / Math.max(1, this.value.durationMs)),
      engineStatus:
        this.value.status === 'preparing'
          ? this.buffered
            ? 'buffering'
            : 'generating'
          : this.value.status === 'playing'
            ? 'speaking'
            : this.value.status === 'cancelled'
              ? 'interrupted'
              : this.value.status === 'error'
                ? 'error'
                : 'idle',
    });
  }
  configureInterrupts(enabled: boolean) {
    this.interruptEnabled = enabled;
  }
  /** Silent reaction still crosses the same voice boundary, without requesting any audio. */
  react(reaction: ReactionEvent) {
    this.cancel();
    this.value = {
      ...this.value,
      status: 'idle',
      utteranceId: null,
      text: reaction.text,
      reaction,
      positionMs: 0,
      durationMs: 0,
      cues: [],
      sync: 'text-simulation',
      audible: false,
      error: null,
    };
  }
  enqueue(provider: VoiceProvider, request: VoiceRequest, now: number) {
    for (const [key, at] of this.seen) if (now - at > 300000) this.seen.delete(key);
    const key = request.reaction?.id ?? request.id;
    if (this.seen.has(key)) return false;
    this.seen.set(key, now);
    if (this.seen.size > 2000) this.seen.delete(this.seen.keys().next().value!);
    const incoming = request.reaction?.priority ?? 'NORMAL';
    const current = this.value.reaction?.priority ?? 'NORMAL';
    if (
      this.active &&
      this.interruptEnabled &&
      incoming === 'CRITICAL' &&
      priorityRank[current] < 3 &&
      this.value.reaction?.interruptible !== false
    )
      this.start(provider, request, now);
    else if (this.active) {
      this.queue.push({ provider, request });
      this.queue.sort(
        (a, b) =>
          priorityRank[b.request.reaction?.priority ?? 'NORMAL'] -
          priorityRank[a.request.reaction?.priority ?? 'NORMAL'],
      );
      this.queue = this.queue.slice(0, 50);
    } else this.start(provider, request, now);
    return true;
  }
  start(provider: VoiceProvider, request: VoiceRequest, now: number) {
    this.release();
    const generation = ++this.generation;
    this.preparationTimeoutMs = provider.preparationTimeoutMs ?? 10000;
    this.buffered = false;
    this.value = {
      provider: provider.name,
      audible: provider.audible,
      status: 'preparing',
      utteranceId: request.id,
      text: request.text,
      positionMs: 0,
      durationMs: request.durationMs,
      sync: 'text-simulation',
      cues: [],
      error: null,
      reaction: request.reaction,
      audioLevel: 0,
    };
    this.lastAt = this.startedAt = now;
    this.playingMs = 0;
    const valid = () => generation === this.generation && this.active;
    try {
      const handle = provider.play(
        request,
        {
          started: (at) => {
            if (!valid() || this.value.status !== 'preparing') return;
            this.value.status = 'playing';
            this.activeSince = at;
            this.lastAt = at;
          },
          timing: (positionMs, durationMs, cues, at, sync = 'audio-visemes') => {
            if (
              !valid() ||
              !Number.isFinite(positionMs) ||
              positionMs < 0 ||
              !Number.isFinite(durationMs) ||
              durationMs <= 0 ||
              positionMs > durationMs ||
              cues.some(
                (c) =>
                  !Number.isFinite(c.atMs) ||
                  c.atMs < 0 ||
                  !Number.isFinite(c.durationMs) ||
                  c.durationMs <= 0 ||
                  c.atMs + c.durationMs > durationMs ||
                  !Number.isFinite(c.weight) ||
                  c.weight < 0 ||
                  c.weight > 1 ||
                  !['sil', 'aa', 'E', 'O', 'M'].includes(c.viseme),
              )
            )
              return;
            this.value.positionMs = positionMs;
            this.value.durationMs = durationMs;
            this.value.cues = structuredClone(cues);
            this.value.sync = sync;
            this.lastAt = at;
          },
          ended: () => {
            if (valid()) this.finish(request.id);
          },
          failed: (message) => {
            if (valid()) this.fail(message);
          },
          level: (level, at) => {
            if (valid() && Number.isFinite(level)) {
              this.value.audioLevel = Math.min(1, Math.max(0, level));
              this.value.audioLevelAt = at;
              this.value.sync = 'audio-amplitude';
            }
          },
          provider: (name, audible, voice) => {
            if (valid()) {
              this.value.provider = name;
              this.value.audible = audible;
              this.value.currentVoice = voice ?? name;
            }
          },
          buffered: () => {
            if (valid()) this.buffered = true;
          },
        },
        now,
      );
      if (valid()) this.handle = handle;
      else handle.cancel();
    } catch (error) {
      if (valid()) this.fail(error instanceof Error ? error.message : 'No se pudo iniciar la voz');
    }
  }
  tick(now: number) {
    if (!this.active && this.queue.length) {
      const next = this.queue.shift()!;
      this.start(next.provider, next.request, now);
    }
    const elapsed = Math.max(0, now - this.lastAt);
    if (this.value.status === 'playing') {
      this.value.positionMs += elapsed;
      if (!this.value.audible && this.value.positionMs >= this.value.durationMs)
        this.finish(this.value.utteranceId!);
      else if (this.playingMs + Math.max(0, now - this.activeSince) > 120000)
        this.fail('La voz no notificó el final de la frase');
      // Audio duration may initially be estimated. Only its provider may end actual playback.
      else if (this.value.audible && this.value.positionMs >= this.value.durationMs)
        this.value.durationMs = this.value.positionMs + 1000;
    } else if (
      this.value.status === 'preparing' &&
      now - this.startedAt > this.preparationTimeoutMs
    )
      this.fail('La voz no comenzó a reproducirse');
    this.lastAt = now;
  }
  pause(now: number) {
    if (this.value.status !== 'playing') return;
    this.tick(now);
    if (!this.active) return;
    this.playingMs += Math.max(0, now - this.activeSince);
    this.value.status = 'paused';
    try {
      this.handle?.pause();
    } catch {
      this.fail('No se pudo pausar la voz');
    }
  }
  resume(now: number) {
    if (this.value.status !== 'paused') return;
    this.value.status = 'playing';
    this.activeSince = now;
    this.lastAt = now;
    try {
      this.handle?.resume();
    } catch {
      this.fail('No se pudo reanudar la voz');
    }
  }
  finish(id: string): boolean {
    if (!this.active || this.value.utteranceId !== id) return false;
    this.release();
    this.value.status = 'ended';
    this.value.positionMs = this.value.durationMs;
    return true;
  }
  cancel() {
    this.queue = [];
    this.release();
    if (this.active) this.value.status = 'cancelled';
  }
  private fail(message: string) {
    this.release();
    this.value.status = 'error';
    this.value.error = message;
  }
  private release() {
    this.value.audioLevel = 0;
    ++this.generation;
    const handle = this.handle;
    this.handle = null;
    try {
      handle?.cancel();
    } catch {
      /* Cancellation must still invalidate callbacks. */
    }
  }
}
