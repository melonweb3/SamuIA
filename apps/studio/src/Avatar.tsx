import { useState } from 'react';
import type { StudioSnapshot, Emotion, AvatarExpression } from '../../../packages/shared/src/index';
import {
  avatarAssets,
  officialAvatarDescriptions,
  selectOfficialAvatar,
  type OfficialAvatarFile,
} from '../../../packages/core/src/visual';
import { avatarSource } from './avatar-source';
import { StudioScenery } from './StudioScenery';
import { AvatarRendererHost, useAvatarRendererFactory } from './AvatarRendererHost';
const fallbackEmotions: Record<AvatarExpression, Emotion> = {
  neutral: 'neutral',
  happy: 'sonrisa',
  shock: 'sorpresa',
  angry: 'enfadado_leve',
  laugh: 'risa',
  frustrated: 'serio',
  thinking: 'pensativo',
  sad: 'serio',
};
const frames = {
  primer_plano: 'scale(1.12)',
  plano_medio: 'scale(1.04)',
  streamer: 'scale(1)',
  tres_cuartos: 'translateX(8px) scale(1.02)',
};
export function Avatar({ state }: { state: StudioSnapshot }) {
  const factory = useAvatarRendererFactory();
  const integrated = !factory && state.settings.studioComposition === 'integrated';
  const [failed, setFailed] = useState<OfficialAvatarFile[]>([]);
  const requested = selectOfficialAvatar(
    {
      ...state.avatar,
      emotion: fallbackEmotions[state.animation.expression],
      speaking: state.animation.speaking,
    },
    state.profile.avatar,
  );
  const file = failed.includes(requested) ? avatarAssets.neutral : requested;
  const source = avatarSource(file);
  const unavailable = !source || failed.includes(file);
  return (
    <div className={`avatar-stage scene-${state.decision.scene}`}>
      <StudioScenery
        state={
          factory
            ? { ...state, settings: { ...state.settings, studioComposition: 'portrait' } }
            : state
        }
      />
      <div className="stage-top">
        <span className="stage-tag">● {factory ? 'AVATAR CONECTADO' : 'FALLBACK VISUAL'}</span>
        <span className="stage-tag">
          {state.animation.animation} · {state.animation.expression}
        </span>
      </div>
      <AvatarRendererHost frame={state.animation}>
        {!integrated && (
          <div
            className="avatar-frame"
            style={{
              transform: `${frames[state.camera]} translateY(var(--avatar-bob, 0px)) rotate(var(--avatar-roll, 0deg))`,
            }}
          >
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
      </AvatarRendererHost>
      <div className="stage-bottom">
        <span>
          ▂ ▄ ▆ ▄ ▂ {state.avatar.speaking ? 'Reproducción simulada' : 'Listo para la siguiente'}
        </span>
        <small>
          {integrated
            ? 'IMAGEN DE REFERENCIA · CONTROL ACTIVO'
            : unavailable
              ? 'IMAGEN NO DISPONIBLE'
              : officialAvatarDescriptions[file].toUpperCase()}
        </small>
      </div>
    </div>
  );
}
