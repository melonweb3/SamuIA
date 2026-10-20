import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, chmod, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import {
  defaultVoiceSettings,
  SimulatedVoiceProvider,
  type VoiceEvents,
  type VoicePlayback,
  type VoiceProvider,
  type VoiceRequest,
  type VoiceProfile,
  type VoiceSettings,
  type SpeechSynthesisProvider,
  type VoiceStudioState,
  type ReactionEvent,
} from '../../../packages/voice/src/index';
import { BroadcastVoiceProvider } from './broadcast-voice';
import { ffmpegSupportsFlite } from './broadcast-encoder';
import { localCapabilities, RemoteVoiceProvider, VoiceApiError } from './voice-providers';
const exec = promisify(execFile);
const profileSchema = z
  .object({
    id: z.string().min(1).max(128),
    name: z.string().min(1).max(80),
    provider: z.enum(['simulation', 'browser', 'flite', 'openai', 'elevenlabs']),
    providerVoiceId: z.string().max(256),
    type: z.enum(['generic', 'custom', 'cloned']),
    isDefault: z.boolean(),
    createdAt: z.number(),
    status: z.enum(['not-configured', 'waiting-consent', 'processing', 'ready', 'error']),
    consentId: z.string().max(256).optional(),
    error: z.string().max(100).optional(),
  })
  .strict();
export const voiceSettingsSchema = z
  .object({
    voiceEnabled: z.boolean(),
    defaultVoiceProfile: z.string().min(1).max(128),
    fallbackVoice: z.string().min(1).max(128),
    volume: z.number().min(0).max(1),
    speechRate: z.number().min(0.7).max(1.2),
    interruptEnabled: z.boolean(),
  })
  .strict();
const savedSchema = z
  .object({
    version: z.literal(1),
    profiles: z.array(profileSchema).max(100),
    settings: voiceSettingsSchema,
  })
  .strict();
