import { useState } from 'react';
import { Panel, type ViewProps } from './ui';
export function NewsBrainControls({
  state,
  manage,
  busy,
}: {
  state: ViewProps['state'];
  manage: (command: unknown) => Promise<void>;
  busy: boolean;
}) {
  const service = state.newsService;
  const [config, setConfig] = useState(
    service?.config ?? {
      mode: 'SIMULACIÓN' as const,
      model: 'gpt-4.1-mini',
      maxOutputTokens: 700,
      dailyTokenLimit: 50000,
      dailyCallLimit: 100,
    },
  );
  const [seconds, setSeconds] = useState(service?.refreshSeconds ?? 60);
  if (!service) return null;
  return (
    <Panel title="Cerebro y memoria del informativo">
      <div className="news-brain-body">
        <p>
          Proveedor: OpenAI ·{' '}
          {service.configured
            ? 'Credencial configurada en el servidor'
            : 'Sin credencial; simulación disponible'}{' '}
          · {service.status}
        </p>
        <div className="news-brain-config">
          <label>
            Modo de inteligencia{' '}
            <select
              aria-label="Modo de inteligencia"
              value={config.mode}
              onChange={(e) => setConfig({ ...config, mode: e.target.value as typeof config.mode })}
            >
              {(['SIMULACIÓN', 'IA REAL', 'AUTOMÁTICO CON FALLBACK'] as const).map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <label>
            Modelo OpenAI{' '}
            <input
              aria-label="Modelo OpenAI"
              value={config.model}
              onChange={(e) => setConfig({ ...config, model: e.target.value })}
            />
          </label>
          <label>
            Máximo de tokens por respuesta{' '}
            <input
              type="number"
              min={128}
              max={2000}
              value={config.maxOutputTokens}
              onChange={(e) => setConfig({ ...config, maxOutputTokens: Number(e.target.value) })}
            />
          </label>
          <label>
            Límite diario de tokens{' '}
            <input
              type="number"
              min={1000}
              max={1000000}
              value={config.dailyTokenLimit}
              onChange={(e) => setConfig({ ...config, dailyTokenLimit: Number(e.target.value) })}
            />
          </label>
          <label>
            Límite diario de llamadas{' '}
            <input
              type="number"
              min={1}
              max={1000}
              value={config.dailyCallLimit}
              onChange={(e) => setConfig({ ...config, dailyCallLimit: Number(e.target.value) })}
            />
          </label>
        </div>
        <button disabled={busy} onClick={() => void manage({ action: 'configure', config })}>
          Guardar configuración de IA
        </button>
        <p>
          Consumo diario: {service.usage.calls} llamadas · {service.usage.tokens} tokens
          contabilizados o reservados. {service.approximateCost}
        </p>
        <p>
          El estado de conexión se actualiza al generar; guardar la configuración no realiza
          llamadas de pago. Revisa siempre el guion antes de aprobarlo.
        </p>
        <label>
          Actualización de fuentes (segundos){' '}
          <input
            aria-label="Intervalo de fuentes"
            type="number"
            min={60}
            max={3600}
            value={seconds}
            onChange={(e) => setSeconds(Number(e.target.value))}
          />
        </label>
        <button disabled={busy} onClick={() => void manage({ action: 'interval', seconds })}>
          Guardar intervalo
        </button>
        {service.storageError && <p role="alert">{service.storageError}</p>}
        <p>
          Fuentes, noticias y borrador se guardan automáticamente en el servidor. Los programas
          recuperados requieren nueva aprobación.
        </p>
        <button
          disabled={busy || !state.news.program}
          onClick={() => void manage({ action: 'save' })}
        >
          Guardar programa en archivo
        </button>
        {service.archive.map((p) => (
          <p key={p.id}>
            {new Date(p.at).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })} · {p.duration} s{' '}
            <button disabled={busy} onClick={() => void manage({ action: 'load', id: p.id })}>
              Recuperar programa
            </button>
          </p>
        ))}
        <details>
          <summary>Historial de emisiones</summary>
          {service.broadcasts.map((b, i) => (
            <p key={i}>
              {new Date(b.at).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })} · {b.status} ·{' '}
              {b.categories.join(', ')} · {b.duration} s previstos
            </p>
          ))}
        </details>
        <details>
          <summary>Historial de actualizaciones y eventos</summary>
          {service.updates.slice(0, 20).map((u, i) => (
            <p key={i}>
              {new Date(u.at).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })} ·{' '}
              {state.news.sources.find((s) => s.id === u.sourceId)?.name ?? u.sourceId} ·{' '}
              {u.ok
                ? `${u.received} elementos recibidos (antes de deduplicar)`
                : 'Error de actualización'}
            </p>
          ))}
          {service.events.slice(0, 10).map((e, i) => (
            <p key={i}>{e.code}</p>
          ))}
        </details>
      </div>
    </Panel>
  );
}
