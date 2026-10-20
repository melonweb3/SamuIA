export const platforms = ['youtube', 'twitch', 'kick', 'tiktok'] as const;
export type Platform = (typeof platforms)[number];
export interface ExternalChatMessage {
  platform: Platform;
  id: string;
  liveId: string;
  userId: string;
  username: string;
  message: string;
  timestamp: number;
  receivedAt: number;
  replyTo?: { id: string; userId?: string; username?: string };
  isBot?: boolean;
  simulated?: boolean;
}
export interface CommunitySummary {
  sampleSize: number;
  windowMs: number;
  filtered: Record<string, number>;
  platforms: {
    platform: Platform | 'simulator';
    total: number;
    users: number;
    positive: number;
    negative: number;
    neutral: number;
    divided: boolean;
    simulated: boolean;
  }[];
  topics: { topic: string; total: number; users: number; platform: Platform | 'simulator' }[];
  questions: { id: string; username: string; platform: Platform | 'simulator'; message: string }[];
}
export interface ExternalChatStatus {
  platform: Platform;
  enabled: boolean;
  status:
    | 'disabled'
    | 'unconfigured'
    | 'restricted'
    | 'connecting'
    | 'listening'
    | 'connected'
    | 'reconnecting';
  message: string;
  received: number;
  lastMessageAt: number | null;
  nextRetryAt: number | null;
}
export type Composition = 'landscape' | 'portrait';
export interface BroadcastDestinationStatus {
  platform: Platform;
  enabled: boolean;
  configured: boolean;
  composition: Composition;
  status:
    | 'disabled'
    | 'unconfigured'
    | 'ready'
    | 'waiting-input'
    | 'connecting'
    | 'live'
    | 'reconnecting'
    | 'error';
  message: string;
  failures: number;
  nextRetryAt: number | null;
  title: string;
  category: string;
  metadataSupported: boolean;
}
export interface MultiplatformState {
  chats: ExternalChatStatus[];
  broadcast: {
    running: boolean;
    runId: number;
    previewOnly: boolean;
    encodedBytes: Record<Composition, number>;
    encoderAvailable: boolean;
    audioAvailable: boolean;
    audioReadyId: string | null;
    compositions: { landscape: [number, number]; portrait: [number, number] };
    destinations: BroadcastDestinationStatus[];
    framesAt: number | null;
    logs: { at: number; code: string; platform?: Platform }[];
  };
}