export class VoiceStudioService implements VoiceProvider {
  captureOnly = false;
  readonly name = 'Voice Studio';
  readonly audible = true;
  readonly preparationTimeoutMs = 45000;
  readonly ready: Promise<void>;
  private profiles: VoiceProfile[] = [];
  settings: VoiceSettings = structuredClone(defaultVoiceSettings);
  private providers: SpeechSynthesisProvider[];
  private flite: BroadcastVoiceProvider | null;
  private samples = new Map<
    string,
    { profileId: string; role: 'sample' | 'consent'; blob: Blob; duration: number; at: number }
  >();
  private logs: VoiceStudioState['logs'] = [];
  private persistenceError: string | null = null;
  private saving = Promise.resolve();
  private lease: { token: string; until: number } | null = null;
  private current: {
    request: VoiceRequest;
    events: VoiceEvents;
    abort: AbortController;
    handle?: VoicePlayback;
    selected?: VoiceProfile;
    audio?: Uint8Array;
    mime: string;
    mode: 'audio' | 'browser';
    duration: number;
    started: boolean;
    completed: boolean;
  } | null = null;
  private directory: string | null;
  private creation = new AbortController();
  constructor(
    private env: NodeJS.ProcessEnv = process.env,
    options: {
      directory?: string | null;
      providers?: SpeechSynthesisProvider[];
      flite?: BroadcastVoiceProvider | null;
    } = {},
  ) {
    this.directory =
      options.directory === undefined
        ? resolve(env.VOICE_STORAGE_DIR || '.local/voice-studio')
        : options.directory;
    this.providers = options.providers ?? [
      new RemoteVoiceProvider('openai', env),
      new RemoteVoiceProvider('elevenlabs', env),
    ];
    this.flite =
      options.flite === undefined
        ? ffmpegSupportsFlite(env.FFMPEG_PATH || 'ffmpeg')
          ? new BroadcastVoiceProvider(env.FFMPEG_PATH || 'ffmpeg')
          : null
        : options.flite;
    this.ready = this.load();
  }
  private log(code: string, provider?: string) {
    this.logs.unshift({ at: Date.now(), code, provider });
    this.logs = this.logs.slice(0, 100);
  }
  private async load() {
    const builtins: VoiceProfile[] = ['simulation', 'browser', 'flite'].map((provider) => ({
      id: provider,
      name: localCapabilities(provider as VoiceProfile['provider'], true).name,
      provider: provider as VoiceProfile['provider'],
      providerVoiceId: '',
      type: 'generic',
      isDefault: provider === 'simulation',
      createdAt: 0,
      status: provider === 'flite' && !this.flite ? 'not-configured' : 'ready',
    }));
    builtins.push({
      id: 'openai-alloy',
      name: 'OpenAI · alloy (genérica)',
      provider: 'openai',
      providerVoiceId: 'alloy',
      type: 'generic',
      isDefault: false,
      createdAt: 0,
      status: 'ready',
    });
    if (this.env.ELEVENLABS_VOICE_ID)
      builtins.push({
        id: 'elevenlabs-preset',
        name: 'ElevenLabs · preset configurado',
        provider: 'elevenlabs',
        providerVoiceId: this.env.ELEVENLABS_VOICE_ID,
        type: 'generic',
        isDefault: false,
        createdAt: 0,
        status: 'ready',
      });
    this.profiles = builtins;
    if (!this.directory) return;
    try {
      const file = join(this.directory, 'profiles.json');
      const bytes = await readFile(file);
      if (bytes.length > 256 * 1024) throw new Error('invalid-store');
      const saved = savedSchema.parse(JSON.parse(bytes.toString()));
      this.profiles = [
        ...builtins.filter((p) => !saved.profiles.some((s) => s.id === p.id)),
        ...saved.profiles,
      ];
      for (const p of this.profiles)
        if (p.status === 'processing') {
          p.status = 'error';
          p.error = 'creation-interrupted-check-provider';
        }
      this.settings = saved.settings;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        this.persistenceError = 'No se pudo leer la configuración privada de voz';
    }
  }
  async persist() {
    for(const profile of this.profiles)profile.isDefault=profile.id===this.settings.defaultVoiceProfile;
    if (!this.directory) return;
    const data = JSON.stringify(
        { version: 1, profiles: this.profiles, settings: this.settings },
        null,
        2,
      ),
      directory = this.directory;
    this.saving = this.saving
      .catch(() => {})
      .then(async () => {
        try {
          await mkdir(directory, { recursive: true, mode: 0o700 });
          await chmod(directory, 0o700);
          const tmp = join(directory, `profiles-${randomUUID()}.tmp`);
          await writeFile(tmp, data, { mode: 0o600 });
          await rename(tmp, join(directory, 'profiles.json'));
          this.persistenceError = null;
        } catch {
          this.persistenceError = 'No se pudo guardar la configuración privada de voz';
          throw new VoiceApiError('voice-persistence-failed');
        }
      });
    await this.saving;
  }
  private profile(id: string) {
    const p = this.profiles.find((p) => p.id === id);
    if (!p) throw new VoiceApiError('voice-profile-not-found');
    return p;
  }
  private available(p: VoiceProfile) {
    return (
      p.status === 'ready' &&
      (p.provider === 'simulation' ||
        p.provider === 'browser' ||
        (p.provider === 'flite'
          ? !!this.flite
          : this.providers.some((s) => s.id === p.provider && s.isAvailable())))
    );
  }
  get enabled() {
    return this.settings.voiceEnabled;
  }
  get capturable() {
    return (
      this.enabled &&
      [this.settings.defaultVoiceProfile, this.settings.fallbackVoice].some((id) => {
        const p = this.profiles.find((p) => p.id === id);
        return !!p && !['simulation', 'browser'].includes(p.provider) && this.available(p);
      })
    );
  }
  snapshot(): VoiceStudioState {
    this.expireSamples();
    const current = this.current;
    return structuredClone({
      profiles: this.profiles.map((p) => ({
        ...p,
        isDefault: p.id === this.settings.defaultVoiceProfile,
      })),
      settings: this.settings,
      providers: [
        localCapabilities('simulation', true),
        localCapabilities('browser', true),
        localCapabilities('flite', !!this.flite),
        ...this.providers.map((p) => p.capabilities()),
      ],
      ready:
        current &&
        (current.audio ||
          current.selected?.provider === 'browser' ||
          (current.selected?.provider === 'flite' && this.flite?.readyId() === current.request.id))
          ? {
              id: current.request.id,
              mode: current.mode,
              voiceId: current.selected?.providerVoiceId ?? '',
              durationMs: current.duration,
              mime: current.mime,
            }
          : null,
      playbackOwned: !!this.lease && this.lease.until > Date.now(),
      persistenceError: this.persistenceError,
      samples: [...this.samples.values()].map((s) => ({
        profileId: s.profileId,
        role: s.role,
        duration: s.duration,
        bytes: s.blob.size,
      })),
      logs: this.logs,
    });
  }
  async configure(patch: Partial<VoiceSettings>) {
    const next = voiceSettingsSchema.parse({ ...this.settings, ...patch });
    this.profile(next.defaultVoiceProfile);
    this.profile(next.fallbackVoice);
    if (next.voiceEnabled && !this.available(this.profile(next.defaultVoiceProfile)))
      throw new VoiceApiError('selected-voice-not-ready');
    const replace =
      next.voiceEnabled !== this.settings.voiceEnabled ||
      next.defaultVoiceProfile !== this.settings.defaultVoiceProfile ||
      next.fallbackVoice !== this.settings.fallbackVoice;
    this.settings = next;
    if (replace) this.cancelSpeech();
    await this.persist();
  }
  async createProfile(name: string, provider: 'openai' | 'elevenlabs') {
    if (this.profiles.length >= 100) throw new VoiceApiError('profile-limit');
    const profile: VoiceProfile = {
      id: randomUUID(),
      name,
      provider,
      providerVoiceId: '',
      type: 'cloned',
      isDefault: false,
      createdAt: Date.now(),
      status: this.providers.find((p) => p.id === provider)?.isAvailable()
        ? 'waiting-consent'
        : 'not-configured',
    };
    this.profiles.push(profile);
    await this.persist();
    return profile;
  }
  private expireSamples() {
    for (const [id, s] of this.samples) if (Date.now() - s.at > 1800000) this.samples.delete(id);
  }
  async upload(id: string, role: 'sample' | 'consent', data: Buffer, mime: string) {
    this.expireSamples();
    const profile = this.profile(id);
    if (profile.type === 'generic' || profile.status === 'processing' || profile.providerVoiceId)
      throw new VoiceApiError('profile-upload-unavailable');
    if (
      !data.length ||
      data.length > 10 * 1024 * 1024 ||
      ![
        'audio/wav',
        'audio/x-wav',
        'audio/mpeg',
        'audio/mp3',
        'audio/mp4',
        'audio/x-m4a',
        'audio/aac',
        'audio/ogg',
        'audio/webm',
        'audio/flac',
      ].includes(mime)
    )
      throw new VoiceApiError('invalid-audio-format-or-size');
    if (this.samples.size >= 12 && !this.samples.has(`${id}:${role}`))
      throw new VoiceApiError('sample-memory-limit');
    const magic = data.subarray(0, 16),
      text = magic.toString('ascii');
    if (
      !(text.startsWith('RIFF') && text.slice(8, 12) === 'WAVE') &&
      !text.startsWith('ID3') &&
      !text.startsWith('OggS') &&
      !text.startsWith('fLaC') &&
      text.slice(4, 8) !== 'ftyp' &&
      !(magic[0] === 0xff && (magic[1] & 0xe0) === 0xe0) &&
      !magic.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
    )
      throw new VoiceApiError('invalid-audio-signature');
    let folder: string | undefined;
    try {
      folder = await mkdtemp(join(tmpdir(), 'samuia-sample-'));
      const file = join(folder, 'sample');
      await writeFile(file, data, { mode: 0o600 });
      const { stdout } = await exec(
        this.env.FFPROBE_PATH || 'ffprobe',
        [
          '-v',
          'error',
          '-protocol_whitelist',
          'file,pipe',
          '-show_entries',
          'format=duration,format_name:stream=codec_type,duration',
          '-of',
          'json',
          file,
        ],
        { timeout: 8000, maxBuffer: 65536 },
      );
      const info = JSON.parse(stdout);
      const duration = Number(
        info.format?.duration ??
          info.streams?.find((s: { codec_type: string }) => s.codec_type === 'audio')?.duration,
      );
      if (
        !Array.isArray(info.streams) ||
        !info.streams.some((s: { codec_type: string }) => s.codec_type === 'audio') ||
        info.streams.some((s: { codec_type: string }) => s.codec_type !== 'audio')
      )
        throw new VoiceApiError('invalid-audio-stream');
      const format = String(info.format?.format_name || '');
      const detected = format.includes('wav')
        ? 'audio/wav'
        : format.includes('mp3')
          ? 'audio/mpeg'
          : format.includes('mov') || format.includes('mp4')
            ? 'audio/mp4'
            : format.includes('matroska') || format.includes('webm')
              ? 'audio/webm'
              : format.includes('ogg')
                ? 'audio/ogg'
                : format.includes('flac')
                  ? 'audio/flac'
                  : format.includes('aac')
                    ? 'audio/aac'
                    : null;
      const normalized =
        mime === 'audio/x-wav'
          ? 'audio/wav'
          : mime === 'audio/mp3'
            ? 'audio/mpeg'
            : mime === 'audio/x-m4a'
              ? 'audio/mp4'
              : mime;
      if (!detected || detected !== normalized) throw new VoiceApiError('audio-mime-mismatch');
      let blob = new Blob([new Uint8Array(data)], { type: detected }),
        measuredDuration = duration;
      if (!Number.isFinite(duration) && detected === 'audio/webm') {
        const normalizedFile = join(folder, 'normalized.wav');
        await exec(
          this.env.FFMPEG_PATH || 'ffmpeg',
          [
            '-v',
            'error',
            '-protocol_whitelist',
            'file,pipe',
            '-i',
            file,
            '-map',
            '0:a:0',
            '-ac',
            '1',
            '-ar',
            '24000',
            '-c:a',
            'pcm_s16le',
            '-fs',
            String(10 * 1024 * 1024),
            normalizedFile,
          ],
          { timeout: 8000, maxBuffer: 65536 },
        );
        const bytes = await readFile(normalizedFile);
        if (bytes.length >= 10 * 1024 * 1024) throw new VoiceApiError('decoded-sample-too-large');
        const result = await exec(
          this.env.FFPROBE_PATH || 'ffprobe',
          ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', normalizedFile],
          { timeout: 8000, maxBuffer: 65536 },
        );
        measuredDuration = Number(JSON.parse(result.stdout).format?.duration);
        blob = new Blob([new Uint8Array(bytes)], { type: 'audio/wav' });
      }
      if (!Number.isFinite(measuredDuration) || measuredDuration <= 0)
        throw new VoiceApiError('invalid-audio-duration');
      this.samples.set(`${id}:${role}`, {
        profileId: id,
        role,
        blob,
        duration: measuredDuration,
        at: Date.now(),
      });
      this.log('sample-validated', profile.provider);
    } catch (error) {
      if (error instanceof VoiceApiError) throw error;
      throw new VoiceApiError('audio-validation-failed');
    } finally {
      if (folder) await rm(folder, { recursive: true, force: true });
    }
  }
  deleteSample(id: string, role: 'sample' | 'consent') {
    this.samples.delete(`${id}:${role}`);
  }
  async createCustom(id: string, ownVoice: boolean) {
    await this.ready;
    const profile = this.profile(id);
    if (!ownVoice) throw new VoiceApiError('own-voice-consent-required');
    if (profile.type === 'generic' || profile.status === 'processing' || profile.providerVoiceId)
      throw new VoiceApiError('profile-creation-unavailable');
    const provider = this.providers.find((p) => p.id === profile.provider);
    if (!provider?.isAvailable() || !provider.createVoice) {
      profile.status = 'not-configured';
      await this.persist();
      throw new VoiceApiError('provider-not-configured');
    }
    this.expireSamples();
    const sample = this.samples.get(`${id}:sample`),
      consent = this.samples.get(`${id}:consent`);
    if (!sample || (profile.provider === 'openai' && !consent))
      throw new VoiceApiError('sample-or-consent-missing');
    profile.status = 'processing';
    profile.error = undefined;
    await this.persist();
    this.log('voice-creation-requested', profile.provider);
    try {
      const result = await provider.createVoice(
        profile.name,
        sample.blob,
        consent?.blob ?? null,
        this.creation.signal,
      );
      profile.providerVoiceId = result.id;
      profile.consentId = result.consentId;
      profile.status = result.verificationRequired ? 'waiting-consent' : 'ready';
      this.log(
        result.verificationRequired ? 'provider-verification-required' : 'voice-created',
        profile.provider,
      );
    } catch (error) {
      profile.status = 'error';
      profile.error = error instanceof VoiceApiError ? error.code : 'voice-creation-failed';
      this.log(profile.error, profile.provider);
    } finally {
      this.deleteSample(id, 'sample');
      this.deleteSample(id, 'consent');
      await this.persist();
    }
  }
  async verify(id: string) {
    const profile = this.profile(id),
      provider = this.providers.find((p) => p.id === profile.provider);
    if (!profile.providerVoiceId || profile.status !== 'waiting-consent' || !provider?.verifyVoice)
      throw new VoiceApiError('verification-unavailable');
    if (await provider.verifyVoice(profile.providerVoiceId, this.creation.signal)) {
      profile.status = 'ready';
      profile.error = undefined;
      await this.persist();
    }
  }
  async remove(id: string) {
    const profile = this.profile(id);
    if (profile.type === 'generic' || profile.status === 'processing')
      throw new VoiceApiError('profile-removal-unavailable');
    if (this.current?.selected?.id === id) this.cancelSpeech();
    this.profiles = this.profiles.filter((p) => p.id !== id);
    this.deleteSample(id, 'sample');
    this.deleteSample(id, 'consent');
    if (this.settings.defaultVoiceProfile === id) {
      this.settings.defaultVoiceProfile = 'simulation';
      this.settings.voiceEnabled = false;
    }
    if (this.settings.fallbackVoice === id) this.settings.fallbackVoice = 'simulation';
    await this.persist();
  }
  claim(token?: string) {
    if (this.lease && this.lease.until > Date.now() && this.lease.token !== token)
      throw new VoiceApiError('audio-player-owned-by-another-tab');
    if (!this.lease || this.lease.token !== token) {
      if (this.current?.started)
        this.current.events.failed('El reproductor perdió la conexión', Date.now());
      this.lease = { token: randomUUID(), until: 0 };
    }
    this.lease.until = Date.now() + 6000;
    return this.lease.token;
  }
  authorized(token: string) {
    return !!this.lease && this.lease.token === token && this.lease.until > Date.now();
  }
  release(token: string) {
    if (this.authorized(token)) {
      if (!this.captureOnly) this.cancelSpeech();
      this.lease = null;
    }
  }
  durationMs(text: string) {
    return Math.max(1800, text.length * 65);
  }
  tick() {
    if (!this.captureOnly && this.lease && this.lease.until < Date.now() && this.current?.started) {
      const c = this.current;
      this.lease = null;
      c.events.failed('Se perdió la conexión con el reproductor de voz', Date.now());
    }
  }
  play(request: VoiceRequest, events: VoiceEvents): VoicePlayback {
    this.cancelSpeech();
    const c = {
      request,
      events,
      abort: new AbortController(),
      mime: 'audio/mpeg',
      mode: 'audio' as 'audio' | 'browser',
      duration: request.durationMs,
      started: false,
      completed: false,
      selected: undefined as VoiceProfile | undefined,
      audio: undefined as Uint8Array | undefined,
      handle: undefined as VoicePlayback | undefined,
    };
    this.current = c;
    this.log('reaction-received');
    void (async () => {
      await this.ready;
      const primary = request.reaction?.profileId ?? this.settings.defaultVoiceProfile;
      for (const [index, id] of [...new Set([primary, this.settings.fallbackVoice])].entries()) {
        if (c.abort.signal.aborted || this.current !== c) return;
        const p = this.profiles.find((p) => p.id === id);
        try {
          if (
            !p ||
            !this.available(p) ||
            (this.captureOnly && ['browser', 'simulation'].includes(p.provider))
          )
            throw new VoiceApiError('custom-voice-unavailable');
          c.selected = p;
          this.log(index ? 'fallback-activated' : 'provider-selected', p.provider);
          events.provider?.(p.provider, p.provider !== 'simulation', p.name);
          if (p.provider === 'simulation') {
            c.handle = new SimulatedVoiceProvider().play(request, events, Date.now());
            return;
          }
          if (p.provider === 'browser') {
            c.mode = 'browser';
            events.buffered?.();
            return;
          }
          if (p.provider === 'flite') {
            c.mime = 'audio/wav';
            await new Promise<void>((resolve, reject) => {
              const timer = setInterval(() => {
                if (c.abort.signal.aborted) {
                  clearInterval(timer);
                  reject(new VoiceApiError('provider-cancelled'));
                } else if (this.flite?.readyId() === request.id) {
                  clearInterval(timer);
                  events.buffered?.();
                  resolve();
                }
              }, 25);
              c.handle = this.flite!.play(
                { ...request, rate: this.settings.speechRate },
                {
                  ...events,
                  failed: () => {
                    clearInterval(timer);
                    reject(new VoiceApiError('flite-generation-failed'));
                  },
                },
              );
            });
            return;
          }
          const provider = this.providers.find((s) => s.id === p.provider)!;
          const reaction: ReactionEvent = request.reaction ?? {
            id: request.id,
            text: request.text,
            source: 'director',
            emotion: 'neutral',
            intensity: request.energy / 100,
            priority: 'NORMAL',
            interruptible: true,
            timestamp: Date.now(),
          };
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              this.log('tts-requested', p.provider);
              const result = await provider.generateSpeech(
                reaction,
                p,
                this.settings.speechRate,
                c.abort.signal,
              );
              if (c.abort.signal.aborted || this.current !== c) return;
              c.audio = result.audio;
              c.mime = result.mime;
              events.buffered?.();
              this.log('audio-buffered', p.provider);
              return;
            } catch (error) {
              if (c.abort.signal.aborted) return;
              if (attempt === 0 && error instanceof VoiceApiError && error.retryable) {
                this.log('tts-retry', p.provider);
                continue;
              }
              throw error;
            }
          }
        } catch (error) {
          c.handle?.cancel();
          c.handle = undefined;
          this.log(error instanceof VoiceApiError ? error.code : 'provider-error', p?.provider);
        }
      }
      if (this.current === c && !c.abort.signal.aborted)
        events.failed('La voz principal y el fallback no están disponibles', Date.now());
    })().catch(() => {
      if (this.current === c && !c.abort.signal.aborted) events.failed('Error de voz', Date.now());
    });
    return {
      cancel: () => {
        if (this.current === c) this.cancelSpeech();
      },
      pause: () => c.handle?.pause(),
      resume: () => c.handle?.resume(),
    };
  }
  cancelSpeech() {
    const c = this.current;
    this.current = null;
    if (c) {
      c.abort.abort();
      c.handle?.cancel();
      this.log(
        !c.completed && (c.started || c.audio) ? 'speech-interrupted' : 'speech-released',
        c.selected?.provider,
      );
    }
  }
  readyId() {
    return this.snapshot().ready?.id ?? null;
  }
  audio(id: string) {
    const c = this.current;
    if (c?.request.id !== id) return null;
    return c.selected?.provider === 'flite' ? (this.flite?.audio(id) ?? null) : (c.audio ?? null);
  }
  audioMime() {
    return this.current?.mime ?? 'audio/wav';
  }
  acknowledge(
    id: string,
    action: 'started' | 'ended' | 'failed',
    positionMs = 0,
    now = Date.now(),
    durationMs?: number,
    audioLevel?: number,
  ) {
    const c = this.current;
    if (!c || c.request.id !== id) return false;
    if (action === 'ended' && c.started) {
      c.completed = true;
      this.log('audio-finished', c.selected?.provider);
    }
    if (c.selected?.provider === 'flite') {
      if (action === 'started') c.started = true;
      const ok = this.flite!.acknowledge(id, action, positionMs, now);
      if (audioLevel !== undefined) c.events.level?.(audioLevel, now);
      return ok;
    }
    if (!c.audio && c.mode !== 'browser') return false;
    if (action === 'failed') {
      c.events.failed(
        'No se pudo reproducir el audio; habilita la reproducción en el navegador',
        now,
      );
      this.log('playback-error');
      return true;
    }
    if (Number.isFinite(durationMs) && durationMs! > 0 && durationMs! < 120000)
      c.duration = durationMs!;
    c.events.timing(
      Math.max(0, Math.min(c.duration, positionMs)),
      c.duration,
      [],
      now,
      'text-simulation',
    );
    if (c.mode === 'audio' && audioLevel !== undefined) c.events.level?.(audioLevel, now);
    if (action === 'started' && !c.started) {
      c.started = true;
      c.events.started(now);
      this.log('audio-started', c.selected?.provider);
    }
    if (action === 'ended' && c.started) {
      c.events.ended(now);
    }
    return true;
  }
  stop() {
    this.creation.abort();
    this.cancelSpeech();
    this.samples.clear();
    this.lease = null;
  }
}
