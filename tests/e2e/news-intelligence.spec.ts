import { test, expect } from '@playwright/test';
import { createStudioServer } from '../../apps/server/src/server';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
test('IA con proveedor simulado: generar, revisar, guardar y recuperar tras reiniciar', async ({
  page,
}) => {
  test.setTimeout(90000);
  const dir = mkdtempSync(join(tmpdir(), 'samuia-news-browser-')),
    file = join(dir, 'state.json');
  let calls = 0;
  const create = () =>
    createStudioServer({
      newsStorageFile: file,
      newsEnv: { OPENAI_API_KEY: 'private-server-test' },
      newsGenerate: async (request) => {
        calls++;
        const data = JSON.parse(request.input);
        return {
          text: JSON.stringify({
            text: data.stories.length
              ? 'La fuente describe un acontecimiento ficticio. No se aportan más detalles.'
              : 'Soy SamuIA. Continuamos este programa con las fuentes disponibles.',
            sourceIds: data.stories.flatMap((s: { sources: { id: string }[] }) =>
              s.sources.map((v) => v.id),
            ),
          }),
          tokens: 120,
        };
      },
    });
  let app = create();
  const listen = async () => {
    await new Promise<void>((r) => app.server.listen(0, '127.0.0.1', r));
    return `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  };
  try {
    await page.goto(await listen());
    await page.getByLabel('Modalidad de programa', { exact: true }).selectOption('NOTICIAS');
    await page.getByLabel('Modo de inteligencia', { exact: true }).selectOption('IA REAL');
    await page.getByRole('button', { name: 'Guardar configuración de IA', exact: true }).click();
    await expect(
      page.getByText('Credencial configurada en el servidor', { exact: false }),
    ).toBeVisible();
    await page.getByLabel('Cantidad de noticias', { exact: true }).fill('1');
    await page.getByLabel('Incluir preguntas del chat', { exact: true }).uncheck();
    await page.getByRole('button', { name: 'Generar informativo', exact: true }).click();
    await expect(page.locator('.news-cue')).toHaveCount(4);
    expect(calls).toBe(4);
    await expect(page.getByLabel('Guion 3', { exact: true })).toHaveValue(
      /acontecimiento ficticio/,
    );
    await page.getByRole('button', { name: 'Aprobar escaleta', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('pendientes');
    for (const button of await page
      .getByRole('button', { name: 'Aprobar contenido', exact: true })
      .all())
      await button.click();
    await page.getByRole('button', { name: 'Aprobar escaleta', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Iniciar informativo', exact: true }),
    ).toBeEnabled();
    await page.getByRole('button', { name: 'Guardar programa en archivo', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Recuperar programa', exact: true })).toHaveCount(
      1,
    );
    await page.getByRole('button', { name: 'Iniciar informativo', exact: true }).click();
    await expect(page.getByTestId('news-current-script')).toContainText('Soy SamuIA');
    app.stop();
    app = create();
    await page.goto(await listen());
    await page.getByLabel('Modalidad de programa', { exact: true }).selectOption('NOTICIAS');
    await expect(page.getByTestId('news-program-status')).toContainText('Borrador');
    await expect(page.getByTestId('news-program-status')).toContainText('Pendiente de aprobación');
    await expect(page.getByLabel('Modo de inteligencia', { exact: true })).toHaveValue('IA REAL');
    await page.getByRole('button', { name: 'Recuperar programa', exact: true }).click();
    await expect(page.locator('.news-cue')).toHaveCount(4);
    expect(readFileSync(file, 'utf8')).not.toContain('private-server-test');
    expect(await page.content()).not.toContain('private-server-test');
  } finally {
    app.stop();
    rmSync(dir, { recursive: true, force: true });
  }
});
