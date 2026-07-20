import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json' with { type: 'json' };

export default defineManifest({
  manifest_version: 3,
  name: 'Universal Video Toolkit',
  version: pkg.version,
  description:
    'Hover controls for any video, any site: speed, seek, rotate, cinema mode, PiP, fullscreen, screenshot, record, volume boost with an 8-band EQ, captions, downloads, subtitles, and a local usage dashboard. Plus per-site custom CSS/JS injection with a full code editor. Off by default — enable per site from the popup.',
  permissions: ['downloads', 'storage', 'webRequest', 'scripting', 'tabs', 'declarativeNetRequest'],
  host_permissions: ['<all_urls>'],
  // 'unsafe-eval' here governs *our own* extension pages/service worker CSP
  // only — it's what lets the background script construct custom per-site
  // JS rules via `new Function(code)` before handing them to
  // chrome.scripting.executeScript. It has no bearing on, and isn't
  // weakened by, the CSP of whatever page the rule ends up running on.
  content_security_policy: {
    extension_pages: "script-src 'self' 'unsafe-eval'; object-src 'self'",
  },
  declarative_net_request: {
    rule_resources: [
      {
        id: 'timing_allow_origin_rules',
        enabled: true,
        path: 'dnr_rules.json',
      },
    ],
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/main.tsx'],
      run_at: 'document_idle',
      all_frames: true,
    },
    {
      matches: ['<all_urls>'],
      js: ['src/rules/injector.ts'],
      run_at: 'document_start',
      all_frames: true,
    },
  ],
  web_accessible_resources: [
    {
      resources: ['src/pages/dashboard/index.html', 'src/pages/rules/index.html', 'src/pages/welcome/index.html'],
      matches: ['<all_urls>'],
    },
  ],
  action: {
    default_popup: 'src/popup/index.html',
    default_title: 'Universal Video Toolkit',
    default_icon: {
      16: 'icons/icon16.png',
      48: 'icons/icon48.png',
      128: 'icons/icon128.png',
    },
  },
  icons: {
    16: 'icons/icon16.png',
    48: 'icons/icon48.png',
    128: 'icons/icon128.png',
  },
});
