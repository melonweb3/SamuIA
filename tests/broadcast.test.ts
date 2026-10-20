import { describe, it, expect, vi } from 'vitest';
import {
  BroadcastOutputManager,
  type BroadcastOutput,
  type Encoder,
} from '../packages/broadcast/src/index';
import { RtmpBroadcastOutput, encoderArgs } from '../apps/server/src/broadcast-encoder';
import { BroadcastVoiceProvider } from '../apps/server/src/broadcast-voice';
import type { Composition, Platform } from '../packages/shared/src/index';
function output(platform: Platform, configured = true) {
  const callbacks: { current?: { live(): void; failed(): void } } = {};
  const adapter: BroadcastOutput = {
    platform,
    configured,
    metadataSupported: false,
    start: vi.fn((c) => {
      callbacks.current = c;
    }),
    write: vi.fn(() => true),
    stop: vi.fn(),
    updateMetadata: vi.fn(async () => {}),
  };
  return { adapter, callbacks };
}
function setup() {
  const packets = new Map<Composition, (p: Uint8Array) => void>(),
    errors = new Map<Composition, () => void>();
  const encoder: Encoder = {
    start: vi.fn((c, p, e) => {
      packets.set(c, p);
      errors.set(c, e);
    }),
    write: vi.fn(() => true),
    stop: vi.fn(),
  };
  const y = output('youtube'),
    t = output('twitch'),
    k = output('kick'),
    tt = output('tiktok');
  const manager = new BroadcastOutputManager(
    encoder,
    [y.adapter, t.adapter, k.adapter, tt.adapter],
    true,
    true,
    () => 'lease',
  );
  return { manager, encoder, packets, errors, y, t, k, tt };
}
describe('independent broadcast fanout', () => {
  it('shares landscape encoding and routes portrait only to TikTok; marks live only after confirmed output', () => {
    const s = setup();
    for (const p of ['youtube', 'twitch', 'kick', 'tiktok'] as const)
      s.manager.enable(p, true, 1000);
    const started = s.manager.start(1000);
    expect(started.compositions).toEqual(['landscape', 'portrait']);
    s.manager.ingest('lease', 'landscape', new Uint8Array([1]), 1100);
    s.manager.tick(1101);
    expect(s.manager.snapshot().destinations.every((d) => d.status === 'connecting')).toBe(true);
    s.packets.get('landscape')!(new Uint8Array([2]));
    s.packets.get('portrait')!(new Uint8Array([3]));
    for (const o of [s.y, s.t, s.k])
      expect(o.adapter.write).toHaveBeenCalledWith(new Uint8Array([2]));
    expect(s.tt.adapter.write).toHaveBeenCalledWith(new Uint8Array([3]));
    expect(s.tt.adapter.write).not.toHaveBeenCalledWith(new Uint8Array([2]));
    s.y.callbacks.current!.live();
    expect(s.manager.snapshot().destinations[0].status).toBe('live');
    s.manager.stop();
  });
  it('one destination failure reconnects without touching others; rejects stale callbacks after stop', () => {
    const s = setup();
    s.manager.enable('youtube', true, 1000);
    s.manager.enable('twitch', true, 1000);
    s.manager.start(1000);
    s.manager.ingest('lease', 'landscape', new Uint8Array([1]), 1100);
    s.manager.tick(1101);
    const old = s.y.callbacks.current!;
    old.failed();
    expect(s.manager.snapshot().destinations[0].status).toBe('reconnecting');
    expect(s.manager.snapshot().destinations[1].status).toBe('connecting');
    s.manager.stop();
    old.live();
    expect(s.manager.snapshot().destinations[0].status).toBe('ready');
    expect(s.manager.authorized('lease')).toBe(false);
    expect(() => s.manager.ingest('lease', 'landscape', new Uint8Array([1]))).toThrow('obsoleta');
  });
  it('isolates encoder failures by aspect ratio and stops when the browser producer is lost', () => {
    const s = setup();
    s.manager.enable('youtube', true, 1000);
    s.manager.enable('tiktok', true, 1000);
    s.manager.start(1000);
    s.errors.get('portrait')!();
    expect(s.manager.running).toBe(true);
    expect(s.manager.snapshot().destinations[3].status).toBe('error');
    s.manager.tick(17000);
    expect(s.manager.running).toBe(false);
    expect(s.manager.snapshot().logs[0].code).toBe('producer-timeout');
  });
  it('local encoded preview never opens a public destination, even if configured and enabled', () => {
    const s = setup();
    s.manager.enable('youtube', true, 1000);
    s.manager.start(1000, true);
    s.manager.ingest('lease', 'landscape', new Uint8Array([1]), 1100);
    s.manager.tick(1101);
    s.packets.get('landscape')!(new Uint8Array([1, 2, 3]));
    expect(s.y.adapter.start).not.toHaveBeenCalled();
    expect(s.y.adapter.write).not.toHaveBeenCalled();
    expect(s.manager.snapshot().encodedBytes.landscape).toBe(3);
    s.manager.stop();
  });
  it('never exposes private stream keys or URLs; preserves unsupported metadata as an explicit degradation', async () => {
    const privateKey = 'not-a-real-stream-secret';
    const output = new RtmpBroadcastOutput('youtube', {
      url: 'rtmps://ingest.example.test/live2',
      streamKey: privateKey,
    });
    const encoder: Encoder = { start() {}, write: () => true, stop() {} };
    const manager = new BroadcastOutputManager(encoder, [output], true);
    expect(output.configured).toBe(true);
    expect(JSON.stringify(manager.snapshot())).not.toContain(privateKey);
    expect(JSON.stringify(manager.snapshot())).not.toContain('ingest.example.test');
    await expect(manager.metadata('youtube', 'Test', '17')).rejects.toThrow('panel oficial');
    expect(encoderArgs()).toContain('libx264');
    expect(encoderArgs()).toContain('aac');
  });
});
it('generates capturable local TTS WAV and waits for actual playback acknowledgments', async () => {
  const provider = new BroadcastVoiceProvider();
  const events = { started: vi.fn(), timing: vi.fn(), ended: vi.fn(), failed: vi.fn() };
  const playback = provider.play(
    {
      id: 'tts',
      text: 'Hello football community',
      emotion: 'sonrisa',
      energy: 60,
      durationMs: 2000,
    },
    events,
  );
  try {
    await vi.waitFor(() => expect(provider.readyId()).toBe('tts'), {
      timeout: 10000,
      interval: 50,
    });
    const audio = provider.audio('tts')!;
    expect(Buffer.from(audio).toString('ascii', 0, 4)).toBe('RIFF');
    expect(audio.byteLength).toBeGreaterThan(10000);
    expect(events.started).not.toHaveBeenCalled();
    expect(provider.acknowledge('old', 'started')).toBe(false);
    provider.acknowledge('tts', 'started');
    expect(events.started).toHaveBeenCalledOnce();
    expect(events.timing.mock.calls[0][4]).toBe('text-simulation');
    provider.acknowledge('tts', 'ended');
    expect(events.ended).toHaveBeenCalledOnce();
  } finally {
    playback.cancel();
  }
  expect(provider.audio('tts')).toBeNull();
}, 12000);
