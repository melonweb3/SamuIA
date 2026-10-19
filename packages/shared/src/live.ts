import type { EventType, MatchState, Side, Team, TeamStatistics } from './index';
export type DataMode = 'SIMULATION' | 'LIVE';
export interface LiveIncident {
  id: string;
  matchId: string;
  provider: string;
  channel: 'event' | 'commentary';
  kind: EventType;
  minute: number;
  timestamp: number;
  timestampQuality?: 'exact' | 'estimated';
  receivedAt: number;
  side?: Side;
  player?: string;
  playerOut?: string;
  action?: 'header' | 'shot' | 'cross';
  outcome?: 'saved' | 'missed' | 'blocked' | 'goal' | 'post';
  text?: string; // source reference, never a script or an instruction for the character
  correlationId?: string;
  sourceIds: string[];
}
export interface LiveMatchRecord {
  id: string;
  league: { id: string; name: string };
  home: Team;
  away: Team;
  minute: number;
  status: MatchState['status'];
  score: Record<Side, number>;
  statistics: Record<Side, Partial<TeamStatistics>>;
  lineups?: {
    home: { name: string; number?: number; position?: string }[];
    away: { name: string; number?: number; position?: string }[];
  };
  updatedAt: number;
  incidents: LiveIncident[];
}
export interface LiveDiagnostics {
  status: 'unconfigured' | 'connecting' | 'connected' | 'reconnecting' | 'paused';
  provider: string;
  commentary: 'available' | 'events-fallback' | 'reconnecting';
  lastSuccessAt: number | null;
  nextRetryAt: number | null;
  failures: number;
  stale: boolean;
  duplicates: number;
  message: string;
  logs: { at: number; level: 'info' | 'warn' | 'error'; code: string; matchId?: string }[];
}
