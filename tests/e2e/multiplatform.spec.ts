import { test, expect } from '@playwright/test';
import { createStudioServer } from '../../apps/server/src/server';
import { createMultiplatform } from '../../apps/server/src/multiplatform-config';
import type { AddressInfo } from 'node:net';
import { readFile } from 'node:fs/promises';

test('administración: chats normalizados, filtros, formatos y capacidades aisladas', async ({
  page,
}) => {
  const app = createStudioServer();
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  let releaseChat: (() => void) | undefined;
  try {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base);
    await page.getByRole('button', { name: 'Multiplataforma', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Señal horizontal · 16:9' })).toBeVisible();
    expect(
      await page
        .locator('[data-testid="compositor-landscape"] canvas')
        .evaluate((c: HTMLCanvasElement) => [c.width, c.height]),
    ).toEqual([1280, 720]);
    expect(
      await page
        .locator('[data-testid="compositor-portrait"] canvas')
        .evaluate((c: HTMLCanvasElement) => [c.width, c.height]),
    ).toEqual([720, 1280]);
    // The controlled input must keep the requested value before the API replies.
    const chatPending = new Promise<void>((resolve) => {
      releaseChat = resolve;
    });
    await page.route(base + '/api/multiplatform/command', async (route) => {
      if (route.request().postDataJSON().action === 'chat') await chatPending;
      await route.continue();
    });
    await page.getByLabel('Chat TikTok ON/OFF', { exact: true }).check();
    await expect(page.getByLabel('Chat TikTok ON/OFF', { exact: true })).toBeChecked();
    releaseChat?.();
    await expect(page.getByTestId('chat-state-tiktok')).toHaveText('restricted');
    await page.getByLabel('Twitch ON/OFF', { exact: true }).check();
    await expect(page.getByTestId('output-state-twitch')).toHaveText('unconfigured');
    for (const [index, name] of ['Ana', 'Brais', 'Lucía'].entries()) {
      await page.getByLabel('Usuario externo simulado', { exact: true }).fill(name);
      await page
        .getByLabel('Mensaje externo simulado', { exact: true })
        .fill(`Vamos Celta, buen partido ${index}`);
      await page
        .getByRole('button', { name: 'Enviar mensaje externo simulado', exact: true })
        .click();
    }
    await expect(page.getByText(/twitch: 3 participantes/)).toBeVisible();
    await page
      .getByLabel('Mensaje externo simulado', { exact: true })
      .fill('buy followers https://a.test https://b.test');
    await page
      .getByRole('button', { name: 'Enviar mensaje externo simulado', exact: true })
      .click();
    await expect(page.getByText(/Filtrados:.*spam: 1/)).toBeVisible();
    await page.screenshot({ path: '.local/multiplatform-admin.png', fullPage: true });
    expect(errors).toEqual([]);
  } finally {
    releaseChat?.();
    app.stop();
  }
});

test('señal propia real: canvas + audio TTS → WebM → FFmpeg H.264/AAC en ambos formatos', async ({
  page,
}) => {
  test.setTimeout(60000);
  const app = createStudioServer({
    multiplatformFactory: (receive) => createMultiplatform(receive, { BROADCAST_TTS: 'flite' }),
  });
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.goto(base);
    await page.getByRole('button', { name: 'Multiplataforma', exact: true }).click();
    await page.getByRole('button', { name: 'Prueba local codificada', exact: true }).click();
    await expect(page.getByTestId('broadcast-state')).toContainText('Prueba local codificada');
    await expect
      .poll(
        async () => {
          const state = await (await page.request.get(base + '/api/state')).json();
          return (
            state.multiplatform.broadcast.encodedBytes.landscape > 0 &&
            state.multiplatform.broadcast.encodedBytes.portrait > 0
          );
        },
        { timeout: 20000 },
      )
      .toBe(true);
    await page.request.post(base + '/api/command', {
      data: { type: 'event', matchId: 'celta-madrid', eventType: 'goal', side: 'home' },
    });
    await expect
      .poll(
        async () => {
          const state = await (await page.request.get(base + '/api/state')).json();
          return state.voice.status;
        },
        { timeout: 10000 },
      )
      .toBe('playing');
    const spoken = await (await page.request.get(base + '/api/state')).json();
    expect(spoken.voice.provider).toContain('Flite');
    expect(spoken.voice.audible).toBe(true);
    expect(spoken.animation.speaking).toBe(true);
    expect(
      spoken.multiplatform.broadcast.destinations.every(
        (d: { status: string }) => d.status !== 'live',
      ),
    ).toBe(true);
    await page.getByRole('button', { name: 'Parar directo', exact: true }).click();
    await expect(page.getByTestId('broadcast-state')).toHaveText('Emisión detenida');
    const ended = await (await page.request.get(base + '/api/state')).json();
    expect(ended.multiplatform.broadcast.running).toBe(false);
    expect(ended.multiplatform.broadcast.encodedBytes.landscape).toBeGreaterThan(10000);
    expect(ended.multiplatform.broadcast.encodedBytes.portrait).toBeGreaterThan(10000);
    expect(errors).toEqual([]);
  } finally {
    app.stop();
  }
});

test('HTML sin conexión: dos composiciones oficiales y administración degradada sin claves', async ({
  page,
  context,
}) => {
  const html = await readFile('.local/SamuIA-Live-Studio.html', 'utf8');
  const requests: string[] = [];
  await page.route('http://localhost/multiplatform-portable', (r) =>
    r.fulfill({ contentType: 'text/html', body: html }),
  );
  page.on('request', (r) => {
    if (!r.isNavigationRequest() && /^https?:/.test(r.url())) requests.push(r.url());
  });
  await context.setOffline(true);
  await page.goto('http://localhost/multiplatform-portable');
  await page.getByRole('button', { name: 'Multiplataforma', exact: true }).click();
  await expect(
    page.getByText(/Estas previsualizaciones funcionan también en el HTML portátil/),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Iniciar directo', exact: true })).toBeDisabled();
  await expect
    .poll(() =>
      page
        .locator('[data-testid="compositor-landscape"] canvas')
        .evaluate((c: HTMLCanvasElement) => {
          const d = c.getContext('2d')!.getImageData(500, 300, 1, 1).data;
          return Array.from(d).slice(0, 3).join(',');
        }),
    )
    .not.toBe('11,21,29');
  expect(requests).toEqual([]);
});
