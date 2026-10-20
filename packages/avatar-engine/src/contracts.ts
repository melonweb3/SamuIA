import type { VoiceEmotion } from '../../voice/src/contracts';
import type { AvatarAnimation } from '../../shared/src/avatar';
export const avatarStates = [
  'idle',
  'talking',
  'listening',
  'thinking',
  'happy',
  'surprised',
  'angry',
  'frustrated',
  'tense',
  'sad',
  'celebrating',
] as const;
export type AvatarVisualState = (typeof avatarStates)[number];
export const renderModes = ['static', 'animated-2d', 'motion-driven', 'future-advanced'] as const;
export type AvatarRenderMode = (typeof renderModes)[number];
export const reactionKinds = [
  'neutral',
  'talking',
  'happy',
  'laughing',
  'surprised',
  'thinking',
  'tense',
  'frustrated',
  'angry',
  'sad',
  'celebrating',
  'celebrating_big',
  'goal_against',
  'penalty',
  'disbelief',
] as const;
export type ReactionKind = (typeof reactionKinds)[number];
export interface AvatarEngineSettings {
  avatarEnabled: boolean;
  lipSyncEnabled: boolean;
  idleAnimationEnabled: boolean;
  blinkEnabled: boolean;
  microMotionEnabled: boolean;
  reactionRandomization: boolean;
  defaultRenderMode: AvatarRenderMode;
  defaultIdleStyle: 'calm' | 'breathing';
  defaultTalkStyle: 'subtle' | 'expressive';
  celebrationIntensityBoost: number;
  reactionCooldown: number;
  videoReferenceEnabled: boolean;
}
export const defaultAvatarSettings: AvatarEngineSettings = {
  avatarEnabled: true,
  lipSyncEnabled: true,
  idleAnimationEnabled: true,
  blinkEnabled: true,
  microMotionEnabled: true,
  reactionRandomization: true,
  defaultRenderMode: 'animated-2d',
  defaultIdleStyle: 'breathing',
  defaultTalkStyle: 'subtle',
  celebrationIntensityBoost: 1.15,
  reactionCooldown: 0.5,
  videoReferenceEnabled: true,
};
/** Small runtime displacements of official image pixels; never a replacement face/video. */
export interface MotionRecipe {
  tilt: number;
  sway: number;
  bounce: number;
  breathe: number;
  mouthGain: number;
}
export interface ReactionAsset {
  id: string;
  name: string;
  emotion: ReactionKind;
  intensityMin: number;
  intensityMax: number;
  animation: AvatarAnimation;
  source: 'built-in' | 'manual' | 'reference-video' | 'placeholder';
  tags: string[];
  durationMs: number;
  compatibleRenderModes: AvatarRenderMode[];
  enabled: boolean;
  favorite: boolean;
  priority: number;
  cooldownMs: number;
  status: 'ready' | 'reference-only' | 'placeholder';
  motion: MotionRecipe;
  videoReferenceId?: string;
  createdAt: number;
}
export interface MotionReference {
  id: string;
  name: string;
  type: 'video';
  sourceKind: 'reference-video';
  emotion: ReactionKind;
  intensity: number;
  duration: number;
  tags: string[];
  enabled: boolean;
  status: 'stored' | 'pending-motion';
  createdAt: number;
  mime: string;
  bytes: number;
}
/** Future extractor consumes private samples and produces numbers, never video frames for broadcast. */
export interface MotionProfile {
  referenceId: string;
  version: number;
  status: 'pending' | 'ready';
  keyframes: {
    atMs: number;
    headYaw: number;
    headPitch: number;
    headRoll: number;
    bodyLean: number;
    expression?: VoiceEmotion;
  }[];
}
export interface MotionReferenceAnalyzer {
  analyze(reference: MotionReference, signal: AbortSignal): Promise<MotionProfile>;
}
export interface AvatarEngineSnapshot {
  avatarEnabled: boolean;
  currentAvatarState: AvatarVisualState;
  currentEmotion: VoiceEmotion;
  currentIntensity: number;
  currentAnimation: string;
  currentReactionAsset: ReactionAsset | null;
  lipSyncEnabled: boolean;
  audioLevel: number;
  speechProgress: number;
  isTalking: boolean;
  isAnimating: boolean;
  manualOverride: boolean;
  renderMode: AvatarRenderMode;
  requestedRenderMode: AvatarRenderMode;
  phase: 'idle' | 'transitioning' | 'manual-triggered' | 'active' | 'cooldown' | 'disabled';
  lipSyncSource: 'audio-amplitude' | 'audio-visemes' | 'text-simulation' | 'none';
  currentText: string;
  fallbackReason: string | null;
  settings: AvatarEngineSettings;
  reactionId?: string;
  priority?: string;
  manualState?: AvatarVisualState;
}
export const stateAnimation: Record<AvatarVisualState, AvatarAnimation> = {
  idle: 'idle',
  talking: 'talking',
  listening: 'idle',
  thinking: 'thinking',
  happy: 'happy',
  surprised: 'shock',
  angry: 'angry',
  frustrated: 'frustrated',
  tense: 'penalty',
  sad: 'loss',
  celebrating: 'goal',
};
