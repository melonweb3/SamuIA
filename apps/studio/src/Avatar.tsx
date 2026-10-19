import { useState } from 'react';
import type { StudioSnapshot } from '../../../packages/shared/src/index';
import {
  avatarAssets,
  officialAvatarDescriptions,
  sceneAssets,
  selectOfficialAvatar,
  type OfficialAvatarFile,
} from '../../../packages/core/src/visual';
import { avatarSource } from './avatar-source';
const frames = {
  primer_plano: 'translateY(80px) scale(1.3)',
  plano_medio: 'translateY(20px) scale(1.07)',
  streamer: 'translateY(10px) scale(.94)',
  tres_cuartos: 'translate(30px,20px) scale(1.02) rotate(-4deg)',
};
export function Avatar({ state }: { state: StudioSnapshot }) {
  const portable = document.documentElement.dataset.portable === 'true';
  const [failed, setFailed] = useState<OfficialAvatarFile[]>([]);
  const requested = selectOfficialAvatar(state.avatar, state.profile.avatar);
  const file = failed.includes(requested) ? avatarAssets.neutral : requested;
  const source = avatarSource(file);
  const unavailable = !source || failed.includes(file);
  return (
    <div className={`avatar-stage scene-${state.decision.scene}`}>
      {!portable && (
        <img
          key={state.decision.scene}
          className="scene-image"
          alt=""
          src={`/samuia/scenes/${sceneAssets[state.decision.scene]}`}
          onError={(e) => {
            e.currentTarget.hidden = true;
          }}
        />
      )}
      <div className="grid-bg" />
      <div className="orbit" />
      <div className="stage-top">
        <span className="stage-tag">● AVATAR OFICIAL</span>
        <span className="stage-tag">{state.camera.replaceAll('_', ' ')}</span>
      </div>
      <div className="monitor monitor-left">
        <b>
          SAMU<span>IA</span>
        </b>
        <p>▁ ▃ ▅ ▂ ▆ ▄ ▂</p>
      </div>
      <div className="monitor monitor-right">
        <small>ON AIR</small>
        <b>
          LOCAL
          <br />
          STUDIO
        </b>
      </div>
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
      <div className="desk" />
      <div className="mic" />
      <div className="stage-bottom">
        <span>
          ▂ ▄ ▆ ▄ ▂ {state.avatar.speaking ? 'Reproducción simulada' : 'Listo para la siguiente'}
        </span>
        <small>
          {unavailable ? 'IMAGEN NO DISPONIBLE' : officialAvatarDescriptions[file].toUpperCase()}
        </small>
      </div>
    </div>
  );
}
