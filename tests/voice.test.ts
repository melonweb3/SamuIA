import { describe, expect, it, vi } from 'vitest';
import { ReactionDirector } from '../packages/core/src/index';
import {
  SimulatedVoiceProvider,
  VoiceController,
  type VoiceEvents,
  type VoiceProvider,
  type VoiceRequest,
} from '../packages/voice/src/index';
import { BrowserVoiceProvider } from '../apps/studio/src/browser-voice';

const request: VoiceRequest = {
  id: 'one',
  text: 'Hola, comunidade',
  emotion: 'sonrisa',
  energy: 70,
  durationMs: 2000,
};
function audioProvider() {
  const callbacks: VoiceEvents[] = [];
  const cancel = vi.fn(),
    pause = vi.fn(),
    resume = vi.fn();
  const provider: VoiceProvider = {
    name: 'Test audio',
    audible: true,
    durationMs: () => 2000,
    play: (_request, events) => {
      callbacks.push(events);
      return { cancel, pause, resume };
    },
  };
  return { provider, callbacks, cancel, pause, resume };
}
const preview = {
  type: 'avatar-simulate',
  animation: 'goal',
  intensity: 0.8,
  text: '¡Gol del Celta!',
  gaze: 'camera',
} as const;

describe('VoiceController: lifecycle independent of provider', () => {
  it('simulates a clock with a real pause and resume, ending exactly once', () => {
    const controller = new VoiceController();
    controller.start(new SimulatedVoiceProvider(), request, 1000);
    controller.pause(1500);
    controller.tick(9000);
    expect(controller.snapshot()).toMatchObject({
      status: 'paused',
      positionMs: 500,
      audible: false,
    });
    controller.resume(10000);
    controller.tick(11499);
    expect(controller.active).toBe(true);
    controller.tick(11500);
    expect(controller.snapshot().status).toBe('ended');
    expect(controller.finish('one')).toBe(false);
  });
  it('waits for audio start and end instead of expiring its duration estimate', () => {
    const { provider, callbacks } = audioProvider();
    const controller = new VoiceController();
    controller.start(provider, request, 1000);
    controller.tick(6000);
    expect(controller.snapshot()).toMatchObject({ status: 'preparing', positionMs: 0 });
    callbacks[0].started(6100);
    controller.tick(12000);
    expect(controller.snapshot().status).toBe('playing');
    expect(controller.active).toBe(true);
    callbacks[0].ended(13000);
    expect(controller.snapshot().status).toBe('ended');
  });
  it('rejects stale callbacks after replacement and cancellation', () => {
    const { provider, callbacks, cancel } = audioProvider();
    const controller = new VoiceController();
    controller.start(provider, request, 1000);
    controller.start(provider, { ...request, id: 'two' }, 1100);
    callbacks[0].started(1200);
    callbacks[0].ended(1200);
    callbacks[0].failed('old failure', 1200);
    expect(controller.snapshot()).toMatchObject({
      utteranceId: 'two',
      status: 'preparing',
      error: null,
    });
    controller.cancel();
    callbacks[1].started(1300);
    callbacks[1].ended(1400);
    expect(controller.snapshot().status).toBe('cancelled');
    expect(cancel).toHaveBeenCalledTimes(2);
  });
  it('recovers from errors, missing startup callbacks and a missing audio end', () => {
    for (const scenario of ['throw', 'error', 'no-start', 'no-end']) {
      const { provider, callbacks } = audioProvider();
      if (scenario === 'throw')
        provider.play = () => {
          throw new Error('Unavailable');
        };
      const controller = new VoiceController();
      controller.start(provider, request, 1000);
      if (scenario === 'error') callbacks[0].failed('Unavailable', 1100);
      if (scenario === 'no-start') controller.tick(11001);
      if (scenario === 'no-end') {
        callbacks[0].started(1100);
        controller.tick(121101);
      }
      expect(controller.snapshot().status).toBe('error');
      expect(controller.active).toBe(false);
      controller.start(new SimulatedVoiceProvider(), request, 130000);
      expect(controller.snapshot()).toMatchObject({ status: 'playing', error: null });
    }
  });
  it('does not reset the playback timeout when audio sends regular progress', () => {
    const { provider, callbacks } = audioProvider();
    const controller = new VoiceController();
    controller.start(provider, request, 1000);
    callbacks[0].started(1000);
    for (let now = 2000; now <= 122000; now += 1000) {
      callbacks[0].timing(now - 1000, 200000, [], now);
      controller.tick(now);
    }
    expect(controller.snapshot().status).toBe('error');
    expect(controller.active).toBe(false);
  });
  it('accepts measured visemes and rejects malformed or stale timing', () => {
    const { provider, callbacks } = audioProvider();
    const controller = new VoiceController();
    controller.start(provider, request, 1000);
    callbacks[0].started(1000);
    const cues = [{ atMs: 0, durationMs: 4000, viseme: 'aa', weight: 1 }] as const;
    callbacks[0].timing(500, 4000, [...cues], 1500);
    expect(controller.snapshot()).toMatchObject({
      sync: 'audio-visemes',
      positionMs: 500,
      durationMs: 4000,
    });
    callbacks[0].timing(NaN, 0, [], 1600);
    callbacks[0].timing(500, 4000, [{ ...cues[0], weight: 2 }], 1600);
    expect(controller.snapshot().cues).toEqual(cues);
    controller.cancel();
    callbacks[0].timing(0, 1000, [], 1700);
    expect(controller.snapshot().durationMs).toBe(4000);
  });
});

