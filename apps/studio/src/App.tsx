import { MultiplatformAdmin } from './MultiplatformAdmin';
import { VoiceStudio } from './VoiceStudio';
import { VoiceStudioPlayer } from './VoiceStudioPlayer';
import { ReactionStudio } from './ReactionStudio';
import { loadAvatarPreferences, saveAvatarPreferences } from './avatar-persistence';
import { LiveDataSession } from '../../../packages/live-data/src/index';
import { LiveStatus } from './LiveStatus';
import { useEffect, useState } from 'react';
import { MatchSimulationSession } from '../../../packages/match-simulation/src/index';
import { MatchSimulation } from './MatchSimulation';
import type { ReactionDirector } from '../../../packages/core/src/index';
import { DISCLAIMER, type StudioSnapshot } from '../../../packages/shared/src/index';
import { Dashboard } from './Dashboard';
import { MatchCenter } from './Matches';
import { ChatPanel } from './Chat';
import { Radar, Alerts } from './Sports';
import { Settings } from './Settings';
import { MemoryPanel } from './Memory';
import { Integrations } from './Integrations';
import { AvatarSimulation } from './AvatarSimulation';
import type { Send } from './ui';
const pages = [
  'Dashboard',
  'Centro de Partidos',
  'Radar SamuIA',
  'Cola del Chat',
  'Memoria',
  'Integraciones',
  'Multiplataforma',
  'Voice Studio',
  'Avatar / Reaction Studio',
  'SIMULATION',
  'Partido de prueba',
  'Ajustes',
] as const;
type Page = (typeof pages)[number];
const icons = ['◫', '⚑', '◎', '☷', '◈', '⌘', '◉', '♫', '◌', '▷', '⚽', '⚙'];
export function App({ session }: { session?: ReactionDirector }) {
  const [portableMode, setPortableMode] = useState<'SIMULATION' | 'LIVE'>('SIMULATION');
  const [portableLive] = useState(() => (session ? new LiveDataSession(null) : null));
  const [matchSimulation, setMatchSimulation] = useState(() => new MatchSimulationSession());
  const [page, setPage] = useState<Page>(
      location.hash === '#partido-prueba' ? 'Partido de prueba' : 'Dashboard',
    ),
    [state, setState] = useState<StudioSnapshot | null>(null),
    [connected, setConnected] = useState(false),
    [error, setError] = useState('');
  const [voicePlayer] = useState(() => new VoiceStudioPlayer(setError));
  useEffect(() => {
    if (session)
      try {
        loadAvatarPreferences(session);
      } catch {
        setError(
          'No se pudieron cargar los ajustes locales del avatar; se mantienen los valores de sesión',
        );
      }
  }, [session]);
  useEffect(() => voicePlayer.setSuspended(page === 'Partido de prueba'), [page, voicePlayer]);
  useEffect(() => {
    if (state && !session) voicePlayer.update(state);
  }, [state, session, voicePlayer]);
  useEffect(() => () => voicePlayer.stop(), [voicePlayer]);
  useEffect(() => {
    if (session) {
      const update = () => {
        session.tick();
        if (portableMode === 'LIVE' && portableLive) {
          portableLive.diagnostics.message =
            'LIVE necesita el servidor configurado. El HTML portátil mantiene SIMULATION sin conexión; no guarda ni solicita claves privadas.';
          setState(portableLive.snapshot());
        } else setState(session.snapshot());
        setConnected(true);
      };
      update();
      const t = setInterval(update, 250);
      return () => clearInterval(t);
    }
    const stream = new EventSource('/api/events');
    stream.onmessage = (e) => {
      const next: StudioSnapshot = JSON.parse(e.data);
      setState((previous) => (previous && previous.now > next.now ? previous : next));
      setConnected(true);
    };
    stream.onerror = () => setConnected(false);
    return () => stream.close();
  }, [session, portableMode, portableLive]);
  useEffect(() => {
    if (error) {
      const t = setTimeout(() => setError(''), 7000);
      return () => clearTimeout(t);
    }
  }, [error]);
  const send: Send = async (command) => {
    setState((s) =>
      !s
        ? s
        : command.type === 'profile'
          ? { ...s, profile: { ...s.profile, ...command.patch } }
          : command.type === 'settings'
            ? { ...s, settings: { ...s.settings, ...command.patch } }
            : command.type === 'subscription'
              ? {
                  ...s,
                  activeMatches: s.activeMatches.map((m) =>
                    m.id === command.matchId
                      ? { ...m, subscription: { ...m.subscription, ...command.patch } }
                      : m,
                  ),
                }
              : command.type === 'league'
                ? {
                    ...s,
                    leagues: s.leagues.map((l) =>
                      l.id === command.id ? { ...l, enabled: command.enabled } : l,
                    ),
                  }
                : s,
    );
    try {
      if (session) {
        if (command.type === 'data-mode') {
          session.command({ type: 'control', action: 'silence' });
          setPortableMode(command.mode);
          return true;
        }
        if (portableMode === 'LIVE')
          throw new Error(
            'LIVE necesita el servidor configurado; cambia a SIMULATION para probar sin conexión',
          );
        session.command(command);
        if (['avatar-settings', 'reaction-upsert', 'reaction-remove'].includes(command.type))
          saveAvatarPreferences(session);
        setState(session.snapshot());
        return true;
      }
      const r = await fetch('/api/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(command),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error ?? 'No se pudo completar la acción');
      setState(result);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de conexión');
      if (session) setState(session.snapshot());
      else
        try {
          const r = await fetch('/api/state');
          if (r.ok) setState(await r.json());
        } catch {
          /* SSE recovers after reconnect. */
        }
      return false;
    }
  };
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage('Dashboard');
          }}
        >
          <span className="logo">s°</span>
          <div>
            Samu<span className="accent">IA</span>
            <small>LIVE STUDIO</small>
          </div>
        </a>
        <div className="workspace-label">ESPACIO DE TRABAJO</div>
        <nav>
          {pages.map((p, i) => (
            <button
              key={p}
              className={p === page ? 'nav-item active' : 'nav-item'}
              onClick={() => setPage(p)}
            >
              <span aria-hidden="true">{icons[i]}</span>
              {p}
              {p === 'Cola del Chat' && (
                <b>{state?.chat.filter((c) => c.status === 'pending').length ?? 0}</b>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span>◎</span>
          <b>Fútbol con memoria.</b>
          <p>
            Tu estudio, tu personaje.
            <br />
            Cada partido tiene su historia.
          </p>
          <small>FASE 01 · DEMO LOCAL</small>
        </div>
        <div className="sidebar-status">
          <i className={connected ? 'dot' : 'dot offline'} />
          <span>
            {connected ? 'Sistema local conectado' : 'Conectando al servidor'}
            <small>{state?.dataMode ?? 'SIMULATION'} · Avatar Engine v9</small>
          </span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span>
            Workspace / <b>{page}</b>
          </span>
          <div>
            <select
              aria-label="Modo de datos"
              value={state?.dataMode ?? 'SIMULATION'}
              disabled={!state}
              onChange={(e) =>
                void send({ type: 'data-mode', mode: e.target.value as 'SIMULATION' | 'LIVE' })
              }
            >
              <option value="SIMULATION">SIMULATION</option>
              <option value="LIVE">LIVE</option>
            </select>
            <span className="local-chip">
              ⌁ {session ? 'Demo portátil' : 'Entorno local'} · Avatar Engine v9
            </span>
            {!session &&
              page !== 'Partido de prueba' &&
              state?.voiceStudio?.settings.voiceEnabled && (
                <button onClick={() => void voicePlayer.enable().catch((e) => setError(e.message))}>
                  Activar audio
                </button>
              )}
            <span className="profile-icon">S</span>
            <span>
              Samu<small>CREADOR</small>
            </span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">TU CENTRO DE CONTROL</div>
              <h1>
                {page === 'Dashboard' ? 'SamuIA Live Studio' : page}
                <span className="demo-badge">
                  ● {connected ? (state?.dataMode ?? 'SIMULATION') : 'OFFLINE'}
                </span>
              </h1>
              <p>
                {page === 'Dashboard'
                  ? 'Tu directo, a tu ritmo. SamuIA le pone voz e historia.'
                  : page === 'Memoria'
                    ? 'Lo que se dijo, lo que ocurrió y los datos que lo respaldan.'
                    : 'Cada encuentro, una historia. Tú decides cómo la contamos.'}
              </p>
            </div>
            <span className="state-badge">
              <i className="dot" />
              {page === 'Partido de prueba' && state?.dataMode !== 'LIVE'
                ? 'SIMULATION'
                : (state?.state ?? 'CONECTANDO')}
              <small>
                {page === 'Partido de prueba'
                  ? 'Prueba de retransmisión'
                  : state?.voice.audible
                    ? `Voz · ${state.voice.currentVoice ?? state.voice.provider}`
                    : 'Voz simulada'}
              </small>
            </span>
          </div>
          {!connected && (
            <div className="info-banner">
              {state
                ? 'Conexión perdida. Reconectando…'
                : 'Conectando al servidor local. Ejecuta pnpm dev para iniciar el estudio.'}
            </div>
          )}
          {error && (
            <div className="toast" role="alert">
              {error}
              <button onClick={() => setError('')} aria-label="Cerrar aviso">
                ×
              </button>
            </div>
          )}
          {state && (
            <>
              {state.dataMode === 'LIVE' && <LiveStatus state={state} />}
              {page === 'Dashboard' && <Dashboard state={state} send={send} />}{' '}
              {page === 'Centro de Partidos' && <MatchCenter state={state} send={send} />}{' '}
              {page === 'Radar SamuIA' && (
                <div className="two-col">
                  <Radar state={state} send={send} />
                  <Alerts state={state} />
                </div>
              )}{' '}
              {page === 'Cola del Chat' && <ChatPanel state={state} send={send} full />}
              {page === 'Memoria' && <MemoryPanel state={state} send={send} />}{' '}
              {page === 'Ajustes' && <Settings state={state} send={send} />}{' '}
              {page === 'Integraciones' && <Integrations />}
              {page === 'Voice Studio' && (
                <VoiceStudio
                  state={state}
                  player={voicePlayer}
                  onState={(next) =>
                    setState((previous) => (previous && previous.now > next.now ? previous : next))
                  }
                  portable={!!session}
                />
              )}
              {page === 'Avatar / Reaction Studio' && (
                <ReactionStudio
                  state={state}
                  send={send}
                  session={session}
                  player={voicePlayer}
                  onState={(next) =>
                    setState((previous) => (previous && previous.now > next.now ? previous : next))
                  }
                />
              )}
              <MultiplatformAdmin
                state={state}
                visible={page === 'Multiplataforma'}
                portable={!!session}
                onState={(next) =>
                  setState((previous) => (previous && previous.now > next.now ? previous : next))
                }
              />
              {page === 'SIMULATION' && state.dataMode !== 'LIVE' && (
                <AvatarSimulation state={state} send={send} />
              )}
              {['SIMULATION', 'Partido de prueba'].includes(page) && state.dataMode === 'LIVE' && (
                <div className="info-banner">
                  <p>
                    Los controles de prueba están en SIMULATION. LIVE conserva los datos recibidos
                    del proveedor.
                  </p>
                  <button onClick={() => void send({ type: 'data-mode', mode: 'SIMULATION' })}>
                    Volver a SIMULATION
                  </button>
                </div>
              )}
              {page === 'Partido de prueba' && state.dataMode !== 'LIVE' && (
                <MatchSimulation session={matchSimulation} onSessionChange={setMatchSimulation} />
              )}
              <footer>
                <span>{DISCLAIMER}</span>
                <span>● SAMUIA LIVE STUDIO / DEMO LOCAL</span>
                <span>
                  {state.dataMode === 'LIVE' ? 'Datos del proveedor LIVE' : 'Datos simulados'} ·{' '}
                  {state.multiplatform?.broadcast.running
                    ? 'Señal propia activa'
                    : 'Sin emisión a plataformas'}
                </span>
              </footer>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
