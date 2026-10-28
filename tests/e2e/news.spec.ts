import { test, expect } from '@playwright/test';
import { createStudioServer } from '../../apps/server/src/server';
import type { AddressInfo } from 'node:net';
import { readFile } from 'node:fs/promises';

test('NOTICIAS: aprobar, editar, emitir, pausar, terminar y volver al fútbol', async ({ page }) => {
  test.setTimeout(90000);
  const app = createStudioServer({ newsStorageFile: null });
  await new Promise<void>((r) => app.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  try {
    await page.goto(base);
    await page.getByLabel('Modalidad de programa', { exact: true }).selectOption('NOTICIAS');
    await expect(page.getByTestId('news-story')).toHaveCount(9);
    for (const index of [0, 1])
      await page
        .getByTestId('news-story')
        .nth(index)
        .getByRole('button', { name: 'Aprobar contenido', exact: true })
        .click();
    await page.getByLabel('Cantidad de noticias', { exact: true }).fill('2');
    await page.getByLabel('Incluir preguntas del chat', { exact: true }).uncheck();
    await page.getByRole('button', { name: 'Crear escaleta', exact: true }).click();
    await expect(page.locator('.news-cue')).toHaveCount(5);
    await expect(
      page.getByRole('button', { name: 'Iniciar informativo', exact: true }),
    ).toBeDisabled();
    await page
      .getByLabel('Guion 1', { exact: true })
      .fill('Hola, soy SamuIA. Comenzamos este informativo ficticio de demostración.');
    await page.getByRole('button', { name: 'Guardar intervención 1', exact: true }).click();
    await page.getByRole('button', { name: 'Aprobar escaleta', exact: true }).click();
    await page.getByRole('button', { name: 'Iniciar informativo', exact: true }).click();
    await expect(page.getByTestId('news-current-script')).toContainText('informativo ficticio');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: '.local/samuia-news-desk.png', fullPage: false });
    await page.getByRole('button', { name: 'Pausar informativo', exact: true }).click();
    await expect(page.getByTestId('news-program-status')).toContainText('Pausado');
    await page.getByRole('button', { name: 'Reanudar informativo', exact: true }).click();
    for (let i = 0; i < 5; i++) {
      await expect(page.getByTestId('news-program-status')).toContainText(`${i}/5`, {
        timeout: 12000,
      });
      const finish = page.getByRole('button', {
        name: 'Terminar intervención actual',
        exact: true,
      });
      await expect(finish).toBeEnabled({ timeout: 12000 });
      await finish.click();
    }
    await expect(page.getByTestId('news-program-status')).toContainText('Completado');
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.getByLabel('Modalidad de programa', { exact: true }).selectOption('DEPORTES');
    await expect(
      page.getByRole('heading', { name: 'Director de comentarios', exact: true }),
    ).toBeVisible();
  } finally {
    app.stop();
  }
});

test('noticiario portátil ficticio completo sin servidor, claves ni solicitudes de red', async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  const requests: string[] = [];
  page.on('request', (r) => {
    if (!r.isNavigationRequest() && /^https?:/.test(r.url())) requests.push(r.url());
  });
  const html = await readFile('.local/SamuIA-Live-Studio.html', 'utf8');
  await page.route('http://localhost/news-demo', (r) =>
    r.fulfill({ contentType: 'text/html', body: html }),
  );
  const start = new Date('2026-10-27T12:00:00Z');
  await page.clock.install({ time: start });
  await page.clock.pauseAt(new Date(start.getTime() + 1000));
  await context.setOffline(true);
  await page.goto('http://localhost/news-demo');
  await page.getByLabel('Modalidad de programa', { exact: true }).selectOption('NOTICIAS');
  await page.clock.runFor(250);
  await expect(page.getByTestId('news-story')).toHaveCount(9);
  await page
    .getByTestId('news-story')
    .first()
    .getByRole('button', { name: 'Aprobar contenido', exact: true })
    .click();
  await page.getByLabel('Cantidad de noticias', { exact: true }).fill('1');
  await page.getByLabel('Incluir preguntas del chat', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Crear escaleta', exact: true }).click();
  await page.getByRole('button', { name: 'Aprobar escaleta', exact: true }).click();
  await page.getByRole('button', { name: 'Iniciar informativo', exact: true }).click();
  for (let i = 0; i < 4; i++) {
    await expect(page.getByTestId('news-program-status')).toContainText(`${i}/4`);
    await page.getByRole('button', { name: 'Terminar intervención actual', exact: true }).click();
    await page.clock.runFor(4250);
  }
  await expect(page.getByTestId('news-program-status')).toContainText('Completado');
  expect(requests).toEqual([]);
});

test('última hora solo autorizada, rótulo y fuentes llegan a la composición de emisión', async ({
  page,
}) => {
  const app = createStudioServer({ newsStorageFile: null });
  await new Promise<void>((r) => app.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  await page.addInitScript(() => {
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
      if (this.canvas.closest('[data-testid^="compositor-"]')) {
        const target = window as Window & { newsDrawnTexts?: string[] };
        target.newsDrawnTexts = [...(target.newsDrawnTexts ?? []).slice(-600), text];
      }
      if (maxWidth === undefined) original.call(this, text, x, y);
      else original.call(this, text, x, y, maxWidth);
    };
  });
  const post = async (command: unknown) => {
    const r = await page.request.post(base + '/api/command', { data: command });
    expect(r.ok()).toBe(true);
    return r.json();
  };
  try {
    await page.goto(base);
    await page.getByLabel('Modalidad de programa', { exact: true }).selectOption('NOTICIAS');
    const state = await (await page.request.get(base + '/api/state')).json();
    const story = state.news.stories[0];
    await post({ type: 'news', action: 'review', id: story.id, review: 'approved' });
    await post({
      type: 'news',
      action: 'build',
      config: {
        categories: [story.category],
        durationMinutes: 5,
        count: 1,
        format: 'resumen',
        interaction: false,
        breaking: true,
      },
    });
    await post({ type: 'news', action: 'approve' });
    await post({ type: 'news', action: 'start' });
    const alert = await post({ type: 'news', action: 'demo-breaking' });
    const breaking = alert.news.stories.find((s: { breaking: boolean }) => s.breaking);
    await expect(page.getByTestId('news-headline')).not.toContainText('Última hora');
    await post({ type: 'news', action: 'review', id: breaking.id, review: 'approved' });
    await page.getByRole('button', { name: 'Autorizar interrupción', exact: true }).click();
    await expect(page.locator('.news-frame')).toHaveAttribute('data-presentation', 'ultima-hora');
    await expect(page.getByTestId('news-current-script')).toContainText('Demostración ficticia');
    await page.getByRole('button', { name: 'Multiplataforma', exact: true }).click();
    await expect(page.locator('[data-testid="compositor-landscape"] canvas')).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as Window & { newsDrawnTexts?: string[] }).newsDrawnTexts?.some((t) =>
              t.includes('Última hora'),
            ) ?? false,
        ),
      )
      .toBe(true);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as Window & { newsDrawnTexts?: string[] }).newsDrawnTexts?.some((t) =>
              t.includes('Fuentes:'),
            ) ?? false,
        ),
      )
      .toBe(true);
    await page.locator('[data-testid="compositor-landscape"] canvas').scrollIntoViewIfNeeded();
    await page.screenshot({ path: '.local/samuia-news-broadcast.png', fullPage: false });
    await post({ type: 'news', action: 'stop' });
  } finally {
    app.stop();
  }
});
