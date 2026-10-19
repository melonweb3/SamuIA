import type { VoiceSnapshot } from '../../voice/src/index';
import type { AvatarDirective, AvatarAnimationFrame, AvatarAnimation, GazeTarget } from './avatar';
export * from './avatar';
export const scenes = [
  'charlando',
  'futbol',
  'gaming',
  'tecnologia',
  'enfado',
  'celebracion',
] as const;
export const emotions = [
  'neutral',
  'sonrisa',
  'risa',
  'sorpresa',
  'pensativo',
  'serio',
  'enfadado_leve',
] as const;
export const cameras = ['primer_plano', 'plano_medio', 'streamer', 'tres_cuartos'] as const;
export const gestures = [
  'ninguno',
  'asentir',
  'señalar',
  'saludo',
  'pulgar_arriba',
  'mano_barbilla',
  'celebracion',
] as const;
export type Scene = (typeof scenes)[number];
export type Emotion = (typeof emotions)[number];
export type Camera = (typeof cameras)[number];
export interface ReactionDecision {
  avatar?: AvatarDirective;
  say: string;
  scene: Scene;
  emotion: Emotion;
  camera: Camera;
  gesture: (typeof gestures)[number];
  energy: number;
}
export const eventTypes = [
  'kickoff',
  'second_half',
  'goal',
  'chance',
  'missed_chance',
  'yellow',
  'red',
  'penalty',
  'var',
  'substitution',
  'halftime',
  'fulltime',
] as const;
export type EventType = (typeof eventTypes)[number];
export type Side = 'home' | 'away';
export type Priority = 'ALTA' | 'MEDIA' | 'BAJA';
export const eventLabels: Record<EventType, string> = {
  kickoff: 'Inicio del partido',
  second_half: 'Segunda parte',
  goal: 'Gol',
  chance: 'Ocasión clara',
  missed_chance: 'Ocasión fallada',
  yellow: 'Amarilla',
  red: 'Roja',
  penalty: 'Penalti',
  var: 'VAR',
  substitution: 'Cambio',
  halftime: 'Descanso',
  fulltime: 'Final',
};
export interface League {
  id: string;
  name: string;
  enabled: boolean;
  importance: number;
}
export interface Team {
  id: string;
  name: string;
  shortName: string;
  aliases: string[];
}
export interface TeamStatistics {
  possession: number;
  shots: number;
  shotsOnTarget: number;
  xG: number;
  yellow: number;
  red: number;
  corners: number;
}
export interface MatchEvent {
  id: string;
  matchId: string;
  type: EventType;
  side: Side;
  minute: number;
  timestamp: number;
  relatedPlayer?: string;
}
export interface MatchReactionSettings {
  paused: boolean;
  events: Record<EventType, boolean>;
}
export interface MatchSubscription {
  tracking: boolean;
  priority: Priority;
  reactions: MatchReactionSettings;
}
export interface MemoryEntry {
  id: string;
  timestamp: number;
  minute: number;
  content: string;
  relatedPlayer: string | null;
  relatedTeam: string | null;
  confidence?: number;
  sourceIds: string[];
}
export interface Opinion extends MemoryEntry {
  metric: 'xG';
  team: Side | null;
  homeXG: number;
  awayXG: number;
}
export interface Prediction extends MemoryEntry {
  target: 'next_goal';
  side: Side | null;
  baseline: { home: number; away: number };
  expiresMinute: number;
  status: 'pending' | 'success' | 'failed';
  resolvedBy?: string;
  acknowledged: boolean;
}
export interface CommunityQuestion extends MemoryEntry {
  kind: 'yes-no';
  closed: boolean;
}
export interface CommunityResponse extends MemoryEntry {
  questionId: string;
  username: string;
  vote: 'yes' | 'no';
  messageId: string;
}
export interface PersonalityMemory {
  previousOpinions: Opinion[];
  predictions: Prediction[];
  successfulPredictions: Prediction[];
  failedPredictions: Prediction[];
  playersPraised: MemoryEntry[];
  playersCriticized: MemoryEntry[];
  communityQuestions: CommunityQuestion[];
  communityResponses: CommunityResponse[];
  runningJokes: MemoryEntry[];
  memorableMoments: MemoryEntry[];
}
export interface LiveMatchContext {
  matchId: string;
  intensity: 1 | 2 | 3 | 4 | 5;
  personalityMemory: PersonalityMemory;
  lastExpressions: string[];
  publishedCount: number;
  lastCommentAt: number;
}
export interface MatchState {
  id: string;
  leagueId: string;
  home: Team;
  away: Team;
  score: Record<Side, number>;
  minute: number;
  status: 'upcoming' | 'live' | 'halftime' | 'finished';
  statistics: Record<Side, TeamStatistics>;
  events: MatchEvent[];
  probabilities: { home: number; draw: number; away: number };
  excitementScore: number;
  subscription: MatchSubscription;
  lastReaction: { at: number; say: string } | null;
  contextType: 'regular' | 'derby' | 'final';
}
export interface PersonalityRule {
  scope: 'team' | 'league';
  key: string;
  emotionLevel: number;
  rivalryLevel: number;
}
export interface AICommentatorProfile {
  name: string;
  avatar: string;
  description: string;
  personalityStyle: string;
  catchphrases: string[];
  prohibitedExpressions: string[];
  humorLevel: number;
  emotionLevel: number;
  rivalryLevel: number;
  predictionFrequency: number;
  emojiFrequency: number;
  communityInteractionLevel: number;
  commentaryFrequency: number;
  galicianLevel: number;
  responseLength: 'short' | 'medium' | 'long';
  communityTeams: Record<string, Side | null>;
  specialRules: PersonalityRule[];
}
export type StudioBackdrop = 'auto' | '01' | '02' | '03' | '04' | '05';
export interface StudioSettings {
  studioComposition: 'integrated' | 'portrait';
  studioBackdrop: StudioBackdrop;
  studioGraphics: boolean;
  studioLighting: boolean;
  autoReactions: boolean;
  maxReactionsPerMinute: number;
  reactionCooldown: number;
  cameraCooldown: number;
  carouselCooldown: number;
  carouselEnabled: boolean;
  showSecondaryAlerts: boolean;
  reactToFavorites: boolean;
  safeMode: boolean;
  favoriteTeams: string[];
  favoriteLeagues: string[];
}
export interface ChatMessage {
  id: string;
  username: string;
  message: string;
  platform: 'simulator' | 'twitch' | 'youtube' | 'tiktok';
  timestamp: number;
  priority: number;
  status: 'pending' | 'selected' | 'answered' | 'skipped' | 'muted';
  detectedTopic: Scene;
  relatedMatchId?: string;
}
export interface SportsEventQueueItem {
  id: string;
  event: MatchEvent;
  reactionPriorityScore: number;
  groupedCount: number;
}
export interface SportsAlert {
  id: string;
  event: MatchEvent;
  label: string;
  secondary: boolean;
  disposition: 'queued' | 'alert-only' | 'reacted' | 'ignored';
}
export type DirectorState = 'IDLE' | 'THINKING' | 'SPEAKING' | 'REACTING' | 'COOLDOWN';
export interface AvatarState {
  emotion: Emotion;
  gesture: ReactionDecision['gesture'];
  energy: number;
  speaking: boolean;
}
export interface CommentaryDraft {
  decision: ReactionDecision;
  matchId?: string;
  opinion?: Omit<Opinion, keyof MemoryEntry>;
  prediction?: { side: Side | null; confidence: number };
  question?: string;
  joke?: string;
  expression?: string;
  recallIds: string[];
  sourceIds: string[];
}
export interface StudioSnapshot {
  voice: VoiceSnapshot;
  mode: 'DEMO';
  state: DirectorState;
  decision: ReactionDecision;
  camera: Camera;
  avatar: AvatarState;
  animation: AvatarAnimationFrame;
  activeMatches: MatchState[];
  leagues: League[];
  mainMatchId: string | null;
  currentMatchId: string | null;
  nextSuggestedMatch: string | null;
  lastVisitedMatch: Record<string, number>;
  sportsEventQueue: SportsEventQueueItem[];
  alerts: SportsAlert[];
  chat: ChatMessage[];
  selectedChatId: string | null;
  mutedUsers: string[];
  settings: StudioSettings;
  profile: AICommentatorProfile;
  contexts: LiveMatchContext[];
  history: {
    id: string;
    at: number;
    source: string;
    decision: ReactionDecision;
    matchId?: string;
    memoryIds: string[];
    sourceIds: string[];
  }[];
  now: number;
}
export type StudioCommand =
  | {
      type: 'avatar-simulate';
      animation: AvatarAnimation;
      intensity: number;
      text: string;
      gaze: GazeTarget;
    }
  | { type: 'avatar-gaze'; target: GazeTarget }
  | { type: 'event'; matchId: string; eventType: EventType; side: Side }
  | { type: 'chat'; username: string; message: string; matchId?: string }
  | { type: 'respond' | 'skip' | 'mute'; id: string }
  | { type: 'control'; action: 'silence' | 'angry' | 'celebrate' | 'normal' }
  | { type: 'main'; matchId: string | null }
  | { type: 'focus'; matchId: string }
  | { type: 'subscription'; matchId: string; patch: Partial<MatchSubscription> }
  | {
      type: 'match-add';
      leagueId: string;
      home: string;
      away: string;
      status: MatchState['status'];
      contextType: MatchState['contextType'];
    }
  | { type: 'match-remove'; matchId: string }
  | { type: 'match-status'; matchId: string; status: MatchState['status'] }
  | { type: 'league'; id: string; enabled: boolean }
  | { type: 'league-add'; name: string }
  | { type: 'settings'; patch: Partial<StudioSettings> }
  | { type: 'profile'; patch: Partial<AICommentatorProfile> }
  | {
      type: 'comment';
      matchId: string;
      kind: 'analysis' | 'prediction' | 'question' | 'community';
    };
