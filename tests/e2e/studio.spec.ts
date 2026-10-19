import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
test('dashboard compilado: gol, alerta secundaria y pregunta de chat sin interrumpir', async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByText('Sistema local conectado')).toBeVisible();
  await expect(page.getByRole('img', { name: /Avatar oficial de SamuIA/ })).toBeVisible();
  await expect
    .poll(() =>
      page.locator('.avatar-image').evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBe(1122);
  await page.getByRole('button', { name: '+ Gol Celta', exact: true }).click();
  await expect(page.locator('.speech-content')).toContainText('GOOOOOL! Iepaaa meu!');
  await page.screenshot({ path: '.local/dashboard-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Centro de Partidos', exact: true }).click();
  const liverpool = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Liverpool – Arsenal', exact: true }) });
  await liverpool
    .getByRole('combobox', { name: 'Equipo del evento en Liverpool – Arsenal' })
    .selectOption('away');
  await liverpool.getByRole('button', { name: 'Roja', exact: true }).click();
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await expect(page.getByText(/ROJA · Arsenal/)).toBeVisible();
  await page.getByRole('textbox', { name: 'Usuario', exact: true }).fill('E2E');
  await page
    .getByRole('textbox', { name: 'Comentario', exact: true })
    .fill('¿Cómo va el Liverpool?');
  await page.getByRole('button', { name: 'Añadir a la cola' }).click();
  const comment = page
    .locator('.chat-item')
    .filter({ has: page.getByText('E2E', { exact: true }) });
  await comment.getByRole('button', { name: /Responder/ }).click();
  await expect(page.locator('.speech-content')).toContainText('Liverpool 0 - 0 Arsenal', {
    timeout: 20000,
  });
  const state = await (await request.get('/api/state')).json();
  expect(state.mainMatchId).toBe('celta-madrid');
  expect(
    state.activeMatches.find((m: { id: string }) => m.id === 'liverpool-arsenal').statistics.away
      .red,
  ).toBe(1);
  expect(errors).toEqual([]);
});
test('gestión de partidos, ajustes y memoria; móvil sin desbordamiento', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Sistema local conectado')).toBeVisible();
  await page.getByRole('button', { name: 'Centro de Partidos', exact: true }).click();
  const form = page.locator('.add-match');
  await form.getByLabel('Local', { exact: true }).fill('Inter');
  await form.getByLabel('Visitante', { exact: true }).fill('Juventus');
  await form.getByRole('combobox', { name: 'Competición', exact: true }).selectOption('serie-a');
  await form.getByRole('combobox', { name: 'Estado', exact: true }).selectOption('upcoming');
  await form.getByRole('button', { name: 'Añadir partido' }).click();
  await page.getByRole('button', { name: 'Próximos', exact: true }).click();
  const inter = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Inter – Juventus', exact: true }) });
  await expect(inter).toBeVisible();
  await inter.getByRole('button', { name: 'Iniciar partido' }).click();
  await expect(inter).not.toBeVisible();
  await page.getByRole('button', { name: 'Todos', exact: true }).click();
  await inter.getByRole('button', { name: 'Eliminar partido', exact: true }).click();
  await expect(inter).not.toBeVisible();
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await expect(page.getByRole('switch', { name: /Modo seguro/ })).toBeChecked();
  await page.getByRole('switch', { name: /Modo carrusel/ }).check();
  await page.getByRole('combobox', { name: 'Partido principal', exact: true }).selectOption('');
  await page.getByRole('button', { name: 'Radar SamuIA', exact: true }).click();
  await expect(page.getByText('CARRUSEL ON', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Memoria', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Predicciones', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Integraciones', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'OpenAI', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '.local/dashboard-mobile.png', fullPage: true });
});
test('HTML portátil offline: opiniones, predicción verificada y encuesta con votos reales', async ({
  page,
  context,
}) => {
  const errors: string[] = [],
    requests: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    if (!r.isNavigationRequest() && /^https?:/.test(r.url())) requests.push(r.url());
  });
  // This environment blocks file:// navigation in managed Chromium. Supply the same bytes
  // from memory on a secure local origin; no server is used for this document or its engine.
  const html = await readFile(resolve('.local/SamuIA-Live-Studio.html'), 'utf8');
  await page.route('http://localhost/portable', (route) =>
    route.fulfill({ contentType: 'text/html', body: html }),
  );
  await context.setOffline(true);
  await page.goto('http://localhost/portable');
  await expect(page.getByText('Sistema local conectado')).toBeVisible();
  await expect(page.locator('h1')).toContainText('SamuIA Live Studio');
  // Zero cooldown makes editorial actions deterministic while still respecting utterances.
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  const cool = page.getByRole('slider', { name: /Cooldown entre reacciones/ });
  await cool.focus();
  await cool.press('Home');
  await expect(cool).toHaveValue('0');
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  const stop = async () => {
    await page.getByRole('button', { name: /Callar/ }).click();
    await expect(page.locator('.state-badge')).toContainText('IDLE');
  };
  await page.getByRole('button', { name: 'Ocasión clara', exact: true }).click();
  await stop();
  await page.getByRole('button', { name: 'Ocasión clara', exact: true }).click();
  await stop();
  await page.getByRole('button', { name: 'Mojarse', exact: true }).click();
  await expect(page.locator('.speech-content')).toContainText('próximo gol de Celta');
  await stop();
  await page.getByRole('button', { name: '+ Gol Celta', exact: true }).click();
  await expect(page.locator('.speech-content')).toContainText('Os lo dije');
  await stop();
  await page.getByRole('button', { name: 'Preguntar al chat', exact: true }).click();
  await expect(page.locator('.speech-content')).toContainText('Responded sí o no');
  await stop();
  for (const [username, message] of [
    ['Ana', 'Sí'],
    ['Brais', 'Sí'],
    ['Carlos', 'No'],
  ]) {
    await page.getByRole('textbox', { name: 'Usuario', exact: true }).fill(username);
    await page.getByRole('textbox', { name: 'Comentario', exact: true }).fill(message);
    await page.getByRole('button', { name: 'Añadir a la cola' }).click();
  }
  await page.getByRole('button', { name: 'Resumir respuestas', exact: true }).click();
  await expect(page.locator('.speech-content')).toContainText('67%');
  await expect(page.locator('.speech-content')).toContainText('2 de 3');
  await page.getByRole('button', { name: 'Memoria', exact: true }).click();
  const success = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Predicciones acertadas', exact: true }) });
  await expect(success.locator('article')).toHaveCount(1);
  await expect(
    page.getByRole('heading', { name: 'Respuestas reales del chat', exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  expect(requests).toEqual([]);
});

test('las cinco referencias se ven offline y mantienen exactamente los PNG originales', async ({
  page,
  context,
}) => {
  const html = await readFile(resolve('.local/SamuIA-Live-Studio.html'), 'utf8');
  const originals: { runtimeFile: string; sha256: string }[] = JSON.parse(
    await readFile('assets/reference/originals-index.json', 'utf8'),
  );
  await page.route('http://localhost/official-avatar', (route) =>
    route.fulfill({ contentType: 'text/html', body: html }),
  );
  await context.setOffline(true);
  await page.goto('http://localhost/official-avatar');
  await expect(page.getByText('Sistema local conectado')).toBeVisible();
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  for (const entry of originals) {
    const filename = entry.runtimeFile.split('/').at(-1)!;
    await page
      .getByRole('combobox', { name: 'Avatar oficial', exact: true })
      .selectOption(filename);
    await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
    const image = page.locator('.avatar-image');
    await expect(image).toHaveAttribute('data-avatar-file', filename);
    await expect
      .poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth))
      .toBe(1122);
    const source = await image.getAttribute('src');
    expect(source?.startsWith('data:image/png;base64,')).toBe(true);
    expect(
      createHash('sha256')
        .update(Buffer.from(source!.split(',')[1], 'base64'))
        .digest('hex'),
    ).toBe(entry.sha256);
    await expect(page.locator('svg.placeholder')).toHaveCount(0);
    await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  }
});

