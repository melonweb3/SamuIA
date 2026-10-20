import type { Emotion, ReactionDecision } from '../../shared/src/index';
export const voiceEmotions = [
  'neutral',
  'happy',
  'excited',
  'celebrating',
  'surprised',
  'angry',
  'frustrated',
  'laughing',
  'thinking',
  'tense',
  'sad',
] as const;
export type VoiceEmotion = (typeof voiceEmotions)[number];
export const speechPriorities = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'] as const;
export type SpeechPriority = (typeof speechPriorities)[number];
export const priorityRank: Record<SpeechPriority, number> = {
  LOW: 0,
  NORMAL: 1,
  HIGH: 2,
  CRITICAL: 3,
};
/** The existing CommentaryDraft/ReactionDecision remains the brain output. This envelope adds delivery metadata. */
export interface ReactionEvent {
  avatarState?: import('../../avatar-engine/src/contracts').AvatarVisualState;
  animationOverride?: import('../../shared/src/avatar').AvatarAnimation;
  assetId?: string;
  assetKind?: import('../../avatar-engine/src/contracts').ReactionKind;
  reactOnly?: boolean;
  id: string;
  source: string;
  matchId?: string;
  text: string;
  emotion: VoiceEmotion;
  intensity: number;
  priority: SpeechPriority;
  interruptible: boolean;
  timestamp: number;
  profileId?: string;
}
export function voiceEmotion(decision: ReactionDecision): VoiceEmotion {
  const animation = decision.avatar?.animation;
  if (animation === 'goal' || animation === 'win' || decision.gesture === 'celebracion')
    return 'celebrating';
  if (animation === 'penalty' || animation === 'var') return 'tense';
  if (animation === 'frustrated') return 'frustrated';
  if (animation === 'loss') return 'sad';
  return (
    {
      neutral: 'neutral',
      sonrisa: 'happy',
      risa: 'laughing',
      sorpresa: 'surprised',
      pensativo: 'thinking',
      serio: 'thinking',
      enfadado_leve: 'angry',
    } as const
  )[decision.emotion];
}
export const legacyEmotion: Record<VoiceEmotion, Emotion> = {
  neutral: 'neutral',
  happy: 'sonrisa',
  excited: 'sorpresa',
  celebrating: 'risa',
  surprised: 'sorpresa',
  angry: 'enfadado_leve',
  frustrated: 'serio',
  laughing: 'risa',
  thinking: 'pensativo',
  tense: 'serio',
  sad: 'serio',
};
export type VoiceProviderId = 'simulation' | 'browser' | 'flite' | 'openai' | 'elevenlabs';
export interface VoiceProfile {
  id: string;
  name: string;
  provider: VoiceProviderId;
  providerVoiceId: string;
  type: 'generic' | 'custom' | 'cloned';
  isDefault: boolean;
  createdAt: number;
  status: 'not-configured' | 'waiting-consent' | 'processing' | 'ready' | 'error';
  consentId?: string;
  error?: string;
}
export interface VoiceSettings {
  voiceEnabled: boolean;
  defaultVoiceProfile: string;
  fallbackVoice: string;
  volume: number;
  speechRate: number;
  interruptEnabled: boolean;
}
export const defaultVoiceSettings: VoiceSettings = {
  voiceEnabled: false,
  defaultVoiceProfile: 'simulation',
  fallbackVoice: 'simulation',
  volume: 1,
  speechRate: 1,
  interruptEnabled: true,
};
export interface ProviderCapabilities {
  id: VoiceProviderId;
  name: string;
  available: boolean;
  customVoices: boolean;
  emotion: boolean;
  streaming: boolean;
  requirements: {
    allowedFormats: string[];
    maxUploadBytes: number;
    minimumSeconds: number | null;
    recommendedSeconds: number | null;
    consentRequired: boolean;
    consentText?: string;
    consentLanguage?: string;
    instructions: string;
    documentation: string;
  };
}
export interface VoiceStudioState {
  profiles: VoiceProfile[];
  settings: VoiceSettings;
  providers: ProviderCapabilities[];
  ready: {
    id: string;
    mode: 'audio' | 'browser';
    voiceId: string;
    durationMs: number;
    mime: string;
  } | null;
  playbackOwned: boolean;
  persistenceError: string | null;
  samples: { profileId: string; role: 'sample' | 'consent'; duration: number; bytes: number }[];
  logs: { at: number; code: string; provider?: string }[];
}
export interface GeneratedSpeech {
  audio: Uint8Array;
  mime: string;
  /** Optional future phoneme/viseme timestamps; audio amplitude works without alignment. */
  alignment?: { atMs: number; durationMs: number; phoneme: string }[];
}
export interface SpeechSynthesisProvider {
  readonly id: VoiceProviderId;
  isAvailable(): boolean;
  capabilities(): ProviderCapabilities;
  getVoices(): Promise<{ id: string; name: string }[]>;
  generateSpeech(
    reaction: ReactionEvent,
    profile: VoiceProfile,
    rate: number,
    signal: AbortSignal,
  ): Promise<GeneratedSpeech>;
  /** Optional streaming port. Consumers must negotiate playback support before using it. */
  streamSpeech?: (
    reaction: ReactionEvent,
    profile: VoiceProfile,
    signal: AbortSignal,
  ) => AsyncIterable<Uint8Array>;
  createVoice?(
    name: string,
    sample: Blob,
    consent: Blob | null,
    signal: AbortSignal,
  ): Promise<{ id: string; consentId?: string; verificationRequired: boolean }>;
  verifyVoice?(id: string, signal: AbortSignal): Promise<boolean>;
}
