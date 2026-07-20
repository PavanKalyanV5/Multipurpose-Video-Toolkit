import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.config.ts';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), crx({ manifest })],
  server: {
    // CRXJS's HMR client needs a fixed, predictable port to reconnect to.
    port: 5173,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      input: {
        // Pages opened via chrome.tabs.create() rather than referenced by a
        // manifest key (popup/background) aren't auto-discovered by CRXJS —
        // they have to be listed as explicit build entries here.
        dashboard: 'src/pages/dashboard/index.html',
        rules: 'src/pages/rules/index.html',
        welcome: 'src/pages/welcome/index.html',
      },
    },
  },
});
