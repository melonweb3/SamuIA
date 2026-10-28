import { it, expect } from 'vitest';
import { createStudioServer } from '../apps/server/src/server';
import type { AddressInfo } from 'node:net';
import type { StudioSnapshot } from '../packages/shared/src/index';
it('la API prepara, revisa y arranca un boletín en el mismo estudio y rechaza comandos inválidos', async () => {
  const app = createStudioServer();
  await new Promise<void>((r) => app.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  const post = async (value: unknown) => {
    const r = await fetch(base + '/api/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value),
    });
    return { status: r.status, body: await r.json() };
  };
  try {
    let result = await post({ type: 'program-mode', mode: 'NOTICIAS' });
    expect(result.status).toBe(200);
    expect(result.body.news.stories).toHaveLength(9);
    const story = (result.body as StudioSnapshot).news.stories[0];
    await post({ type: 'news', action: 'review', id: story.id, review: 'approved' });
    result = await post({
      type: 'news',
      action: 'build',
      config: {
        categories: [story.category],
        durationMinutes: 5,
        count: 1,
        format: 'titular',
        interaction: false,
        breaking: true,
      },
    });
    expect(result.status).toBe(200);
    expect(result.body.news.program.cues).toHaveLength(4);
    expect((await post({ type: 'news', action: 'start' })).status).toBe(422);
    await post({ type: 'news', action: 'approve' });
    result = await post({ type: 'news', action: 'start' });
    expect(result.body.news.program.status).toBe('running');
    expect(result.body.voice.text).toContain('SamuIA News');
    expect((await post({ type: 'news', action: 'build', config: { count: -1 } })).status).toBe(400);
    expect((await post({ type: 'news', action: 'approve', extra: true })).status).toBe(400);
    const unsafe = await fetch(base + '/api/news/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'add',
        source: {
          name: 'private',
          url: 'http://127.0.0.1/',
          kind: 'rss',
          category: 'España',
          enabled: true,
          usage: 'headlines',
        },
      }),
    });
    expect(unsafe.status).toBe(422);
    const wrongOrigin = await fetch(base + '/api/news/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://untrusted.example' },
      body: JSON.stringify({ action: 'refresh' }),
    });
    expect(wrongOrigin.status).toBe(403);
    result = await post({ type: 'program-mode', mode: 'DEPORTES' });
    expect(result.body.activeMatches).toHaveLength(4);
  } finally {
    app.stop();
  }
});
