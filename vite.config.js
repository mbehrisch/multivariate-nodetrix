import { defineConfig } from 'vite';

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
});
