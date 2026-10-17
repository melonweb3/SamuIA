import { useState } from 'react';
import { Panel, Empty, Badge, matchTitle, exportJson, type ViewProps } from './ui';
import type { PersonalityMemory, MemoryEntry } from '../../../packages/shared/src/index';
const sections: [keyof PersonalityMemory, string][] = [
  ['previousOpinions', 'Opiniones publicadas'],
  ['predictions', 'Predicciones'],
  ['successfulPredictions', 'Predicciones acertadas'],
  ['failedPredictions', 'Predicciones fallidas'],
  ['communityQuestions', 'Preguntas a la comunidad'],
  ['communityResponses', 'Respuestas reales del chat'],
  ['runningJokes', 'Bromas ya utilizadas'],
  ['memorableMoments', 'Momentos registrados'],
  ['playersPraised', 'Jugadores destacados'],
  ['playersCriticized', 'Críticas futbolísticas a jugadores'],
];
export function MemoryPanel({ state }: ViewProps) {
  const [selected, setSelected] = useState('');
  const match =
    state.activeMatches.find((m) => m.id === (selected || state.currentMatchId)) ??
    state.activeMatches[0];
  const context = state.contexts.find((c) => c.matchId === match?.id);
  return (
    <>
      <div className="section-toolbar">
        <select
          aria-label="Partido de la memoria"
          value={match?.id ?? ''}
          onChange={(e) => setSelected(e.target.value)}
        >
          {state.activeMatches.map((m) => (
            <option key={m.id} value={m.id}>
              {matchTitle(m)}
            </option>
          ))}
        </select>
        <button
          className="primary"
          disabled={!context}
          onClick={() =>
            exportJson(
              {
                profile: state.profile,
                match,
                context,
                history: state.history.filter((h) => h.matchId === match?.id),
              },
              'SamuIA-memoria.json',
            )
          }
        >
          Exportar memoria ↓
        </button>
      </div>
      {context ? (
        <>
          <div className="memory-summary">
            <div>
              <small>PARTIDO</small>
              <b>{matchTitle(match)}</b>
            </div>
            <div>
              <small>INTENSIDAD</small>
              <b>{context.intensity}/5</b>
            </div>
            <div>
              <small>COMENTARIOS PUBLICADOS</small>
              <b>{context.publishedCount}</b>
            </div>
            <div>
              <small>PREDICCIONES PENDIENTES</small>
              <b>
                {context.personalityMemory.predictions.filter((p) => p.status === 'pending').length}
              </b>
            </div>
          </div>
          <div className="info-banner">
            La memoria contiene comentarios publicados y eventos de esta simulación. No se inventan
            jugadores, recuerdos ni votos. Los apartados de jugadores permanecen vacíos hasta
            disponer de datos de jugadores.
          </div>
          <div className="memory-grid">
            {sections.map(([key, title]) => (
              <Panel
                key={key}
                title={title}
                meta={<Badge>{context.personalityMemory[key].length}</Badge>}
              >
                <div className="memory-list">
                  {[...context.personalityMemory[key]].reverse().map((entry: MemoryEntry) => (
                    <article key={entry.id}>
                      <header>
                        <span>
                          {entry.minute}' ·{' '}
                          {new Date(entry.timestamp).toLocaleTimeString('es-ES', {
                            timeZone: 'Europe/Madrid',
                          })}
                        </span>
                        {'status' in entry && <Badge>{String(entry.status)}</Badge>}
                      </header>
                      <p>{entry.content}</p>
                      <small>
                        {entry.relatedTeam ?? 'Contexto del partido'}
                        {'confidence' in entry && entry.confidence !== undefined
                          ? ` · confianza editorial ${(entry.confidence * 100).toFixed(0)}%`
                          : ''}
                      </small>
                      <details>
                        <summary>Datos de respaldo</summary>
                        <code>ID: {entry.id}</code>
                        <p>
                          Fuentes:{' '}
                          {entry.sourceIds.join(', ') ||
                            'Estado agregado del marcador y estadísticas'}
                        </p>
                        {'resolvedBy' in entry && (
                          <p>Resuelto por: {String(entry.resolvedBy ?? 'Pendiente')}</p>
                        )}
                      </details>
                    </article>
                  ))}
                  {!context.personalityMemory[key].length && (
                    <Empty>Todavía no hay registros.</Empty>
                  )}
                </div>
              </Panel>
            ))}
          </div>
          <Panel title="Comentarios publicados en este partido">
            <div className="memory-list">
              {state.history
                .filter((h) => h.matchId === match.id)
                .map((h) => (
                  <article key={h.id}>
                    <small>
                      {h.source} ·{' '}
                      {new Date(h.at).toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid' })}
                    </small>
                    <p>{h.decision.say}</p>
                    <details>
                      <summary>Referencias de memoria</summary>
                      <p>{h.memoryIds.join(', ') || 'Sin nueva escritura de memoria'}</p>
                    </details>
                  </article>
                ))}
            </div>
          </Panel>
        </>
      ) : (
        <Empty>No hay un contexto activo.</Empty>
      )}
    </>
  );
}
