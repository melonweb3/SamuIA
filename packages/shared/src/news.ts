export const programModes = ['DEPORTES', 'NOTICIAS', 'EVENTOS', 'CHAT', 'AUTOMÁTICO'] as const;
export type ProgramMode = (typeof programModes)[number];
export const newsCategories = [
  'España',
  'Galicia',
  'Internacional',
  'Deportes',
  'Fútbol',
  'Otros deportes',
  'Tecnología',
  'Inteligencia artificial',
  'Economía',
  'Criptomonedas',
  'Entretenimiento',
] as const;
export type NewsCategory = (typeof newsCategories)[number];
/** The existing Deportes selection also includes its more specific categories. */
export const newsCategorySelected = (selected: readonly string[], category: string) =>
  selected.includes(category) ||
  (selected.includes('Deportes') && ['Fútbol', 'Otros deportes'].includes(category));
export const newsFormats = [
  'titular',
  'resumen',
  'explicacion',
  'analisis',
  'ultima-hora',
] as const;
export type NewsFormat = (typeof newsFormats)[number];
export const newsScenes = [
  'estudio',
  'titulares',
  'ultima-hora',
  'imagenes',
  'texto',
  'chat',
  'despedida',
] as const;
export type NewsScene = (typeof newsScenes)[number];
export interface NewsSource {
  id: string;
  name: string;
  url: string;
  kind: 'rss' | 'json';
  category: NewsCategory;
  enabled: boolean;
  usage: 'headlines' | 'licensed-excerpts';
  termsUrl?: string;
  termsNote?: string;
  lastFetchedAt?: number;
  error?: string;
}
export interface NewsItem {
  id: string;
  sourceId: string;
  sourceName: string;
  url: string;
  publishedAt: number;
  title: string;
  summary: string;
  category: NewsCategory;
  location?: string;
  simulated: boolean;
}
export interface NewsStory {
  id: string;
  title: string;
  summary: string;
  category: NewsCategory;
  location?: string;
  publishedAt: number;
  updatedAt: number;
  revision: number;
  sources: NewsItem[];
  simulated: boolean;
  importance: number;
  breaking: boolean;
  verification: 'pending' | 'single-source' | 'corroborated' | 'confirmed' | 'demo';
  verificationNote: string;
  review: 'pending' | 'approved' | 'discarded';
  stale: boolean;
}
export interface NewsCue {
  storyVersions?: { id: string; revision: number }[];
  id: string;
  section: string;
  storyId?: string;
  storyRevision?: number;
  text: string;
  headline: string;
  scene: NewsScene;
  sourceIds: string[];
  estimatedSeconds: number;
}
export interface NewsProgramConfig {
  categories: NewsCategory[];
  durationMinutes: 5 | 15 | 30 | 60;
  count: number;
  format: NewsFormat;
  interaction: boolean;
  breaking: boolean;
}
export interface NewsProgram {
  config: NewsProgramConfig;
  cues: NewsCue[];
  approved: boolean;
  status: 'draft' | 'running' | 'paused' | 'stopped' | 'completed';
  index: number;
  estimatedSeconds: number;
}
export interface NewsState {
  sources: NewsSource[];
  stories: NewsStory[];
  categories: NewsCategory[];
  program: NewsProgram | null;
  current: NewsCue | null;
  breakingAlerts: string[];
  externalAvailable: boolean;
  error: string | null;
}
export type NewsAction =
  | { action: 'demo' }
  | { action: 'categories'; categories: NewsCategory[] }
  | { action: 'review'; id: string; review: NewsStory['review'] }
  | { action: 'verify'; id: string; note: string }
  | { action: 'build'; config: NewsProgramConfig }
  | { action: 'edit'; id: string; text: string; scene: NewsScene; position: number }
  | { action: 'approve' | 'start' | 'pause' | 'stop' | 'finish' }
  | { action: 'breaking'; id: string }
  | { action: 'demo-breaking' };

/** One presentation rule shared by the studio and the encoded signal. */
export function isNewsPresentation(state: { programMode: ProgramMode; news: NewsState }) {
  return (
    state.programMode === 'NOTICIAS' ||
    (state.programMode === 'AUTOMÁTICO' &&
      (!!state.news.current || ['running', 'paused'].includes(state.news.program?.status ?? '')))
  );
}
