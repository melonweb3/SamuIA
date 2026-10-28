import { test, expect } from '@playwright/test';
import type { AddressInfo } from 'node:net';
import { readFile } from 'node:fs/promises';
import { createStudioServer } from '../../apps/server/src/server';
import { ReactionStudioService } from '../../apps/server/src/reaction-studio';
import { VoiceStudioService } from '../../apps/server/src/voice-studio';
import { referenceVideoFixture } from '../fixtures/reference-video';
async function serve() {
  const app = createStudioServer({
    newsStorageFile: null,
    reactionStudio: new ReactionStudioService({}, { directory: null }),
    voiceStudio: new VoiceStudioService({}, { directory: null }),
  });
  await new Promise<void>((r) => app.server.listen(0, '127.0.0.1', r));
  return { app, base: `http://127.0.0.1:${(app.server.address() as AddressInfo).port}` };
}
test('official image actually animates: speech, mouth pixels, blink, fixed desk/microphone, goal and reset', async ({
  page,
}) => {
  const { app, base } = await serve(),
    errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.goto(base);
    await page.getByRole('button', { name: 'Avatar / Reaction Studio', exact: true }).click();
    const canvas = page.getByTestId('official-animated-avatar');
    await expect(canvas).toHaveAttribute('data-ready', 'true');
    const readRegions = () =>
      canvas.evaluate((c: HTMLCanvasElement) => {
        const ctx = c.getContext('2d')!;
        const region = (x: number, y: number, w: number, h: number) =>
          Array.from(
            ctx.getImageData(
              Math.round((x * c.width) / 1672),
              Math.round((y * c.height) / 941),
              Math.round((w * c.width) / 1672),
              Math.round((h * c.height) / 941),
            ).data,
          );
        return {
          background: region(90, 90, 45, 45),
          desk: region(720, 820, 50, 30),
          microphone: region(1048, 568, 35, 30),
          mouth: region(796, 345, 95, 65),
        };
      });
    const idle = await readRegions();
    await page
      .getByLabel('Texto de reacción')
      .fill(
        'GOOOOOOOL DEL CELTA! Vamos a celebrar este gol juntos, con toda la comunidad, porque acaba de cambiar el partido.',
      );
    await page.getByRole('button', { name: 'SPEAK + REACT', exact: true }).click();
    await expect(page.getByTestId('engine-avatar-state')).toHaveText('celebrating');
    await expect.poll(() => canvas.getAttribute('data-mouth').then(Number)).toBeGreaterThan(0.1);
    const speaking = await readRegions();
    expect(speaking.background).toEqual(idle.background);
    expect(speaking.desk).toEqual(idle.desk);
    expect(speaking.microphone).toEqual(idle.microphone);
    expect(speaking.mouth).not.toEqual(idle.mouth);
    await page.screenshot({ path: '.local/avatar-engine-v9-speaking.png', fullPage: true });
    await page.locator('.avatar-stage').screenshot({path:'.local/avatar-v9-stage.png'});
    await page.getByRole('button', { name: 'Partido: goal', exact: true }).click();
    await expect
      .poll(async () => {
        const s = await (await page.request.get(base + '/api/state')).json();
        return s.voice.reaction?.source;
      })
      .toBe('match:goal');
    await expect(page.getByTestId('engine-avatar-state')).toHaveText('idle', { timeout: 10000 });
    await expect(canvas).toHaveAttribute('data-mouth', '0');
    await page.getByRole('button', { name: 'REACT ONLY', exact: true }).click();
    await expect(page.getByTestId('engine-avatar-state')).toHaveText('celebrating');
    const state = await (await page.request.get(base + '/api/state')).json();
    expect(state.voice.status).toBe('idle');
    expect(state.animation.engine.isTalking).toBe(false);
    await page.getByRole('button', { name: 'STOP ANIMATION', exact: true }).click();
    await expect(page.getByTestId('engine-avatar-state')).toHaveText('idle');
    await page.getByRole('button', { name: 'RESET TO IDLE', exact: true }).click();
    await page.getByLabel('Render mode', { exact: true }).selectOption('static');
    const still = await readRegions();
    await page.waitForTimeout(300);
    expect(await readRegions()).toEqual(still);
    expect(errors).toEqual([]);
    await expect(page.locator('.avatar-stage video')).toHaveCount(0);
  } finally {
    app.stop();
  }
});
test('Reaction Studio stores, classifies and previews video privately; reference-only assets never become output video', async ({
  page,
}) => {
  const { app, base } = await serve();
  try {
    await page.goto(base);
    await page.getByRole('button', { name: 'Avatar / Reaction Studio', exact: true }).click();
    await page.getByLabel('Nombre de reacción', { exact: true }).fill('my_manual_celebration');
    await page.getByRole('button', { name: 'Crear reacción', exact: true }).click();
    const asset = page
      .locator('.reaction-library .reaction-asset')
      .filter({ has: page.getByText('my_manual_celebration', { exact: true }) });
    await expect(asset).toHaveCount(1);
    await asset.getByLabel('Favorita', { exact: true }).check();
    await expect
      .poll(async () => {
        const s = await (await page.request.get(base + '/api/state')).json();
        return s.reactionLibrary.find((a: { name: string }) => a.name === 'my_manual_celebration')
          ?.favorite;
      })
      .toBe(true);
    await page
      .getByLabel('Nombre del vídeo', { exact: true })
      .fill('celebration_big_video_fixture');
    await page
      .getByLabel('Subir vídeo de referencia', { exact: true })
      .setInputFiles({
        name: 'own-reference-fixture.mp4',
        mimeType: 'video/mp4',
        buffer: await referenceVideoFixture(),
      });
    await page.getByRole('button', { name: 'Guardar referencia de vídeo', exact: true }).click();
    const video = page
      .locator('.reference-list .reaction-asset')
      .filter({ hasText: 'celebration_big_video_fixture' });
    await expect(video).toContainText('pending-motion');
    await video
      .getByRole('button', { name: 'Previsualizar celebration_big_video_fixture', exact: true })
      .click();
    await expect(
      page.getByLabel('Previsualización privada de referencia', { exact: true }),
    ).toHaveAttribute('src', /^blob:/);
    await expect(page.locator('.avatar-stage video')).toHaveCount(0);
    await video
      .getByRole('button', {
        name: 'Vincular celebration_big_video_fixture a una reacción',
        exact: true,
      })
      .click();
    await page.getByRole('button', { name: 'Crear reacción', exact: true }).click();
    const linked = page
      .locator('.reaction-library .reaction-asset')
      .filter({ has: page.getByText('celebration_big_video_fixture', { exact: true }) });
    await expect(linked).toContainText('reference-only');
    await linked
      .getByRole('button', { name: 'Probar celebration_big_video_fixture', exact: true })
      .click();
    await expect(
      page.getByText('La referencia no contiene movimiento extraído; se usa una reacción 2D.', {
        exact: true,
      }),
    ).toBeVisible();
    const state = await (await page.request.get(base + '/api/state')).json();
    expect(state.animation.engine.currentReactionAsset.source).not.toBe('reference-video');
    expect(state.motionReferences).toHaveLength(1);
    expect(JSON.stringify(state)).not.toContain('data:video');
    await video
      .getByRole('button', { name: 'Eliminar vídeo celebration_big_video_fixture', exact: true })
      .click();
    await expect(video).toHaveCount(0);
    await expect(linked).toContainText('placeholder');
    await expect(page.locator('.avatar-stage video')).toHaveCount(0);
  } finally {
    app.stop();
  }
});
test('Flite uses measured audio amplitude in the official animated renderer without a cloned voice', async ({
  page,
}) => {
  const { app, base } = await serve();
  try {
    await page.goto(base);
    await page.getByRole('button', { name: 'Avatar / Reaction Studio', exact: true }).click();
    await page.getByLabel('Voz para la prueba', { exact: true }).selectOption('flite');
    await page
      .getByLabel('Texto de reacción')
      .fill(
        'Hello, this is a local voice test for the SamuIA official avatar. We are following the match together.',
      );
    await page.getByRole('button', { name: 'SPEAK + REACT', exact: true }).click();
    await expect
      .poll(
        async () => {
          const s = await (await page.request.get(base + '/api/state')).json();
          return s.animation.engine.lipSyncSource;
        },
        { timeout: 15000 },
      )
      .toBe('audio-amplitude');
    await expect
      .poll(async () => {
        const s = await (await page.request.get(base + '/api/state')).json();
        return s.animation.engine.audioLevel;
      })
      .toBeGreaterThan(0.01);
    await expect(page.getByTestId('official-animated-avatar')).toHaveAttribute(
      'data-ready',
      'true',
    );
    await page.getByRole('button', { name: 'Callar voz y avatar', exact: true }).click();
    await expect(page.getByTestId('engine-avatar-state')).toHaveText('idle');
  } finally {
    app.stop();
  }
});
test('portable avatar animates offline with test audio, saves settings/recipes and keeps video references in IndexedDB', async ({
  page,
  context,
}) => {
  const html = await readFile('.local/SamuIA-Live-Studio.html', 'utf8'),
    network: string[] = [];
  page.on('request', (r) => {
    if (!r.isNavigationRequest() && /^https?:/.test(r.url())) network.push(r.url());
  });
  await page.route('http://localhost/avatar-v9', (route) =>
    route.fulfill({ contentType: 'text/html', body: html }),
  );
  await context.setOffline(true);
  await page.goto('http://localhost/avatar-v9');
  await page.getByRole('button', { name: 'Avatar / Reaction Studio', exact: true }).click();
  await expect(page.getByTestId('official-animated-avatar')).toHaveAttribute('data-ready', 'true');
  await page.getByLabel('Voz para la prueba', { exact: true }).selectOption('tone');
  await page.getByRole('button', { name: 'SPEAK + REACT', exact: true }).click();
  await expect
    .poll(() =>
      page.getByTestId('official-animated-avatar').getAttribute('data-mouth').then(Number),
    )
    .toBeGreaterThan(0.01);
  await page.getByRole('button', { name: 'Callar voz y avatar', exact: true }).click();
  await page.getByLabel('Lip-sync enabled', { exact: true }).uncheck();
  await page.getByLabel('Nombre de reacción', { exact: true }).fill('portable_saved_recipe');
  await page.getByRole('button', { name: 'Crear reacción', exact: true }).click();
  await expect(page.getByText('portable_saved_recipe', { exact: true })).toBeVisible();
  await page
    .getByLabel('Subir vídeo de referencia', { exact: true })
    .setInputFiles({
      name: 'local-fixture.mp4',
      mimeType: 'video/mp4',
      buffer: await referenceVideoFixture(),
    });
  await page.getByRole('button', { name: 'Guardar referencia de vídeo', exact: true }).click();
  await expect(page.locator('.reference-list')).toContainText('pending-motion');
  await page.reload();
  await page.getByRole('button', { name: 'Avatar / Reaction Studio', exact: true }).click();
  await expect(page.getByLabel('Lip-sync enabled', { exact: true })).not.toBeChecked();
  await expect(page.getByText('portable_saved_recipe', { exact: true })).toBeVisible();
  await expect(page.locator('.reference-list')).toContainText('celebration_big');
  expect(network).toEqual([]);
});
