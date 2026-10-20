import { test, expect } from '@playwright/test';
import type { AddressInfo } from 'node:net';
import { createStudioServer } from '../../apps/server/src/server';
import { VoiceStudioService } from '../../apps/server/src/voice-studio';
import { RemoteVoiceProvider } from '../../apps/server/src/voice-providers';
import { fixtureWav } from '../fixtures/voice-audio';
import type { SpeechSynthesisProvider } from '../../packages/voice/src/index';
function fixtureStudio() {
  const provider: SpeechSynthesisProvider = {
    id: 'openai',
    isAvailable: () => true,
    getVoices: async () => [],
    capabilities: () => ({
      ...new RemoteVoiceProvider('openai', {
        OPENAI_API_KEY: 'fixture-only',
        OPENAI_VOICE_CONSENT_TEXT: 'Test fixture consent, not a real account',
      }).capabilities(),
      name: 'Fixture OpenAI (no real cloning)',
    }),
    createVoice: async () => ({
      id: 'voice_fixture_only',
      consentId: 'cons_fixture_only',
      verificationRequired: false,
    }),
    generateSpeech: async () => ({ audio: new Uint8Array(fixtureWav(3)), mime: 'audio/wav' }),
  };
  return new VoiceStudioService({}, { directory: null, providers: [provider], flite: null });
}
async function serve(voiceStudio: VoiceStudioService) {
  await voiceStudio.ready;
  const app = createStudioServer({ voiceStudio });
  await new Promise<void>((r) => app.server.listen(0, '127.0.0.1', r));
  return { app, base: `http://127.0.0.1:${(app.server.address() as AddressInfo).port}` };
}
test('Voice Studio: fixture clone → default → actual playback → critical goal → own broadcast signal', async ({
  page,
}) => {
  test.setTimeout(60000);
  const { app, base } = await serve(fixtureStudio());
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.goto(base);
    await page.getByRole('button', { name: 'Voice Studio', exact: true }).click();
    await page.getByLabel('Nombre del perfil de voz').fill('Samuel Voice · fixture');
    await page.getByRole('button', { name: 'Crear perfil', exact: true }).click();
    await expect(page.getByLabel('VOICE PROFILE', { exact: true })).not.toHaveValue('');
    const id = await page.getByLabel('VOICE PROFILE', { exact: true }).inputValue();
    for (const role of ['sample', 'consent']) {
      await page.getByLabel('Tipo de grabación').selectOption(role);
      await page
        .getByLabel('Subir muestra de voz')
        .setInputFiles({ name: 'own-test.wav', mimeType: 'audio/wav', buffer: fixtureWav() });
      await page
        .getByRole('button', {
          name: `Enviar ${role === 'sample' ? 'muestra' : 'consentimiento'} al servidor privado`,
          exact: true,
        })
        .click();
      await expect(page.getByText(`${role} validado`, { exact: false })).toBeVisible();
    }
    await page.getByLabel('Esta es mi propia voz', { exact: false }).check();
    await page.getByRole('button', { name: 'CREATE CUSTOM VOICE', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Usar como DEFAULT VOICE', exact: true }),
    ).toBeEnabled();
    await page.getByRole('button', { name: 'Usar como DEFAULT VOICE', exact: true }).click();
    await expect(page.getByLabel('DEFAULT VOICE', { exact: true })).toHaveValue(id);
    await page.getByLabel('Voice enabled', { exact: true }).check();
    await page.getByRole('button', { name: 'SPEAK / SAY NOW', exact: true }).click();
    await expect
      .poll(async () => {
        const s = await (await page.request.get(base + '/api/state')).json();
        return s.voice.status;
      })
      .toBe('playing');
    await expect
      .poll(async () => {
        const s = await (await page.request.get(base + '/api/state')).json();
        return s.voice.audioLevel;
      })
      .toBeGreaterThan(0.01);
    await page.request.post(base + '/api/command', {
      data: { type: 'event', matchId: 'celta-madrid', eventType: 'goal', side: 'home' },
    });
    await expect
      .poll(async () => {
        const s = await (await page.request.get(base + '/api/state')).json();
        return s.voice.reaction?.source;
      })
      .toBe('match:goal');
    const goal = await (await page.request.get(base + '/api/state')).json();
    expect(goal.voice.reaction.matchId).toBe('celta-madrid');
    expect(goal.voice.currentVoice).toBe('Samuel Voice · fixture');
    await expect
      .poll(async () => {
        const s = await (await page.request.get(base + '/api/state')).json();
        return s.voice.status;
      })
      .toBe('playing');
    await page.getByRole('button', { name: 'Multiplataforma', exact: true }).click();
    await page.getByRole('button', { name: 'Prueba local codificada', exact: true }).click();
    await page.request.post(base + '/api/command', {
      data: { type: 'event', matchId: 'celta-madrid', eventType: 'goal', side: 'home' },
    });
    await expect
      .poll(
        async () => {
          const s = await (await page.request.get(base + '/api/state')).json();
          return Math.min(
            s.multiplatform.broadcast.encodedBytes.landscape,
            s.multiplatform.broadcast.encodedBytes.portrait,
          );
        },
        { timeout: 20000 },
      )
      .toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Parar directo', exact: true }).click();
    expect(errors).toEqual([]);
    await page.getByRole('button', { name: 'Voice Studio', exact: true }).click();
    await page.getByRole('button', { name: 'SPEAK / SAY NOW', exact: true }).click();
    await expect
      .poll(async () => {
        const s = await (await page.request.get(base + '/api/state')).json();
        return s.voice.status;
      })
      .toBe('playing');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.getByRole('button', { name: 'Partido de prueba', exact: true }).click();
    await expect
      .poll(async () => {
        const s = await (await page.request.get(base + '/api/state')).json();
        return s.voice.status;
      })
      .toBe('cancelled');
    await page.getByRole('button', { name: 'Voice Studio', exact: true }).click();
    await page.getByRole('button', { name: 'SPEAK / SAY NOW', exact: true }).click();
    await expect
      .poll(async () => {
        const s = await (await page.request.get(base + '/api/state')).json();
        return s.voice.status;
      })
      .toBe('playing');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.screenshot({ path: '.local/voice-studio.png', fullPage: true });
  } finally {
    app.stop();
  }
});
test('missing credentials keep the existing simulation and never report a cloned voice as ready', async ({
  page,
}) => {
  const { app, base } = await serve(new VoiceStudioService({}, { directory: null, flite: null }));
  try {
    await page.goto(base);
    await page.getByRole('button', { name: 'Voice Studio', exact: true }).click();
    await page.getByRole('button', { name: 'Crear perfil', exact: true }).click();
    await expect(
      page.getByText('Not configured: falta la API key del proveedor', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'CREATE CUSTOM VOICE', exact: true }),
    ).toBeDisabled();
    await page.getByLabel('Voice enabled', { exact: true }).check();
    await page.getByRole('button', { name: 'SPEAK / SAY NOW', exact: true }).click();
    await expect
      .poll(async () => {
        const s = await (await page.request.get(base + '/api/state')).json();
        return s.voice.provider;
      })
      .toBe('simulation');
    const state = await (await page.request.get(base + '/api/state')).json();
    expect(state.voice.audible).toBe(false);
    expect(state.voiceStudio.profiles.at(-1)).toMatchObject({
      providerVoiceId: '',
      status: 'not-configured',
    });
  } finally {
    app.stop();
  }
});
test('browser recording can be reviewed, uploaded, validated and deleted without retaining public audio', async ({
  page,
}) => {
  const { app, base } = await serve(fixtureStudio());
  try {
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = async () => {
        const ctx = new AudioContext();
        await ctx.resume();
        const oscillator = ctx.createOscillator(),
          destination = ctx.createMediaStreamDestination();
        oscillator.connect(destination);
        oscillator.start();
        return destination.stream;
      };
    });
    await page.goto(base);
    await page.getByRole('button', { name: 'Voice Studio', exact: true }).click();
    await page.getByRole('button', { name: 'Crear perfil', exact: true }).click();
    await expect(page.getByLabel('VOICE PROFILE', { exact: true })).not.toHaveValue('');
    await page.getByRole('button', { name: 'RECORD VOICE SAMPLE', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Parar grabación', exact: true })).toBeEnabled();
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: 'Parar grabación', exact: true }).click();
    await expect(page.locator('audio')).toHaveAttribute('src', /^blob:/);
    await page
      .getByRole('button', { name: 'Enviar muestra al servidor privado', exact: true })
      .click();
    await expect(page.getByText('sample validado', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Borrar sample', exact: true }).click();
    await expect(page.getByText('sample validado', { exact: false })).toHaveCount(0);
    expect((await page.request.get(base + '/samuia/samples/voice.wav')).status()).toBe(404);
  } finally {
    app.stop();
  }
});
