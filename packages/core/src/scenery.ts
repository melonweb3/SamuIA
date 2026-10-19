import type { Scene, StudioSnapshot } from '../../shared/src/index';

export const studioBackdrops = {
  '01': { file: 'escena_01.png', label: '01 · Noche roja' },
  '02': { file: 'escena_02.png', label: '02 · Análisis tecnológico' },
  '03': { file: 'escena_03.png', label: '03 · Charla cálida' },
  '04': { file: 'escena_04.png', label: '04 · Previa futbolera' },
  '05': { file: 'escena_05.png', label: '05 · SamuIA Live · principal' },
} as const;
const automaticBackdrop: Record<Scene, keyof typeof studioBackdrops> = {
  futbol: '05',
  celebracion: '05',
  enfado: '01',
  charlando: '03',
  gaming: '05',
  tecnologia: '02',
};
const lights: Record<Scene, string> = {
  futbol: '#42bfff',
  celebracion: '#76f3ac',
  enfado: '#ff5555',
  charlando: '#ffc179',
  gaming: '#bd8aff',
  tecnologia: '#64dcff',
};
/** Derive broadcast graphics from the focused match, never a secondary alert. */
export function studioScenery(state: StudioSnapshot) {
  const backdrop =
    state.settings.studioBackdrop === 'auto'
      ? automaticBackdrop[state.decision.scene]
      : state.settings.studioBackdrop;
  const match = state.activeMatches.find((m) => m.id === state.currentMatchId);
  const league = state.leagues.find((l) => l.id === match?.leagueId);
  return {
    backdrop,
    ...studioBackdrops[backdrop],
    integrated: state.settings.studioComposition === 'integrated',
    file:
      state.settings.studioComposition === 'integrated'
        ? `samuia_setup_${backdrop}.png`
        : studioBackdrops[backdrop].file,
    match,
    competition: league?.name ?? (match ? 'Competición sin asignar' : 'SamuIA Live Studio'),
    light: lights[state.decision.scene],
  };
}
