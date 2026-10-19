import type { StudioSnapshot } from '../../../packages/shared/src/index';
export function LiveStatus({ state }: { state: StudioSnapshot }) {
  const live = state.live;
  if (!live) return null;
  const labels = {
    unconfigured: 'Sin configurar',
    connecting: 'Conectando',
    connected: 'Conectado',
    reconnecting: 'Reconectando',
    paused: 'Pausado',
  };
  const date = (at: number | null) => (at === null ? '—' : new Date(at).toLocaleTimeString());
  return (
    <section className="info-banner live-status" aria-label="Estado del proveedor LIVE">
      <b data-testid="live-status">
        LIVE · {labels[live.status]}
        {live.stale ? ' · Datos pendientes o desactualizados' : ''}
      </b>
      <p>{live.message}</p>
      <div className="live-status-values">
        <span>Proveedor: {live.provider}</span>
        <span>
          Narración:{' '}
          {live.commentary === 'available'
            ? 'Disponible'
            : live.commentary === 'reconnecting'
              ? 'Reconectando · usando eventos'
              : 'Fallback con eventos'}
        </span>
        <span>Última recepción: {date(live.lastSuccessAt)}</span>
        <span>Próximo intento: {date(live.nextRetryAt)}</span>
        <span>Duplicados evitados: {live.duplicates}</span>
      </div>
      <details>
        <summary>Registro de conexión · {live.logs.length} entradas</summary>
        <ul>
          {live.logs.slice(0, 20).map((l, i) => (
            <li key={`${l.at}-${i}`}>
              {date(l.at)} · {l.level} · {l.code}
              {l.matchId ? ` · partido ${l.matchId}` : ''}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
