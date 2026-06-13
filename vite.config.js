import { defineConfig } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// The codebase has circular module imports (main.js <-> utils.js, etc.), so
// vite's HMR engine can't compute a clean update boundary and logs
// "no update happened" instead of refreshing. Force a full page reload on
// every .js change instead — same effect, predictable behavior.
const fullReloadOnJs = {
  name: 'full-reload-on-js',
  handleHotUpdate({ file, server }) {
    if (file.endsWith('.js')) {
      server.ws.send({ type: 'full-reload' });
      return [];
    }
  },
};

export default defineConfig({
  plugins: [fullReloadOnJs],
  build: {
    rollupOptions: {
      // Multi-page app: every HTML entry must be listed or it won't be built.
      input: {
        index:   resolve(__dirname, 'index.html'),
        consent: resolve(__dirname, 'consent.html'),
        demo:    resolve(__dirname, 'demo.html'),
        study:   resolve(__dirname, 'study.html'),
      },
    },
  },
});
