import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// CI must exercise real media tools; missing dependencies are not a reason to skip tests.
const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
const ffprobe = process.env.FFPROBE_PATH || 'ffprobe';
const run = (binary, args) =>
  execFileSync(binary, args, { encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024 });
let directory;
try {
  for (const binary of [ffmpeg, ffprobe]) console.log(run(binary, ['-version']).split('\n')[0]);
  for (const [option, required] of [
    ['-encoders', ['libx264', 'aac', 'pcm_s16le']],
    ['-filters', ['flite', 'atempo', 'testsrc', 'testsrc2', 'sine']],
    ['-protocols', ['rtmp']],
    ['-muxers', ['wav', 'flv', 'mpegts']],
  ]) {
    const available = run(ffmpeg, ['-hide_banner', option]);
    for (const name of required)
      if (!new RegExp(`\\b${name}\\b`).test(available))
        throw new Error(`FFmpeg no incluye ${name} (${option}).`);
  }
  directory = mkdtempSync(join(tmpdir(), 'samuia-media-check-'));
  const text = join(directory, 'text.txt');
  const audio = join(directory, 'speech.wav');
  writeFileSync(text, 'Hello SamuIA');
  run(ffmpeg, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    `flite=textfile=${text}:voice=slt`,
    '-ar',
    '48000',
    '-ac',
    '1',
    '-c:a',
    'pcm_s16le',
    audio,
  ]);
  const info = JSON.parse(
    run(ffprobe, [
      '-v',
      'error',
      '-protocol_whitelist',
      'file,pipe',
      '-show_entries',
      'format=duration:stream=codec_type,codec_name',
      '-of',
      'json',
      audio,
    ]),
  );
  if (
    info.streams?.length !== 1 ||
    info.streams[0].codec_type !== 'audio' ||
    info.streams[0].codec_name !== 'pcm_s16le' ||
    !(Number(info.format?.duration) > 0)
  )
    throw new Error('La comprobación de voz local no produjo un WAV PCM válido.');
  console.log('Dependencias multimedia verificadas: H.264, AAC, RTMP, Flite y WAV PCM real.');
} catch (error) {
  console.error(
    'Falló la comprobación multimedia. Instala FFmpeg y FFprobe con libx264, AAC y Flite.',
  );
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  if (directory) rmSync(directory, { recursive: true, force: true });
}
