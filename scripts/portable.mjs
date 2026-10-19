import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
const output = resolve('.local/portable');
await build({
  configFile: false,
  root: resolve('apps/studio'),
  base: './',
  plugins: [react()],
  build: {
    outDir: output,
    emptyOutDir: true,
    copyPublicDir: false,
    cssCodeSplit: false,
    rollupOptions: {
      input: resolve('apps/studio/standalone.html'),
      output: { inlineDynamicImports: true },
    },
  },
});
let html = await readFile(resolve(output, 'standalone.html'), 'utf8');
const script = html.match(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/),
  style = html.match(/<link\b[^>]*href="([^"]+\.css)"[^>]*>/);
if (!script || !style) throw new Error('Assets no encontrados');
const js = await readFile(resolve(output, script[1]), 'utf8'),
  css = await readFile(resolve(output, style[1]), 'utf8');
html = html
  .replace(
    script[0],
    () => `<script type="module">${js.replace(/<\/script/gi, '<\\/script')}</script>`,
  )
  .replace(style[0], () => `<style>${css}</style>`);
for (const [manifest, elementId] of [
  ['assets/reference/originals-index.json', 'samuia-avatar-originals'],
  ['assets/reference/scenes/originals-index.json', 'samuia-scene-originals'],
  ['assets/runtime/scenes/composites-index.json', 'samuia-scene-composites'],
]) {
  const originals = JSON.parse(await readFile(resolve(manifest), 'utf8'));
  const embedded = {};
  for (const original of originals) {
    const reference = await readFile(resolve(original.originalFile));
    const runtime = await readFile(resolve(original.runtimeFile));
    const archive = original.archiveFile ? await readFile(resolve(original.archiveFile)) : null;
    if (
      !reference.equals(runtime) ||
      createHash('sha256').update(runtime).digest('hex') !== original.sha256 ||
      (archive && createHash('sha256').update(archive).digest('hex') !== original.archiveSha256)
    ) {
      throw new Error(`La referencia no coincide con el original: ${original.runtimeFile}`);
    }
    const filename = original.runtimeFile.split('/').at(-1);
    embedded[filename] = `data:image/png;base64,${runtime.toString('base64')}`;
  }
  html = html.replace(
    '<head>',
    () =>
      `<head><script id="${elementId}" type="application/json">${JSON.stringify(embedded)}</script>`,
  );
}
await writeFile(resolve('.local/SamuIA-Live-Studio.html'), html);
await mkdir(resolve('downloads'), { recursive: true });
await writeFile(resolve('downloads/SamuIA-Live-Studio.html'), html);
console.log('HTML portátil: .local/SamuIA-Live-Studio.html');
