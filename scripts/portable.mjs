import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
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
await writeFile(resolve('.local/SamuIA-Live-Studio.html'), html);
await mkdir(resolve('downloads'), { recursive: true });
await writeFile(resolve('downloads/SamuIA-Live-Studio.html'), html);
console.log('HTML portátil: .local/SamuIA-Live-Studio.html');
