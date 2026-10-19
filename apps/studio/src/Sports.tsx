import { Panel, Empty, Badge, matchTitle, type ViewProps } from './ui';
import type { StudioSnapshot } from '../../../packages/shared/src/index';
export function Radar({ state, send }: ViewProps) {
  const matches = state.activeMatches
    .filter(
      (m) =>
        m.subscription.tracking &&
        state.leagues.some((l) => l.id === m.leagueId && l.enabled) &&
        ['live', 'halftime'].includes(m.status),
    )
    .sort((a, b) => b.excitementScore - a.excitementScore);
  return (
    <Panel title="Radar SamuIA" meta={<Badge>EN DIRECTO</Badge>}>
      <p className="description">
        {state.dataMode === 'LIVE'
          ? 'El pulso de tus partidos según los datos recibidos.'
          : 'El pulso de tus partidos, en tiempo real simulado.'}
      </p>
      <div className="radar-list">
        {matches.map((m, i) => (
          <button
            className={`radar-row ${state.currentMatchId === m.id ? 'current' : ''}`}
            key={m.id}
            onClick={() => void send({ type: 'focus', matchId: m.id })}
          >
            <span className="rank">{String(i + 1).padStart(2, '0')}</span>
            <div>
              <b>
                {m.home.shortName} {m.score.home} – {m.score.away} {m.away.shortName}
              </b>
              <small>
                {state.leagues.find((l) => l.id === m.leagueId)?.name} · {m.minute}'
              </small>
            </div>
            <div className="heat">
              <i style={{ width: `${m.excitementScore}%` }} />
            </div>
            <span>
              {m.excitementScore}
              <small>/100</small>
            </span>
          </button>
        ))}
        {!matches.length && <Empty>No hay partidos en seguimiento.</Empty>}
      </div>
      <div className="radar-foot">
        <span>
          ◎{' '}
          {state.nextSuggestedMatch
            ? matchTitle(state.activeMatches.find((m) => m.id === state.nextSuggestedMatch)!)
            : 'Detectando el siguiente momento'}
        </span>
        <Badge>
          {state.settings.carouselEnabled && !state.mainMatchId ? 'CARRUSEL ON' : 'MANUAL'}
        </Badge>
      </div>
    </Panel>
  );
}
export function Alerts({ state, compact = false }: { state: StudioSnapshot; compact?: boolean }) {
  return (
    <Panel
      title="Alertas deportivas"
      meta={<small className="muted">{state.alerts.length} eventos</small>}
    >
      <div className="alert-list">
        {state.alerts.slice(0, compact ? 3 : 30).map((a) => (
          <div className={`alert alert-${a.event.type}`} key={a.id}>
            <span>{a.event.type === 'red' ? '▮' : '⚑'}</span>
            <div>
              <b>{a.label}</b>
              <small>
                {a.secondary ? 'Secundario' : 'Principal'} · {a.event.minute}'
              </small>
              <small>
                {
                  {
                    queued: 'En cola · espera a terminar la frase',
                    'alert-only': 'Solo alerta',
                    reacted: 'Reacción emitida',
                    ignored: 'Agrupado o descartado',
                  }[a.disposition]
                }
              </small>
            </div>
          </div>
        ))}
        {!state.alerts.length && (
          <Empty>
            El radar está atento.
            <br />
            <small>Simula un evento para ver la primera alerta.</small>
          </Empty>
        )}
      </div>
    </Panel>
  );
}
