import { useState } from 'react';
import type { StudioSnapshot, Emotion, AvatarExpression } from '../../../packages/shared/src/index';
import {
  avatarAssets,
  officialAvatarDescriptions,
  selectOfficialAvatar,
  type OfficialAvatarFile,
} from '../../../packages/core/src/visual';
import { avatarSource } from './avatar-source';
import { StudioScenery, StudioMatchGraphics } from './StudioScenery';
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
    <>
      <div className={`avatar-stage scene-${state.decision.scene}`}>
        {factory || integrated ? (
          <StudioScenery
            state={
              factory
                ? { ...state, settings: { ...state.settings, studioComposition: 'portrait' } }
                : state
            }
          />
        ) : (
          <div className="avatar-reference-background" />
        )}
        <div className="stage-top">
          <span className="stage-tag">
            ●{' '}
            {factory
              ? 'AVATAR CONECTADO'
              : integrated
                ? 'REFERENCIA INTEGRADA · ESTÁTICA'
                : 'RETRATO DE REFERENCIA'}
          </span>
          <span className="stage-tag">
            {state.animation.animation} · {state.animation.expression}
          </span>
        </div>
        <AvatarRendererHost frame={state.animation}>
          {!integrated && (
            <div className="avatar-frame avatar-reference-frame">
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
              ? 'ESCENARIO Y PERSONAJE · IMAGEN ESTÁTICA'
              : unavailable
                ? 'IMAGEN NO DISPONIBLE'
                : officialAvatarDescriptions[file].toUpperCase()}
          </small>
        </div>
      </div>
      {(factory || integrated) && <StudioMatchGraphics state={state} />}
    </>
  );
}
