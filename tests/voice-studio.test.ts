import { fixtureWav } from './fixtures/voice-audio';
import { describe, it, expect, vi } from 'vitest';
import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import {
  VoiceController,
  SimulatedVoiceProvider,
  type ReactionEvent,
  type VoiceEvents,
  type SpeechSynthesisProvider,
  type VoiceProfile,
} from '../packages/voice/src/index';
import { ReactionDirector } from '../packages/core/src/index';
import { RemoteVoiceProvider, VoiceApiError } from '../apps/server/src/voice-providers';
import { VoiceStudioService } from '../apps/server/src/voice-studio';
import { createStudioServer } from '../apps/server/src/server';
export function fixtureProvider(): SpeechSynthesisProvider {
  return {
    id: 'openai',
    isAvailable: () => true,
    capabilities: () => ({
      ...new RemoteVoiceProvider('openai', {
        OPENAI_API_KEY: 'fixture',
        OPENAI_VOICE_CONSENT_TEXT: 'Fixture consent only',
      }).capabilities(),
      name: 'Fixture · not a real clone',
    }),
    getVoices: async () => [],
    generateSpeech: vi.fn(async () => ({ audio: new Uint8Array(fixtureWav()), mime: 'audio/wav' })),
    createVoice: vi.fn(async () => ({
      id: 'voice_fixture',
      consentId: 'cons_fixture',
      verificationRequired: false,
    })),
  };
}
const reaction = (id: string, priority: ReactionEvent['priority'] = 'NORMAL'): ReactionEvent => ({
  id,
  source: 'test',
  text: 'Hola',
  emotion: 'neutral',
  intensity: 0.5,
  priority,
  interruptible: true,
  timestamp: 1000,
});
const request = (id: string, priority: ReactionEvent['priority'] = 'NORMAL') => ({
  id,
  text: 'Hola',
  emotion: 'neutral' as const,
  energy: 50,
  durationMs: 2000,
  reaction: reaction(id, priority),
});
describe('priority, queue, cancellation and critical match events', () => {
  it('deduplicates IDs, orders pending speech and rejects interrupted callbacks', () => {
    const events: VoiceEvents[] = [],
      cancel = vi.fn();
    const provider = {
      name: 'fixture',
      audible: true,
      durationMs: () => 2000,
      play: (_r: unknown, e: VoiceEvents) => {
        events.push(e);
        return { cancel, pause() {}, resume() {} };
      },
    };
    const c = new VoiceController();
    c.enqueue(provider, request('one'), 1000);
    events[0].started(1000);
    c.enqueue(provider, request('low', 'LOW'), 1100);
    c.enqueue(provider, request('high', 'HIGH'), 1200);
    expect(c.enqueue(provider, request('one'), 1200)).toBe(false);
    expect(c.snapshot().queueLength).toBe(2);
    c.enqueue(provider, request('goal', 'CRITICAL'), 1300);
    expect(cancel).toHaveBeenCalledOnce();
    expect(c.snapshot().reaction?.id).toBe('goal');
    events[0].ended(1400);
    expect(c.snapshot().utteranceId).toBe('goal');
    events[1].started(1400);
    events[1].ended(1500);
    c.tick(1501);
    expect(c.snapshot().utteranceId).toBe('high');
    c.cancel();
    c.tick(1600);
    expect(c.snapshot()).toMatchObject({
      status: 'cancelled',
      queueLength: 0,
      isSpeaking: false,
      audioLevel: 0,
    });
  });
  it('respects non-interruptible reactions and the disabled interrupt setting', () => {
    const c = new VoiceController(),
      p = new SimulatedVoiceProvider();
    c.enqueue(
      p,
      { ...request('one'), reaction: { ...reaction('one'), interruptible: false } },
      1000,
    );
    c.enqueue(p, request('goal', 'CRITICAL'), 1100);
    expect(c.snapshot().utteranceId).toBe('one');
    c.cancel();
    c.configureInterrupts(false);
    c.enqueue(p, request('two'), 2000);
    c.enqueue(p, request('goal2', 'CRITICAL'), 2100);
    expect(c.snapshot().utteranceId).toBe('two');
  });
  it('routes operator text through the brain, queues normal messages and interrupts with a goal', () => {
    const d = new ReactionDirector(1000, false);
    d.interruptVoiceEnabled = true;
    d.operator(
      { ...reaction('manual'), matchId: 'celta-madrid', emotion: 'thinking' },
      false,
      1000,
    );
    d.operator({ ...reaction('queued'), text: 'Después' }, false, 1100);
    expect(d.snapshot(1100).voice.queueLength).toBe(1);
    expect(d.operator(reaction('queued'), false, 1150)).toBe(false);
    d.command({ type: 'event', matchId: 'celta-madrid', eventType: 'goal', side: 'home' }, 1200);
    expect(d.snapshot(1200).voice.reaction).toMatchObject({
      source: 'match:goal',
      matchId: 'celta-madrid',
      priority: 'CRITICAL',
      emotion: 'celebrating',
    });
    expect(d.history[0].sourceIds).toContain(d.manager.get('celta-madrid').events.at(-1)!.id);
    expect(d.snapshot(1200).voice.queueLength).toBe(1);
  });
  it('measured amplitude drives the avatar and expires without stale mouth movement', () => {
    let events: VoiceEvents | undefined;
    const d = new ReactionDirector(1000, false);
    d.voice = {
      name: 'real fixture audio',
      audible: true,
      durationMs: () => 2000,
      play: (_r, e) => {
        events = e;
        return { cancel() {}, pause() {}, resume() {} };
      },
    };
    d.operator(reaction('audio'), false, 1000);
    events!.started(1100);
    events!.level!(0.8, 1200);
    d.tick(1200);
    expect(d.snapshot(1200).animation.mouth.open).toBe(0.8);
    expect(d.snapshot(1900).animation.mouth.open).toBe(0);
    d.command({ type: 'control', action: 'silence' }, 2000);
    events!.level!(1, 2100);
    expect(d.snapshot(2100).animation.mouth.open).toBe(0);
  });
});
describe('official provider adapters with HTTP fixtures (no accounts)', () => {
  it('fails without keys and does not claim a custom voice exists', async () => {
    const fetcher = vi.fn(),
      p = new RemoteVoiceProvider('openai', {}, fetcher);
    expect(p.isAvailable()).toBe(false);
    await expect(
      p.createVoice('Samuel', new Blob(['sample']), null, new AbortController().signal),
    ).rejects.toThrow('consent-required');
    expect(fetcher).not.toHaveBeenCalled();
    expect(p.capabilities().requirements.minimumSeconds).toBeNull();
  });
  it('uploads OpenAI consent first and sends its actual ID to voice creation', async () => {
    const fetcher = vi.fn(async (_url: unknown, _init?: RequestInit) => {
      void _url;
      void _init;
      return new Response(
        JSON.stringify({ id: fetcher.mock.calls.length === 1 ? 'cons_123' : 'voice_123' }),
        { status: 200 },
      );
    });
    const p = new RemoteVoiceProvider(
      'openai',
      {
        OPENAI_API_KEY: 'private-test-key',
        OPENAI_VOICE_CONSENT_TEXT: 'Official phrase configured by operator',
      },
      fetcher as typeof fetch,
    );
    const result = await p.createVoice(
      'Samuel',
      new Blob([fixtureWav()], { type: 'audio/wav' }),
      new Blob([fixtureWav()], { type: 'audio/wav' }),
      new AbortController().signal,
    );
    expect(result).toEqual({ id: 'voice_123', consentId: 'cons_123', verificationRequired: false });
    expect(String(fetcher.mock.calls[0][0]).endsWith('/audio/voice_consents')).toBe(true);
    expect((fetcher.mock.calls[1][1]!.body as FormData).get('consent')).toBe('cons_123');
    const profile: VoiceProfile = {
      id: 's',
      name: 'Samuel',
      provider: 'openai',
      providerVoiceId: result.id,
      type: 'cloned',
      isDefault: true,
      createdAt: 0,
      status: 'ready',
    };
    fetcher.mockImplementationOnce(async () => new Response(new Uint8Array(fixtureWav())));
    await p.generateSpeech(
      { ...reaction('s'), emotion: 'celebrating' },
      profile,
      1,
      new AbortController().signal,
    );
    expect(JSON.parse(fetcher.mock.calls[2][1]!.body as string)).toMatchObject({
      voice: { id: 'voice_123' },
      input: 'Hola',
      instructions: expect.stringContaining('celebrating'),
    });
  });
  it('preserves ElevenLabs verification and maps only supported controls', async () => {
    const fetcher = vi.fn(
      async () => new Response(JSON.stringify({ voice_id: 'el_123', requires_verification: true })),
    );
    const p = new RemoteVoiceProvider(
      'elevenlabs',
      { ELEVENLABS_API_KEY: 'private-test-key' },
      fetcher as typeof fetch,
    );
    expect(
      (
        await p.createVoice(
          'Samuel',
          new Blob([fixtureWav()], { type: 'audio/wav' }),
          null,
          new AbortController().signal,
        )
      ).verificationRequired,
    ).toBe(true);
    expect(p.capabilities().emotion).toBe(false);
    expect(p.capabilities().streaming).toBe(false);
    fetcher.mockImplementationOnce(
      async () =>
        new Response(
          JSON.stringify({ voice_id: 'el_123', voice_verification: { is_verified: false } }),
        ),
    );
    expect(await p.verifyVoice('el_123', new AbortController().signal)).toBe(false);
  });
  it('sanitizes HTTP failures rather than exposing response secrets', async () => {
    const p = new RemoteVoiceProvider(
      'openai',
      { OPENAI_API_KEY: 'do-not-leak' },
      async () => new Response('secret raw error', { status: 503 }),
    );
    await expect(
      p.generateSpeech(
        reaction('one'),
        {
          id: 'a',
          name: 'a',
          provider: 'openai',
          providerVoiceId: 'alloy',
          type: 'generic',
          createdAt: 0,
          isDefault: false,
          status: 'ready',
        },
        1,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'provider-http-503', retryable: true });
  });
});
describe('profiles, private storage, audio ownership and fallback', () => {
  it('validates actual audio, requires ownership and consent, clears samples and persists metadata only', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'voice-store-test-')),
      p = fixtureProvider(),
      service = new VoiceStudioService({}, { directory, providers: [p], flite: null });
    await service.ready;
    try {
      const profile = await service.createProfile('Samuel', 'openai');
      await expect(
        service.upload(profile.id, 'sample', Buffer.from('<script>'), 'audio/wav'),
      ).rejects.toThrow('invalid-audio-signature');
      await expect(
        service.upload(profile.id, 'sample', fixtureWav(), 'audio/mpeg'),
      ).rejects.toThrow('audio-mime-mismatch');
      await service.upload(profile.id, 'sample', fixtureWav(), 'audio/wav');
      await service.upload(profile.id, 'consent', fixtureWav(), 'audio/wav');
      await expect(service.createCustom(profile.id, false)).rejects.toThrow(
        'own-voice-consent-required',
      );
      await service.createCustom(profile.id, true);
      expect(service.snapshot().samples).toEqual([]);
      expect(service.snapshot().profiles.find((p) => p.id === profile.id)?.status).toBe('ready');
      await service.configure({ defaultVoiceProfile: profile.id, voiceEnabled: true, volume: 0.8 });
      const persisted = await readFile(join(directory, 'profiles.json'), 'utf8');
      expect(persisted).not.toContain('private-test-key');
      expect(persisted).not.toContain('RIFF');
      expect((await stat(join(directory, 'profiles.json'))).mode & 0o777).toBe(0o600);
      const restored = new VoiceStudioService({}, { directory, providers: [p], flite: null });
      await restored.ready;
      expect(restored.settings.defaultVoiceProfile).toBe(profile.id);
      expect(restored.settings.volume).toBe(0.8);
      restored.stop();
    } finally {
      service.stop();
      await rm(directory, { recursive: true, force: true });
    }
  });
  it('keeps missing-key profiles unconfigured and never fabricates clone IDs', async () => {
    const service = new VoiceStudioService({}, { directory: null, flite: null });
    await service.ready;
    const profile = await service.createProfile('Samuel', 'elevenlabs');
    await expect(service.createCustom(profile.id, true)).rejects.toThrow('provider-not-configured');
    expect(service.snapshot().profiles.find((p) => p.id === profile.id)).toMatchObject({
      status: 'not-configured',
      providerVoiceId: '',
    });
    service.stop();
  });
  it('retries retryable synthesis then uses configured fallback without blocking', async () => {
    const p = fixtureProvider();
    p.generateSpeech = vi.fn(async () => {
      throw new VoiceApiError('provider-http-503', true);
    });
    const service = new VoiceStudioService({}, { directory: null, providers: [p], flite: null });
    await service.ready;
    await service.configure({
      voiceEnabled: true,
      defaultVoiceProfile: 'openai-alloy',
      fallbackVoice: 'simulation',
    });
    const controller = new VoiceController();
    controller.start(service, request('one'), Date.now());
    await vi.waitFor(() => expect(controller.snapshot().status).toBe('playing'));
    expect(p.generateSpeech).toHaveBeenCalledTimes(2);
    expect(controller.snapshot()).toMatchObject({ provider: 'simulation', audible: false });
    expect(service.snapshot().logs.some((l) => l.code === 'fallback-activated')).toBe(true);
    controller.cancel();
    service.stop();
  });
  it('starts only on playback acknowledgment, rejects late IDs and prevents two owners', async () => {
    const service = new VoiceStudioService(
      {},
      { directory: null, providers: [fixtureProvider()], flite: null },
    );
    await service.ready;
    await service.configure({ voiceEnabled: true, defaultVoiceProfile: 'openai-alloy' });
    const token = service.claim();
    expect(() => service.claim()).toThrow('another-tab');
    expect(service.claim(token)).toBe(token);
    const controller = new VoiceController();
    controller.start(service, request('one'), Date.now());
    await vi.waitFor(() => expect(service.readyId()).toBe('one'));
    expect(controller.snapshot().status).toBe('preparing');
    expect(service.acknowledge('old', 'started')).toBe(false);
    service.acknowledge('one', 'started', 0, Date.now(), 200, 0.5);
    expect(controller.snapshot()).toMatchObject({
      status: 'playing',
      sync: 'audio-amplitude',
      audioLevel: 0.5,
    });
    service.acknowledge('one', 'ended', 200, Date.now(), 200);
    expect(controller.snapshot().status).toBe('ended');
    expect(service.audio('one')).toBeNull();
    service.stop();
  });
  it('cancellation discards a provider result that arrives after interruption', async () => {
    let resolveSpeech: ((value: { audio: Uint8Array; mime: string }) => void) | undefined;
    const p = fixtureProvider();
    p.generateSpeech = vi.fn(
      () =>
        new Promise<{ audio: Uint8Array; mime: string }>((resolve) => {
          resolveSpeech = resolve;
        }),
    );
    const service = new VoiceStudioService({}, { directory: null, providers: [p], flite: null });
    await service.ready;
    await service.configure({ voiceEnabled: true, defaultVoiceProfile: 'openai-alloy' });
    const c = new VoiceController();
    c.start(service, request('old'), Date.now());
    await vi.waitFor(() => expect(resolveSpeech).toBeDefined());
    c.cancel();
    resolveSpeech!({ audio: new Uint8Array(fixtureWav()), mime: 'audio/wav' });
    await Promise.resolve();
    expect(service.readyId()).toBeNull();
    expect(c.snapshot().status).toBe('cancelled');
    service.stop();
  });
});
it('HTTP manual and match flows use the same profile; audio is private and commands validated', async () => {
  const provider = fixtureProvider(),
    voiceStudio = new VoiceStudioService(
      {},
      { directory: null, providers: [provider], flite: null },
    );
  await voiceStudio.ready;
  const app = createStudioServer({ voiceStudio });
  await new Promise<void>((r) => app.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  const post = (body: unknown) =>
    fetch(base + '/api/voice/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  try {
    expect(
      (
        await post({
          action: 'speak',
          text: 'Hola',
          emotion: 'neutral',
          intensity: 0.4,
          priority: 'NORMAL',
        })
      ).status,
    ).toBe(409);
    expect((await post({ action: 'configure', patch: { apiKey: 'forbidden' } })).status).toBe(400);
    await post({
      action: 'configure',
      patch: { defaultVoiceProfile: 'openai-alloy', voiceEnabled: true },
    });
    const response = await post({
      action: 'speak',
      id: 'operator-one',
      text: 'GOOOL!',
      emotion: 'celebrating',
      intensity: 1,
      priority: 'NORMAL',
      matchId: 'celta-madrid',
    });
    expect(response.status).toBe(200);
    await vi.waitFor(() => expect(voiceStudio.readyId()).not.toBeNull());
    const first = voiceStudio.readyId()!;
    expect((await fetch(base + `/api/voice/audio?id=${first}`)).status).toBe(403);
    const token = (await (await post({ action: 'claim' })).json()).token;
    expect(
      (
        await fetch(base + `/api/voice/audio?id=${first}`, {
          headers: { 'X-Voice-Session': token },
        })
      ).status,
    ).toBe(200);
    await post({ action: 'playback', token, id: first, event: 'started', durationMs: 200 });
    await fetch(base + '/api/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'event',
        matchId: 'celta-madrid',
        eventType: 'goal',
        side: 'home',
      }),
    });
    await vi.waitFor(() => expect(provider.generateSpeech).toHaveBeenCalledTimes(2));
    const args = vi.mocked(provider.generateSpeech).mock.calls[1];
    expect(args[0]).toMatchObject({
      source: 'match:goal',
      matchId: 'celta-madrid',
      priority: 'CRITICAL',
    });
    expect(args[1].id).toBe('openai-alloy');
    expect((await post({ action: 'playback', token, id: first, event: 'ended' })).status).toBe(409);
    const state = JSON.stringify(await (await fetch(base + '/api/state')).json());
    expect(state).not.toContain('private-test-key');
    expect(state).not.toContain('audio/wav;base64');
  } finally {
    app.stop();
  }
});
