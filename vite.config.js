import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  plugins: [
    {
      name: 'copy-character-portraits',
      writeBundle(outputOptions) {
        const source = resolve('assets/characters');
        if (!existsSync(source)) return;
        const destination = resolve(
          outputOptions.dir ?? 'dist',
          'assets/characters',
        );
        mkdirSync(destination, { recursive: true });
        cpSync(source, destination, { recursive: true });
      },
    },
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
        },
      },
    },
  },
  server: {
    host: true,
  },
});