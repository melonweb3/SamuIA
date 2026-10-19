import {
  eventTypes,
  id,
  normalize,
  type League,
  type MatchState,
  type MatchEvent,
  type MatchSubscription,
  type Side,
  type Team,
  type EventType,
  type StudioSettings,
} from '../../shared/src/index';
export const defaultLeagues: League[] = [
  ['laliga', 'LaLiga'],
  ['segunda', 'Segunda División'],
  ['premier', 'Premier League'],
  ['champions', 'Champions League'],
  ['europa', 'Europa League'],
  ['conference', 'Conference League'],
  ['serie-a', 'Serie A'],
  ['bundesliga', 'Bundesliga'],
  ['ligue-1', 'Ligue 1'],
  ['copa', 'Copa del Rey'],
  ['selecciones', 'Selecciones'],
  ['mundial', 'Mundial'],
  ['eurocopa', 'Eurocopa'],
].map(([id, name]) => ({ id, name, enabled: true, importance: id === 'champions' ? 10 : 5 }));
const team = (name: string, shortName = name, aliases: string[] = []): Team => ({
  id: normalize(name).replace(/\W+/g, '-'),
  name,
  shortName,
  aliases: [name, shortName, ...aliases],
});
export function createMatch(leagueId: string, home: Team, away: Team, matchId = id()): MatchState {
  const stats = () => ({
    possession: 50,
    shots: 0,
    shotsOnTarget: 0,
    xG: 0,
    yellow: 0,
    red: 0,
    corners: 0,
  });
  return {
    id: matchId,
    leagueId,
    home,
    away,
    score: { home: 0, away: 0 },
    minute: 0,
    status: 'live',
    statistics: { home: stats(), away: stats() },
    events: [],
    probabilities: { home: 0, draw: 0, away: 0 },
    excitementScore: 0,
    subscription: {
      tracking: true,
      priority: 'MEDIA',
      reactions: {
        paused: false,
        events: Object.fromEntries(
          eventTypes.map((t) => [t, t !== 'yellow' && t !== 'substitution']),
        ) as Record<EventType, boolean>,
      },
    },
    lastReaction: null,
    contextType: 'regular',
  };
}
export function initialMatches() {
  const result = [
    createMatch(
      'laliga',
      team('Celta de Vigo', 'Celta'),
      team('Real Madrid', 'Madrid'),
      'celta-madrid',
    ),
    createMatch(
      'laliga',
      team('Barcelona', 'Barça', ['barca']),
      team('Atlético de Madrid', 'Atlético', ['atleti']),
      'barcelona-atletico',
    ),
    createMatch('premier', team('Liverpool'), team('Arsenal'), 'liverpool-arsenal'),
    createMatch(
      'champions',
      team('Paris Saint-Germain', 'PSG', ['paris']),
      team('Bayern de Múnich', 'Bayern'),
      'psg-bayern',
    ),
  ];
  result[0].subscription.priority = 'ALTA';
  result[2].subscription.priority = 'BAJA';
  return result;
}
export function calculateProbabilities(m: MatchState): MatchState['probabilities'] {
  if (m.status === 'finished')
    return {
      home: Number(m.score.home > m.score.away) * 100,
      draw: Number(m.score.home === m.score.away) * 100,
      away: Number(m.score.home < m.score.away) * 100,
    };
  const remaining = Math.max(0.01, (95 - m.minute) / 95);
  const poisson = (lambda: number) => {
    const p = [Math.exp(-lambda)];
    for (let i = 1; i < 30; i++) p.push((p[i - 1] * lambda) / i);
    return p;
  };
  const h = poisson(
    1.45 * remaining * Math.exp((m.statistics.away.red - m.statistics.home.red) * 0.45),
  );
  const a = poisson(
    1.15 * remaining * Math.exp((m.statistics.home.red - m.statistics.away.red) * 0.45),
  );
  let home = 0,
    draw = 0,
    away = 0;
  h.forEach((ph, i) =>
    a.forEach((pa, j) => {
      const d = m.score.home + i - m.score.away - j;
      if (d > 0) home += ph * pa;
      else if (d === 0) draw += ph * pa;
      else away += ph * pa;
    }),
  );
  const total = home + draw + away;
  home = Math.round((home / total) * 1000) / 10;
  draw = Math.round((draw / total) * 1000) / 10;
  return { home, draw, away: Math.round((100 - home - draw) * 10) / 10 };
}
const heatWeights: Record<EventType, number> = {
  goal: 20,
  chance: 8,
  missed_chance: 8,
  red: 15,
  penalty: 20,
  var: 12,
  yellow: 2,
  substitution: 1,
  halftime: 0,
  fulltime: 0,
};
export function excitementScore(m: MatchState, importance = 5, now = Date.now()) {
  if (m.status === 'upcoming' || m.status === 'finished') return 0;
  const difference = Math.abs(m.score.home - m.score.away);
  const goals = m.score.home + m.score.away;
  const lastGoal = [...m.events].reverse().find((e) => e.type === 'goal');
  const comeback =
    lastGoal &&
    difference <= 1 &&
    m.score[lastGoal.side] <= m.score[lastGoal.side === 'home' ? 'away' : 'home'];
  return Math.min(
    100,
    Math.round(
      (difference === 0 ? 22 : difference === 1 ? 16 : 2) +
        (difference <= 1 ? m.minute / 5 : 0) +
        Math.min(10, goals * 2) +
        Math.min(12, (m.statistics.home.shotsOnTarget + m.statistics.away.shotsOnTarget) * 1.5) +
        Math.min(10, (m.statistics.home.xG + m.statistics.away.xG) * 3) +
        Math.min(
          35,
          m.events
            .filter((e) => now - e.timestamp < 120000)
            .reduce((n, e) => n + heatWeights[e.type], 0),
        ) +
        (comeback ? 5 : 0) +
        importance / 2 +
        { ALTA: 6, MEDIA: 3, BAJA: 0 }[m.subscription.priority],
    ),
  );
}
export class MatchManager {
  activeMatches: MatchState[];
  leagues: League[];
  mainMatchId: string | null;
  currentMatchId: string | null;
  nextSuggestedMatch: string | null = null;
  lastVisitedMatch: Record<string, number> = {};
  constructor(matches = initialMatches(), leagues = structuredClone(defaultLeagues)) {
    this.activeMatches = matches;
    this.leagues = leagues;
    this.mainMatchId = this.currentMatchId = matches[0]?.id ?? null;
    this.refresh();
  }
  get(matchId: string) {
    const m = this.activeMatches.find((m) => m.id === matchId);
    if (!m) throw new Error('Partido no encontrado');
    return m;
  }
  followed() {
    return this.activeMatches.filter(
      (m) =>
        m.subscription.tracking &&
        this.leagues.some((l) => l.id === m.leagueId && l.enabled) &&
        ['live', 'halftime'].includes(m.status),
    );
  }
  add(
    leagueId: string,
    home: string,
    away: string,
    status: MatchState['status'] = 'live',
    contextType: MatchState['contextType'] = 'regular',
  ) {
    if (!this.leagues.some((l) => l.id === leagueId)) throw new Error('Competición no encontrada');
    if (normalize(home) === normalize(away)) throw new Error('Los equipos deben ser distintos');
    const make = (s: string) => team(s, s, /juventus/i.test(s) ? ['juve'] : []);
    const m = createMatch(leagueId, make(home), make(away));
    m.status = status;
    m.contextType = contextType;
    this.activeMatches.push(m);
    this.refresh();
    return m;
  }
  remove(matchId: string) {
    this.get(matchId);
    this.activeMatches = this.activeMatches.filter((m) => m.id !== matchId);
    delete this.lastVisitedMatch[matchId];
    if (this.mainMatchId === matchId) this.mainMatchId = null;
    if (this.currentMatchId === matchId)
      this.currentMatchId = this.mainMatchId ?? this.activeMatches[0]?.id ?? null;
    this.nextSuggestedMatch = null;
  }
  focus(matchId: string, now = Date.now()) {
    this.get(matchId);
    this.currentMatchId = matchId;
    this.lastVisitedMatch[matchId] = now;
  }
  setMain(matchId: string | null, now = Date.now()) {
    if (matchId) this.focus(matchId, now);
    this.mainMatchId = matchId;
  }
  subscribe(matchId: string, patch: Partial<MatchSubscription>) {
    const m = this.get(matchId);
    m.subscription = {
      ...m.subscription,
      ...patch,
      reactions: patch.reactions
        ? {
            ...patch.reactions,
            events: { ...m.subscription.reactions.events, ...patch.reactions.events },
          }
        : m.subscription.reactions,
    };
    this.refresh();
  }
  receiveEvent(matchId: string, type: EventType, side: Side, now = Date.now()): MatchEvent {
    const m = this.get(matchId);
    if (
      !['live', 'halftime'].includes(m.status) ||
      (m.status === 'halftime' && type !== 'fulltime')
    )
      throw new Error('Inicia o reanuda el partido antes de simular eventos');
    const s = m.statistics[side];
    if (type === 'red' && s.red >= 4)
      throw new Error('Máximo de cuatro expulsiones en esta simulación');
    if (type === 'goal') {
      m.score[side]++;
      s.shots++;
      s.shotsOnTarget++;
      s.xG += 0.3;
    }
    if (type === 'chance') {
      s.shots++;
      s.shotsOnTarget++;
      s.xG += 0.22;
      s.corners++;
    }
    if (type === 'missed_chance') {
      s.shots++;
      s.xG += 0.22;
    }
    if (type === 'yellow') s.yellow++;
    if (type === 'red') s.red++;
    if (type === 'penalty') s.xG += 0.76;
    if (type === 'halftime') {
      m.status = 'halftime';
      m.minute = Math.max(45, m.minute);
    }
    if (type === 'fulltime') {
      m.status = 'finished';
      m.minute = Math.max(90, m.minute);
    }
    const shots = m.statistics.home.shots + m.statistics.away.shots;
    m.statistics.home.possession = Math.round(
      50 + (shots ? ((m.statistics.home.shots - m.statistics.away.shots) / shots) * 12 : 0),
    );
    m.statistics.away.possession = 100 - m.statistics.home.possession;
    const e = { id: id(), matchId, type, side, minute: m.minute, timestamp: now };
    m.events.push(e);
    m.events = m.events.slice(-300);
    this.refresh(now);
    return e;
  }
  refresh(now = Date.now()) {
    for (const m of this.activeMatches) {
      m.probabilities = calculateProbabilities(m);
      m.excitementScore = excitementScore(
        m,
        this.leagues.find((l) => l.id === m.leagueId)?.importance,
        now,
      );
    }
  }
  radar() {
    return this.followed().sort((a, b) => b.excitementScore - a.excitementScore);
  }
  suggest(settings: StudioSettings, now: number) {
    const rank = (m: MatchState) =>
      m.excitementScore +
      (settings.reactToFavorites &&
      settings.favoriteTeams.some((t) => [m.home.name, m.away.name].includes(t))
        ? 6
        : 0) +
      Math.min(8, (now - (this.lastVisitedMatch[m.id] ?? now - 60000)) / 15000);
    const candidates = this.followed()
      .filter((m) => m.status === 'live')
      .sort((a, b) => rank(b) - rank(a));
    const next = candidates[0];
    this.nextSuggestedMatch = next?.id ?? null;
    if (!next || this.mainMatchId || !settings.carouselEnabled || next.id === this.currentMatchId)
      return;
    const current = candidates.find((m) => m.id === this.currentMatchId);
    const last = this.currentMatchId ? (this.lastVisitedMatch[this.currentMatchId] ?? 0) : 0;
    if (
      now - last >= settings.carouselCooldown * 1000 &&
      (next.excitementScore >= 50 || next.events.some((e) => now - e.timestamp < 60000)) &&
      (!current || rank(next) > rank(current) + 3)
    )
      this.focus(next.id, now);
  }
}
