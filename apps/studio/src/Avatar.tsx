import { useState } from 'react';
import type { StudioSnapshot } from '../../../packages/shared/src/index';
import {
  avatarAssets,
  officialAvatarDescriptions,
  selectOfficialAvatar,
  type OfficialAvatarFile,
} from '../../../packages/core/src/visual';
import { avatarSource } from './avatar-source';
import { StudioScenery } from './StudioScenery';
const frames = {
  primer_plano: 'scale(1.12)',
  plano_medio: 'scale(1.04)',
  streamer: 'scale(1)',
  tres_cuartos: 'translateX(8px) scale(1.02)',
};
export function Avatar({ state }: { state: StudioSnapshot }) {
  const integrated = state.settings.studioComposition === 'integrated';
  const [failed, setFailed] = useState<OfficialAvatarFile[]>([]);
  const requested = selectOfficialAvatar(state.avatar, state.profile.avatar);
  const file = failed.includes(requested) ? avatarAssets.neutral : requested;
  const source = avatarSource(file);
  const unavailable = !source || failed.includes(file);
  return (
    <div className={`avatar-stage scene-${state.decision.scene}`}>
      <StudioScenery state={state} />
      <div className="stage-top">
        <span className="stage-tag">● {integrated ? 'ESCENA INTEGRADA' : 'RETRATO ORIGINAL'}</span>
        <span className="stage-tag">
          {integrated ? 'Plano streamer · fijo' : state.camera.replaceAll('_', ' ')}
        </span>
      </div>
      {!integrated && (
        <div className="avatar-frame" style={{ transform: frames[state.camera] }}>
          {unavailable ? (
            <div className="avatar-unavailable" role="status">
              <p>No se ha podido cargar el retrato oficial.</p>
              <button onClick={() => setFailed([])}>Reintentar imagen</button>
            </div>
          ) : (
            <img
              key={source}
              className="avatar-image"
              src={source}
              data-avatar-file={file}
              alt={`Avatar oficial de ${state.profile.name}: ${officialAvatarDescriptions[file]}`}
              decoding="async"
              onError={() => setFailed((previous) => [...new Set([...previous, file])])}
            />
          )}
        </div>
      )}
      <div className="stage-bottom">
        <span>
          ▂ ▄ ▆ ▄ ▂ {state.avatar.speaking ? 'Reproducción simulada' : 'Listo para la siguiente'}
        </span>
        <small>
          {integrated
            ? 'COMPOSICIÓN ÚNICA · POSE FIJA'
            : unavailable
              ? 'IMAGEN NO DISPONIBLE'
              : officialAvatarDescriptions[file].toUpperCase()}
        </small>
      </div>
    </div>
  );
}
