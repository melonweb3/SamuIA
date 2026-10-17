import { beforeAll, afterAll, it, expect } from 'vitest';
import { createStudioServer } from '../apps/server/src/server';
const app = createStudioServer();
let base: string;
beforeAll(async () => {
  await new Promise<void>((r) => app.server.listen(0, '127.0.0.1', r));
  const a = app.server.address();
  if (!a || typeof a === 'string') throw new Error('Sin puerto');
  base = `http://127.0.0.1:${a.port}`;
});
afterAll(() => app.stop());
const post = (body: unknown) =>
  fetch(base + '/api/command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
it('sirve salud y estados; procesa eventos por HTTP', async () => {
  expect((await (await fetch(base + '/api/health')).json()).ok).toBe(true);
  const r = await post({ type: 'event', matchId: 'celta-madrid', eventType: 'goal', side: 'home' });
  expect(r.status).toBe(200);
  const s = await r.json();
  expect(s.activeMatches).toHaveLength(4);
  expect(s.decision.say).toBe('GOOOOOL! Iepaaa meu!');
  expect(s.contexts[0].personalityMemory.memorableMoments).toHaveLength(1);
});
it('rechaza comandos y perfiles inválidos sin mutar el estado', async () => {
  expect((await post({ type: 'profile', patch: { rivalryLevel: 101 } })).status).toBe(400);
  expect((await post({ type: 'settings', patch: { unknown: true } })).status).toBe(400);
  expect((await post({ type: 'chat', username: '', message: 'hola' })).status).toBe(400);
  expect(
    (await post({ type: 'event', matchId: 'unknown', eventType: 'goal', side: 'home' })).status,
  ).toBe(422);
});
it('emite instantáneas SSE', async () => {
  const controller = new AbortController();
  const response = await fetch(base + '/api/events', { signal: controller.signal });
  expect(response.headers.get('content-type')).toContain('text/event-stream');
  const chunk = await response.body!.getReader().read();
  expect(new TextDecoder().decode(chunk.value)).toContain('"personalityMemory"');
  controller.abort();
});
it('limita cuerpos y exige JSON', async () => {
  const r = await fetch(base + '/api/command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ x: 'a'.repeat(20000) }),
  });
  expect(r.status).toBe(413);
  expect((await fetch(base + '/api/command', { method: 'POST', body: 'no JSON' })).status).toBe(
    415,
  );
});
