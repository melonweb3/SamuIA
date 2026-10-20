import {
  directiveForAnimation,
  type AvatarAnimationFrame,
  type AvatarDirective,
  type GazeTarget,
  type Viseme,
  type VisemeCue,
} from '../../shared/src/index';

/** Adapter contract contains no portrait filenames or model-specific SDK types. */
export interface AvatarRendererAdapter {
  name: string;
  capabilities: {
    headBody: boolean;
    blink: boolean;
    lipSync: boolean;
    expressions: boolean;
    gaze: boolean;
  };
  update(frame: AvatarAnimationFrame): void;
  dispose(): void;
}
export type AvatarRendererFactory = (host: HTMLElement) => AvatarRendererAdapter;
const gazePositions: Record<GazeTarget, [number, number]> = {
  camera: [0, 0],
  chat: [0.7, 0.2],
  match: [0.65, -0.15],
  radar: [-0.65, 0.1],
};

/** Timing from text is a simulation, not phoneme alignment or generated audio. */
export function textVisemes(text: string, durationMs: number): VisemeCue[] {
  const chars = Array.from(
    text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase(),
  );
  const unit = durationMs / Math.max(1, chars.length);
  return chars.map((char, i) => {
    const viseme: Viseme = /[mbp]/.test(char)
      ? 'M'
      : /[a]/.test(char)
        ? 'aa'
        : /[ei]/.test(char)
          ? 'E'
          : /[ou]/.test(char)
            ? 'O'
            : /[a-zñ]/.test(char)
              ? 'E'
              : 'sil';
    return {
      atMs: i * unit,
      durationMs: unit,
      viseme,
      weight: viseme === 'sil' || viseme === 'M' ? 0 : 0.75,
    };
  });
}
export function sampleAvatarFrame(base: AvatarAnimationFrame, now: number): AvatarAnimationFrame {
  const elapsed = Math.max(0, now - base.startedAt);
  const speech = base.speech;
  const position = speech
    ? Math.max(
        0,
        speech.clock
          ? speech.clock.positionMs +
              (speech.playback && speech.playback !== 'playing' ? 0 : now - speech.clock.receivedAt)
          : now - speech.startedAt,
      )
    : 0;
  const speaking =
    !!speech && (!speech.playback || speech.playback === 'playing') && position < speech.durationMs;
  const animation =
    now < base.reactionUntil ? base.requestedAnimation : speaking ? 'talking' : 'idle';
  const activeReaction = animation !== 'idle' && animation !== 'talking';
  const intensity = base.intensity;
  const blinkPhase = elapsed % 3800;
  const blink =
    blinkPhase >= 3100 && blinkPhase <= 3300 ? Math.sin(((blinkPhase - 3100) / 200) * Math.PI) : 0;
  const cue = speaking
    ? speech?.cues.find((c) => position >= c.atMs && position < c.atMs + c.durationMs)
    : undefined;
  const envelope = cue ? Math.sin((Math.PI * (position - cue.atMs)) / cue.durationMs) : 0;
  return {
    ...base,
    sampledAt: now,
    animation,
    speaking,
    expression: activeReaction ? base.expression : 'neutral',
    blink,
    head: {
      yaw: base.gaze.x * 10 + Math.sin(elapsed / 1900) * 1.5,
      pitch: base.gaze.y * 6 + Math.sin(elapsed / 1500) * 0.8,
      roll: Math.sin(elapsed / 2200) * (activeReaction ? 2.5 : 0.6) * intensity,
    },
    body: {
      lean: Math.sin(elapsed / 1800) * 0.025 * intensity,
      bob:
        animation === 'goal' || animation === 'win'
          ? Math.abs(Math.sin(elapsed / 170)) * 0.12 * intensity
          : Math.sin(elapsed / 1300) * 0.012,
    },
    mouth: {
      viseme: cue?.viseme ?? 'sil',
      open:
        speech?.source === 'audio-amplitude'
          ? speaking && speech.audioLevel && now - speech.audioLevel.receivedAt < 600
            ? speech.audioLevel.value
            : 0
          : (cue?.weight ?? 0) * Math.max(0, envelope),
    },
  };
}
export class AvatarAnimationController {
  private sequence = 0;
  private base: AvatarAnimationFrame;
  private lastReported: AvatarAnimationFrame['animation'] = 'idle';
  constructor(now = Date.now()) {
    this.base = {
      mode: 'SIMULATION',
      clipId: 0,
      requestedAnimation: 'idle',
      animation: 'idle',
      expression: 'neutral',
      intensity: 0.35,
      startedAt: now,
      reactionUntil: now,
      sampledAt: now,
      gaze: { target: 'camera', x: 0, y: 0 },
      head: { yaw: 0, pitch: 0, roll: 0 },
      body: { lean: 0, bob: 0 },
      blink: 0,
      mouth: { viseme: 'sil', open: 0 },
      speaking: false,
      speech: null,
      transitions: [],
    };
  }
  play(
    directive: AvatarDirective,
    now: number,
    speech: { id: string; text: string; durationMs: number } | null = null,
  ) {
    // Replacing the clip also cancels every cue from the previous utterance.
    this.sequence++;
    const hold = ['idle', 'talking'].includes(directive.animation)
      ? 0
      : Math.min(
          speech?.durationMs ?? 3000,
          ['var', 'penalty', 'thinking'].includes(directive.animation) ? 5000 : 2800,
        );
    this.base = {
      ...this.base,
      clipId: this.sequence,
      requestedAnimation: directive.animation,
      expression: directive.expression,
      intensity: Math.max(0, Math.min(1, directive.intensity)),
      startedAt: now,
      reactionUntil: now + hold,
      speech:
        speech && speech.text
          ? {
              ...speech,
              startedAt: now,
              source: 'text-simulation',
              cues: textVisemes(speech.text, speech.durationMs),
            }
          : null,
    };
    this.lookAt(directive.gaze);
    this.frame(now);
  }
  lookAt(target: GazeTarget) {
    const [x, y] = gazePositions[target];
    this.base.gaze = { target, x, y };
  }
  /** A real voice bridge supplies measured playback position + visemes. Reject late callbacks. */
  updateSpeechTiming(
    id: string,
    positionMs: number,
    cues: VisemeCue[],
    durationMs: number,
    now: number,
  ): boolean {
    if (
      !this.base.speech ||
      this.base.speech.id !== id ||
      !Number.isFinite(positionMs) ||
      positionMs < 0 ||
      positionMs > durationMs ||
      !Number.isFinite(durationMs) ||
      durationMs <= 0 ||
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
      return false;
    this.base.speech = {
      ...this.base.speech,
      source: 'audio-visemes',
      cues: structuredClone(cues),
      durationMs,
      clock: { positionMs, receivedAt: now },
    };
    return true;
  }
  setPlayback(
    id: string,
    playback: 'preparing' | 'playing' | 'paused',
    positionMs: number,
    durationMs: number,
    now: number,
  ) {
    if (this.base.speech?.id !== id) return false;
    this.base.speech.playback = playback;
    if (this.base.speech.source === 'text-simulation' && this.base.speech.durationMs !== durationMs)
      this.base.speech.cues = textVisemes(this.base.speech.text, durationMs);
    this.base.speech.durationMs = durationMs;
    this.base.speech.clock = { positionMs, receivedAt: now };
    return true;
  }
  updateSpeechAmplitude(id: string, level: number, at: number) {
    if (this.base.speech?.id !== id || !Number.isFinite(level)) return false;
    this.base.speech.source = 'audio-amplitude';
    this.base.speech.audioLevel = { value: Math.min(1, Math.max(0, level)), receivedAt: at };
    return true;
  }
  finishSpeech(id: string, now: number): boolean {
    if (this.base.speech?.id !== id) return false;
    this.stop(now);
    return true;
  }
  stop(now: number) {
    this.play(directiveForAnimation('idle', 0.35), now);
  }
  frame(now = Date.now()): AvatarAnimationFrame {
    const frame = sampleAvatarFrame(this.base, now);
    if (frame.animation !== this.lastReported) {
      this.base.transitions = [
        ...this.base.transitions,
        { at: now, from: this.lastReported, to: frame.animation, clipId: this.sequence },
      ].slice(-30);
      this.lastReported = frame.animation;
    }
    return structuredClone({ ...frame, transitions: this.base.transitions });
  }
}