export const defaultSettings: StudioSettings = {
  studioComposition: 'integrated',
  studioBackdrop: '05',
  studioGraphics: true,
  studioLighting: true,
  autoReactions: true,
  maxReactionsPerMinute: 8,
  reactionCooldown: 4,
  cameraCooldown: 3,
  carouselCooldown: 12,
  carouselEnabled: false,
  showSecondaryAlerts: true,
  reactToFavorites: true,
  safeMode: true,
  favoriteTeams: ['Celta de Vigo', 'Deportivo de La Coruña'],
  favoriteLeagues: ['laliga'],
};
export const defaultProfile: AICommentatorProfile = {
  name: 'SamuIA',
  avatar: 'official',
  description: 'Fútbol entre amigos. Pasión, buen humor y memoria; siempre con respeto.',
  personalityStyle: 'futbolero, cercano, observador y espontáneo',
  catchphrases: ['Ojo con esto', 'Me voy a mojar', 'Vamos allá', 'Buena esa'],
  prohibitedExpressions: ['seguro que ganas dinero', 'apuesta segura'],
  humorLevel: 65,
  emotionLevel: 75,
  rivalryLevel: 30,
  predictionFrequency: 35,
  emojiFrequency: 30,
  communityInteractionLevel: 40,
  commentaryFrequency: 25,
  galicianLevel: 35,
  responseLength: 'medium',
  communityTeams: {},
  specialRules: [],
};
export const DISCLAIMER = 'Estimación informativa. No es consejo de apuesta.';
export const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
export function id() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return [...crypto.getRandomValues(new Uint8Array(16))]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('');
}
export const normalDecision = (): ReactionDecision => ({
  say: '',
  scene: 'futbol',
  emotion: 'neutral',
  camera: 'streamer',
  gesture: 'ninguno',
  energy: 45,
});
export const scoreline = (m: MatchState) =>
  `${m.home.shortName} ${m.score.home} - ${m.score.away} ${m.away.shortName}, minuto ${m.minute}`;
