import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
export async function referenceVideoFixture() {
  const folder = await mkdtemp(join(tmpdir(), 'samuia-video-fixture-'));
  try {
    const file = join(folder, 'reference.mp4');
    await promisify(execFile)(
      'ffmpeg',
      [
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'testsrc=size=160x90:rate=10',
        '-t',
        '0.8',
        '-threads',
        '1',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-an',
        file,
      ],
      { timeout: 10000 },
    );
    return await readFile(file);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}
