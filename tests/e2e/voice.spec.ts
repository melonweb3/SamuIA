import { test, expect } from '@playwright/test';

test('voz simulada: pausa congela reloj y boca; reanudar y silenciar libera la cola', async ({
  page,
}) => {
  await page.goto('/#partido-prueba');
  await page.getByRole('checkbox', { name: 'Lectura rápida', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Siguiente paso', exact: true }).click();
  await expect(page.getByTestId('trial-voice-status')).toHaveText('playing');
  await expect(page.getByTestId('trial-pipeline')).toContainText('Comentario publicado');
  await page.getByRole('button', { name: 'Pausar voz', exact: true }).click();
  await expect(page.getByTestId('trial-voice-status')).toHaveText('paused');
  const clock = await page.getByTestId('trial-voice-clock').textContent();
  await page.waitForTimeout(900);
  await expect(page.getByTestId('trial-voice-clock')).toHaveText(clock!);
  await expect(page.getByTestId('trial-pipeline')).toContainText('boca 0%');
  await expect(page.getByRole('button', { name: 'Siguiente paso', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Reanudar voz', exact: true }).click();
  await expect(page.getByTestId('trial-voice-status')).toHaveText('playing');
  await page.getByRole('button', { name: 'Silenciar voz', exact: true }).click();
  await expect(page.getByTestId('trial-voice-status')).toHaveText('cancelled');
  await expect(page.getByTestId('trial-reaction')).toHaveText('idle');
  await expect(page.getByRole('button', { name: 'Siguiente paso', exact: true })).toBeEnabled();
  await expect(page.locator('.trial-commentary-log article')).toHaveCount(1);
});

test('adaptador audible: espera inicio real, pausa, error recuperable y cancelación al reiniciar', async ({
  page,
}) => {
  // Fake the OS device, not the application or director; no claim of audible sound in CI.
  await page.addInitScript(() => {
    class TestUtterance {
      voice = null;
      lang = '';
      onstart = null;
      onend = null;
      onerror = null;
      constructor(public text: string) {}
    }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      configurable: true,
      value: TestUtterance,
    });
    const voice = {
      name: 'Español local de prueba',
      voiceURI: 'test-es',
      lang: 'es-ES',
      localService: true,
      default: true,
    };
    let current: SpeechSynthesisUtterance | null = null;
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        getVoices: () => [voice],
        addEventListener() {},
        removeEventListener() {},
        speak: (u: SpeechSynthesisUtterance) => {
          current = u;
        },
        cancel: () => {
          current = null;
        },
        pause() {},
        resume() {},
      },
    });
    Object.assign(window, {
      testVoice: {
        start: () => current?.onstart?.({} as SpeechSynthesisEvent),
        fail: () => current?.onerror?.({ error: 'audio-busy' } as SpeechSynthesisErrorEvent),
        active: () => !!current,
      },
    });
  });
  await page.goto('/#partido-prueba');
  await page.getByLabel('Proveedor de voz', { exact: true }).selectOption('test-es');
  await page.getByRole('button', { name: 'Siguiente paso', exact: true }).click();
  await expect(page.getByTestId('trial-voice-status')).toHaveText('preparing');
  await expect(page.getByTestId('trial-pipeline')).toContainText('boca 0%');
  await page.evaluate(() =>
    (window as unknown as { testVoice: { start(): void } }).testVoice.start(),
  );
  await expect(page.getByTestId('trial-voice-status')).toHaveText('playing');
  await page.getByRole('button', { name: 'Pausar voz', exact: true }).click();
  await expect(page.getByTestId('trial-voice-status')).toHaveText('paused');
  await page.getByRole('button', { name: 'Reanudar voz', exact: true }).click();
  await page.evaluate(() =>
    (window as unknown as { testVoice: { fail(): void } }).testVoice.fail(),
  );
  await expect(page.getByTestId('trial-voice-status')).toHaveText('error');
  await expect(page.getByRole('alert')).toContainText('audio-busy');
  await expect(page.getByRole('button', { name: 'Siguiente paso', exact: true })).toBeEnabled();
  await page.getByLabel('Proveedor de voz', { exact: true }).selectOption('simulation');
  await page.getByRole('button', { name: 'Siguiente paso', exact: true }).click();
  await expect(page.getByTestId('trial-voice-status')).toHaveText('playing');
  await page.getByRole('button', { name: 'Nuevo partido de prueba', exact: true }).click();
  await expect(page.getByTestId('trial-voice-status')).toHaveText('idle');
  await expect(page.getByTestId('trial-score')).toHaveText('0 – 0');
  expect(
    await page.evaluate(() =>
      (window as unknown as { testVoice: { active(): boolean } }).testVoice.active(),
    ),
  ).toBe(false);
});
