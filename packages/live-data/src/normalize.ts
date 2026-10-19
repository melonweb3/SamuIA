import {
  eventTypes,
  normalize,
  type LiveIncident,
  type LiveMatchRecord,
  type Team,
  type TeamStatistics,
} from '../../shared/src/index';
const object = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('Objeto LIVE inválido');
  return v as Record<string, unknown>;
};
const string = (v: unknown, max = 200): string => {
  if (typeof v !== 'string' || !v.trim() || v.length > max) throw new Error('Texto LIVE inválido');
  return v.trim();
};
const number = (v: unknown, max = 100000): number => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > max)
    throw new Error('Número LIVE inválido');
  return v;
};
const array = (v: unknown, max = 1000): unknown[] => {
  if (!Array.isArray(v) || v.length > max) throw new Error('Lista LIVE inválida');
  return v;
};
export function interpretNarration(incident: LiveIncident): LiveIncident {
  const result = { ...incident };
  const text = normalize(incident.text ?? '');
  if (!result.action && /cabeza|header|headed/.test(text)) result.action = 'header';
  if (!result.outcome && /parad[ao]|salva|saved|save by/.test(text)) result.outcome = 'saved';
  if (!result.outcome && /fuera|desviad|missed|wide/.test(text)) result.outcome = 'missed';
  if (!result.player) {
    const actor = incident.text
      ?.match(
        /^(?:\d+[′']?\s*[-:.]?\s*)?([\p{L}][\p{L} .'-]{1,65}?)\s+(?:remata|dispara|cabecea|shoots|heads)\b/u,
      )?.[1]
      ?.trim();
    if (actor) result.player = actor;
  }
  // Only classify untyped narrative; never override a structured goal, card or VAR.
  if (result.kind === 'narration') {
    if (/\bvar\b/.test(text)) result.kind = 'var';
    else if (result.outcome === 'saved') result.kind = 'save';
    else if (/corner|corner kick|saque de esquina/.test(text)) result.kind = 'corner';
    else if (/falta|foul/.test(text)) result.kind = 'foul';
    else if (/ataque peligroso|dangerous attack/.test(text)) result.kind = 'dangerous_attack';
    else if (/remata|dispara|shoots|shot|cabecea/.test(text)) result.kind = 'shot';
  }
  return result;
}
export function parseIncidents(
  value: unknown,
  provider: string,
  receivedAt: number,
): LiveIncident[] {
  return array(value).map((raw) => {
    const v = object(raw);
    if (!eventTypes.includes(v.kind as never)) throw new Error('Tipo de evento LIVE inválido');
    if (v.side !== undefined && v.side !== 'home' && v.side !== 'away')
      throw new Error('Equipo LIVE inválido');
    if (v.channel !== undefined && !['event', 'commentary'].includes(v.channel as string))
      throw new Error('Canal LIVE inválido');
    const id = string(v.id, 128),
      matchId = string(v.matchId, 128);
    const item: LiveIncident = {
      id,
      matchId,
      provider,
      channel: v.channel === 'commentary' ? 'commentary' : 'event',
      kind: v.kind as LiveIncident['kind'],
      minute: number(v.minute, 160),
      timestamp: number(v.timestamp, Number.MAX_SAFE_INTEGER),
      receivedAt,
      sourceIds: [
        `${provider}:${v.channel === 'commentary' ? 'commentary' : 'event'}:${matchId}:${id}`,
      ],
      side: v.side as LiveIncident['side'],
    };
    for (const key of ['player', 'playerOut', 'text', 'correlationId'] as const)
      if (v[key] !== undefined) item[key] = string(v[key], key === 'text' ? 3000 : 200);
    if (v.action !== undefined) {
      if (!['header', 'shot', 'cross'].includes(v.action as string))
        throw new Error('Acción LIVE inválida');
      item.action = v.action as LiveIncident['action'];
    }
    if (v.outcome !== undefined) {
      if (!['saved', 'missed', 'blocked', 'goal', 'post'].includes(v.outcome as string))
        throw new Error('Desenlace LIVE inválido');
      item.outcome = v.outcome as LiveIncident['outcome'];
    }
    if (v.timestampQuality !== undefined) {
      if (!['exact', 'estimated'].includes(v.timestampQuality as string))
        throw new Error('Precisión temporal LIVE inválida');
      item.timestampQuality = v.timestampQuality as LiveIncident['timestampQuality'];
    }
    return interpretNarration(item);
  });
}
export function parseMatches(value: unknown, provider: string, now: number): LiveMatchRecord[] {
  const team = (raw: unknown): Team => {
    const v = object(raw),
      name = string(v.name, 100);
    return {
      id: string(v.id, 128),
      name,
      shortName: v.shortName ? string(v.shortName, 100) : name,
      aliases: [name],
    };
  };
  const statistics = (raw: unknown): Partial<TeamStatistics> => {
    const v = object(raw),
      result: Partial<TeamStatistics> = {};
    for (const key of [
      'possession',
      'shots',
      'shotsOnTarget',
      'xG',
      'yellow',
      'red',
      'corners',
      'fouls',
    ] as const)
      if (v[key] !== undefined && v[key] !== null)
        result[key] = number(v[key], key === 'possession' ? 100 : 10000);
    return result;
  };
  const lineup = (raw: unknown) =>
    array(raw, 60).map((player) => {
      const p = object(player);
      return {
        name: string(p.name, 100),
        ...(p.number == null ? {} : { number: number(p.number, 999) }),
        ...(p.position == null ? {} : { position: string(p.position, 50) }),
      };
    });
  const matches = array(value, 200).map((raw) => {
    const v = object(raw),
      league = object(v.league),
      score = object(v.score),
      stats = object(v.statistics ?? { home: {}, away: {} });
    if (!['upcoming', 'live', 'halftime', 'finished'].includes(v.status as string))
      throw new Error('Estado LIVE inválido');
    const match: LiveMatchRecord = {
      id: string(v.id, 128),
      league: { id: string(league.id, 128), name: string(league.name, 100) },
      home: team(v.home),
      away: team(v.away),
      minute: number(v.minute, 160),
      status: v.status as LiveMatchRecord['status'],
      score: { home: number(score.home, 100), away: number(score.away, 100) },
      statistics: { home: statistics(stats.home ?? {}), away: statistics(stats.away ?? {}) },
      updatedAt: number(v.updatedAt, Number.MAX_SAFE_INTEGER),
      incidents: parseIncidents(v.incidents ?? [], provider, now),
    };
    if (match.home.id === match.away.id || match.incidents.some((i) => i.matchId !== match.id))
      throw new Error('Identidad de partido LIVE inválida');
    if (v.lineups != null) {
      const l = object(v.lineups);
      match.lineups = { home: lineup(l.home), away: lineup(l.away) };
    }
    return match;
  });
  if (new Set(matches.map((m) => m.id)).size !== matches.length)
    throw new Error('Partidos LIVE duplicados');
  return matches;
}
