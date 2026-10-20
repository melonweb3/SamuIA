import { it, expect, vi } from 'vitest';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { RtmpBroadcastOutput } from '../apps/server/src/broadcast-encoder';
const run = promisify(execFile);
it('transports our H.264/AAC signal to a real local RTMP receiver without any public destination', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'samuia-rtmp-'));
  const reservation = createServer();
  await new Promise<void>((r) => reservation.listen(0, '127.0.0.1', r));
  const port = (reservation.address() as AddressInfo).port;
  await new Promise<void>((r) => reservation.close(() => r()));
  const target = `rtmp://127.0.0.1:${port}/live/test-only-key`,
    file = join(folder, 'received.flv');
  const receiver = spawn(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-listen',
      '1',
      '-i',
      target,
      '-c',
      'copy',
      '-f',
      'flv',
      '-y',
      file,
    ],
    { stdio: 'ignore' },
  );
  const output = new RtmpBroadcastOutput('youtube', {
    url: `rtmp://127.0.0.1:${port}/live`,
    streamKey: 'test-only-key',
  });
  try {
    const fixture = await run(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        'testsrc2=size=320x180:rate=25',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:sample_rate=48000',
        '-t',
        '8',
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-g',
        '25',
        '-c:a',
        'aac',
        '-f',
        'mpegts',
        'pipe:1',
      ],
      { encoding: 'buffer', maxBuffer: 8 * 1024 * 1024, timeout: 15000 },
    );
    const live = vi.fn(),
      failed = vi.fn();
    output.start({ live, failed });
    expect(output.write(fixture.stdout)).toBe(true);
    await vi.waitFor(() => expect(live).toHaveBeenCalledOnce(), { timeout: 10000, interval: 50 });
    output.stop();
    await vi.waitFor(() => expect(receiver.exitCode).not.toBeNull(), {
      timeout: 5000,
      interval: 50,
    });
    const probe = await run('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', file], {
      timeout: 5000,
    });
    const streams = JSON.parse(probe.stdout).streams as { codec_name: string }[];
    expect(streams.map((s) => s.codec_name)).toContain('h264');
    expect(streams.map((s) => s.codec_name)).toContain('aac');
  } finally {
    output.stop();
    if (receiver.exitCode === null) receiver.kill('SIGKILL');
    await rm(folder, { recursive: true, force: true });
  }
}, 30000);
