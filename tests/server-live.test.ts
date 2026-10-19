import { afterAll, beforeAll, expect, it } from 'vitest';
import { createStudioServer } from '../apps/server/src/server';
import { LiveDataSession, parseMatches } from '../packages/live-data/src/index';
import type { LiveMatchRecord } from '../packages/shared/src/index';
let records: LiveMatchRecord[] = [];
const live = new LiveDataSession(
  { name: 'Fixture HTTP test', getMatches: async () => records },
  null,
  { mergeMs: 0, pollMs: 1000 },
);
const app = createStudioServer({ live });
let base: string;
beforeAll(async () => {
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const address = app.server.address();
  if (!address || typeof address === 'string') throw new Error('No port');
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(() => app.stop());
const post = (command: unknown) =>
  fetch(base + '/api/command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
it('alterna modos manteniendo simulación, preferencias y memoria independiente; protege LIVE de eventos manuales', async () => {
  await post({ type: 'settings', patch: { studioBackdrop: '02' } });
  await post({ type: 'profile', patch: { name: 'Samu en directo', commentaryFrequency: 0 } });
  await post({ type: 'event', matchId: 'celta-madrid', eventType: 'goal', side: 'home' });
  records = parseMatches(
    [
      {
        id: 'live-1',
        league: { id: 'league-live', name: 'Live league' },
        home: { id: 'a', name: 'Casa' },
        away: { id: 'b', name: 'Fuera' },
        minute: 67,
        status: 'live',
        score: { home: 2, away: 1 },
        statistics: { home: {}, away: {} },
        updatedAt: Date.now(),
        incidents: [],
      },
    ],
    'fixture',
    Date.now(),
  );
  const switchLive = await post({ type: 'data-mode', mode: 'LIVE' });
  expect(switchLive.status).toBe(200);
  await live.poll();
  live.tick();
  const state = await (await fetch(base + '/api/state')).json();
  expect(state.dataMode).toBe('LIVE');
  expect(state.activeMatches).toHaveLength(1);
  expect(state.activeMatches[0].score).toEqual({ home: 2, away: 1 });
  expect(state.settings.studioBackdrop).toBe('02');
  expect(state.profile.name).toBe('Samu en directo');
  expect(
    (await post({ type: 'event', matchId: 'live-1', eventType: 'goal', side: 'home' })).status,
  ).toBe(409);
  expect(
    (
      await post({
        type: 'match-add',
        leagueId: 'laliga',
        home: 'Fake',
        away: 'Other',
        status: 'live',
        contextType: 'regular',
      })
    ).status,
  ).toBe(409);
  await post({
    type: 'chat',
    username: 'Ana',
    message: '¿Cómo va?',
    matchId: 'live-1',
    clientId: 'my-message',
  });
  await post({
    type: 'chat',
    username: 'Ana',
    message: '¿Cómo va?',
    matchId: 'live-1',
    clientId: 'my-message',
  });
  expect(live.director.chat.messages).toHaveLength(1);
  const back = await (await post({ type: 'data-mode', mode: 'SIMULATION' })).json();
  expect(back.dataMode).toBe('SIMULATION');
  expect(back.activeMatches.find((m: { id: string }) => m.id === 'celta-madrid').score.home).toBe(
    1,
  );
  expect(
    back.contexts.find((c: { matchId: string }) => c.matchId === 'celta-madrid').personalityMemory
      .memorableMoments,
  ).toHaveLength(1);
  expect(back.activeMatches.some((m: { id: string }) => m.id === 'live-1')).toBe(false);
  expect(back.chat.some((c: { username: string }) => c.username === 'Ana')).toBe(false);
  await post({ type: 'data-mode', mode: 'LIVE' });
  const resumed = await (await fetch(base + '/api/state')).json();
  expect(resumed.chat).toHaveLength(1);
  expect(resumed.activeMatches[0].score).toEqual({ home: 2, away: 1 });
});
it('rechaza un cambio de modo inválido sin filtrar claves ni URLs privadas', async () => {
  expect((await post({ type: 'data-mode', mode: 'INVALID' })).status).toBe(400);
  const json = JSON.stringify(await (await fetch(base + '/api/state')).json());
  expect(json).not.toContain('FOOTBALL_API_KEY');
  expect(json).not.toContain('Authorization');
});
