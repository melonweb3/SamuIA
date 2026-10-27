import { useEffect, useRef, useState } from 'react';
import {
  platforms,
  type Composition,
  type StudioSnapshot,
} from '../../../packages/shared/src/index';
import { Panel } from './ui';
import { VideoCompositor } from './VideoCompositor';
import { BroadcastProducer } from './BroadcastProducer';
import { useAvatarRendererFactory } from './AvatarRendererHost';
const names = { youtube: 'YouTube', twitch: 'Twitch', kick: 'Kick', tiktok: 'TikTok' };
export function MultiplatformAdmin({
  state,
  visible,
  portable,
  onState,
}: {
  state: StudioSnapshot;
  visible: boolean;
  portable: boolean;
  onState: (state: StudioSnapshot) => void;
}) {
  const landscape = useRef<HTMLDivElement>(null),
    portrait = useRef<HTMLDivElement>(null);
  const compositors = useRef<Record<Composition, VideoCompositor> | null>(null),
    producer = useRef<BroadcastProducer | null>(null);
  const factory = useAvatarRendererFactory();
  const [toggles, setToggles] = useState<Record<string, boolean>>({});
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [title, setTitle] = useState('SamuIA · Fútbol con la comunidad'),
    [category, setCategory] = useState(''),
    [platform, setPlatform] = useState<(typeof platforms)[number]>('twitch'),
    [username, setUsername] = useState('Ana'),
    [message, setMessage] = useState('Samu, ¿qué opinas del penalti?');
  const latest = useRef(state);
  latest.current = state;
  useEffect(() => {
    const instances = {
      landscape: new VideoCompositor('landscape', latest.current, factory),
      portrait: new VideoCompositor('portrait', latest.current, factory),
    };
    compositors.current = instances;
    landscape.current?.append(instances.landscape.canvas);
    portrait.current?.append(instances.portrait.canvas);
    return () => {
      void producer.current?.stop().catch(() => {});
      producer.current = null;
      for (const instance of Object.values(instances)) {
        instance.dispose();
        instance.canvas.remove();
      }
      compositors.current = null;
    };
  }, [factory]);
  useEffect(() => {
    for (const compositor of Object.values(compositors.current ?? {})) compositor.update(state);
    producer.current?.update(state);
    if (!state.multiplatform?.broadcast.running && producer.current?.matches(state)) {
      const current = producer.current;
      producer.current = null;
      void current.stop().catch(() => {});
    }
  }, [state]);
  const admin = async (command: unknown) => {
    const response = await fetch('/api/multiplatform/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? 'No se pudo ejecutar la acción');
    if (result.multiplatform) onState(result);
    return result;
  };
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de administración');
    } finally {
      setBusy(false);
    }
  };
  const toggle = (
    kind: 'chat' | 'output',
    platform: (typeof platforms)[number],
    enabled: boolean,
  ) => {
    const key = `${kind}:${platform}`;
    setToggles((previous) => ({ ...previous, [key]: enabled }));
    void act(async () => {
      try {
        await admin({ action: kind, platform, enabled });
      } finally {
        setToggles((previous) => {
          const next = { ...previous };
          delete next[key];
          return next;
        });
      }
    });
  };
  const start = async (preview: boolean) => {
    if (!compositors.current) return;
    const current = new BroadcastProducer(compositors.current, state, setError);
    producer.current = current;
    try {
      await current.start(preview);
    } catch (error) {
      await current.stop().catch(() => {});
      producer.current = null;
      throw error;
    }
  };
  const multi = state.multiplatform,
    output = multi?.broadcast;
  return (
    <section
      className="broadcast-admin"
      hidden={!visible}
      aria-label="Administración multiplataforma"
    >
      <div className="info-banner">
        <b>Programa propio · 16:9 y 9:16</b>
        <p>
          Escenario, personaje, marcador, comentarios y voz de SamuIA. Las dos composiciones
          comparten contenido y mantienen el encuadre completo. El avatar actual usa imágenes
          estáticas; un renderer con rig puede aportar movimiento, expresiones y lip-sync al
          compositor.
        </p>
        {portable && (
          <p>
            Los chats externos y la emisión necesitan el servidor. Estas previsualizaciones
            funcionan también en el HTML portátil.
          </p>
        )}
      </div>
      {error && (
        <div className="info-banner" role="alert">
          {error}
        </div>
      )}
      <div className="broadcast-previews">
        <Panel title="Señal horizontal · 16:9">
          <div className="program-canvas" ref={landscape} data-testid="compositor-landscape" />
        </Panel>
        <Panel title="Señal vertical · 9:16">
          <div
            className="program-canvas portrait"
            ref={portrait}
            data-testid="compositor-portrait"
          />
        </Panel>
      </div>
      <Panel title="Control de emisión">
        <div className="settings-body voice-panel">
          <p data-testid="broadcast-state">
            {output?.running
              ? output.previewOnly
                ? 'Prueba local codificada · sin destinos públicos'
                : 'Emisión en curso'
              : 'Emisión detenida'}
          </p>
          <p>
            FFmpeg: {output?.encoderAvailable ? 'disponible' : 'necesita servidor con FFmpeg'} ·
            Audio capturable:{' '}
            {output?.audioAvailable ? 'TTS local de prueba' : 'pendiente de configuración'}. La voz
            Flite es de prueba y no es la voz personalizada del personaje.
          </p>
          <div className="controls">
            <button
              disabled={portable || busy || output?.running || !output?.encoderAvailable}
              onClick={() => void act(() => start(true))}
            >
              Prueba local codificada
            </button>
            <button
              className="primary"
              disabled={
                portable ||
                busy ||
                output?.running ||
                !output?.audioAvailable ||
                !output?.destinations.some((d) => d.enabled && d.configured)
              }
              onClick={() => void act(() => start(false))}
            >
              Iniciar directo
            </button>
            <button
              disabled={portable || busy || !output?.running}
              onClick={() =>
                void act(async () => {
                  if (producer.current) {
                    const current = producer.current;
                    producer.current = null;
                    await current.stop();
                  } else await admin({ action: 'stop' });
                })
              }
            >
              Parar directo
            </button>
          </div>
          <p data-testid="encoded-counts">
            H.264/AAC · horizontal: {output?.encodedBytes.landscape ?? 0} bytes · vertical:{' '}
            {output?.encodedBytes.portrait ?? 0} bytes
          </p>
          <small>
            Mantén abierta la pestaña productora. Si deja de enviar señal, el servidor detiene la
            sesión. Ninguna clave de stream se muestra en el navegador.
          </small>
        </div>
      </Panel>
      <div className="integration-grid">
        {platforms.map((p) => {
          const chat = multi?.chats.find((c) => c.platform === p),
            destination = output?.destinations.find((d) => d.platform === p);
          return (
            <Panel key={p} title={names[p]}>
              <div className="settings-body voice-panel">
                <label>
                  <input
                    type="checkbox"
                    aria-label={`Chat ${names[p]} ON/OFF`}
                    checked={toggles[`chat:${p}`] ?? chat?.enabled ?? false}
                    disabled={portable || busy}
                    onChange={(e) => toggle('chat', p, e.target.checked)}
                  />{' '}
                  Recibir chat
                </label>
                <b data-testid={`chat-state-${p}`}>{chat?.status ?? 'Necesita servidor'}</b>
                <small>
                  {chat?.message ?? 'Configura el adaptador y sus permisos en el servidor'}
                </small>
                <span>{chat?.received ?? 0} mensajes recibidos</span>
                <label>
                  <input
                    type="checkbox"
                    aria-label={`${names[p]} ON/OFF`}
                    checked={toggles[`output:${p}`] ?? destination?.enabled ?? false}
                    disabled={portable || busy}
                    onChange={(e) => toggle('output', p, e.target.checked)}
                  />{' '}
                  Emitir en {names[p]}
                </label>
                <b data-testid={`output-state-${p}`}>{destination?.status ?? 'Sin configurar'}</b>
                <small>
                  {destination?.message ?? 'Las claves se configuran en variables de entorno'}
                </small>
                <span>
                  Formato {p === 'tiktok' ? '9:16' : '16:9'} · reintentos:{' '}
                  {destination?.failures ?? 0}
                </span>
                <button
                  disabled={portable || busy || !destination?.metadataSupported}
                  onClick={() =>
                    void act(() => admin({ action: 'metadata', platform: p, title, category }))
                  }
                >
                  Actualizar título/categoría en {names[p]}
                </button>
                {!destination?.metadataSupported && (
                  <small>Metadatos: utiliza el panel oficial de la plataforma.</small>
                )}
              </div>
            </Panel>
          );
        })}
      </div>
      <Panel title="Título y categoría">
        <div className="settings-body voice-panel">
          <label>
            Título
            <input
              aria-label="Título del directo"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={140}
            />
          </label>
          <label>
            ID de categoría
            <input
              aria-label="Categoría del directo"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              maxLength={100}
            />
          </label>
          <small>
            Se actualizan con los botones de cada plataforma cuando hay API y permisos configurados.
          </small>
        </div>
      </Panel>
      <Panel title="CommunityAnalyzer · muestra reciente">
        <div className="settings-body voice-panel">
          <p>
            {state.community.sampleSize} mensajes en {state.community.windowMs / 1000} segundos.
          </p>
          {state.community.platforms.map((p) => (
            <p key={p.platform}>
              {p.platform}: {p.users} participantes · {p.positive} positivos · {p.negative} críticos
              {p.divided ? ' · opiniones divididas' : ''}
              {p.simulated ? ' · muestra simulada' : ''}
            </p>
          ))}
          <p>
            Temas:{' '}
            {state.community.topics
              .map((t) => `${t.topic} (${t.platform}, ${t.users} participantes)`)
              .join(' · ') || 'Aún no hay temas repetidos suficientes'}
          </p>
          <p>
            Filtrados:{' '}
            {Object.entries(state.community.filtered)
              .map(([reason, count]) => `${reason}: ${count}`)
              .join(' · ') || '0'}
          </p>
        </div>
      </Panel>
      {state.dataMode === 'SIMULATION' && (
        <Panel title="Prueba de chats · mensajes simulados">
          <form
            className="settings-body voice-panel"
            onSubmit={(e) => {
              e.preventDefault();
              void act(() => admin({ action: 'simulate-chat', platform, username, message }));
            }}
          >
            <label>
              Plataforma
              <select
                aria-label="Plataforma del mensaje simulado"
                value={platform}
                onChange={(e) => setPlatform(e.target.value as typeof platform)}
              >
                {platforms.map((p) => (
                  <option key={p} value={p}>
                    {names[p]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Usuario
              <input
                aria-label="Usuario externo simulado"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                maxLength={40}
                required
              />
            </label>
            <label>
              Mensaje
              <textarea
                aria-label="Mensaje externo simulado"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={500}
                required
              />
            </label>
            <button disabled={portable || busy}>Enviar mensaje externo simulado</button>
          </form>
        </Panel>
      )}
      <Panel title="Registro de emisión">
        <div className="settings-body">
          <ul>
            {output?.logs.slice(0, 20).map((l, i) => (
              <li key={`${l.at}-${i}`}>
                {new Date(l.at).toLocaleTimeString()} · {l.platform ?? 'programa'} · {l.code}
              </li>
            ))}
          </ul>
        </div>
      </Panel>
    </section>
  );
}
