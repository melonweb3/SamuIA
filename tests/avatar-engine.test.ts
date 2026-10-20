import { describe, it, expect, vi } from 'vitest';
import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import {
  ReactionLibrary,
  builtInReactions,
  defaultAvatarSettings,
  reactionKinds,
  avatarStates,
  type ReactionAsset,
} from '../packages/avatar-engine/src/index';
import { ReactionDirector } from '../packages/core/src/index';
import { AvatarAnimationController } from '../packages/avatar-animation/src/index';
import { directiveForAnimation } from '../packages/shared/src/index';
import type { ReactionEvent, VoiceEvents } from '../packages/voice/src/index';
import {
  deformOfficialPoint,
  officialImageCalibration,
} from '../apps/studio/src/OfficialImageRenderer';
import { ReactionStudioService } from '../apps/server/src/reaction-studio';
import { VoiceStudioService } from '../apps/server/src/voice-studio';
import { createStudioServer } from '../apps/server/src/server';
import { commandSchema } from '../apps/server/src/commands';
import { referenceVideoFixture } from './fixtures/reference-video';
const reaction = (patch: Partial<ReactionEvent> = {}): ReactionEvent => ({
  id: crypto.randomUUID(),
  source: 'Operador · Reaction Studio',
  text: 'GOOOOL DEL CELTA',
  emotion: 'celebrating',
  intensity: 1,
  priority: 'NORMAL',
  interruptible: true,
  timestamp: 1000,
  ...patch,
});
describe('ReactionLibrary', () => {
  it('covers every requested kind and rotates eligible variants without immediate repetition', () => {
    expect(new Set(builtInReactions.map((a) => a.emotion))).toEqual(new Set(reactionKinds));
    const library = new ReactionLibrary(),
      first = library.choose('celebrating_big', 1, defaultAvatarSettings, 1000),
      second = library.choose('celebrating_big', 1, defaultAvatarSettings, 1001, {
        critical: true,
      });
    expect(first.asset?.emotion).toBe('celebrating_big');
    expect(second.asset?.id).not.toBe(first.asset?.id);
    const third = library.choose('celebrating_big', 1, defaultAvatarSettings, 1002, {
      critical: true,
    });
    expect(third.asset?.id).not.toBe(first.asset?.id);
    expect(third.asset?.id).not.toBe(second.asset?.id);
  });
  it('honors intensity, enabled flags, global cooldown and prioritization without fake motion extraction', () => {
    const library = new ReactionLibrary(),
      special: ReactionAsset = {
        ...builtInReactions.find((a) => a.emotion === 'happy')!,
        id: 'preferred',
        priority: 10,
        favorite: true,
      };
    library.upsert(special);
    expect(
      library.choose('happy', 0.5, { ...defaultAvatarSettings, reactionRandomization: false }, 1000)
        .asset?.id,
    ).toBe('preferred');
    expect(library.choose('angry', 1, defaultAvatarSettings, 1100)).toMatchObject({
      asset: null,
      reason: 'Cooldown de reacciones',
    });
    library.upsert({
      ...special,
      id: 'video-link',
      source: 'reference-video',
      status: 'reference-only',
    });
    expect(
      library.choose('happy', 0.5, defaultAvatarSettings, 3000, { assetId: 'video-link' }),
    ).toMatchObject({
      asset: { source: 'built-in' },
      reason: expect.stringContaining('movimiento extraído'),
    });
    library.replace(library.snapshot().map((a) => ({ ...a, enabled: false })));
    expect(library.choose('angry', 1, defaultAvatarSettings, 10000).asset).toBeNull();
  });
  it('uses a neutral fallback if a specific category is unavailable', () => {
    const library = new ReactionLibrary();
    library.replace(library.snapshot().filter((a) => a.emotion === 'neutral'));
    expect(library.choose('penalty', 1, defaultAvatarSettings, 1000)).toMatchObject({
      asset: { emotion: 'neutral' },
      reason: expect.stringContaining('fallback'),
    });
  });
});
describe('AvatarAnimationController reused as Avatar Engine', () => {
  it.each(avatarStates)('supports manual %s without starting audio for REACT ONLY', (state) => {
    const director = new ReactionDirector(1000, false),
      play = vi.fn();
    director.voice = { name: 'test', audible: true, durationMs: () => 4000, play };
    director.command(
      {
        type: 'avatar-manual',
        interrupt: true,
        reaction: reaction({ avatarState: state, reactOnly: true }),
      },
      1000,
    );
    expect(director.snapshot(1200).animation.engine).toMatchObject({
      currentAvatarState: state,
      isTalking: false,
      manualOverride: true,
    });
    expect(director.snapshot(1200).voice).toMatchObject({
      status: 'idle',
      reaction: { reactOnly: true },
    });
    expect(play).not.toHaveBeenCalled();
  });
  it('transitions idle → speaking → idle with simulated voice and an unchanged official renderer contract', () => {
    const d = new ReactionDirector(1000, false);
    d.operator(reaction({ emotion: 'neutral', avatarState: 'talking' }), true, 1000);
    const duration = d.snapshot(1000).voice.durationMs;
    expect(d.snapshot(1100).animation.engine).toMatchObject({
      currentAvatarState: 'talking',
      isTalking: true,
      lipSyncSource: 'text-simulation',
    });
    d.tick(1000 + duration + 1);
    expect(d.snapshot(1000 + duration + 1).animation.engine).toMatchObject({
      currentAvatarState: 'idle',
      isTalking: false,
      audioLevel: 0,
    });
  });
  it('waits for real start, receives measured amplitude/progress and rejects old callbacks on reset', () => {
    let events: VoiceEvents | undefined;
    const d = new ReactionDirector(1000, false);
    d.voice = {
      name: 'measured fixture',
      audible: true,
      durationMs: () => 4000,
      play: (_r, e) => {
        events = e;
        return { cancel() {}, pause() {}, resume() {} };
      },
    };
    d.operator(reaction(), true, 1000);
    expect(d.snapshot(1100).animation.engine?.isTalking).toBe(false);
    events!.started(1200);
    events!.timing(1000, 4000, [], 1300, 'audio-amplitude');
    events!.level!(0.7, 1300);
    d.tick(1300);
    expect(d.snapshot(1300).animation.engine).toMatchObject({
      lipSyncSource: 'audio-amplitude',
      audioLevel: 0.7,
      speechProgress: 0.25,
      isTalking: true,
    });
    d.command({ type: 'avatar-stop', reset: true }, 1400);
    events!.level!(1, 1500);
    d.tick(1500);
    expect(d.snapshot(1500).animation.engine?.currentAvatarState).toBe('idle');
    expect(d.snapshot(1500).animation.mouth.open).toBe(0);
    expect(d.snapshot(1500).voice.status).toBe('playing');
    d.command({ type: 'control', action: 'silence' }, 1600);
    expect(d.snapshot(1600).voice.status).toBe('cancelled');
  });
  it('keeps static/disabled modes compatible and reports advanced render fallback honestly', () => {
    const c = new AvatarAnimationController(0);
    c.configure({ avatarEnabled: false });
    c.play(directiveForAnimation('goal'), 1000);
    expect(c.frame(1100).engine).toMatchObject({ phase: 'disabled', isAnimating: false });
    c.configure({ avatarEnabled: true, defaultRenderMode: 'static', lipSyncEnabled: false });
    expect(c.frame(1200).engine).toMatchObject({
      renderMode: 'static',
      isAnimating: false,
      lipSyncEnabled: false,
    });
    c.configure({ defaultRenderMode: 'motion-driven' });
    c.play(directiveForAnimation('goal'), 2000);
    expect(c.frame(2100).engine).toMatchObject({
      renderMode: 'animated-2d',
      requestedRenderMode: 'motion-driven',
      fallbackReason: expect.stringContaining('pendiente'),
    });
  });
  it('allows a critical match goal to interrupt a manual animation without a cloned voice', () => {
    const d = new ReactionDirector(1000, false);
    d.operator(reaction({ reactOnly: true }), true, 1000);
    d.command({ type: 'event', eventType: 'goal', matchId: 'celta-madrid', side: 'home' }, 1200);
    expect(d.snapshot(1200).voice.reaction).toMatchObject({
      source: 'match:goal',
      priority: 'CRITICAL',
      matchId: 'celta-madrid',
    });
    expect(d.snapshot(1300).animation.engine?.currentEmotion).toBe('celebrating');
    expect(d.manager.get('celta-madrid').score.home).toBe(1);
  });
});
describe('official image geometry and validation', () => {
  it('moves only the character region and preserves desk/microphone for every composition', () => {
    for (const rig of Object.values(officialImageCalibration)) {
      const pose = { shift: 3, rise: -4, rotation: 0.02, breath: 2, blink: 1 };
      expect(deformOfficialPoint({ x: rig.head.x, y: rig.head.y }, rig, pose)).not.toEqual(
        rig.head,
      );
      expect(deformOfficialPoint({ x: 50, y: 50 }, rig, pose)).toEqual({ x: 50, y: 50 });
      expect(deformOfficialPoint({ x: 800, y: 900 }, rig, pose)).toEqual({ x: 800, y: 900 });
      if (rig.protected)
        expect(deformOfficialPoint({ x: rig.protected.x, y: rig.protected.y }, rig, pose)).toEqual({
          x: rig.protected.x,
          y: rig.protected.y,
        });
    }
  });
  it('rejects invalid asset ranges, arbitrary motion, video playback as a ready reaction and unknown settings', () => {
    expect(
      commandSchema.safeParse({
        type: 'reaction-upsert',
        asset: { ...builtInReactions[0], intensityMin: 1, intensityMax: 0 },
      }).success,
    ).toBe(false);
    expect(
      commandSchema.safeParse({
        type: 'reaction-upsert',
        asset: { ...builtInReactions[0], source: 'reference-video', status: 'ready' },
      }).success,
    ).toBe(false);
    expect(
      commandSchema.safeParse({ type: 'avatar-settings', patch: { code: 'run' } }).success,
    ).toBe(false);
  });
});
it('persists settings/assets and privately validates, catalogs, links and removes original video bytes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'samuia-reactions-test-')),
    store = new ReactionStudioService({}, { directory });
  await store.ready;
  try {
    const d = new ReactionDirector(1000, false);
    d.command(
      { type: 'avatar-settings', patch: { lipSyncEnabled: false, defaultRenderMode: 'static' } },
      1000,
    );
    await store.capture(d);
    const video = await referenceVideoFixture(),
      metadata = {
        name: 'celebration_big fixture',
        emotion: 'celebrating_big',
        intensity: 1,
        tags: ['fixture'],
        enabled: true,
      };
    await expect(store.upload(Buffer.from('not video'), 'video/mp4', metadata)).rejects.toThrow(
      'firma',
    );
    const reference = await store.upload(video, 'video/mp4', metadata);
    expect(reference.status).toBe('pending-motion');
    expect(reference.duration).toBeGreaterThan(0);
    await expect(store.video(reference.id, 'no-token')).rejects.toThrow('Sesión privada');
    const token = store.session();
    expect((await store.video(reference.id, token)).bytes.equals(video)).toBe(true);
    const linked = {
      ...builtInReactions[0],
      id: 'linked-ref',
      source: 'reference-video' as const,
      status: 'reference-only' as const,
      videoReferenceId: reference.id,
    };
    d.command({ type: 'reaction-upsert', asset: linked }, 1100);
    await store.capture(d);
    const restored = new ReactionStudioService({}, { directory });
    await restored.ready;
    const other = new ReactionDirector(2000, false);
    restored.apply(other);
    expect(other.snapshot(2000).animation.engine).toMatchObject({
      renderMode: 'static',
      lipSyncEnabled: false,
    });
    expect((await stat(join(directory, 'library.json'))).mode & 0o777).toBe(0o600);
    expect(await readFile(join(directory, 'library.json'), 'utf8')).not.toContain('data:video');
    await restored.removeReference(reference.id);
    restored.apply(other);
    expect(other.animation.library.snapshot().find((a) => a.id === 'linked-ref')).toMatchObject({
      status: 'placeholder',
      enabled: false,
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
it('HTTP manual/avatar settings use the existing brain; private video never appears in SSE or public files', async () => {
  const service = new ReactionStudioService({}, { directory: null }),
    voiceStudio = new VoiceStudioService({}, { directory: null, flite: null }),
    app = createStudioServer({ reactionStudio: service, voiceStudio });
  await new Promise<void>((r) => app.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  try {
    const post = (data: unknown) =>
      fetch(base + '/api/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    const response = await post({
      type: 'avatar-manual',
      interrupt: true,
      reaction: reaction({ reactOnly: true }),
    });
    expect(response.status).toBe(200);
    const state = await response.json();
    expect(state.animation.engine.currentAvatarState).toBe('celebrating');
    expect(state.history[0].source).toBe('Operador · Reaction Studio');
    const asset = {
      ...builtInReactions[0],
      id: 'bad-ref',
      videoReferenceId: crypto.randomUUID(),
      source: 'reference-video',
      status: 'reference-only',
    };
    expect((await post({ type: 'reaction-upsert', asset })).status).toBe(400);
    expect(app.director.animation.library.snapshot().some((a) => a.id === 'bad-ref')).toBe(false);
    const video = await referenceVideoFixture(),
      metadata = { name: 'fixture', emotion: 'happy', intensity: 0.5, tags: [], enabled: true };
    const upload = await fetch(
      base + '/api/avatar/video?' + new URLSearchParams({ metadata: JSON.stringify(metadata) }),
      { method: 'POST', headers: { 'Content-Type': 'video/mp4' }, body: new Uint8Array(video) },
    );
    expect(upload.status).toBe(200);
    const uploaded = await upload.json(),
      reference = uploaded.motionReferences[0];
    expect(uploaded.motionReferences).toHaveLength(1);
    expect(JSON.stringify(uploaded)).not.toContain('data:video');
    expect(JSON.stringify(uploaded)).not.toContain('references/');
    expect(
      (await fetch(base + `/api/avatar/video?id=${reference.id}`)).status,
    ).toBeGreaterThanOrEqual(400);
    expect((await fetch(base + `/samuia/references/${reference.id}.mp4`)).status).toBe(404);
  } finally {
    app.stop();
  }
});
