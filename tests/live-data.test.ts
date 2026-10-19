import { describe, expect, it, vi } from 'vitest';
import {
  LiveDataSession,
  AppCommunityCommentProvider,
  parseIncidents,
  parseMatches,
  type MatchDataProvider,
  type LiveCommentaryProvider,
} from '../packages/live-data/src/index';
import { ProviderHttpError, HttpMatchDataProvider } from '../packages/live-data/src/http';
import { createConfiguredLiveSession } from '../apps/server/src/live-config';
import { ApiFootballMatchDataProvider } from '../integrations/sports/src/api-football';
import type { LiveIncident, LiveMatchRecord } from '../packages/shared/src/index';

const at = 1000000;
function match(id = 'm1'): LiveMatchRecord {
  return parseMatches(
    [
      {
        id,
        league: { id: 'liga', name: 'Liga de prueba' },
        home: { id: 'a', name: 'Celta' },
        away: { id: 'b', name: 'Dépor' },
        minute: 66,
        status: 'live',
        score: { home: 0, away: 0 },
        statistics: { home: { possession: 61, shotsOnTarget: 4 }, away: {} },
        updatedAt: at,
        incidents: [],
      },
    ],
    'test',
    at,
  )[0];
}
function incident(id: string, values: Partial<LiveIncident> = {}): LiveIncident {
  return {
    id,
    matchId: 'm1',
    provider: 'test',
    channel: 'event',
    kind: 'goal',
    minute: 67,
    timestamp: at + 1000,
    receivedAt: at + 1000,
    side: 'home',
    player: 'Borja Iglesias',
    sourceIds: [`test:${id}`],
    ...values,
  };
}
function setup(commentary?: LiveCommentaryProvider) {
  let records = [match()];
  const provider: MatchDataProvider = { name: 'test', getMatches: vi.fn(async () => records) };
  const session = new LiveDataSession(provider, commentary, { pollMs: 1000, mergeMs: 0 }, at);
  session.director.profile.commentaryFrequency = 0;
  session.director.settings.reactionCooldown = 0;
  session.resume(at);
  return {
    session,
    provider,
    set: (value: LiveMatchRecord[]) => {
      records = value;
    },
  };
}

describe('normalización independiente de API', () => {
  it('valida datos y distingue estadísticas ausentes, cero y posesión real', () => {
    const record = match();
    expect(record.statistics.home.possession).toBe(61);
    expect(record.statistics.away).not.toHaveProperty('xG');
    expect(() => parseMatches([{ ...record, score: { home: -1, away: 0 } }], 'test', at)).toThrow();
    expect(() => parseMatches([{ ...record, minute: NaN }], 'test', at)).toThrow();
    expect(() => parseMatches([record, record], 'test', at)).toThrow();
    expect(() =>
      parseIncidents(
        [{ id: 'x', matchId: 'm1', kind: 'goal', minute: 67, timestamp: Infinity }],
        'test',
        at,
      ),
    ).toThrow();
  });
  it('interpreta hechos del texto sin reproducirlo como guion', async () => {
    const text = "67' Borja Iglesias remata de cabeza, parada del portero";
    const normalized = parseIncidents(
      [
        {
          id: 'n1',
          matchId: 'm1',
          kind: 'narration',
          channel: 'commentary',
          side: 'home',
          minute: 67,
          timestamp: at + 1000,
          text,
        },
      ],
      'narrator',
      at + 1000,
    )[0];
    expect(normalized).toMatchObject({
      kind: 'save',
      player: 'Borja Iglesias',
      action: 'header',
      outcome: 'saved',
    });
    const { session, set } = setup();
    await session.poll(at);
    set([{ ...match(), minute: 67, updatedAt: at + 1000, incidents: [normalized] }]);
    await session.poll(at + 1000);
    session.tick(at + 1001);
    const result = session.snapshot(at + 1001);
    expect(result.decision.say).toContain('Borja Iglesias');
    expect(result.decision.say).toContain('de cabeza');
    expect(result.decision.say).toContain('portero');
    expect(result.decision.say).not.toContain(text);
    expect(result.animation.requestedAnimation).toBe('shock');
    expect(result.voice.status).toBe('playing');
  });
});

