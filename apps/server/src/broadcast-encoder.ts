import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { Encoder, BroadcastOutput } from '../../../packages/broadcast/src/index';
import type { Composition, Platform } from '../../../packages/shared/src/index';
export const ffmpegAvailable = (binary = 'ffmpeg') => {
  const result = spawnSync(binary, ['-hide_banner', '-encoders'], {
    encoding: 'utf8',
    timeout: 3000,
  });
  return result.status === 0 && /libx264/.test(result.stdout) && /\baac\b/.test(result.stdout);
};
export const ffmpegSupportsFlite = (binary = 'ffmpeg') => {
  const result = spawnSync(binary, ['-hide_banner', '-filters'], {
    encoding: 'utf8',
    timeout: 3000,
  });
  return result.status === 0 && /\bflite\b/.test(result.stdout);
};
const kill = (child: ChildProcessWithoutNullStreams | null) => {
  if (!child) return;
  child.stdin.destroy();
  child.kill('SIGTERM');
  const timer = setTimeout(() => {
    if (child.exitCode === null) child.kill('SIGKILL');
  }, 1000);
  timer.unref();
  child.once('exit', () => clearTimeout(timer));
};
export function encoderArgs() {
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-fflags',
    '+genpts',
    '-analyzeduration',
    '1000000',
    '-probesize',
    '1048576',
    '-f',
    'webm',
    '-i',
    'pipe:0',
    '-map',
    '0:v:0',
    '-map',
    '0:a:0',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-tune',
    'zerolatency',
    '-pix_fmt',
    'yuv420p',
    '-r',
    '25',
    '-g',
    '50',
    '-b:v',
    '2500k',
    '-c:a',
    'aac',
    '-ar',
    '48000',
    '-b:a',
    '128k',
    '-f',
    'mpegts',
    '-mpegts_flags',
    '+resend_headers',
    'pipe:1',
  ];
}
export class FFmpegEncoder implements Encoder {
  private children = new Map<Composition, ChildProcessWithoutNullStreams>();
  constructor(private binary = 'ffmpeg') {}
  start(composition: Composition, packet: (bytes: Uint8Array) => void, failed: () => void) {
    const child = spawn(this.binary, encoderArgs(), { stdio: ['pipe', 'pipe', 'pipe'] });
    this.children.set(composition, child);
    child.stdout.on('data', (bytes) => {
      if (this.children.get(composition) === child) packet(bytes);
    });
    child.stderr.resume();
    child.on('error', () => {
      if (this.children.get(composition) === child) failed();
    });
    child.stdin.on('error', () => {
      if (this.children.get(composition) === child) failed();
    });
    child.on('exit', () => {
      if (this.children.get(composition) === child) {
        this.children.delete(composition);
        failed();
      }
    });
  }
  write(composition: Composition, bytes: Uint8Array) {
    const child = this.children.get(composition);
    if (!child || child.stdin.destroyed || child.stdin.writableLength > 4 * 1024 * 1024)
      return false;
    child.stdin.write(bytes);
    return true;
  }
  stop(composition?: Composition) {
    if (composition) {
      const child = this.children.get(composition);
      this.children.delete(composition);
      kill(child ?? null);
      return;
    }
    const children = [...this.children.values()];
    this.children.clear();
    for (const child of children) kill(child);
  }
}
export interface PrivateOutputConfig {
  url?: string;
  streamKey?: string;
  token?: string;
  clientId?: string;
  channelId?: string;
  videoId?: string;
}
/** Credentials and FFmpeg stderr never leave this server-side adapter. */
export class RtmpBroadcastOutput implements BroadcastOutput {
  readonly configured: boolean;
  readonly metadataSupported: boolean;
  private child: ChildProcessWithoutNullStreams | null = null;
  private target: string | null = null;
  constructor(
    readonly platform: Platform,
    protected config: PrivateOutputConfig,
    private binary = 'ffmpeg',
  ) {
    try {
      const url = new URL(config.url ?? '');
      if (
        !['rtmp:', 'rtmps:'].includes(url.protocol) ||
        !config.streamKey ||
        url.username ||
        url.password
      )
        throw new Error('invalid');
      url.pathname = `${url.pathname.replace(/\/$/, '')}/${config.streamKey}`;
      this.target = url.toString();
    } catch {
      this.target = null;
    }
    this.configured = !!this.target;
    this.metadataSupported =
      platform === 'youtube'
        ? !!config.videoId && !!config.token
        : platform === 'twitch'
          ? !!config.channelId && !!config.token && !!config.clientId
          : false;
  }
  start(callbacks: { live(): void; failed(): void }) {
    this.stop();
    if (!this.target) throw new Error('Salida no configurada');
    const child = spawn(
      this.binary,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-fflags',
        '+genpts',
        '-f',
        'mpegts',
        '-i',
        'pipe:0',
        '-map',
        '0:v:0',
        '-map',
        '0:a:0',
        '-c',
        'copy',
        '-progress',
        'pipe:1',
        '-f',
        'flv',
        this.target,
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
    this.child = child;
    let reported = false,
      progress = '';
    child.stdout.on('data', (data: Buffer) => {
      progress += data.toString();
      if (!reported && /(?:out_time_us|out_time_ms)=[1-9]\d*/.test(progress)) {
        reported = true;
        callbacks.live();
      }
      if (progress.length > 8192) progress = progress.slice(-4096);
    });
    child.stderr.resume();
    const failed = () => {
      if (this.child === child) {
        this.child = null;
        callbacks.failed();
      }
    };
    child.on('error', failed);
    child.stdin.on('error', failed);
    child.on('exit', failed);
  }
  write(packet: Uint8Array) {
    const child = this.child;
    if (!child || child.stdin.destroyed || child.stdin.writableLength > 1024 * 1024) return false;
    child.stdin.write(packet);
    return true;
  }
  stop() {
    const child = this.child;
    this.child = null;
    kill(child);
  }
  async updateMetadata(title: string, category: string) {
    if (!this.metadataSupported) throw new Error('Metadatos no disponibles');
    const response =
      this.platform === 'youtube'
        ? await fetch('https://www.googleapis.com/youtube/v3/videos?part=snippet', {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${this.config.token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              id: this.config.videoId,
              snippet: { title, categoryId: category },
            }),
            signal: AbortSignal.timeout(10000),
          })
        : await fetch(
            `https://api.twitch.tv/helix/channels?broadcaster_id=${encodeURIComponent(this.config.channelId!)}`,
            {
              method: 'PATCH',
              headers: {
                Authorization: `Bearer ${this.config.token}`,
                'Client-Id': this.config.clientId!,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ title, game_id: category }),
              signal: AbortSignal.timeout(10000),
            },
          );
    if (!response.ok) throw new Error('Metadatos rechazados');
  }
}
export class YouTubeBroadcastOutput extends RtmpBroadcastOutput {
  constructor(config: PrivateOutputConfig, binary?: string) {
    super('youtube', config, binary);
  }
}
export class TwitchBroadcastOutput extends RtmpBroadcastOutput {
  constructor(config: PrivateOutputConfig, binary?: string) {
    super('twitch', config, binary);
  }
}
export class KickBroadcastOutput extends RtmpBroadcastOutput {
  constructor(config: PrivateOutputConfig, binary?: string) {
    super('kick', config, binary);
  }
}
export class TikTokBroadcastOutput extends RtmpBroadcastOutput {
  constructor(config: PrivateOutputConfig, binary?: string) {
    super('tiktok', config, binary);
  }
}
