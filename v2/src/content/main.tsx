import { VideoToolkit } from './VideoToolkit';

declare global {
  interface Window {
    __uvtLoaded?: boolean;
  }
}

if (!window.__uvtLoaded) {
  window.__uvtLoaded = true;
  new VideoToolkit().init().catch((e) => {
    console.error('[Universal Video Toolkit] Failed to initialize:', e);
  });
}
