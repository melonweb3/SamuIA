import { useState, type FormEvent } from 'react';
import {
  DISCLAIMER,
  eventTypes,
  eventLabels,
  type MatchState,
} from '../../../packages/shared/src/index';
import { Panel, Empty, Badge, matchTitle, statusLabels, type ViewProps, type Send } from './ui';
export function EventSimulator({ match, send }: { match: MatchState; send: Send }) {
  const [side, setSide] = useState<'home' | 'away'>('home');
  const disabled = match.status !== 'live';
  return (
    <div className="simulator">
      <div className="eyebrow">SIMULADOR DE EVENTOS</div>
      <div className="goal-buttons">
        {(['home', 'away'] as const).map((s) => (
          <button
            key={s}
            disabled={disabled}
            onClick={() =>
              void send({ type: 'event', matchId: match.id, eventType: 'goal', side: s })
            }
          >
            + Gol {match[s].shortName}
          </button>
        ))}
      </div>
      <label className="side-label">
        Equipo
        <select
          aria-label={`Equipo del evento en ${matchTitle(match)}`}
          value={side}
          onChange={(e) => setSide(e.target.value as 'home' | 'away')}
        >
          <option value="home">{match.home.shortName}</option>
          <option value="away">{match.away.shortName}</option>
        </select>
      </label>
      <div className="event-buttons">
        {eventTypes
          .filter((t) => !['goal', 'kickoff', 'second_half'].includes(t))
          .map((t) => (
            <button
              className={`event-${t}`}
              key={t}
              disabled={disabled && !(match.status === 'halftime' && t === 'fulltime')}
              onClick={() => void send({ type: 'event', matchId: match.id, eventType: t, side })}
            >
              {eventLabels[t]}
            </button>
          ))}
      </div>
      {disabled && (
        <button
          className="resume"
          onClick={() =>
            void send(
              match.status === 'finished'
                ? { type: 'match-status', matchId: match.id, status: 'live' }
                : {
                    type: 'event',
                    matchId: match.id,
                    eventType: match.status === 'upcoming' ? 'kickoff' : 'second_half',
                    side: 'home',
                  },
            )
          }
        >
          ▷{' '}
          {match.status === 'upcoming'
            ? 'Iniciar partido'
            : match.status === 'halftime'
              ? 'Reanudar segunda parte'
              : 'Reabrir simulación'}
        </button>
      )}
    </div>
  );
}
export function MatchDetail({ match: m, state, send }: { match: MatchState } & ViewProps) {
  const rows: [string, string | number, string | number][] = [
    ['Posesión', `${m.statistics.home.possession}%`, `${m.statistics.away.possession}%`],
    ['Tiros', m.statistics.home.shots, m.statistics.away.shots],
    ['A puerta', m.statistics.home.shotsOnTarget, m.statistics.away.shotsOnTarget],
    ['xG', m.statistics.home.xG.toFixed(2), m.statistics.away.xG.toFixed(2)],
    ['Amarillas', m.statistics.home.yellow, m.statistics.away.yellow],
    ['Rojas', m.statistics.home.red, m.statistics.away.red],
    ['Córners', m.statistics.home.corners, m.statistics.away.corners],
  ];
  return (
    <div className="match-detail">
      <div className="competition">
        {state.leagues.find((l) => l.id === m.leagueId)?.name}
        <span>
          {m.minute}' · {statusLabels[m.status]}
        </span>
      </div>
      <div className="scoreboard">
        <div>
          <span className="crest home">{m.home.shortName.slice(0, 2).toUpperCase()}</span>
          <b>{m.home.shortName}</b>
        </div>
        <strong>
          {m.score.home}
          <i>:</i>
          {m.score.away}
        </strong>
        <div>
          <span className="crest away">{m.away.shortName.slice(0, 2).toUpperCase()}</span>
          <b>{m.away.shortName}</b>
        </div>
      </div>
      <div className="statistics">
        {rows.map(([label, a, b]) => (
          <div key={label}>
            <span>{a}</span>
            <small>{label}</small>
            <span>{b}</span>
          </div>
        ))}
      </div>
      <div className="probabilities">
        <div className="eyebrow">ESTIMACIÓN DEL RESULTADO</div>
        <div className="probability-bar">
          <i style={{ width: `${m.probabilities.home}%` }} />
          <i style={{ width: `${m.probabilities.draw}%` }} />
          <i style={{ width: `${m.probabilities.away}%` }} />
        </div>
        <div className="probability-labels">
          {[
            [m.home.shortName, m.probabilities.home],
            ['Empate', m.probabilities.draw],
            [m.away.shortName, m.probabilities.away],
          ].map(([name, value]) => (
            <span key={name}>
              {name}
              <b>{value}%</b>
            </span>
          ))}
        </div>
        <p className="disclaimer">{DISCLAIMER}</p>
      </div>
      <EventSimulator match={m} send={send} />
    </div>
  );
}
export function MatchCenter({ state, send }: ViewProps) {
  const [filter, setFilter] = useState('all'),
    [league, setLeague] = useState('all'),
    [home, setHome] = useState(''),
    [away, setAway] = useState(''),
    [addLeague, setAddLeague] = useState('laliga'),
    [status, setStatus] = useState<'live' | 'upcoming'>('live'),
    [kind, setKind] = useState<MatchState['contextType']>('regular'),
    [newLeague, setNewLeague] = useState('');
  const matches = state.activeMatches.filter(
    (m) =>
      (league === 'all' || m.leagueId === league) &&
      (filter === 'all' ||
        m.status === filter ||
        (filter === 'live' && m.status === 'halftime') ||
        (filter === 'favorites' &&
          (state.settings.favoriteTeams.some((t) => [m.home.name, m.away.name].includes(t)) ||
            state.settings.favoriteLeagues.includes(m.leagueId)))),
  );
  async function add(e: FormEvent) {
    e.preventDefault();
    if (
      await send({ type: 'match-add', leagueId: addLeague, home, away, status, contextType: kind })
    ) {
      setHome('');
      setAway('');
    }
  }
  return (
    <>
      <Panel
        title="Competiciones"
        meta={<small className="muted">Activar o pausar por liga</small>}
      >
        <div className="league-chips">
          {state.leagues.map((l) => (
            <label key={l.id}>
              <input
                type="checkbox"
                checked={l.enabled}
                onChange={(e) => void send({ type: 'league', id: l.id, enabled: e.target.checked })}
              />
              {l.name}
            </label>
          ))}
        </div>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            void send({ type: 'league-add', name: newLeague }).then((ok) => {
              if (ok) setNewLeague('');
            });
          }}
        >
          <input
            aria-label="Nueva competición"
            value={newLeague}
            onChange={(e) => setNewLeague(e.target.value)}
            maxLength={80}
            required
            placeholder="Nueva competición"
          />
          <button>Añadir liga +</button>
        </form>
      </Panel>
      <div className="section-toolbar">
        <div className="tabs">
          {[
            ['all', 'Todos'],
            ['live', 'En directo'],
            ['upcoming', 'Próximos'],
            ['finished', 'Finalizados'],
            ['favorites', 'Favoritos'],
          ].map(([key, label]) => (
            <button
              key={key}
              className={filter === key ? 'selected' : ''}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <select
          aria-label="Filtrar competición"
          value={league}
          onChange={(e) => setLeague(e.target.value)}
        >
          <option value="all">Todas las competiciones</option>
          {state.leagues.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </div>
      <div className="match-grid">
        {matches.map((m) => (
          <Panel
            key={m.id}
            title={matchTitle(m)}
            meta={
              <button
                className="text-button"
                onClick={() =>
                  void send({ type: 'main', matchId: state.mainMatchId === m.id ? null : m.id })
                }
              >
                {state.mainMatchId === m.id ? '⚑ Principal · soltar' : 'Fijar principal'}
              </button>
            }
          >
            <div className="match-controls">
              <label>
                <input
                  type="checkbox"
                  checked={m.subscription.tracking}
                  onChange={(e) =>
                    void send({
                      type: 'subscription',
                      matchId: m.id,
                      patch: { tracking: e.target.checked },
                    })
                  }
                />
                Seguir
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={!m.subscription.reactions.paused}
                  onChange={(e) =>
                    void send({
                      type: 'subscription',
                      matchId: m.id,
                      patch: {
                        reactions: { ...m.subscription.reactions, paused: !e.target.checked },
                      },
                    })
                  }
                />
                Auto reacción
              </label>
              <select
                aria-label={`Prioridad ${matchTitle(m)}`}
                value={m.subscription.priority}
                onChange={(e) =>
                  void send({
                    type: 'subscription',
                    matchId: m.id,
                    patch: { priority: e.target.value as 'ALTA' | 'MEDIA' | 'BAJA' },
                  })
                }
              >
                {['ALTA', 'MEDIA', 'BAJA'].map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </div>
            <MatchDetail match={m} state={state} send={send} />
            <details className="event-filters">
              <summary>Filtros de reacción por evento</summary>
              <div>
                {eventTypes.map((t) => (
                  <label key={t}>
                    <input
                      type="checkbox"
                      checked={m.subscription.reactions.events[t]}
                      onChange={(e) =>
                        void send({
                          type: 'subscription',
                          matchId: m.id,
                          patch: {
                            reactions: {
                              ...m.subscription.reactions,
                              events: { ...m.subscription.reactions.events, [t]: e.target.checked },
                            },
                          },
                        })
                      }
                    />
                    {eventLabels[t]}
                  </label>
                ))}
              </div>
            </details>
            <details className="event-filters">
              <summary>Historial · {m.events.length} eventos</summary>
              {[...m.events]
                .reverse()
                .slice(0, 15)
                .map((e) => (
                  <p key={e.id}>
                    {e.minute}' · {eventLabels[e.type]} · {m[e.side].shortName}
                  </p>
                ))}
              <p>Última reacción: {m.lastReaction?.say ?? 'Todavía ninguna'}</p>
            </details>
            <div className="match-footer">
              <button onClick={() => void send({ type: 'focus', matchId: m.id })}>
                Ver en estudio ↗
              </button>
              <button
                className="danger"
                onClick={() => void send({ type: 'match-remove', matchId: m.id })}
              >
                Eliminar partido
              </button>
            </div>
          </Panel>
        ))}
      </div>
      {!matches.length && <Empty>No hay partidos con estos filtros.</Empty>}
      <Panel title="Añadir partido simulado" meta={<Badge>DATOS MOCK</Badge>}>
        <form className="add-match" onSubmit={(e) => void add(e)}>
          <label>
            Local
            <input
              value={home}
              onChange={(e) => setHome(e.target.value)}
              placeholder="Deportivo de La Coruña"
              required
              maxLength={80}
            />
          </label>
          <label>
            Visitante
            <input
              value={away}
              onChange={(e) => setAway(e.target.value)}
              placeholder="Racing"
              required
              maxLength={80}
            />
          </label>
          <label>
            Competición
            <select
              aria-label="Competición"
              value={addLeague}
              onChange={(e) => setAddLeague(e.target.value)}
            >
              {state.leagues.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Estado
            <select
              aria-label="Estado"
              value={status}
              onChange={(e) => setStatus(e.target.value as 'live' | 'upcoming')}
            >
              <option value="live">En directo</option>
              <option value="upcoming">Próximo</option>
            </select>
          </label>
          <label>
            Contexto
            <select
              aria-label="Contexto"
              value={kind}
              onChange={(e) => setKind(e.target.value as MatchState['contextType'])}
            >
              <option value="regular">Regular</option>
              <option value="derby">Derbi</option>
              <option value="final">Final</option>
            </select>
          </label>
          <button className="primary">Añadir partido +</button>
        </form>
      </Panel>
    </>
  );
}
