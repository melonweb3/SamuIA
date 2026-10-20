import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import type {
  VoiceEvents,
  VoicePlayback,
  VoiceProvider,
  VoiceRequest,
} from '../../../packages/voice/src/index';
/** Optional local test TTS. Browser playback acknowledges the real audio clock. */
export class BroadcastVoiceProvider implements VoiceProvider {
  readonly name = 'TTS local Flite · voz de prueba';
  readonly audible = true;
  private current: {
    id: string;
    audio: Uint8Array | null;
    duration: number;
    events: VoiceEvents;
    cancelled: boolean;
    playing: boolean;
    process?: ReturnType<typeof spawn>;
  } | null = null;
  constructor(private binary = 'ffmpeg') {}
  durationMs(text: string) {
    return Math.max(1800, text.length * 65);
  }
  play(request: VoiceRequest, events: VoiceEvents): VoicePlayback {
    const current = {
      id: request.id,
      audio: null as Uint8Array | null,
      duration: 0,
      events,
      cancelled: false,
      playing: false,
      process: undefined as ReturnType<typeof spawn> | undefined,
    };
    this.current = current;
    void (async () => {
      let folder: string | undefined;
      try {
        folder = await mkdtemp(join(tmpdir(), 'samuia-voice-'));
        if (current.cancelled) return;
        const textFile = join(folder, 'text.txt'),
          audioFile = join(folder, 'speech.wav');
        await writeFile(textFile, request.text.slice(0, 2000));
        await new Promise<void>((resolve, reject) => {
          const child = spawn(
            this.binary,
            [
              '-hide_banner',
              '-loglevel',
              'error',
              '-f',
              'lavfi',
              '-i',
              `flite=textfile=${textFile}:voice=slt`,
              '-ar',
              '48000',
              '-ac',
              '1',
              '-c:a',
              'pcm_s16le',
              '-y',
              audioFile,
            ],
            { stdio: 'ignore' },
          );
          current.process = child;
          const timeout = setTimeout(() => {
            child.kill('SIGKILL');
            reject(new Error('tts-timeout'));
          }, 8000);
          child.on('error', () => {
            clearTimeout(timeout);
            reject(new Error('tts-unavailable'));
          });
          child.on('exit', (code) => {
            clearTimeout(timeout);
            if (code === 0) resolve();
            else reject(new Error('tts-failed'));
          });
        });
        const audio = await readFile(audioFile);
        if (audio.length > 4 * 1024 * 1024) throw new Error('tts-too-long');
        let dataSize = 0;
        for (let offset = 12; offset + 8 <= audio.length;) {
          const size = audio.readUInt32LE(offset + 4);
          if (audio.toString('ascii', offset, offset + 4) === 'data') {
            dataSize = Math.min(size, audio.length - offset - 8);
            break;
          }
          offset += 8 + size + (size % 2);
        }
        if (!dataSize) throw new Error('tts-invalid-wave');
        if (current.cancelled || this.current !== current) return;
        current.duration = (dataSize / 96000) * 1000;
        current.audio = audio;
      } catch {
        if (!current.cancelled && this.current === current)
          events.failed('No se pudo generar la voz local de prueba', Date.now());
      } finally {
        if (folder) await rm(folder, { recursive: true, force: true });
      }
    })();
    return {
      cancel: () => {
        current.cancelled = true;
        current.process?.kill('SIGKILL');
        if (this.current === current) this.current = null;
      },
      pause() {},
      resume() {},
    };
  }
  readyId() {
    return this.current?.audio ? this.current.id : null;
  }
  audio(id: string) {
    return this.current?.id === id ? this.current.audio : null;
  }
  acknowledge(
    id: string,
    action: 'started' | 'ended' | 'failed',
    positionMs = 0,
    now = Date.now(),
  ) {
    const current = this.current;
    if (!current || current.id !== id || current.cancelled || !current.audio) return false;
    if (action === 'started' && !current.playing) {
      current.playing = true;
      current.events.timing(0, current.duration, [], now, 'text-simulation');
      current.events.started(now);
    } else if (action === 'ended' && current.playing) current.events.ended(now);
    else if (action === 'failed') current.events.failed('Reproducción de voz no disponible', now);
    else if (action === 'started' && current.playing && Number.isFinite(positionMs))
      current.events.timing(
        Math.min(current.duration, Math.max(0, positionMs)),
        current.duration,
        [],
        now,
        'text-simulation',
      );
    return true;
  }
}
