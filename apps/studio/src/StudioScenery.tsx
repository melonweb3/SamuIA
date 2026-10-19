import { useState, type CSSProperties } from 'react';
import type { StudioSnapshot } from '../../../packages/shared/src/index';
import { studioScenery } from '../../../packages/core/src/scenery';
import { statusLabels } from './ui';

let embedded: Record<string, string> | undefined;
function sceneSource(filename: string): string | null {
  if (document.documentElement.dataset.portable !== 'true') return `/samuia/scenes/${filename}`;
  if (!embedded) {
    embedded = {};
    for (const id of ['samuia-scene-originals', 'samuia-scene-composites']) {
      const element = document.getElementById(id);
      Object.assign(embedded, element?.textContent ? JSON.parse(element.textContent) : {});
    }
  }
  return embedded?.[filename] ?? null;
}
export function StudioScenery({ state }: { state: StudioSnapshot }) {
  const scene = studioScenery(state);
  const [failed, setFailed] = useState<string[]>([]);
  const source = sceneSource(scene.file);
  const unavailable = !source || failed.includes(scene.file);
  return (
    <>
      {unavailable ? (
        <div className="scenery-unavailable" role="status">
          Escenario no disponible · {scene.label}
          <button onClick={() => setFailed([])}>Reintentar escenario</button>
        </div>
      ) : (
        <img
          key={scene.file}
          className="scene-image"
          src={source}
          alt={
            scene.integrated
              ? `Avatar oficial de ${state.profile.name} integrado en ${scene.label}`
              : `Setup del comentarista: ${scene.label}`
          }
          data-scene-file={scene.file}
          data-composition={state.settings.studioComposition}
          onError={() => setFailed((previous) => [...new Set([...previous, scene.file])])}
        />
      )}
      <div className="scenery-shade" />
      {state.settings.studioLighting && (
        <div
          className="scenery-light"
          data-mood={state.decision.scene}
          style={{ '--studio-light': scene.light } as CSSProperties}
        />
      )}
    </>
  );
}

export function StudioMatchGraphics({ state }: { state: StudioSnapshot }) {
  const scene = studioScenery(state);
  return (
    <>
      {state.settings.studioGraphics && (
        <div className="studio-match-graphics" aria-label="Gráficos del partido">
          <div className="studio-competition">{scene.competition}</div>
          {scene.match ? (
            <div className="studio-scoreboard">
              <span className="studio-team home" title={scene.match.home.name}>
                {scene.match.home.shortName}
              </span>
              <b className="studio-score">
                {scene.match.score.home} – {scene.match.score.away}
              </b>
              <span className="studio-team away" title={scene.match.away.name}>
                {scene.match.away.shortName}
              </span>
              <small>
                {scene.match.minute}′ · {statusLabels[scene.match.status]}
              </small>
            </div>
          ) : (
            <div className="studio-no-match">
              Selecciona un partido para preparar la retransmisión
            </div>
          )}
        </div>
      )}
    </>
  );
}
