import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFile } from 'node:fs/promises';
import { createStudioServer } from '../../apps/server/src/server';
import { LiveDataSession } from '../../packages/live-data/src/index';
import {
  HttpMatchDataProvider,
  HttpLiveCommentaryProvider,
} from '../../packages/live-data/src/http';

test('LIVE en navegador: HTTP → normalización → comentario propio → avatar/voz; retorno a SIMULATION', async ({
  page,
}) => {
  let incidents: unknown[] = [],
    narration: unknown[] = [],
    minute = 66;
  const upstream = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify(
        req.url === '/commentary'
          ? narration
          : [
              {
                id: 'live-e2e',
                league: { id: 'real-feed', name: 'Feed de prueba HTTP' },
                home: { id: 'celta', name: 'Celta' },
                away: { id: 'depor', name: 'Dépor' },
                minute,
                status: 'live',
                score: { home: 0, away: 0 },
                statistics: {
                  home: { shotsOnTarget: 4, possession: 61 },
                  away: { possession: 39 },
                },
                updatedAt: Date.now(),
                incidents,
              },
            ],
      ),
    );
  });
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const source = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
  const live = new LiveDataSession(
    new HttpMatchDataProvider(source + '/matches'),
    new HttpLiveCommentaryProvider(source + '/commentary'),
    { pollMs: 1000, mergeMs: 100 },
  );
  const app = createStudioServer({ live });
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.goto(base);
    await page.getByLabel('Modo de datos', { exact: true }).selectOption('LIVE');
    await expect(page.getByTestId('live-status')).toContainText('Conectado');
    await expect(page.locator('.scoreboard')).toContainText('0:0');
    await expect(page.getByRole('button', { name: '+ Gol Celta', exact: true })).toHaveCount(0);
    minute = 67;
    const timestamp = Date.now();
    incidents = [
      {
        id: 'shot1',
        matchId: 'live-e2e',
        kind: 'shot',
        side: 'home',
        player: 'Borja Iglesias',
        minute,
        timestamp,
        correlationId: 'play1',
      },
    ];
    narration = [
      {
        id: 'text1',
        matchId: 'live-e2e',
        kind: 'narration',
        side: 'home',
        minute,
        timestamp,
        correlationId: 'play1',
        text: "67' Borja Iglesias remata de cabeza, parada del portero",
      },
    ];
    await expect(page.locator('.speech-content')).toContainText('Borja Iglesias', {
      timeout: 8000,
    });
    await expect(page.locator('.speech-content')).toContainText('de cabeza');
    await expect(page.locator('.speech-content')).toContainText('portero');
    const state = await (await page.request.get(base + '/api/state')).json();
    expect(state.history).toHaveLength(1);
    expect(state.history[0].sourceIds).toHaveLength(2);
    expect(state.animation.requestedAnimation).toBe('shock');
    expect(state.voice.status).toBe('playing');
    expect(state.activeMatches[0].statistics.home.shotsOnTarget).toBe(4);
    await page.screenshot({ path: '.local/live-browser.png', fullPage: true });
    await page.getByLabel('Modo de datos', { exact: true }).selectOption('SIMULATION');
    await expect(page.getByRole('button', { name: '+ Gol Celta', exact: true })).toBeVisible();
    await expect(page.getByTestId('live-status')).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    app.stop();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  }
});

test('HTML portátil: LIVE indica configuración pendiente y permite volver a la simulación sin red', async ({
  page,
  context,
}) => {
  const html = await readFile('.local/SamuIA-Live-Studio.html', 'utf8');
  await page.route('http://localhost/live-portable', (r) =>
    r.fulfill({ contentType: 'text/html', body: html }),
  );
  const requests: string[] = [];
  page.on('request', (r) => {
    if (!r.isNavigationRequest() && /^https?:/.test(r.url())) requests.push(r.url());
  });
  await context.setOffline(true);
  await page.goto('http://localhost/live-portable');
  await page.getByLabel('Modo de datos', { exact: true }).selectOption('LIVE');
  await expect(page.getByTestId('live-status')).toContainText('Sin configurar');
  await expect(page.getByLabel('Estado del proveedor LIVE')).toContainText('servidor configurado');
  await expect(page.locator('.scoreboard')).toHaveCount(0);
  await page.getByLabel('Modo de datos', { exact: true }).selectOption('SIMULATION');
  await expect(page.getByRole('button', { name: '+ Gol Celta', exact: true })).toBeVisible();
  expect(requests).toEqual([]);
});
