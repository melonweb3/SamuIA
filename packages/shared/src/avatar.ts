import type { Emotion, ReactionDecision } from './index';

export const avatarAnimations = [
  'idle',
  'talking',
  'happy',
  'goal',
  'shock',
  'angry',
  'laugh',
  'frustrated',
  'thinking',
  'var',
  'penalty',
  'win',
  'loss',
] as const;
export type AvatarAnimation = (typeof avatarAnimations)[number];
export const avatarExpressions = [
  'neutral',
  'happy',
  'shock',
  'angry',
  'laugh',
  'frustrated',
  'thinking',
  'sad',
] as const;
export type AvatarExpression = (typeof avatarExpressions)[number];
export const gazeTargets = ['camera', 'chat', 'match', 'radar'] as const;
export type GazeTarget = (typeof gazeTargets)[number];
export interface AvatarDirective {
  animation: AvatarAnimation;
  expression: AvatarExpression;
  intensity: number; // 0..1, independent of renderer units
  gaze: GazeTarget;
}
export type Viseme = 'sil' | 'aa' | 'E' | 'O' | 'M';
export interface VisemeCue {
  atMs: number;
  durationMs: number;
  viseme: Viseme;
  weight: number;
}
export interface AvatarSpeech {
  id: string;
  text: string;
  startedAt: number;
  durationMs: number;
  source: 'text-simulation' | 'audio-visemes' | 'audio-amplitude';
  audioLevel?: { value: number; receivedAt: number };
  cues: VisemeCue[];
  playback?: 'preparing' | 'playing' | 'paused';
  clock?: { positionMs: number; receivedAt: number };
}
export interface AvatarAnimationFrame {
  mode: 'SIMULATION';
  clipId: number;
  requestedAnimation: AvatarAnimation;
  animation: AvatarAnimation;
  expression: AvatarExpression;
  intensity: number;
  startedAt: number;
  reactionUntil: number;
  sampledAt: number;
  gaze: { target: GazeTarget; x: number; y: number };
  head: { yaw: number; pitch: number; roll: number }; // degrees
  body: { lean: number; bob: number }; // normalized
  blink: number; // closure 0..1
  mouth: { viseme: Viseme; open: number };
  speaking: boolean;
  speech: AvatarSpeech | null;
  transitions: { at: number; from: AvatarAnimation; to: AvatarAnimation; clipId: number }[];
}
export function directiveForAnimation(
  animation: AvatarAnimation,
  intensity = 0.65,
  gaze: GazeTarget = 'camera',
): AvatarDirective {
  const expression: AvatarExpression = ['goal', 'happy', 'win'].includes(animation)
    ? 'happy'
    : animation === 'laugh'
      ? 'laugh'
      : ['shock', 'penalty'].includes(animation)
        ? 'shock'
        : animation === 'angry'
          ? 'angry'
          : animation === 'frustrated'
            ? 'frustrated'
            : animation === 'loss'
              ? 'sad'
              : ['thinking', 'var'].includes(animation)
                ? 'thinking'
                : 'neutral';
  return { animation, expression, intensity: Math.max(0, Math.min(1, intensity)), gaze };
}
export function directiveForDecision(decision: ReactionDecision): AvatarDirective {
  if (decision.avatar) return decision.avatar;
  const mapping: Record<Emotion, AvatarAnimation> = {
    neutral: decision.say ? 'talking' : 'idle',
    sonrisa: 'happy',
    risa: 'laugh',
    sorpresa: 'shock',
    pensativo: 'thinking',
    serio: 'thinking',
    enfadado_leve: 'angry',
  };
  return directiveForAnimation(
    decision.gesture === 'celebracion' ? 'goal' : mapping[decision.emotion],
    decision.energy / 100,
  );
}