describe('LIVE: snapshots, dedupe, memoria y reconexión', () => {
  it('inicializa sin retransmitir historia y aplica marcador/estadísticas sin incrementos simulados', async () => {
    const { session, set } = setup();
    set([{ ...match(), incidents: [incident('old', { timestamp: at - 10000 })] }]);
    await session.poll(at);
    session.tick(at);
    expect(session.director.history).toHaveLength(0);
    set([
      {
        ...match(),
        minute: 67,
        updatedAt: at + 1000,
        score: { home: 1, away: 0 },
        incidents: [incident('old'), incident('new')],
      },
    ]);
    await session.poll(at + 1000);
    session.tick(at + 1001);
    expect(session.director.manager.get('m1').score).toEqual({ home: 1, away: 0 });
    expect(session.director.manager.get('m1').statistics.home.shotsOnTarget).toBe(4);
    await session.poll(at + 2000);
    session.tick(at + 2001);
    expect(session.director.history).toHaveLength(1);
    expect(session.director.manager.get('m1').events).toHaveLength(2);
  });
  it('fusiona evento + narración y rechaza duplicados entre reconexiones', async () => {
    let narrations: LiveIncident[] = [];
    const { session, set } = setup({ name: 'text', getCommentary: async () => narrations });
    await session.poll(at);
    const shot = incident('s1', { kind: 'shot' });
    narrations = [
      incident('n1', {
        channel: 'commentary',
        provider: 'text',
        kind: 'save',
        text: 'Borja Iglesias remata de cabeza, parada del portero',
        action: 'header',
        outcome: 'saved',
        sourceIds: ['text:n1'],
      }),
    ];
    set([{ ...match(), updatedAt: at + 1000, incidents: [shot] }]);
    await session.poll(at + 1000);
    session.tick(at + 1001);
    expect(session.director.history).toHaveLength(1);
    expect(session.director.history[0].sourceIds).toEqual(['test:s1', 'text:n1']);
    expect(session.director.history[0].decision.say).toContain('portero');
    session.pause(at + 1100);
    session.resume(at + 2000);
    await session.poll(at + 2000);
    session.tick(at + 2001);
    expect(session.director.history).toHaveLength(1);
    expect(session.director.manager.get('m1').events).toHaveLength(1);
    expect(session.diagnostics.duplicates).toBeGreaterThan(1);
  });
  it('no fusiona dos jugadas distintas del mismo canal ni dos partidos', async () => {
    const { session, set } = setup();
    set([match('m1'), match('m2')]);
    await session.poll(at);
    set([
      {
        ...match('m1'),
        updatedAt: at + 1000,
        incidents: [incident('a', { kind: 'shot' }), incident('b', { kind: 'shot' })],
      },
      { ...match('m2'), updatedAt: at + 1000, incidents: [incident('a', { matchId: 'm2' })] },
    ]);
    await session.poll(at + 1000);
    session.tick(at + 1001);
    expect(session.director.manager.get('m1').events).toHaveLength(2);
    expect(session.director.manager.get('m2').events).toHaveLength(1);
    expect(session.director.context.get('m1').personalityMemory.memorableMoments).toHaveLength(2);
    expect(session.director.context.get('m2').personalityMemory.memorableMoments).toHaveLength(1);
  });
  it('resuelve predicciones publicadas por el motor con goles LIVE y contexto independiente', async () => {
    const { session, set } = setup();
    const records = ['m1', 'm2'].map((id) => ({
      ...match(id),
      minute: 60,
      statistics: { home: { xG: 2 }, away: { xG: 0.5 } },
      incidents: [
        incident(`${id}-chance1`, {
          matchId: id,
          kind: 'chance',
          minute: 58,
          timestamp: at - 2000,
        }),
        incident(`${id}-chance2`, {
          matchId: id,
          kind: 'chance',
          minute: 59,
          timestamp: at - 1000,
        }),
      ],
    }));
    set(records);
    await session.poll(at);
    for (const [index, record] of records.entries()) {
      const now = at + index * 3;
      session.director.command({ type: 'comment', kind: 'prediction', matchId: record.id }, now);
      session.director.voiceEnded(session.director.snapshot(now).animation.speech!.id, now + 1);
      session.director.tick(now + 2);
    }
    set(
      records.map((record, index) => ({
        ...record,
        minute: 67,
        updatedAt: at + 1000,
        score: index ? { home: 0, away: 1 } : { home: 1, away: 0 },
        incidents: [
          ...record.incidents,
          incident(`${record.id}-goal`, { matchId: record.id, side: index ? 'away' : 'home' }),
        ],
      })),
    );
    await session.poll(at + 1000);
    session.tick(at + 1001);
    expect(session.director.context.get('m1').personalityMemory.successfulPredictions).toHaveLength(
      1,
    );
    expect(session.director.context.get('m2').personalityMemory.failedPredictions).toHaveLength(1);
    expect(session.director.context.get('m1').personalityMemory.failedPredictions).toHaveLength(0);
    expect(session.director.context.get('m2').personalityMemory.successfulPredictions).toHaveLength(
      0,
    );
  });
  it('observa un gol en el límite de una predicción antes de esperar la fusión textual', async () => {
    let record = {
      ...match(),
      minute: 60,
      statistics: { home: { xG: 2 }, away: { xG: 0.5 } },
      incidents: [
        incident('c1', { kind: 'chance', minute: 58, timestamp: at - 2000 }),
        incident('c2', { kind: 'chance', minute: 59, timestamp: at - 1000 }),
      ],
    };
    const session = new LiveDataSession(
      { name: 'test', getMatches: async () => [record] },
      null,
      { pollMs: 1000, mergeMs: 1500 },
      at,
    );
    session.director.profile.commentaryFrequency = 0;
    session.resume(at);
    await session.poll(at);
    session.director.command({ type: 'comment', kind: 'prediction', matchId: 'm1' }, at);
    const prediction = session.director.context.get('m1').personalityMemory.predictions[0];
    record = {
      ...record,
      minute: prediction.expiresMinute,
      updatedAt: at + 1000,
      incidents: [
        ...record.incidents,
        incident('boundary-goal', { minute: prediction.expiresMinute }),
      ],
    };
    await session.poll(at + 1000);
    session.tick(at + 1001);
    expect(prediction.status).toBe('success');
    expect(session.director.manager.get('m1').events.filter((e) => e.type === 'goal')).toHaveLength(
      1,
    );
    session.tick(at + 2501);
    expect(session.director.manager.get('m1').events.filter((e) => e.type === 'goal')).toHaveLength(
      1,
    );
    session.pause(at + 2502);
  });
  it('no fusiona gol y VAR aunque compartan identificador de jugada', async () => {
    const { session, set } = setup({
      name: 'text',
      getCommentary: async () => [
        incident('var', {
          kind: 'var',
          side: undefined,
          channel: 'commentary',
          correlationId: 'play',
        }),
      ],
    });
    await session.poll(at);
    set([
      {
        ...match(),
        updatedAt: at + 1000,
        incidents: [incident('goal', { correlationId: 'play' })],
      },
    ]);
    await session.poll(at + 1000);
    session.tick(at + 1001);
    expect(session.director.manager.get('m1').events.map((e) => e.type)).toEqual(['var', 'goal']);
    expect(
      session.director.context
        .get('m1')
        .personalityMemory.memorableMoments.find((m) => m.content.startsWith('var'))?.relatedTeam,
    ).toBeNull();
  });
  it('mantiene eventos como fallback si falla la narración; reintenta sin perder el contexto', async () => {
    const narration: LiveCommentaryProvider = {
      name: 'text',
      getCommentary: vi.fn(async () => {
        throw new Error('secret must not leak');
      }),
    };
    const { session, set } = setup(narration);
    await session.poll(at);
    set([{ ...match(), updatedAt: at + 1000, incidents: [incident('goal')] }]);
    await session.poll(at + 1000);
    session.tick(at + 1001);
    expect(session.director.history).toHaveLength(1);
    expect(session.diagnostics.commentary).toBe('reconnecting');
    expect(JSON.stringify(session.snapshot())).not.toContain('secret must not leak');
    expect(session.diagnostics.status).toBe('connected');
  });
  it('reconecta con backoff/Retry-After, conserva caché y no inventa minutos', async () => {
    const { session, provider } = setup();
    await session.poll(at);
    vi.mocked(provider.getMatches).mockRejectedValueOnce(new ProviderHttpError(429, 10000));
    await session.poll(at + 1000);
    expect(session.diagnostics.nextRetryAt).toBe(at + 11000);
    expect(session.diagnostics.status).toBe('reconnecting');
    expect(session.director.dataFresh).toBe(false);
    session.tick(at + 5000);
    expect(session.director.manager.get('m1').minute).toBe(66);
    expect(provider.getMatches).toHaveBeenCalledTimes(2);
    await session.poll(at + 11000);
    expect(session.diagnostics.status).toBe('connected');
    session.pause(at + 12000);
  });
  it('aborta timeouts aunque un adaptador ignore la señal, y descarta respuestas tras cambiar de modo', async () => {
    vi.useFakeTimers();
    try {
      let resolve!: (matches: LiveMatchRecord[]) => void;
      const provider: MatchDataProvider = {
        name: 'slow',
        getMatches: () =>
          new Promise((r) => {
            resolve = r;
          }),
      };
      const session = new LiveDataSession(provider, null, { timeoutMs: 20 }, at);
      session.resume(at);
      const task = session.poll(at);
      await vi.advanceTimersByTimeAsync(21);
      await task;
      expect(session.diagnostics.status).toBe('reconnecting');
      expect(session.diagnostics.logs[0].code).toBe('match-timeout');
      session.pause(at + 1000);
      resolve([match()]);
      await Promise.resolve();
      expect(session.director.manager.activeMatches).toHaveLength(0);
      session.resume(at + 2000);
      const pending = session.poll(at + 2000);
      session.pause(at + 2001);
      resolve([match()]);
      await pending;
      expect(session.director.manager.activeMatches).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
  it('anuncia eventos nuevos con timestamp estimado y genera descanso, reanudación y final desde el estado', async () => {
    const { session, set } = setup();
    await session.poll(at);
    set([
      {
        ...match(),
        updatedAt: at + 1000,
        incidents: [
          incident('late-clock', { timestamp: at - 500000, timestampQuality: 'estimated' }),
        ],
      },
    ]);
    await session.poll(at + 1000);
    session.tick(at + 1001);
    expect(session.director.history).toHaveLength(1);
    expect(session.director.manager.get('m1').events[0].timestamp).toBe(at + 1000);
    for (const [index, status] of (['halftime', 'live', 'finished'] as const).entries()) {
      set([{ ...match(), updatedAt: at + 2000 + index * 1000, status }]);
      await session.poll(at + 2000 + index * 1000);
      session.tick(at + 2001 + index * 1000);
    }
    expect(session.director.manager.get('m1').events.map((e) => e.type)).toEqual([
      'goal',
      'halftime',
      'second_half',
      'fulltime',
    ]);
  });
  it('rechaza snapshots atrasados y acepta correcciones del marcador sin sumar otro gol', async () => {
    const { session, set } = setup();
    await session.poll(at);
    set([{ ...match(), updatedAt: at - 1, score: { home: 9, away: 0 } }]);
    await session.poll(at + 1000);
    expect(session.director.manager.get('m1').score.home).toBe(0);
    set([{ ...match(), updatedAt: at + 2000, score: { home: 1, away: 0 } }]);
    await session.poll(at + 2000);
    set([
      {
        ...match(),
        updatedAt: at + 3000,
        score: { home: 0, away: 0 },
        incidents: [incident('var', { kind: 'var', timestamp: at + 3000 })],
      },
    ]);
    await session.poll(at + 3000);
    session.tick(at + 3001);
    expect(session.director.manager.get('m1').score.home).toBe(0);
    expect(session.director.history[0].decision.avatar?.animation).toBe('var');
  });
});

describe('configuración y proveedores', () => {
  it('procesa comentarios propios con ID, timestamp y partido independiente', () => {
    const provider = new AppCommunityCommentProvider();
    const input = {
      id: 'c',
      username: ' Ana ',
      message: ' ¿Qué opinas? ',
      matchId: 'm1',
      timestamp: at,
    };
    expect(provider.process(input, at)?.username).toBe('Ana');
    expect(provider.process(input, at + 1)).toBeNull();
    expect(provider.process({ ...input, matchId: 'm2' }, at + 2)).not.toBeNull();
  });
  it('no necesita claves y no expone configuración inválida ni valores privados', () => {
    const unconfigured = createConfiguredLiveSession({});
    expect(unconfigured.diagnostics.status).toBe('unconfigured');
    const invalid = createConfiguredLiveSession({
      FOOTBALL_PROVIDER: 'http-json',
      FOOTBALL_MATCHES_URL: 'file:///etc/passwd',
      FOOTBALL_API_KEY: 'private-value',
    });
    expect(invalid.diagnostics.status).toBe('unconfigured');
    expect(JSON.stringify(invalid.snapshot())).not.toContain('private-value');
  });
  it('lee JSON normalizado vía HTTP y rechaza errores del proveedor', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    try {
      fetch.mockResolvedValueOnce(new Response(JSON.stringify([match()])));
      const provider = new HttpMatchDataProvider('https://example.test/matches');
      expect(await provider.getMatches(new AbortController().signal)).toHaveLength(1);
      fetch.mockResolvedValueOnce(
        new Response('', { status: 429, headers: { 'retry-after': '2' } }),
      );
      await expect(provider.getMatches(new AbortController().signal)).rejects.toMatchObject({
        status: 429,
        retryAfterMs: 2000,
      });
    } finally {
      fetch.mockRestore();
    }
  });
  it('normaliza API-Football, eventos estables, estadísticas, alineación y final fuera del listado LIVE', async () => {
    const fixture = (short = '2H', home = 1) => ({
      fixture: {
        id: 123,
        timestamp: Math.floor(Date.now() / 1000) - 4800,
        status: { short, elapsed: 67 },
      },
      league: { id: 140, name: 'La Liga' },
      teams: { home: { id: 1, name: 'Celta' }, away: { id: 2, name: 'Dépor' } },
      goals: { home, away: 0 },
    });
    let discovery: unknown[] = [fixture()];
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const path = new URL(String(input));
      let response: unknown[] = [];
      if (path.pathname === '/fixtures')
        response = path.searchParams.has('ids') ? [fixture('FT')] : discovery;
      if (path.pathname.endsWith('/events'))
        response = [
          {
            time: { elapsed: 67, extra: null },
            team: { id: 1 },
            player: { id: 9, name: 'Borja Iglesias' },
            assist: { id: null, name: null },
            type: 'Goal',
            detail: 'Normal Goal',
            comments: null,
          },
        ];
      if (path.pathname.endsWith('/statistics'))
        response = [
          {
            team: { id: 1 },
            statistics: [
              { type: 'Ball Possession', value: '61%' },
              { type: 'Total Shots', value: 10 },
              { type: 'expected_goals', value: null },
              { type: 'Fouls', value: 4 },
            ],
          },
        ];
      if (path.pathname.endsWith('/lineups'))
        response = [
          {
            team: { id: 1 },
            startXI: [{ player: { name: 'Borja Iglesias', number: 9, pos: 'F' } }],
            substitutes: [],
          },
        ];
      return new Response(JSON.stringify({ errors: [], response }));
    });
    try {
      const provider = new ApiFootballMatchDataProvider('test-not-a-real-key');
      const first = await provider.getMatches(new AbortController().signal);
      expect(first[0].statistics.home).toEqual({ possession: 61, shots: 10, fouls: 4 });
      expect(first[0].lineups?.home[0].name).toBe('Borja Iglesias');
      expect(first[0].incidents[0].kind).toBe('goal');
      discovery = [];
      const second = await provider.getMatches(new AbortController().signal);
      expect(second[0].status).toBe('finished');
      expect(second[0].incidents[0].id).toBe(first[0].incidents[0].id);
      expect(second[0].score.home).toBe(1);
    } finally {
      fetch.mockRestore();
    }
  });
});
