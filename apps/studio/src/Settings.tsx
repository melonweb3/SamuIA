import { useState } from 'react';
import type {
  AICommentatorProfile,
  StudioSettings,
  PersonalityRule,
} from '../../../packages/shared/src/index';
import { Panel, matchTitle, type ViewProps } from './ui';
import { officialAvatarFiles, officialAvatarDescriptions } from '../../../packages/core/src/visual';
export function Settings({ state, send }: ViewProps) {
  const profile = (patch: Partial<AICommentatorProfile>) => void send({ type: 'profile', patch }),
    settings = (patch: Partial<StudioSettings>) => void send({ type: 'settings', patch });
  const [scope, setScope] = useState<PersonalityRule['scope']>('league'),
    [key, setKey] = useState('laliga'),
    [ruleEmotion, setRuleEmotion] = useState(80),
    [ruleRivalry, setRuleRivalry] = useState(35);
  const levels: [keyof AICommentatorProfile, string][] = [
    ['humorLevel', 'Humor'],
    ['emotionLevel', 'Nivel de emoción'],
    ['rivalryLevel', 'Picante y rivalidad'],
    ['emojiFrequency', 'Cantidad de emojis'],
    ['predictionFrequency', 'Frecuencia de predicciones automáticas'],
    ['communityInteractionLevel', 'Preguntas a la comunidad'],
    ['commentaryFrequency', 'Frecuencia de comentarios'],
    ['galicianLevel', 'Toque gallego'],
  ];
  const timings: [keyof StudioSettings, string, number, number][] = [
    ['maxReactionsPerMinute', 'Máximo de reacciones por minuto', 1, 30],
    ['reactionCooldown', 'Cooldown entre reacciones (s)', 0, 60],
    ['cameraCooldown', 'Cooldown de cámara (s)', 0, 60],
    ['carouselCooldown', 'Cooldown de cambio de partido (s)', 1, 120],
  ];
  const toggles: [keyof StudioSettings, string, string][] = [
    ['autoReactions', 'Reacciones automáticas', 'Procesar eventos y comentarios editoriales.'],
    ['carouselEnabled', 'Modo carrusel', 'Cambiar por relevancia sin partido principal.'],
    ['showSecondaryAlerts', 'Alertas secundarias', 'Mostrar lo que pasa en otros encuentros.'],
    ['reactToFavorites', 'Reaccionar a favoritos', 'Prioridad editorial; nunca cambia los datos.'],
    ['safeMode', 'Modo seguro', 'Predeterminado. El respeto se mantiene siempre.'],
  ];
  return (
    <div className="two-col">
      <div>
        <Panel title="Identidad del comentarista">
          <div className="settings-body">
            <label>
              Nombre
              <input
                defaultValue={state.profile.name}
                maxLength={80}
                onBlur={(e) => profile({ name: e.target.value.trim() || 'SamuIA' })}
              />
            </label>
            <label>
              Avatar oficial
              <select
                aria-label="Avatar oficial"
                value={
                  officialAvatarFiles.includes(
                    state.profile.avatar as (typeof officialAvatarFiles)[number],
                  )
                    ? state.profile.avatar
                    : 'official'
                }
                onChange={(e) => profile({ avatar: e.target.value })}
              >
                <option value="official">Automático según la reacción</option>
                {officialAvatarFiles.map((file) => (
                  <option key={file} value={file}>
                    {officialAvatarDescriptions[file]}
                  </option>
                ))}
              </select>
              <small>
                Cinco retratos originales del mismo personaje, sin ediciones. También incluidos en
                el HTML portátil.
              </small>
            </label>
            <label>
              Descripción
              <textarea
                defaultValue={state.profile.description}
                maxLength={500}
                onBlur={(e) => profile({ description: e.target.value })}
              />
            </label>
            <label>
              Estilo de personalidad
              <textarea
                defaultValue={state.profile.personalityStyle}
                maxLength={500}
                onBlur={(e) => profile({ personalityStyle: e.target.value })}
              />
              <small>
                Metadatos para futuras IA. En esta demo el tono se configura con los controles y
                expresiones.
              </small>
            </label>
            <label>
              Expresiones características · una por línea
              <textarea
                defaultValue={state.profile.catchphrases.join('\n')}
                onBlur={(e) =>
                  profile({
                    catchphrases: e.target.value
                      .split('\n')
                      .map((s) => s.trim())
                      .filter(Boolean)
                      .slice(0, 30),
                  })
                }
              />
            </label>
            <label>
              Expresiones prohibidas · una por línea
              <textarea
                defaultValue={state.profile.prohibitedExpressions.join('\n')}
                onBlur={(e) =>
                  profile({
                    prohibitedExpressions: e.target.value
                      .split('\n')
                      .map((s) => s.trim())
                      .filter(Boolean)
                      .slice(0, 50),
                  })
                }
              />
            </label>
          </div>
        </Panel>
        <Panel title="Personalidad y ritmo">
          <div className="settings-body">
            {levels.map(([field, label]) => (
              <label className="slider-label" key={field}>
                <span>
                  {label}
                  <b>{String(state.profile[field])}%</b>
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={state.profile[field] as number}
                  onChange={(e) => profile({ [field]: Number(e.target.value) })}
                />
              </label>
            ))}
            <label>
              Longitud de respuesta
              <select
                value={state.profile.responseLength}
                onChange={(e) =>
                  profile({
                    responseLength: e.target.value as AICommentatorProfile['responseLength'],
                  })
                }
              >
                <option value="short">Corta</option>
                <option value="medium">Media</option>
                <option value="long">Larga</option>
              </select>
            </label>
            <p className="muted">
              Las frecuencias son editoriales, no garantías de respuesta. Se aplican datos
              suficientes, cooldown y límite por minuto.
            </p>
          </div>
        </Panel>
        <Panel title="Contextos especiales">
          <div className="settings-body">
            <p className="muted">
              Ajustes de emoción y picante por equipo o competición. No modifican probabilidades ni
              estadísticas.
            </p>
            <form
              className="rule-form"
              onSubmit={(e) => {
                e.preventDefault();
                profile({
                  specialRules: [
                    ...state.profile.specialRules,
                    { scope, key, emotionLevel: ruleEmotion, rivalryLevel: ruleRivalry },
                  ],
                });
              }}
            >
              <label>
                Ámbito
                <select
                  value={scope}
                  onChange={(e) => {
                    setScope(e.target.value as PersonalityRule['scope']);
                    setKey(
                      e.target.value === 'league'
                        ? 'laliga'
                        : (state.activeMatches[0]?.home.name ?? ''),
                    );
                  }}
                >
                  <option value="league">Competición</option>
                  <option value="team">Equipo</option>
                </select>
              </label>
              <label>
                Contexto
                <select value={key} onChange={(e) => setKey(e.target.value)}>
                  {scope === 'league'
                    ? state.leagues.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))
                    : [
                        ...new Set(state.activeMatches.flatMap((m) => [m.home.name, m.away.name])),
                      ].map((t) => <option key={t}>{t}</option>)}
                </select>
              </label>
              <label>
                Emoción
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={ruleEmotion}
                  onChange={(e) => setRuleEmotion(Number(e.target.value))}
                />
              </label>
              <label>
                Picante
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={ruleRivalry}
                  onChange={(e) => setRuleRivalry(Number(e.target.value))}
                />
              </label>
              <button>Añadir contexto</button>
            </form>
            {state.profile.specialRules.map((r, i) => (
              <div className="rule-row" key={i}>
                <span>
                  {r.key} · emoción {r.emotionLevel} · picante {r.rivalryLevel}
                </span>
                <button
                  onClick={() =>
                    profile({
                      specialRules: state.profile.specialRules.filter((_, index) => index !== i),
                    })
                  }
                >
                  Eliminar
                </button>
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <div>
        <Panel title="Control del estudio">
          <div className="settings-body">
            {toggles.map(([field, label, description]) => (
              <label className="toggle" key={field}>
                <span>
                  <b>{label}</b>
                  <small>{description}</small>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={state.settings[field] as boolean}
                  onChange={(e) => settings({ [field]: e.target.checked })}
                />
              </label>
            ))}
            {timings.map(([field, label, min, max]) => (
              <label className="slider-label" key={field}>
                <span>
                  {label}
                  <b>{String(state.settings[field])}</b>
                </span>
                <input
                  type="range"
                  min={min}
                  max={max}
                  value={state.settings[field] as number}
                  onChange={(e) => settings({ [field]: Number(e.target.value) })}
                />
              </label>
            ))}
            <label>
              Partido principal
              <select
                aria-label="Partido principal"
                value={state.mainMatchId ?? ''}
                onChange={(e) => void send({ type: 'main', matchId: e.target.value || null })}
              >
                <option value="">Sin fijar · permitir carrusel</option>
                {state.activeMatches.map((m) => (
                  <option key={m.id} value={m.id}>
                    {matchTitle(m)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </Panel>
        <Panel title="Afinidad de la comunidad">
          <div className="settings-body">
            <p className="muted">
              Preferencia editorial configurada por ti; no se deduce de mensajes ni se presenta como
              una encuesta real. SamuIA reconoce el buen juego del rival.
            </p>
            {state.activeMatches.map((m) => (
              <label key={m.id}>
                {matchTitle(m)}
                <select
                  value={state.profile.communityTeams[m.id] ?? ''}
                  onChange={(e) =>
                    profile({
                      communityTeams: {
                        ...state.profile.communityTeams,
                        [m.id]: (e.target.value || null) as 'home' | 'away' | null,
                      },
                    })
                  }
                >
                  <option value="">Neutral</option>
                  <option value="home">{m.home.shortName}</option>
                  <option value="away">{m.away.shortName}</option>
                </select>
              </label>
            ))}
          </div>
        </Panel>
        <Panel title="Tus favoritos">
          <div className="settings-body">
            <label>
              Equipos · separados por coma
              <input
                defaultValue={state.settings.favoriteTeams.join(', ')}
                onBlur={(e) =>
                  settings({
                    favoriteTeams: e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
              />
            </label>
            <div className="favorite-leagues">
              {state.leagues.map((l) => (
                <label key={l.id}>
                  <input
                    type="checkbox"
                    checked={state.settings.favoriteLeagues.includes(l.id)}
                    onChange={(e) =>
                      settings({
                        favoriteLeagues: e.target.checked
                          ? [...state.settings.favoriteLeagues, l.id]
                          : state.settings.favoriteLeagues.filter((id) => id !== l.id),
                      })
                    }
                  />
                  {l.name}
                </label>
              ))}
            </div>
            <p className="muted">La objetividad de los datos y las probabilidades no cambia.</p>
          </div>
        </Panel>
        <p className="session-note">
          Los datos duran durante la sesión. En la demo portátil, recargar restaura el estado
          inicial. Puedes exportar la memoria desde su panel.
        </p>
      </div>
    </div>
  );
}
