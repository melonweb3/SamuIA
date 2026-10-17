import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  root: 'apps/studio',
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    fs: { allow: ['../..'] },
    proxy: { '/api': 'http://127.0.0.1:3001' },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
