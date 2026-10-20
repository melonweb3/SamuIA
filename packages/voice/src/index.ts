import type { Emotion, VisemeCue } from '../../shared/src/index';

export type VoiceStatus =
  'idle' | 'preparing' | 'playing' | 'paused' | 'ended' | 'cancelled' | 'error';
export interface VoiceRequest {
  id: string;
  text: string;
  emotion: Emotion;
  energy: number;
  durationMs: number;
}
export interface VoiceEvents {
  started(now: number): void;
  timing(
    positionMs: number,
    durationMs: number,
    cues: VisemeCue[],
    now: number,
    sync?: 'text-simulation' | 'audio-visemes',
  ): void;
  ended(now: number): void;
  failed(message: string, now: number): void;
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
  sync: 'text-simulation' | 'audio-visemes';
  cues: VisemeCue[];
  error: string | null;
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
  get active() {
    return ['preparing', 'playing', 'paused'].includes(this.value.status);
  }
  snapshot(): VoiceSnapshot {
    return structuredClone(this.value);
  }
  start(provider: VoiceProvider, request: VoiceRequest, now: number) {
    this.cancel();
    const generation = ++this.generation;
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
    } else if (this.value.status === 'preparing' && now - this.startedAt > 10000)
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
    this.release();
    if (this.active) this.value.status = 'cancelled';
  }
  private fail(message: string) {
    this.release();
    this.value.status = 'error';
    this.value.error = message;
  }
  private release() {
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
