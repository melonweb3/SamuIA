export type {
  MatchDataProvider,
  LiveCommentaryProvider,
  CommunityCommentProvider,
} from '../packages/live-data/src/contracts';
import type {
  ChatMessage,
  League,
  MatchState,
  MatchEvent,
  ReactionDecision,
  Emotion,
} from '../packages/shared/src/index';
export interface ChatProvider {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getMessages(): AsyncIterable<ChatMessage>;
  sendMessage?(message: string): Promise<void>;
}
export interface SportsDataProvider {
  getLeagues(): Promise<League[]>;
  getMatches(): Promise<MatchState[]>;
  getMatchState(id: string): Promise<MatchState>;
  subscribeToMatch(id: string, listener: (event: MatchEvent) => void): Promise<void>;
  unsubscribeFromMatch(id: string): Promise<void>;
  getEvents(id: string): Promise<MatchEvent[]>;
  getStatistics(id: string): Promise<MatchState['statistics']>;
}
export interface BrainProvider {
  decide(context: { message: string; matches: MatchState[] }): Promise<ReactionDecision>;
}
export interface VoiceProvider {
  speak(input: {
    text: string;
    emotion: Emotion;
    energy: number;
  }): Promise<{ durationMs: number; audio?: Uint8Array }>;
  stop(): void;
}
