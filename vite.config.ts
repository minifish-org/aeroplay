import { defineConfig } from 'vite';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

function publicFiles(directory = 'public', prefix = ''): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? publicFiles(resolve(directory, entry.name), `${prefix}${entry.name}/`)
      : entry.name === 'service-worker.js'
        ? []
        : [`/${prefix}${entry.name}`]
  );
}

export default defineConfig({
  plugins: [
    {
      name: 'offline-precache',
      apply: 'build',
      writeBundle(options, bundle) {
        const files = Object.keys(bundle).filter(
          (file) => file !== 'service-worker.js' && file !== 'index.html'
        );
        const assets = [
          '/',
          ...files.map((file) => `/${file}`),
          ...publicFiles()
        ];
        const template = readFileSync(
          resolve('public/service-worker.js'),
          'utf8'
        );
        const version = createHash('sha256')
          .update(JSON.stringify(assets) + template)
          .digest('hex')
          .slice(0, 12);
        const worker = template
          .replace('__VERSION__', version)
          .replace('__PRECACHE__', JSON.stringify(assets));
        writeFileSync(
          resolve(options.dir ?? 'dist', 'service-worker.js'),
          worker
        );
      }
    }
  ],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: { output: { manualChunks: { three: ['three'] } } }
  }
});
