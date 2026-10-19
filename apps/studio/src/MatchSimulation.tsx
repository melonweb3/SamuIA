import { BrowserVoiceProvider, localBrowserVoices } from './browser-voice';
import { useEffect, useState, type FormEvent } from 'react';
import {
  MatchSimulationSession,
  matchSimulationSteps,
} from '../../../packages/match-simulation/src/index';
import { eventLabels, type EventType, type Side } from '../../../packages/shared/src/index';
import {
  selectAnimationReference,
  officialAvatarDescriptions,
} from '../../../packages/core/src/visual';
import { studioBackdrops } from '../../../packages/core/src/scenery';
import { Avatar } from './Avatar';
import { avatarSource } from './avatar-source';
import { Panel, statusLabels } from './ui';

export function MatchSimulation({
  session: initial,
  onSessionChange,
}: {
  session: MatchSimulationSession;
  onSessionChange: (session: MatchSimulationSession) => void;
}) {
  const [session, setSession] = useState(initial);
  const [state, setState] = useState(() => session.snapshot());
  const [error, setError] = useState('');
  const [username, setUsername] = useState('Tú');
  const [message, setMessage] = useState('');
  const [side, setSide] = useState<Side>('home');
  const [minute, setMinute] = useState(0);
  const [voices, setVoices] = useState(localBrowserVoices);
  const [voiceKey, setVoiceKey] = useState(() =>
    session.director.voice instanceof BrowserVoiceProvider
      ? session.director.voice.voiceURI
      : 'simulation',
  );
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const update = () => setVoices(localBrowserVoices());
    window.speechSynthesis.addEventListener('voiceschanged', update);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', update);
  }, []);
  const refresh = () => setState(session.snapshot(Date.now()));
  useEffect(() => {
    const timer = setInterval(() => {
      session.tick();
      setState(session.snapshot());
    }, 250);
    return () => {
      clearInterval(timer);
      session.running = false;
      session.finishReading();
    };
  }, [session]);
  const act = (fn: () => void) => {
    try {
      setError('');
      fn();
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo ejecutar el evento');
    }
  };
  const match = state.activeMatches[0];
  useEffect(() => {
    setMinute(match.minute);
  }, [match.minute]);
  const memory = state.contexts[0].personalityMemory;
  const pending = memory.predictions.find((p) => p.status === 'pending');
  const latest = state.history[0];
  const playing = ['SPEAKING', 'REACTING'].includes(state.state);
  const locked = session.running || !!session.activeStep;
  const canComment =
    !locked && !['THINKING', 'SPEAKING', 'REACTING', 'COOLDOWN'].includes(state.state);
  const reactionFile = selectAnimationReference(state.animation);
  const source = avatarSource(reactionFile);
  function post(e: FormEvent) {
    e.preventDefault();
    act(() => {
      session.command({
        type: 'chat',
        username: username.trim(),
        message: message.trim(),
        matchId: session.matchId,
      });
      setMessage('');
    });
  }
  return (
    <>
      <div className="info-banner">
        <b>SIMULATION · Partido completo · Celta – Dépor</b>
        <p>
          Sesión de prueba independiente. El guion usa los motores locales existentes; no consulta
          resultados ni IA externos. Puedes probar la voz simulada o una voz local instalada en tu
          navegador. Las imágenes oficiales siguen como fallback estático de un futuro avatar
          animado.
        </p>
      </div>
      {error || session.error ? (
        <div role="alert" className="info-banner">
          {error || session.error}
        </div>
      ) : null}
      <div className="match-run-controls">
        <button
          className="primary"
          disabled={session.done || session.manual}
          onClick={() =>
            act(() => {
              session.running = !session.running;
            })
          }
        >
          {session.running ? 'Pausar recorrido' : 'Reproducir partido completo'}
        </button>
        <button disabled={!session.canAdvance} onClick={() => act(() => session.next())}>
          Siguiente paso
        </button>
        <button
          disabled={!session.director.playback.active}
          onClick={() => act(() => session.finishReading())}
        >
          {state.voice.audible ? 'Terminar voz actual' : 'Terminar lectura simulada'}
        </button>
        <button
          onClick={() => {
            session.running = false;
            session.finishReading();
            setVoiceKey('simulation');
            const fresh = new MatchSimulationSession();
            setSession(fresh);
            onSessionChange(fresh);
            setState(fresh.snapshot());
            setError('');
            setMinute(0);
          }}
        >
          Nuevo partido de prueba
        </button>
        <label>
          <input
            type="checkbox"
            checked={session.fast}
            disabled={voiceKey !== 'simulation'}
            onChange={(e) =>
              act(() => {
                session.fast = e.target.checked;
              })
            }
          />
          Lectura rápida
        </label>
        <label>
          <input
            type="checkbox"
            checked={session.autoReply}
            onChange={(e) =>
              act(() => {
                session.autoReply = e.target.checked;
              })
            }
          />
          Responder al chat automáticamente
        </label>
        <span data-testid="match-progress">
          {session.manual
            ? 'Modo manual · nuevo partido para volver al guion'
            : session.done
              ? 'Recorrido completado'
              : `${session.completed.length} / ${matchSimulationSteps.length} pasos completados`}
        </span>
      </div>
      <div className="match-live-header" aria-label="Marcador del partido de prueba">
        <span>{match.home.name}</span>
        <strong data-testid="trial-score">
          {match.score.home} – {match.score.away}
        </strong>
        <span>{match.away.name}</span>
        <small>
          <b data-testid="trial-minute">{match.minute}′</b> ·{' '}
          <span data-testid="trial-status">{statusLabels[match.status]}</span> ·{' '}
          {state.leagues.find((l) => l.id === match.leagueId)?.name} · Derbi simulado
        </small>
      </div>
      <div className="match-live-grid">
        <div>
          <Panel title="SamuIA en el partido" meta={<span className="badge">{state.state}</span>}>
            <Avatar state={{ ...state, settings: { ...state.settings, studioGraphics: false } }} />
            <div className="match-reaction" aria-label="Reacción activa del personaje">
              {source && (
                <img
                  className="reaction-reference"
                  src={source}
                  alt={`Reacción oficial: ${officialAvatarDescriptions[reactionFile]}`}
                  onError={(e) => {
                    e.currentTarget.hidden = true;
                  }}
                />
              )}
              <div>
                <b data-testid="trial-reaction">{state.animation.animation}</b> ·{' '}
                <span data-testid="trial-expression">{state.animation.expression}</span>
                <p>
                  Intensidad {Math.round(state.animation.intensity * 100)}% · mirada{' '}
                  {state.animation.gaze.target}
                </p>
                <small>
                  Retrato de referencia seleccionado por la reacción; no es una animación facial.
                </small>
              </div>
            </div>
          </Panel>
          <Panel title="Comentarios y reacciones publicados">
            <div className="trial-commentary-log" data-testid="trial-commentary-log">
              {state.history.map((h) => (
                <article key={h.id}>
                  <small>
                    {h.source} · {h.decision.avatar?.animation ?? 'talking'}
                  </small>
                  <p>{h.decision.say}</p>
                  <small>
                    {h.sourceIds.length} fuentes · {h.memoryIds.length} recuerdos publicados
                  </small>
                </article>
              ))}
            </div>
          </Panel>
        </div>
        <div>
          <Panel
            title={playing ? 'SamuIA comenta ahora' : 'Último comentario de SamuIA'}
            meta={<span className="badge">COMMENTARY ENGINE LOCAL</span>}
          >
            <div className="settings-body">
              <p className="match-current-speech" data-testid="trial-comment">
                {state.decision.say ||
                  latest?.decision.say ||
                  'Abre el recorrido con Inicio del partido o pulsa Reproducir partido completo.'}
              </p>
              <small>
                {state.voice.status === 'paused'
                  ? 'Voz en pausa'
                  : state.animation.speaking
                    ? state.voice.audible
                      ? 'Voz local en reproducción'
                      : 'Lectura simulada en curso'
                    : 'Esperando el siguiente evento'}{' '}
                · {latest?.source ?? 'Partido sin comenzar'}
              </small>
            </div>
          </Panel>
          <Panel
            title="Voz y flujo de retransmisión"
            meta={<span className="badge">TTS ADAPTER</span>}
          >
            <div className="settings-body voice-panel">
              <label>
                Proveedor de voz
                <select
                  aria-label="Proveedor de voz"
                  value={voiceKey}
                  disabled={session.director.playback.active || session.running}
                  onChange={(e) =>
                    act(() => {
                      const key = e.target.value;
                      if (key === 'simulation') session.useSimulatedVoice();
                      else {
                        const voice = voices.find((v) => v.voiceURI === key);
                        if (!voice) throw new Error('Esta voz local ya no está disponible');
                        session.director.setVoiceProvider(new BrowserVoiceProvider(voice));
                      }
                      setVoiceKey(key);
                    })
                  }
                >
                  <option value="simulation">Simulación local · sin audio</option>
                  {voices.map((v) => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      {v.name} · {v.lang}
                    </option>
                  ))}
                </select>
              </label>
              <small>
                {voices.length
                  ? 'Selecciona una voz local antes de iniciar el recorrido. El navegador debe permitir sonido.'
                  : 'Este navegador no ofrece voces locales instaladas. Puedes comprobar todo el flujo con el proveedor simulado.'}
              </small>
              <b data-testid="trial-voice-status">{state.voice.status}</b>
              <span>
                {session.director.voice.name} · {state.voice.audible ? 'Audio local' : 'Sin audio'}
              </span>
              <span data-testid="trial-voice-clock">
                {(state.voice.positionMs / 1000).toFixed(1)} s / ~
                {(state.voice.durationMs / 1000).toFixed(1)} s
              </span>
              <small>
                {state.voice.sync === 'audio-visemes'
                  ? 'Sincronización recibida del proveedor: reloj y visemas'
                  : 'Visemas aproximados desde texto; sin alineación fonética real'}
              </small>
              <div className="animation-gaze-buttons">
                <button
                  disabled={state.voice.status !== 'playing'}
                  onClick={() => act(() => session.director.pauseVoice())}
                >
                  Pausar voz
                </button>
                <button
                  disabled={state.voice.status !== 'paused'}
                  onClick={() => act(() => session.director.resumeVoice())}
                >
                  Reanudar voz
                </button>
                <button
                  disabled={!session.director.playback.active}
                  onClick={() =>
                    act(() => {
                      session.running = false;
                      session.command({ type: 'control', action: 'silence' });
                    })
                  }
                >
                  Silenciar voz
                </button>
              </div>
              {state.voice.error && (
                <p role="alert">
                  {state.voice.error}. Selecciona simulación para seguir sin audio.
                </p>
              )}
              <ol className="broadcast-pipeline" data-testid="trial-pipeline">
                <li>
                  Evento → {latest?.source ?? 'Esperando inicio'} · {latest?.sourceIds.length ?? 0}{' '}
                  fuentes
                </li>
                <li>
                  Partido → {match.minute}′ · {match.score.home}–{match.score.away} ·{' '}
                  {statusLabels[match.status]}
                </li>
                <li>
                  CommentaryEngine → {latest ? 'Comentario publicado' : 'En espera'} ·{' '}
                  {latest?.memoryIds.length ?? 0} recuerdos
                </li>
                <li>
                  Emoción → {latest?.decision.emotion ?? 'neutral'} · intensidad{' '}
                  {latest?.decision.energy ?? 0}%
                </li>
                <li>
                  AvatarAnimationController → {state.animation.animation} · boca{' '}
                  {Math.round(state.animation.mouth.open * 100)}%
                </li>
                <li>
                  Voz → {state.voice.status} · {state.voice.provider}
                </li>
                <li>Interfaz → marcador, comunidad e historial sincronizados</li>
              </ol>
            </div>
          </Panel>
          <Panel title="Comunidad en directo">
            <div className="trial-community" data-testid="trial-community">
              {state.chat.length ? (
                [...state.chat]
                  .reverse()
                  .slice(0, 30)
                  .map((c) => (
                    <article key={c.id}>
                      <b>{c.username}</b>
                      <small>
                        {c.status === 'answered'
                          ? 'Respondido'
                          : c.status === 'selected'
                            ? 'SamuIA está respondiendo'
                            : c.status === 'pending'
                              ? 'En cola'
                              : c.status}
                      </small>
                      <p>{c.message}</p>
                      {c.status === 'pending' && (
                        <button
                          disabled={!!state.selectedChatId}
                          onClick={() => act(() => session.command({ type: 'respond', id: c.id }))}
                        >
                          Responder a {c.username}
                        </button>
                      )}
                    </article>
                  ))
              ) : (
                <p>Aún no hay mensajes. Puedes escribir durante el recorrido.</p>
              )}
            </div>
            <form className="chat-composer" onSubmit={post}>
              <input
                aria-label="Usuario de la comunidad"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                maxLength={40}
                required
              />
              <textarea
                aria-label="Mensaje de la comunidad"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={500}
                required
                placeholder="Pregunta a SamuIA por el partido…"
              />
              <button className="primary" disabled={!username.trim() || !message.trim()}>
                Enviar a la comunidad
              </button>
            </form>
          </Panel>
          <Panel title="Recorrido end-to-end" meta={<small>24 pasos · inicio → final</small>}>
            <div className="trial-steps">
              {matchSimulationSteps.map((step, i) => (
                <div
                  key={step.id}
                  className={
                    session.completed.some((c) => c.id === step.id)
                      ? 'completed'
                      : session.activeStep?.id === step.id
                        ? 'active'
                        : ''
                  }
                >
                  <span>
                    {session.completed.some((c) => c.id === step.id)
                      ? '✓'
                      : session.activeStep?.id === step.id
                        ? '▶'
                        : i + 1}
                  </span>
                  <b>
                    {step.minute}′ · {step.label}
                  </b>
                </div>
              ))}
            </div>
            <p className="session-note">
              Pausar detiene el siguiente paso; la frase en curso termina normalmente. Los pasos
              solo avanzan después de publicar su comentario.
            </p>
          </Panel>
          <Panel title="Contexto y memoria del partido">
            <div className="settings-body" data-testid="trial-memory">
              <span>Intensidad del partido: {state.contexts[0].intensity} / 5</span>
              <span>Comentarios publicados: {state.contexts[0].publishedCount}</span>
              <span>Eventos observados: {memory.memorableMoments.length}</span>
              <span data-testid="trial-prediction-pending">
                Pendientes: {memory.predictions.filter((p) => p.status === 'pending').length}
              </span>
              <span data-testid="trial-prediction-success">
                Acertadas: {memory.successfulPredictions.length}
              </span>
              <span data-testid="trial-prediction-failed">
                Fallidas: {memory.failedPredictions.length}
              </span>
              <span>Participaciones registradas: {memory.communityResponses.length}</span>
              {memory.predictions.map((p) => (
                <article key={p.id}>
                  <b>
                    {p.minute}′ ·{' '}
                    {p.status === 'pending'
                      ? 'Pendiente'
                      : p.status === 'success'
                        ? 'Acertada'
                        : 'Fallida'}
                  </b>
                  <p>{p.content}</p>
                  <small>
                    {p.resolvedBy
                      ? `Resuelta por ${p.resolvedBy}`
                      : `Vence en el minuto ${p.expiresMinute}`}{' '}
                    · {p.acknowledged ? 'Reconocida por SamuIA' : 'Sin reconocer todavía'}
                  </small>
                </article>
              ))}
            </div>
          </Panel>
          <Panel title="Eventos manuales">
            <div className="settings-body">
              <p>
                Usa estos controles con el recorrido pausado y sin un paso en curso. Se aplican los
                mismos filtros, cola y memoria.
              </p>
              <label>
                Equipo del evento
                <select
                  aria-label="Equipo del evento de prueba"
                  value={side}
                  onChange={(e) => setSide(e.target.value as Side)}
                >
                  <option value="home">{match.home.shortName}</option>
                  <option value="away">{match.away.shortName}</option>
                </select>
              </label>
              <div className="animation-gaze-buttons">
                {(
                  [
                    'kickoff',
                    'chance',
                    'missed_chance',
                    'goal',
                    'yellow',
                    'red',
                    'penalty',
                    'var',
                    'substitution',
                    'halftime',
                    'second_half',
                    'fulltime',
                  ] as EventType[]
                ).map((type) => (
                  <button
                    key={type}
                    disabled={
                      locked ||
                      (type === 'kickoff'
                        ? match.status !== 'upcoming'
                        : type === 'second_half'
                          ? match.status !== 'halftime'
                          : match.status !== 'live')
                    }
                    onClick={() => act(() => session.event(type, side))}
                  >
                    {eventLabels[type]}
                  </button>
                ))}
              </div>
              <div className="animation-gaze-buttons">
                {(['analysis', 'prediction', 'question', 'community'] as const).map((kind, i) => (
                  <button
                    key={kind}
                    disabled={!canComment || !['live', 'halftime'].includes(match.status)}
                    onClick={() =>
                      act(() =>
                        session.command({ type: 'comment', matchId: session.matchId, kind }),
                      )
                    }
                  >
                    {
                      [
                        'Analizar partido',
                        'Publicar predicción',
                        'Preguntar al chat',
                        'Resumir comunidad',
                      ][i]
                    }
                  </button>
                ))}
                <button
                  disabled={!pending || locked || match.status !== 'live'}
                  onClick={() => act(() => session.resolvePrediction(true))}
                >
                  Predicción acertada · simular gol
                </button>
                <button
                  disabled={!pending || locked || match.status !== 'live'}
                  onClick={() => act(() => session.resolvePrediction(false))}
                >
                  Predicción fallida · simular desenlace
                </button>
              </div>
              <label>
                Avanzar al minuto
                <input
                  aria-label="Minuto del partido de prueba"
                  type="number"
                  min={match.minute}
                  max={95}
                  value={minute}
                  onChange={(e) => setMinute(Number(e.target.value))}
                />
              </label>
              <button
                disabled={!canComment || match.status !== 'live'}
                onClick={() => act(() => session.setMinute(minute))}
              >
                Aplicar minuto
              </button>
              <label>
                Escenario oficial
                <select
                  aria-label="Escenario del partido de prueba"
                  value={state.settings.studioBackdrop}
                  onChange={(e) =>
                    act(() =>
                      session.command({
                        type: 'settings',
                        patch: {
                          studioBackdrop: e.target.value as '01' | '02' | '03' | '04' | '05',
                        },
                      }),
                    )
                  }
                >
                  {Object.entries(studioBackdrops).map(([id, s]) => (
                    <option key={id} value={id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <small>
                Los botones de predicción generan un desenlace real del simulador; nunca escriben
                directamente «acertada» o «fallida» en la memoria. La afinidad de este ensayo está
                configurada con el Celta.
              </small>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