describe('ReactionDirector voice and avatar synchronization', () => {
  it('keeps lips closed during buffering and pause; queues a goal until audio ends', () => {
    const { provider, callbacks, pause, resume } = audioProvider();
    const director = new ReactionDirector(1000, false);
    director.voice = provider;
    director.command(preview, 1000);
    director.tick(4000);
    expect(director.snapshot(4000).animation).toMatchObject({
      speaking: false,
      mouth: { open: 0 },
    });
    expect(director.snapshot(4000).voice.status).toBe('preparing');
    callbacks[0].started(4100);
    director.tick(4200);
    expect(director.snapshot(4200).animation.speaking).toBe(true);
    director.pauseVoice(4300);
    director.tick(50000);
    expect(director.snapshot(50000).animation).toMatchObject({
      speaking: false,
      mouth: { open: 0 },
    });
    expect(director.busy).toBe(true);
    director.command(
      { type: 'event', matchId: director.manager.mainMatchId!, eventType: 'goal', side: 'home' },
      50000,
    );
    expect(director.scheduler.sportsEventQueue).toHaveLength(1);
    director.resumeVoice(51000);
    director.tick(51100);
    expect(director.snapshot(51100).animation.speaking).toBe(true);
    expect(pause).toHaveBeenCalledOnce();
    expect(resume).toHaveBeenCalledOnce();
    callbacks[0].ended(51200);
    director.tick(51200);
    expect(director.state).toBe('COOLDOWN');
    director.tick(56000);
    expect(director.history).toHaveLength(2);
    expect(director.snapshot(56000).animation.requestedAnimation).toBe('goal');
  });
  it('finishing a reading cancels actual audio; errors release the actor and keep the comment', () => {
    const { provider, callbacks, cancel } = audioProvider();
    const director = new ReactionDirector(1000, false);
    director.voice = provider;
    director.command(preview, 1000);
    const id = director.snapshot(1000).animation.speech!.id;
    director.voiceEnded(id, 1100);
    expect(cancel).toHaveBeenCalledOnce();
    callbacks[0].started(1200);
    expect(director.snapshot(1200).animation.speaking).toBe(false);
    director.command(preview, 2000);
    callbacks[1].failed('No audio device', 2100);
    director.tick(2100);
    expect(director.state).toBe('COOLDOWN');
    expect(director.snapshot(2100).voice.error).toBe('No audio device');
    expect(director.history).toHaveLength(2);
  });
});

describe('browser TTS adapter', () => {
  it('uses a local voice and forwards start, end, pause, resume and cancellation', () => {
    class Utterance {
      voice = null;
      lang = '';
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror = null;
      constructor(public text: string) {}
    }
    vi.stubGlobal('SpeechSynthesisUtterance', Utterance);
    try {
      const synth = { speak: vi.fn(), cancel: vi.fn(), pause: vi.fn(), resume: vi.fn() };
      const voice = { localService: true, lang: 'es-ES' } as SpeechSynthesisVoice;
      const provider = new BrowserVoiceProvider(voice, synth as unknown as SpeechSynthesis);
      const events: VoiceEvents = {
        started: vi.fn(),
        ended: vi.fn(),
        timing: vi.fn(),
        failed: vi.fn(),
      };
      const playback = provider.play(request, events);
      const utterance = synth.speak.mock.calls[0][0] as Utterance;
      expect(utterance.voice).toBe(voice);
      expect(utterance.text).toBe(request.text);
      utterance.onstart!();
      utterance.onend!();
      expect(events.started).toHaveBeenCalledOnce();
      expect(events.ended).toHaveBeenCalledOnce();
      playback.pause();
      playback.resume();
      Object.assign(synth, { paused: true });
      playback.cancel();
      expect(synth.pause).toHaveBeenCalledOnce();
      expect(synth.resume).toHaveBeenCalledTimes(2);
      expect(synth.cancel).toHaveBeenCalledOnce();
      expect(utterance.onstart).toBeNull();
      expect(
        () =>
          new BrowserVoiceProvider(
            { ...voice, localService: false },
            synth as unknown as SpeechSynthesis,
          ),
      ).toThrow('localmente');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
