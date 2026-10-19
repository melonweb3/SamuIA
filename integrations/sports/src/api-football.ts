import type { MatchDataProvider } from '../../../packages/live-data/src/contracts';
import { fetchJson } from '../../../packages/live-data/src/http';
import { parseMatches } from '../../../packages/live-data/src/normalize';
import type { LiveMatchRecord } from '../../../packages/shared/src/index';
// The API-specific shape ends here. No provider field names reach the commentary engine.
type Row = Record<string, unknown>;
const row = (value: unknown): Row => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Respuesta API-Football inválida');
  return value as Row;
};
const list = (value: unknown): unknown[] => {
  if (!Array.isArray(value)) throw new Error('Lista API-Football inválida');
  return value;
};
const numeric = (value: unknown) =>
  value == null ? undefined : Number(String(value).replace('%', ''));
export class ApiFootballMatchDataProvider implements MatchDataProvider {
  readonly name = 'API-Football v3';
  private tracked = new Set<string>();
  private cache = new Map<string, { at: number; value: unknown[] }>();
  constructor(
    private key: string,
    private fixtureIds: string[] = [],
    private base = 'https://v3.football.api-sports.io',
  ) {}
  private async request(path: string, signal: AbortSignal): Promise<unknown[]> {
    const payload = row(
      await fetchJson(`${this.base}${path}`, { 'x-apisports-key': this.key }, signal),
    );
    if (
      payload.errors &&
      (Array.isArray(payload.errors)
        ? payload.errors.length
        : Object.keys(row(payload.errors)).length)
    )
      throw new Error('API-Football rechazó la solicitud');
    return list(payload.response);
  }
  private async optional(path: string, ttl: number, signal: AbortSignal) {
    const cached = this.cache.get(path);
    if (cached && Date.now() - cached.at < ttl) return cached.value;
    try {
      const value = await this.request(path, signal);
      this.cache.set(path, { at: Date.now(), value });
      while (this.cache.size > 100) this.cache.delete(this.cache.keys().next().value!);
      return value;
    } catch {
      if (signal.aborted) throw new Error('Solicitud cancelada');
      return []; // Missing statistics/lineups are explicitly unavailable, never fabricated.
    }
  }
  async getMatches(signal: AbortSignal): Promise<LiveMatchRecord[]> {
    let fixtures = await this.request(
      this.fixtureIds.length ? `/fixtures?ids=${this.fixtureIds.join('-')}` : '/fixtures?live=all',
      signal,
    );
    if (!this.fixtureIds.length) {
      const current = new Set(fixtures.map((f) => String(row(row(f).fixture).id)));
      const missing = [...this.tracked].filter((id) => !current.has(id));
      if (missing.length)
        fixtures = [
          ...fixtures,
          ...(await this.request(`/fixtures?ids=${missing.join('-')}`, signal)),
        ];
    }
    const result: unknown[] = [];
    for (const value of fixtures.slice(0, 20)) {
      const f = row(value),
        fixture = row(f.fixture),
        status = row(fixture.status),
        teams = row(f.teams),
        home = row(teams.home),
        away = row(teams.away),
        league = row(f.league),
        goals = row(f.goals);
      const id = String(fixture.id),
        now = Date.now();
      if (!/^\d+$/.test(id)) throw new Error('ID API-Football inválido');
      const statusMap: Record<string, LiveMatchRecord['status']> = {
        NS: 'upcoming',
        TBD: 'upcoming',
        '1H': 'live',
        '2H': 'live',
        ET: 'live',
        BT: 'live',
        P: 'live',
        LIVE: 'live',
        HT: 'halftime',
        FT: 'finished',
        AET: 'finished',
        PEN: 'finished',
      };
      const normalizedStatus = statusMap[String(status.short)];
      if (!normalizedStatus) continue; // Abandoned/postponed fixtures are not announced as finished.
      if (normalizedStatus !== 'finished') this.tracked.add(id);
      else this.tracked.delete(id);
      while (this.tracked.size > 20) this.tracked.delete(this.tracked.values().next().value!);
      const [events, stats, lineups] = await Promise.all([
        this.request(`/fixtures/events?fixture=${id}`, signal),
        this.optional(`/fixtures/statistics?fixture=${id}`, 30000, signal),
        this.optional(`/fixtures/lineups?fixture=${id}`, 120000, signal),
      ]);
      const occurrences = new Map<string, number>();
      const incidents = events.flatMap((value) => {
        const e = row(value),
          time = row(e.time),
          player = row(e.player),
          assist = row(e.assist),
          team = row(e.team);
        const side =
          String(team.id) === String(home.id)
            ? 'home'
            : String(team.id) === String(away.id)
              ? 'away'
              : undefined;
        const kind =
          e.type === 'Goal' && e.detail !== 'Missed Penalty'
            ? 'goal'
            : e.type === 'Goal'
              ? 'missed_chance'
              : e.type === 'Card'
                ? /Red|Second Yellow/.test(String(e.detail))
                  ? 'red'
                  : 'yellow'
                : e.type === 'subst'
                  ? 'substitution'
                  : e.type === 'Var'
                    ? 'var'
                    : null;
        if (!kind || !side) return [];
        const minute = Number(time.elapsed ?? 0) + Number(time.extra ?? 0);
        const fingerprint = [kind, minute, team.id, player.id, assist.id, e.detail].join(':');
        const n = occurrences.get(fingerprint) ?? 0;
        occurrences.set(fingerprint, n + 1);
        // Event occurrence time is estimated: API-Football events expose minutes, not epoch timestamps.
        const timestamp = Math.min(
          now,
          Number(fixture.timestamp) * 1000 + minute * 60000 + (minute > 45 ? 15 * 60000 : 0),
        );
        return [
          {
            id: `${fingerprint}:${n}`,
            matchId: id,
            kind,
            minute,
            timestamp,
            timestampQuality: 'estimated',
            side,
            ...(e.type === 'subst' && assist.name
              ? { player: assist.name }
              : player.name
                ? { player: player.name }
                : {}),
            ...(e.type === 'subst' && player.name ? { playerOut: player.name } : {}),
            ...(e.comments ? { text: String(e.comments) } : {}),
          },
        ];
      });
      const statistics: Record<string, Record<string, number>> = { home: {}, away: {} };
      const names: Record<string, string> = {
        'Ball Possession': 'possession',
        'Total Shots': 'shots',
        'Shots on Goal': 'shotsOnTarget',
        Fouls: 'fouls',
        'Corner Kicks': 'corners',
        'Yellow Cards': 'yellow',
        'Red Cards': 'red',
        expected_goals: 'xG',
      };
      for (const value of stats) {
        const s = row(value),
          team = row(s.team),
          side =
            String(team.id) === String(home.id)
              ? 'home'
              : String(team.id) === String(away.id)
                ? 'away'
                : null;
        if (!side) continue;
        for (const value of list(s.statistics)) {
          const stat = row(value),
            key = names[String(stat.type)],
            n = numeric(stat.value);
          if (key && n !== undefined) statistics[side][key] = n;
        }
      }
      const normalizedLineups: Record<string, unknown[]> = { home: [], away: [] };
      for (const value of lineups) {
        const l = row(value),
          side =
            String(row(l.team).id) === String(home.id)
              ? 'home'
              : String(row(l.team).id) === String(away.id)
                ? 'away'
                : null;
        if (side)
          normalizedLineups[side] = [...list(l.startXI ?? []), ...list(l.substitutes ?? [])].map(
            (value) => {
              const p = row(row(value).player);
              return { name: p.name, number: p.number, position: p.pos };
            },
          );
      }
      result.push({
        id,
        league: { id: `api-football:${league.id}`, name: league.name },
        home: { id: String(home.id), name: home.name },
        away: { id: String(away.id), name: away.name },
        minute: Number(status.elapsed ?? 0),
        status: normalizedStatus,
        score: { home: goals.home ?? 0, away: goals.away ?? 0 },
        statistics,
        updatedAt: now,
        incidents,
        ...(lineups.length ? { lineups: normalizedLineups } : {}),
      });
    }
    return parseMatches(result, this.name, Date.now());
  }
}