test('si falla un retrato solo recurre a otro original o muestra un aviso', async ({ page }) => {
  await page.route('**/samuia/avatar/*.png', (route) => route.abort());
  await page.goto('/');
  await expect(page.getByText('No se ha podido cargar el retrato oficial.')).toBeVisible();
  await expect(page.locator('svg.placeholder')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reintentar imagen' })).toBeVisible();
});

test('escenarios oficiales offline: selección, gráficos, luz e integridad de los cinco fondos', async ({
  page,
  context,
}) => {
  const html = await readFile(resolve('.local/SamuIA-Live-Studio.html'), 'utf8');
  const originals: { id: string; runtimeFile: string; sha256: string }[] = JSON.parse(
    await readFile('assets/reference/scenes/originals-index.json', 'utf8'),
  );
  const network: string[] = [];
  page.on('request', (request) => {
    if (!request.isNavigationRequest() && /^https?:/.test(request.url()))
      network.push(request.url());
  });
  await page.route('http://localhost/studio-setup', (route) =>
    route.fulfill({ contentType: 'text/html', body: html }),
  );
  await context.setOffline(true);
  await page.goto('http://localhost/studio-setup');
  await expect(page.locator('.scene-image')).toHaveAttribute('data-scene-file', 'escena_05.png');
  for (const entry of originals) {
    await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
    await page
      .getByRole('combobox', { name: 'Setup principal', exact: true })
      .selectOption(entry.id);
    await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
    const img = page.locator('.scene-image');
    await expect(img).toHaveAttribute('data-scene-file', entry.runtimeFile.split('/').at(-1)!);
    await expect.poll(() => img.evaluate((e: HTMLImageElement) => e.naturalWidth)).toBe(1672);
    const source = await img.getAttribute('src');
    expect(
      createHash('sha256')
        .update(Buffer.from(source!.split(',')[1], 'base64'))
        .digest('hex'),
    ).toBe(entry.sha256);
  }
  await expect(page.locator('.studio-team.home')).toHaveText('Celta');
  await expect(page.locator('.studio-team.away')).toHaveText('Madrid');
  await page.getByRole('button', { name: '+ Gol Celta', exact: true }).click();
  await expect(page.locator('.studio-score')).toHaveText('1 – 0');
  await expect(page.locator('.scenery-light')).toHaveAttribute('data-mood', 'celebracion');
  await page.screenshot({ path: '.local/studio-setup.png', fullPage: true });
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  await page.getByRole('switch', { name: 'Gráficos del partido', exact: true }).uncheck();
  await page.getByRole('switch', { name: 'Iluminación reactiva', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await expect(page.locator('.studio-match-graphics')).toHaveCount(0);
  await expect(page.locator('.scenery-light')).toHaveCount(0);
  await expect(page.locator('.avatar-image')).toBeVisible();
  expect(network).toEqual([]);
});
