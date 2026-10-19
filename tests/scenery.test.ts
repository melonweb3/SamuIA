import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { ReactionDirector } from '../packages/core/src/index';
import { studioScenery } from '../packages/core/src/scenery';
import { commandSchema } from '../apps/server/src/commands';

describe('Escenarios del comentarista', () => {
  it('conserva los ZIP y PNG originales, incluidas las copias de ejecución', () => {
    const entries = JSON.parse(
      readFileSync('assets/reference/scenes/originals-index.json', 'utf8'),
    );
    expect(entries).toHaveLength(5);
    const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
    for (const entry of entries) {
      const original = readFileSync(entry.originalFile);
      expect(sha(readFileSync(entry.archiveFile))).toBe(entry.archiveSha256);
      expect(sha(original)).toBe(entry.sha256);
      expect(readFileSync(entry.runtimeFile).equals(original)).toBe(true);
      expect(original.readUInt32BE(16)).toBe(1672);
      expect(original.readUInt32BE(20)).toBe(941);
    }
  });
  it('mantiene el setup principal y separa las alertas secundarias del marcador', () => {
    const d = new ReactionDirector(1000, false);
    d.command({ type: 'main', matchId: 'celta-madrid' }, 1000);
    d.command({ type: 'event', matchId: 'celta-madrid', eventType: 'goal', side: 'home' }, 1500);
    d.command(
      { type: 'event', matchId: 'liverpool-arsenal', eventType: 'goal', side: 'away' },
      2000,
    );
    const state = d.snapshot(2000);
    const scene = studioScenery(state);
    expect(scene.file).toBe('samuia_setup_05.png');
    expect(scene.match?.id).toBe('celta-madrid');
    expect(scene.match?.score).toEqual({ home: 1, away: 0 });
    const before = structuredClone(state.activeMatches);
    state.settings.studioBackdrop = 'auto';
    state.decision.scene = 'enfado';
    expect(studioScenery(state).file).toBe('samuia_setup_01.png');
    expect(studioScenery(state).light).toBe('#ff5555');
    state.decision.scene = 'charlando';
    expect(studioScenery(state).file).toBe('samuia_setup_03.png');
    state.decision.scene = 'celebracion';
    expect(studioScenery(state).light).toBe('#76f3ac');
    expect(state.activeMatches).toEqual(before);
  });
  it('actualiza equipos, marcador y competición al cambiar el foco y tolera ausencia de partido', () => {
    const d = new ReactionDirector(1000, false);
    d.command({ type: 'focus', matchId: 'liverpool-arsenal' }, 2000);
    d.command(
      { type: 'event', matchId: 'liverpool-arsenal', eventType: 'goal', side: 'away' },
      3000,
    );
    const state = d.snapshot(3000);
    const scene = studioScenery(state);
    expect(scene.match?.home.shortName).toBe('Liverpool');
    expect(scene.match?.away.shortName).toBe('Arsenal');
    expect(scene.match?.score.away).toBe(1);
    expect(scene.competition).toBe(state.leagues.find((l) => l.id === scene.match?.leagueId)?.name);
    state.currentMatchId = null;
    expect(studioScenery(state).match).toBeUndefined();
    expect(studioScenery(state).competition).toBe('SamuIA Live Studio');
  });
  it('separa los derivados y permite volver a los retratos originales', () => {
    const entries = JSON.parse(readFileSync('assets/runtime/scenes/composites-index.json', 'utf8'));
    expect(entries).toHaveLength(5);
    for (const entry of entries) {
      expect(entry.originalFile.startsWith('assets/runtime/scenes/')).toBe(true);
      const bytes = readFileSync(entry.originalFile);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(entry.sha256);
      expect(readFileSync(entry.runtimeFile).equals(bytes)).toBe(true);
    }
    const state = new ReactionDirector(1000, false).snapshot(1000);
    expect(studioScenery(state).integrated).toBe(true);
    state.settings.studioComposition = 'portrait';
    expect(studioScenery(state).file).toBe('escena_05.png');
    expect(studioScenery(state).integrated).toBe(false);
    expect(
      commandSchema.safeParse({ type: 'settings', patch: { studioComposition: 'integrated' } })
        .success,
    ).toBe(true);
    expect(
      commandSchema.safeParse({ type: 'settings', patch: { studioComposition: 'other' } }).success,
    ).toBe(false);
  });
  it('valida los controles de escenario en la API', () => {
    for (const studioBackdrop of ['auto', '01', '02', '03', '04', '05'])
      expect(
        commandSchema.safeParse({
          type: 'settings',
          patch: { studioBackdrop, studioGraphics: true, studioLighting: false },
        }).success,
      ).toBe(true);
    expect(
      commandSchema.safeParse({ type: 'settings', patch: { studioBackdrop: '../other.png' } })
        .success,
    ).toBe(false);
  });
});
