import { useState, type FormEvent } from 'react';
import { Panel, Empty, Badge, matchTitle, type ViewProps } from './ui';
export function ChatPanel({ state, send, full = false }: ViewProps & { full?: boolean }) {
  const [username, setUsername] = useState('Pedro'),
    [message, setMessage] = useState(''),
    [history, setHistory] = useState(false),
    [matchId, setMatchId] = useState(''),
    [sending, setSending] = useState(false);
  const pending = state.chat
    .filter((m) => ['pending', 'selected'].includes(m.status))
    .sort((a, b) =>
      a.status === 'selected' ? -1 : b.status === 'selected' ? 1 : b.priority - a.priority,
    );
  const messages = history ? [...state.chat].reverse() : pending;
  async function add(e: FormEvent) {
    e.preventDefault();
    setSending(true);
    if (await send({ type: 'chat', username, message, matchId: matchId || undefined }))
      setMessage('');
    setSending(false);
  }
  return (
    <Panel title="Cola del chat" meta={<Badge>{pending.length} PENDIENTES</Badge>}>
      <div className="chat-tabs">
        <button className={!history ? 'selected' : ''} onClick={() => setHistory(false)}>
          Pendientes
        </button>
        <button className={history ? 'selected' : ''} onClick={() => setHistory(true)}>
          Historial
        </button>
        <span>{state.dataMode === 'LIVE' ? 'COMUNIDAD DE LA APP' : 'SIMULADOR LOCAL'}</span>
      </div>
      <div className={`chat-list ${full ? 'full' : ''}`}>
        {messages.slice(0, full ? 100 : 8).map((m) => (
          <div className={`chat-item chat-${m.status}`} key={m.id}>
            <span className="user-avatar">{m.username.slice(0, 1).toUpperCase()}</span>
            <div className="chat-copy">
              <div>
                <b>{m.username}</b>
                <small>
                  {m.status} · {m.platform}
                </small>
                <small>{m.priority} pts</small>
              </div>
              <p>{m.message}</p>
              {m.relatedMatchId && (
                <small className="accent">
                  ⚑{' '}
                  {state.activeMatches.find((x) => x.id === m.relatedMatchId)?.home.shortName ??
                    'Partido eliminado'}
                </small>
              )}
              <div className="chat-actions">
                <button
                  disabled={m.status !== 'pending' || Boolean(state.selectedChatId)}
                  onClick={() => void send({ type: 'respond', id: m.id })}
                >
                  Responder ↗
                </button>
                <button
                  disabled={m.status !== 'pending'}
                  onClick={() => void send({ type: 'skip', id: m.id })}
                >
                  Saltar
                </button>
                <button
                  disabled={m.status !== 'pending'}
                  onClick={() => void send({ type: 'mute', id: m.id })}
                >
                  Silenciar usuario
                </button>
              </div>
            </div>
          </div>
        ))}
        {!messages.length && <Empty>Todo al día. Añade un comentario para empezar.</Empty>}
      </div>
      <form className="chat-composer" onSubmit={(e) => void add(e)}>
        <input
          aria-label="Usuario"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Usuario"
          required
          maxLength={40}
        />
        <select
          aria-label="Contexto del comentario"
          value={matchId}
          onChange={(e) => setMatchId(e.target.value)}
        >
          <option value="">Partido en pantalla / detectar equipo</option>
          {state.activeMatches.map((m) => (
            <option key={m.id} value={m.id}>
              {matchTitle(m)}
            </option>
          ))}
        </select>
        <textarea
          aria-label="Comentario"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Escribe un comentario para SamuIA…"
          required
          maxLength={500}
          rows={2}
        />
        <div>
          <small>
            {state.dataMode === 'LIVE'
              ? '↳ Comunidad de esta sesión del estudio'
              : '↳ Solo tú ves esta simulación'}
          </small>
          <button className="primary" disabled={sending || !message.trim() || !username.trim()}>
            Añadir a la cola ↗
          </button>
        </div>
      </form>
    </Panel>
  );
}
