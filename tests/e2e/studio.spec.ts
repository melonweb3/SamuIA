import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
test('dashboard compilado: gol, alerta secundaria y pregunta de chat sin interrumpir', async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByText('Sistema local conectado')).toBeVisible();
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
