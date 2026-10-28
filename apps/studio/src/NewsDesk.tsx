import { NewsBrainControls } from './NewsBrainControls';
import { useState } from 'react';
import {
  newsCategories,
  newsCategorySelected,
  newsFormats,
  newsScenes,
  type NewsProgramConfig,
  type NewsCue,
  type NewsScene,
} from '../../../packages/shared/src/news';
import { Panel, type ViewProps } from './ui';
import { Avatar } from './Avatar';
import { ChatPanel } from './Chat';
const formatLabels = {
  titular: 'Titular · hasta 15 s',
  resumen: 'Resumen · hasta 30 s',
  explicacion: 'Explicación · hasta 60 s',
  analisis: 'Análisis informativo',
  'ultima-hora': 'Última hora',
};
const reliability = {
  pending: 'Pendiente de verificar',
  'single-source': 'Una sola fuente',
  corroborated: 'Varias publicaciones · sin confirmar',
  confirmed: 'Confirmada por el operador',
  demo: 'DEMO · ficción',
};
function CueEditor({ cue, index, send }: { cue: NewsCue; index: number; send: ViewProps['send'] }) {
  const [text, setText] = useState(cue.text),
    [scene, setScene] = useState<NewsScene>(cue.scene),
    [position, setPosition] = useState(index);
  return (
    <article className="news-cue">
      <b>
        {index + 1}. {cue.section} · {cue.estimatedSeconds} s estimados
      </b>
      <textarea
        aria-label={`Guion ${index + 1}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={2000}
      />
      <label>
        Escena{' '}
        <select
          aria-label={`Escena ${index + 1}`}
          value={scene}
          onChange={(e) => setScene(e.target.value as NewsScene)}
        >
          {newsScenes.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <label>
        Posición{' '}
        <input
          aria-label={`Posición ${index + 1}`}
          type="number"
          min={1}
          max={100}
          value={position + 1}
          onChange={(e) => setPosition(Number(e.target.value) - 1)}
        />
      </label>
      <button
        onClick={() =>
          void send({ type: 'news', action: 'edit', id: cue.id, text, scene, position })
        }
      >
        Guardar intervención {index + 1}
      </button>
    </article>
  );
}
export function NewsDesk({
  state,
  send,
  onState,
  portable,
}: ViewProps & { onState: (s: ViewProps['state']) => void; portable: boolean }) {
  const news = state.news,
    p = news.program;
  const [config, setConfig] = useState<NewsProgramConfig>(
    news.program?.config ?? {
      categories: [...news.categories],
      durationMinutes: 5,
      count: 9,
      format: 'resumen',
      interaction: true,
      breaking: true,
    },
  );
  const [name, setName] = useState(''),
    [url, setUrl] = useState(''),
    [termsUrl, setTermsUrl] = useState(''),
    [termsNote, setTermsNote] = useState(''),
    [kind, setKind] = useState<'rss' | 'json'>('rss'),
    [category, setCategory] = useState(config.categories[0]),
    [usage, setUsage] = useState<'headlines' | 'licensed-excerpts'>('headlines');
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [verification, setVerification] = useState('');
  const admin = async (command: unknown, path = '/api/news/sources') => {
    setBusy(true);
    setError('');
    try {
      const r = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(command),
      });
      const result = await r.json();
      if (!r.ok) throw Error(result.error ?? 'No se pudo modificar la fuente');
      onState(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de fuentes');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="news-desk">
      <div className="info-banner">
        <b>SamuIA News · {state.dataMode}</b>
        <p>
          Las piezas DEMO son ficticias. La duración depende de los hechos disponibles: no se
          rellenan minutos inventando información. Revisa y aprueba la escaleta antes de emitir.
        </p>
      </div>
      {(error || news.error) && <p role="alert">{error || news.error}</p>}
      {!portable && (
        <NewsBrainControls
          state={state}
          manage={(cmd) => admin(cmd, '/api/news/manage')}
          busy={busy || !!state.newsService?.generating}
        />
      )}
      <div className="two-col">
        <Panel title="SamuIA presenta">
          <Avatar state={state} />
          <p data-testid="news-current-script">
            {news.current?.text ?? 'Prepara y aprueba una escaleta para comenzar.'}
          </p>
          <p>
            Escena: {news.current?.scene ?? 'estudio'} · Avatar: {state.animation.animation} ·{' '}
            {state.voice.audible ? 'Audio' : 'Voz simulada'}
          </p>
          <p>
            Siguiente:{' '}
            {p?.cues[p.index + (news.current ? 1 : 0)]?.headline ?? 'Sin siguiente pieza'}
          </p>
        </Panel>
        <Panel title="Preparar informativo">
          <fieldset>
            <legend>Categorías del informativo</legend>
            <div className="news-category-grid">
              {newsCategories.map((c) => (
                <label key={c}>
                  <input
                    type="checkbox"
                    checked={config.categories.includes(c)}
                    onChange={(e) => {
                      const categories = e.target.checked
                        ? [...config.categories, c]
                        : config.categories.filter((v) => v !== c);
                      setConfig({ ...config, categories });
                      void send({ type: 'news', action: 'categories', categories });
                    }}
                  />
                  {c}
                </label>
              ))}
            </div>
          </fieldset>
          <label>
            Duración solicitada{' '}
            <select
              aria-label="Duración del informativo"
              value={config.durationMinutes}
              onChange={(e) =>
                setConfig({
                  ...config,
                  durationMinutes: Number(e.target.value) as NewsProgramConfig['durationMinutes'],
                })
              }
            >
              {[5, 15, 30, 60].map((v) => (
                <option key={v} value={v}>
                  {v} minutos
                </option>
              ))}
            </select>
          </label>
          <label>
            Cantidad de noticias{' '}
            <input
              aria-label="Cantidad de noticias"
              type="number"
              min={1}
              max={30}
              value={config.count}
              onChange={(e) => setConfig({ ...config, count: Number(e.target.value) })}
            />
          </label>
          <label>
            Presentación{' '}
            <select
              aria-label="Formato informativo"
              value={config.format}
              onChange={(e) =>
                setConfig({ ...config, format: e.target.value as NewsProgramConfig['format'] })
              }
            >
              {newsFormats.map((f) => (
                <option key={f} value={f}>
                  {formatLabels[f]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={config.interaction}
              onChange={(e) => setConfig({ ...config, interaction: e.target.checked })}
            />
            Incluir preguntas del chat
          </label>
          <label>
            <input
              type="checkbox"
              checked={config.breaking}
              onChange={(e) => setConfig({ ...config, breaking: e.target.checked })}
            />
            Alertas de última hora con aprobación
          </label>
          {!portable && (
            <button
              disabled={busy || state.newsService?.generating}
              onClick={() => void admin({ action: 'generate', config }, '/api/news/manage')}
            >
              {busy || state.newsService?.generating
                ? 'Generando informativo…'
                : 'Generar informativo'}
            </button>
          )}
          <button onClick={() => void send({ type: 'news', action: 'build', config })}>
            Crear escaleta
          </button>
          <button
            disabled={state.dataMode !== 'SIMULATION'}
            onClick={() => void send({ type: 'news', action: 'demo' })}
          >
            Cargar noticias de demostración
          </button>
        </Panel>
      </div>
      <Panel title="Noticias recibidas">
        <p>
          Aprueba cada contenido que quieras incluir. Una publicación o varias copias no constituyen
          una verificación independiente.
        </p>
        <label>
          Comprobación editorial (para confirmar noticias reales)
          <textarea
            aria-label="Evidencia de verificación"
            value={verification}
            onChange={(e) => setVerification(e.target.value)}
            placeholder="Indica qué hechos has comprobado y cómo, con referencias."
          />
        </label>
        <div className="news-story-grid">
          {news.stories
            .filter((s) => newsCategorySelected(config.categories, s.category))
            .map((s) => (
              <article className="news-story" key={s.id} data-testid="news-story">
                <small>
                  {s.category} · {reliability[s.verification]} · revisión {s.revision} ·{' '}
                  {s.review === 'approved'
                    ? 'Aprobada'
                    : s.review === 'discarded'
                      ? 'Descartada'
                      : 'Pendiente'}
                </small>
                <h3>{s.title}</h3>
                <p>{s.summary || 'Solo titular autorizado; consulta la fuente para ampliar.'}</p>
                <p>
                  {new Date(s.publishedAt).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })} ·{' '}
                  {s.stale ? 'ANTIGUA · excluida del programa' : 'Actual'} · importancia{' '}
                  {s.importance}/100
                </p>
                <ul>
                  {s.sources.map((v) => (
                    <li key={v.id}>
                      {s.simulated ? (
                        <span>{v.sourceName} · fuente ficticia</span>
                      ) : (
                        <a href={v.url} target="_blank" rel="noreferrer noopener">
                          {v.sourceName}
                        </a>
                      )}{' '}
                      ·{' '}
                      {new Date(v.publishedAt).toLocaleString('es-ES', {
                        timeZone: 'Europe/Madrid',
                      })}
                    </li>
                  ))}
                </ul>
                <div className="button-row">
                  <button
                    disabled={s.stale || s.review === 'approved'}
                    onClick={() =>
                      void send({ type: 'news', action: 'review', id: s.id, review: 'approved' })
                    }
                  >
                    Aprobar contenido
                  </button>
                  <button
                    onClick={() =>
                      void send({ type: 'news', action: 'review', id: s.id, review: 'discarded' })
                    }
                  >
                    Descartar
                  </button>
                  {!s.simulated && (
                    <button
                      disabled={verification.trim().length < 20}
                      onClick={() =>
                        void send({ type: 'news', action: 'verify', id: s.id, note: verification })
                      }
                    >
                      Confirmar tras comprobar
                    </button>
                  )}
                </div>
              </article>
            ))}
        </div>
      </Panel>
      <Panel title="Escaleta y emisión">
        {!p ? (
          <p>Selecciona y aprueba noticias actuales, después crea la escaleta.</p>
        ) : (
          <>
            <p data-testid="news-program-status">
              {
                {
                  draft: 'Borrador',
                  running: 'En emisión',
                  paused: 'Pausado',
                  stopped: 'Detenido',
                  completed: 'Completado',
                }[p.status]
              }{' '}
              · {p.approved ? 'Escaleta aprobada' : 'Pendiente de aprobación'} · {p.index}/
              {p.cues.length}
            </p>
            <p>
              Contenido disponible: {p.estimatedSeconds} segundos estimados. Solicitados:{' '}
              {p.config.durationMinutes} minutos. No se garantiza esa duración si faltan datos.
            </p>
            <div className="button-row">
              <button
                disabled={p.approved || p.status === 'running'}
                onClick={() => void send({ type: 'news', action: 'approve' })}
              >
                Aprobar escaleta
              </button>
              <button
                disabled={!p.approved || p.status === 'running'}
                onClick={() => void send({ type: 'news', action: 'start' })}
              >
                {p.status === 'paused' ? 'Reanudar informativo' : 'Iniciar informativo'}
              </button>
              <button
                disabled={p.status !== 'running'}
                onClick={() => void send({ type: 'news', action: 'pause' })}
              >
                Pausar informativo
              </button>
              <button onClick={() => void send({ type: 'news', action: 'stop' })}>
                Detener informativo
              </button>
              <button
                disabled={!news.current || !['playing', 'paused'].includes(state.voice.status)}
                onClick={() => void send({ type: 'news', action: 'finish' })}
              >
                Terminar intervención actual
              </button>
            </div>
            <div className="news-cues">
              {p.cues.map((cue, i) =>
                p.status === 'running' || news.current ? (
                  <article className="news-cue" key={cue.id}>
                    <b>
                      {i + 1}. {cue.section}
                    </b>
                    <p>{cue.text}</p>
                  </article>
                ) : (
                  <CueEditor key={`${cue.id}:${cue.text}:${i}`} cue={cue} index={i} send={send} />
                ),
              )}
            </div>
          </>
        )}
      </Panel>
      <Panel title="Última hora">
        <p>
          Una alerta nunca interrumpe sola. Autorizar reinicia después la pieza interrumpida desde
          su comienzo.
        </p>
        <button
          disabled={state.dataMode !== 'SIMULATION'}
          onClick={() => void send({ type: 'news', action: 'demo-breaking' })}
        >
          Simular noticia de última hora
        </button>
        {news.breakingAlerts.map((key) => {
          const s = news.stories.find((v) => v.id === key)!;
          return (
            <article key={key}>
              <b>{s.title}</b>
              <p>{reliability[s.verification]}</p>
              <button
                disabled={
                  s.review !== 'approved' || !['confirmed', 'demo'].includes(s.verification)
                }
                onClick={() => void send({ type: 'news', action: 'breaking', id: key })}
              >
                Autorizar interrupción
              </button>
            </article>
          );
        })}
      </Panel>
      <ChatPanel state={state} send={send} />
      <Panel title="Fuentes RSS y API">
        {portable ? (
          <p>
            Las fuentes externas requieren el servidor. El HTML portátil reproduce el informativo
            ficticio completo sin conexión.
          </p>
        ) : (
          <>
            <p>
              Solo HTTPS y dominios públicos autorizados en el servidor. Sin artículos completos ni
              imágenes remotas. Usa extractos únicamente con permiso de la fuente.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void admin({
                  action: 'add',
                  source: {
                    name,
                    url,
                    kind,
                    category,
                    usage,
                    enabled: true,
                    ...(termsUrl ? { termsUrl } : {}),
                    ...(termsNote ? { termsNote } : {}),
                  },
                });
              }}
            >
              <label>
                Nombre{' '}
                <input
                  aria-label="Nombre de la fuente"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label>
                URL{' '}
                <input
                  aria-label="URL de la fuente"
                  type="url"
                  required
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </label>
              <label>
                Tipo{' '}
                <select value={kind} onChange={(e) => setKind(e.target.value as 'rss' | 'json')}>
                  <option value="rss">RSS / Atom</option>
                  <option value="json">API JSON normalizada</option>
                </select>
              </label>
              <label>
                Categoría{' '}
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as typeof category)}
                >
                  {newsCategories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                Permiso de uso{' '}
                <select value={usage} onChange={(e) => setUsage(e.target.value as typeof usage)}>
                  <option value="headlines">Solo titulares y enlaces</option>
                  <option value="licensed-excerpts">Tengo permiso para usar extractos</option>
                </select>
              </label>
              <label>
                Condiciones de uso (URL HTTPS){' '}
                <input
                  aria-label="Condiciones de uso"
                  type="url"
                  value={termsUrl}
                  onChange={(e) => setTermsUrl(e.target.value)}
                  required
                />
              </label>
              <label>
                Permiso de reutilización comprobado{' '}
                <textarea
                  aria-label="Permiso de reutilización"
                  value={termsNote}
                  onChange={(e) => setTermsNote(e.target.value)}
                  minLength={20}
                  maxLength={1000}
                  required
                />
              </label>
              <button disabled={busy}>Añadir fuente</button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void admin({ action: 'refresh' })}
              >
                Actualizar fuentes
              </button>
            </form>
            {news.sources.map((s) => (
              <article key={s.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={s.enabled}
                    disabled={busy}
                    onChange={(e) =>
                      void admin({ action: 'enable', id: s.id, enabled: e.target.checked })
                    }
                  />
                  {s.name}
                </label>
                <p>
                  {s.url} ·{' '}
                  {s.lastFetchedAt
                    ? new Date(s.lastFetchedAt).toLocaleString('es-ES', {
                        timeZone: 'Europe/Madrid',
                      })
                    : 'Todavía no consultada'}
                </p>
                {s.error && <p role="status">{s.error}</p>}
              </article>
            ))}
          </>
        )}
      </Panel>
    </div>
  );
}
