import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { matchSimulationSteps } from '../../packages/match-simulation/src/index';

test('partido completo offline: todos los eventos, chat, predicción acertada y fallida, final 2–1', async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [],
    network: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    if (!r.isNavigationRequest() && /^https?:/.test(r.url())) network.push(r.url());
  });
  const html = await readFile('.local/SamuIA-Live-Studio.html', 'utf8');
  await page.route('http://localhost/match-trial', (r) =>
    r.fulfill({ contentType: 'text/html', body: html }),
  );
  // Keep automatic progression under test control: a short reaction must not
  // disappear while Playwright inspects it on a busy machine.
  const start = new Date('2026-01-01T12:00:00Z');
  await page.clock.install({ time: start });
  await page.clock.pauseAt(new Date(start.getTime() + 1000));
  await context.setOffline(true);
  await page.goto('http://localhost/match-trial#partido-prueba');
  await expect(page.getByTestId('trial-status')).toHaveText('Próximo');
  await expect(page.getByTestId('trial-score')).toHaveText('0 – 0');
  await page.getByRole('button', { name: 'Reproducir partido completo', exact: true }).click();
  await page.clock.runFor(250);
  for (let index = 0; index < matchSimulationSteps.length; index++) {
    const step = matchSimulationSteps[index];
    await expect(page.locator('.trial-steps > .active')).toContainText(step.label, {
      timeout: 12000,
    });
    // Minor sports events deliberately wait for grouping before speaking.
    await expect
      .poll(
        async () => {
          const reading = page.getByRole('button', {
            name: 'Terminar lectura simulada',
            exact: true,
          });
          if (!(await reading.isEnabled())) await page.clock.runFor(250);
          return reading.isEnabled();
        },
        { timeout: 12000, intervals: [0] },
      )
      .toBe(true);
    await expect(
      page.getByRole('button', { name: 'Terminar lectura simulada', exact: true }),
    ).toBeEnabled({ timeout: 12000 });
    await expect(page.getByTestId('trial-comment')).not.toBeEmpty();
    if (step.id === 'success') {
      await expect(page.getByTestId('trial-prediction-success')).toHaveText('Acertadas: 1');
      await expect(page.getByTestId('trial-comment')).toContainText('Os lo dije');
      await expect(page.getByTestId('trial-reaction')).toHaveText('goal');
      await page.screenshot({ path: '.local/match-trial-goal.png', fullPage: false });
    }
    if (step.id === 'failed') {
      await expect(page.getByTestId('trial-prediction-failed')).toHaveText('Fallidas: 1');
      await expect(page.getByTestId('trial-comment')).toContainText('envejeció regular');
      await expect(page.getByTestId('trial-reaction')).toHaveText('frustrated');
    }
    if (step.id === 'community') {
      await expect(page.getByTestId('trial-comment')).toContainText('67%');
      await expect(page.getByTestId('trial-comment')).toContainText('2 de 3');
    }
    await page.getByRole('button', { name: 'Terminar lectura simulada', exact: true }).click();
    // Complete the cooldown and the next step's optional thinking state.
    await page.clock.runFor(1000);
    await expect(page.locator('.trial-steps > .completed')).toHaveCount(index + 1, {
      timeout: 12000,
    });
  }
  await expect(page.getByTestId('match-progress')).toHaveText('Recorrido completado');
  await expect(page.getByTestId('trial-score')).toHaveText('2 – 1');
  await expect(page.getByTestId('trial-minute')).toHaveText('90′');
  await expect(page.getByTestId('trial-status')).toHaveText('Finalizado');
  await expect(page.locator('.trial-commentary-log article')).toHaveCount(24);
  await expect(page.getByTestId('trial-community')).toContainText('Ana');
  await expect(page.getByTestId('trial-memory')).toContainText('Participaciones registradas: 3');
  await expect(page.getByTestId('trial-prediction-success')).toHaveText('Acertadas: 1');
  await expect(page.getByTestId('trial-prediction-failed')).toHaveText('Fallidas: 1');
  await page.screenshot({ path: '.local/match-trial-final.png', fullPage: true });
  expect(errors).toEqual([]);
  expect(network).toEqual([]);
});

test('pantalla servida: comunidad manual, continuidad al navegar, reinicio aislado y móvil', async ({
  page,
  request,
}) => {
  const before = await (await request.get('/api/state')).json();
  await page.goto('/#partido-prueba');
  await expect(page.getByTestId('trial-score')).toHaveText('0 – 0');
  await page.getByRole('button', { name: 'Inicio del partido', exact: true }).click();
  await expect(page.getByTestId('trial-comment')).toContainText('Arranca el partido');
  await page.getByRole('textbox', { name: 'Usuario de la comunidad', exact: true }).fill('Eva');
  await page
    .getByRole('textbox', { name: 'Mensaje de la comunidad', exact: true })
    .fill('Samu, ¿cómo ves al Celta?');
  await page.getByRole('button', { name: 'Enviar a la comunidad', exact: true }).click();
  await page.getByRole('button', { name: 'Terminar lectura simulada', exact: true }).click();
  await expect(page.getByTestId('trial-community')).toContainText('SamuIA está respondiendo', {
    timeout: 10000,
  });
  await expect(page.getByTestId('trial-comment')).toContainText('Celta 0 - 0 Dépor', {
    timeout: 10000,
  });
  await page.getByRole('button', { name: 'Terminar lectura simulada', exact: true }).click();
  await expect(page.getByTestId('trial-community')).toContainText('Respondido');
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await page.getByRole('button', { name: 'Partido de prueba', exact: true }).click();
  await expect(page.getByTestId('trial-community')).toContainText('Eva');
  await page.getByRole('button', { name: 'Nuevo partido de prueba', exact: true }).click();
  await expect(page.getByTestId('trial-status')).toHaveText('Próximo');
  await expect(page.getByTestId('trial-community')).not.toContainText('Eva');
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await page.getByRole('button', { name: 'Partido de prueba', exact: true }).click();
  await expect(page.getByTestId('trial-status')).toHaveText('Próximo');
  const after = await (await request.get('/api/state')).json();
  const scores = (s: typeof after) =>
    s.activeMatches.map((m: { id: string; score: unknown; events: unknown[] }) => ({
      id: m.id,
      score: m.score,
      events: m.events.length,
    }));
  expect(scores(after)).toEqual(scores(before));
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId('trial-score')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: '.local/match-trial-mobile.png', fullPage: true });
});
