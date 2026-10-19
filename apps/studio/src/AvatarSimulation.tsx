import { useState } from 'react';
import {
  avatarAnimations,
  gazeTargets,
  type AvatarAnimation,
} from '../../../packages/shared/src/index';
import { Avatar } from './Avatar';
import { useLiveAvatarFrame } from './AvatarRendererHost';
import { Panel, type ViewProps } from './ui';
const examples: Record<AvatarAnimation, string> = {
  idle: '',
  talking: 'Estamos siguiendo el partido juntos. ¡Vamos allá!',
  happy: '¡Qué buena noticia, meu!',
  goal: '¡GOOOOL! ¡Vaya golazo!',
  shock: '¡No me lo puedo creer!',
  angry: '¡Ojo con esa entrada!',
  laugh: '¡Ja, ja! Hoy el sofá cuenta como deporte de riesgo.',
  frustrated: '¡Ufff! Esa ocasión no ha entrado.',
  thinking: 'Vamos a analizarlo con calma.',
  var: 'El VAR está revisando la acción. Esperamos la decisión.',
  penalty: '¡Penalti! Ahora hay tensión hasta en el sofá.',
  win: '¡Victoria! ¡Qué final de partido!',
  loss: 'Hoy no ha podido ser. Toca levantarse.',
};
export function AvatarSimulation({ state, send }: ViewProps) {
  const [animation, setAnimation] = useState<AvatarAnimation>('goal');
  const [text, setText] = useState(examples.goal);
  const [intensity, setIntensity] = useState(0.85);
  const live = useLiveAvatarFrame(state.animation);
  return (
    <>
      <div className="info-banner">
        <b>SIMULATION · AvatarAnimationController</b>
        <p>
          Prueba las señales que recibirá el avatar 2D/3D. La referencia permanece quieta: no hay
          rig facial ni audio real. Los medidores verifican el controlador, no una animación de la
          fotografía. Las pruebas manuales interrumpen la frase actual; no añaden goles ni
          resultados.
        </p>
      </div>
      <div className="two-col">
        <div>
          <Panel title="Avatar y señales en tiempo real">
            <Avatar state={state} />
            <div className="animation-signals" aria-label="Estado de animación">
              <b data-testid="animation-state">{live.animation}</b>
              <span>
                Expresión: <strong data-testid="animation-expression">{live.expression}</strong>
              </span>
              <span>Intensidad: {Math.round(live.intensity * 100)}%</span>
              <span>
                Mirada: <strong data-testid="animation-gaze">{live.gaze.target}</strong>
              </span>
              <span>
                Cabeza: {live.head.yaw.toFixed(1)}° / {live.head.pitch.toFixed(1)}° /{' '}
                {live.head.roll.toFixed(1)}°
              </span>
              <span>
                Cuerpo: {live.body.bob.toFixed(3)} · {live.body.lean.toFixed(3)}
              </span>
              <label>
                Parpadeo simulado
                <meter min="0" max="1" value={live.blink} />
              </label>
              <label>
                Boca simulada · {live.mouth.viseme}
                <meter data-testid="mouth-open" min="0" max="1" value={live.mouth.open} />
              </label>
              <span data-testid="speech-status">
                {live.speaking
                  ? live.speech?.source === 'audio-visemes'
                    ? 'Hablando · tiempos de audio'
                    : 'Hablando · sincronización por texto'
                  : 'En espera · boca cerrada'}
              </span>
              <small>
                El parpadeo, boca y mirada son señales de control. Un renderer compatible las
                convertirá en movimientos del personaje.
              </small>
            </div>
          </Panel>
          <Panel title="Texto y voz">
            <div className="settings-body">
              <p data-testid="avatar-spoken-text">{live.speech?.text || 'Sin frase activa.'}</p>
              <small>
                Fuente: {live.speech?.source ?? 'sin reproducción'}. La simulación no genera audio;
                el contrato admite tiempos y visemas de un proveedor de voz real.
              </small>
            </div>
          </Panel>
        </div>
        <div>
          <Panel title="Probar una animación">
            <form
              className="settings-body"
              onSubmit={(e) => {
                e.preventDefault();
                void send({ type: 'avatar-simulate', animation, text, intensity, gaze: 'camera' });
              }}
            >
              <label>
                Animación
                <select
                  aria-label="Animación del avatar"
                  value={animation}
                  onChange={(e) => {
                    const value = e.target.value as AvatarAnimation;
                    setAnimation(value);
                    setText(examples[value]);
                  }}
                >
                  {avatarAnimations.map((a) => (
                    <option key={a}>{a}</option>
                  ))}
                </select>
              </label>
              <label>
                Texto hablado
                <textarea
                  aria-label="Texto del avatar"
                  maxLength={500}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              </label>
              <label>
                Intensidad · {Math.round(intensity * 100)}%
                <input
                  aria-label="Intensidad del avatar"
                  type="range"
                  min="0"
                  max="1"
                  step=".05"
                  value={intensity}
                  onChange={(e) => setIntensity(Number(e.target.value))}
                />
              </label>
              <button className="primary">Ejecutar animación</button>
              <button
                type="button"
                onClick={() => void send({ type: 'control', action: 'silence' })}
              >
                Detener avatar y voz
              </button>
              <div className="animation-gaze-buttons">
                {gazeTargets.map((target) => (
                  <button
                    key={target}
                    type="button"
                    onClick={() => void send({ type: 'avatar-gaze', target })}
                  >
                    Mirar: {target}
                  </button>
                ))}
              </div>
            </form>
          </Panel>
          <Panel title="Probar un evento del partido">
            <div className="settings-body">
              <p>
                Estos botones sí envían eventos simulados al CommentaryEngine. Respetan la cola, los
                filtros y el cooldown del estudio.
              </p>
              <div className="animation-gaze-buttons">
                {(
                  ['goal', 'chance', 'missed_chance', 'var', 'yellow', 'red', 'penalty'] as const
                ).map((eventType) => (
                  <button
                    key={eventType}
                    disabled={!state.currentMatchId}
                    onClick={() =>
                      state.currentMatchId &&
                      void send({
                        type: 'event',
                        matchId: state.currentMatchId,
                        eventType,
                        side: 'home',
                      })
                    }
                  >
                    Evento: {eventType}
                  </button>
                ))}
              </div>
            </div>
          </Panel>
          <Panel title="Transiciones del controlador">
            <div className="settings-body" data-testid="animation-transitions">
              {state.animation.transitions
                .slice(-10)
                .reverse()
                .map((t, i) => (
                  <div key={`${t.clipId}-${t.at}-${i}`}>
                    <code>
                      {t.from} → {t.to}
                    </code>{' '}
                    · clip {t.clipId}
                  </div>
                ))}
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
