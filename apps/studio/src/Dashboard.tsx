import { Panel, Empty, Badge, pretty, type ViewProps } from './ui';
import { Avatar } from './Avatar';
import { MatchDetail } from './Matches';
import { ChatPanel } from './Chat';
import { Radar, Alerts } from './Sports';
import { eventLabels } from '../../../packages/shared/src/index';
export function Dashboard({ state, send }: ViewProps) {
  const integrated = state.settings.studioComposition === 'integrated';
  const current = state.activeMatches.find((m) => m.id === state.currentMatchId),
    context = state.contexts.find((c) => c.matchId === current?.id);
  const selected =
    state.chat.find((m) => m.id === state.selectedChatId) ??
    [...state.chat]
      .filter((m) => m.status === 'pending')
      .sort((a, b) => b.priority - a.priority)[0];
  return (
    <>
      <div className="dashboard-top">
        <div>
          <Panel
            title={`Vista previa de ${state.profile.name}`}
            meta={<small className="muted">◉ Motor visual activo</small>}
          >
            <Avatar state={state} />
            <div className="visual-values">
              {[
                ['Escena', state.decision.scene],
                ['Emoción', integrated ? 'neutra fija' : state.avatar.emotion],
                ['Cámara', integrated ? 'streamer fijo' : state.camera],
                ['Gesto', integrated ? 'pose fija' : state.avatar.gesture],
              ].map(([name, value]) => (
                <div key={name}>
                  <small>{name}</small>
                  <b>{pretty(value)}</b>
                </div>
              ))}
              <div>
                <small>Energía</small>
                <b className="accent">
                  {state.decision.energy}
                  <small> /100</small>
                </b>
                <div className="energy-track">
                  <i style={{ width: `${state.decision.energy}%` }} />
                </div>
              </div>
            </div>
          </Panel>
          <Panel
            title={state.avatar.speaking ? 'SamuIA está hablando' : 'Salida de SamuIA'}
            meta={<Badge>VOZ SIMULADA</Badge>}
          >
            <div className="speech-content">
              <span>“</span>
              <p>
                {state.decision.say ||
                  'Iepaaa, ¿qué tal? Añade un comentario o simula un evento. Vamos allá.'}
              </p>
              <div className={state.avatar.speaking ? 'wave playing' : 'wave'}>
                {Array.from({ length: 16 }, (_, i) => (
                  <i
                    key={i}
                    style={{ height: `${8 + ((i * 7) % 27)}px`, animationDelay: `${i * 0.07}s` }}
                  />
                ))}
              </div>
            </div>
            <div className="controls">
              <button
                className="primary"
                disabled={!selected || selected.status === 'selected'}
                onClick={() => selected && void send({ type: 'respond', id: selected.id })}
              >
                ▷ Responder
              </button>
              <button
                disabled={!selected || selected.status === 'selected'}
                onClick={() => selected && void send({ type: 'skip', id: selected.id })}
              >
                ↠ Saltar
              </button>
              <button onClick={() => void send({ type: 'control', action: 'silence' })}>
                ◼ Callar
              </button>
              <button
                className="warm"
                onClick={() => void send({ type: 'control', action: 'angry' })}
              >
                Enfado
              </button>
              <button
                className="gold"
                onClick={() => void send({ type: 'control', action: 'celebrate' })}
              >
                ✦ Celebración
              </button>
              <button onClick={() => void send({ type: 'control', action: 'normal' })}>
                Normal
              </button>
            </div>
            <details className="json">
              <summary>Ver ReactionDecision</summary>
              <pre>{JSON.stringify(state.decision, null, 2)}</pre>
            </details>
          </Panel>
          <div className="current-comment">
            <small>COMENTARIO ACTUAL</small>
            <p>
              {selected ? (
                <>
                  <b>{selected.username}</b> {selected.message}
                </>
              ) : (
                'Sin comentarios pendientes.'
              )}
            </p>
          </div>
          {current && (
            <Panel
              title="Director de comentarios"
              meta={<Badge>INTENSIDAD {context?.intensity ?? 1}/5</Badge>}
            >
              <p className="description">
                Las opiniones, predicciones y preguntas se guardan cuando se publican. Datos y voz
                simulados.
              </p>
              <div className="comment-tools">
                {[
                  ['analysis', 'Analizar'],
                  ['prediction', 'Mojarse'],
                  ['question', 'Preguntar al chat'],
                  ['community', 'Resumir respuestas'],
                ].map(([kind, label]) => (
                  <button
                    key={kind}
                    disabled={state.state !== 'IDLE'}
                    onClick={() =>
                      void send({
                        type: 'comment',
                        matchId: current.id,
                        kind: kind as 'analysis' | 'prediction' | 'question' | 'community',
                      })
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Panel>
          )}
        </div>
        <div>
          <Panel
            title={
              state.currentMatchId === state.mainMatchId
                ? 'Partido principal'
                : 'Partido en pantalla'
            }
            meta={<Badge>{state.mainMatchId ? '⚑ FIJADO' : 'CARRUSEL'}</Badge>}
          >
            {current ? (
              <MatchDetail match={current} state={state} send={send} />
            ) : (
              <Empty>Selecciona un partido en el Centro de Partidos.</Empty>
            )}
          </Panel>
          <Alerts state={state} compact />
        </div>
      </div>
      <div className="dashboard-bottom">
        <ChatPanel state={state} send={send} />
        <div>
          <Radar state={state} send={send} />
          {state.sportsEventQueue.length > 0 && (
            <Panel
              title="Cola deportiva"
              meta={<Badge>{state.sportsEventQueue.length} EN ESPERA</Badge>}
            >
              <div className="queue-chips">
                {state.sportsEventQueue.map((i) => (
                  <span key={i.id}>
                    {eventLabels[i.event.type]} ·{' '}
                    {state.activeMatches.find((m) => m.id === i.event.matchId)?.home.shortName}{' '}
                    <b>{i.reactionPriorityScore} pts</b>
                    {i.groupedCount > 1 && ` ×${i.groupedCount}`}
                  </span>
                ))}
              </div>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
