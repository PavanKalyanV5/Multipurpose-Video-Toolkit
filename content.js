(async () => {
  if (window.__uvtLoaded) return;
  window.__uvtLoaded = true;

  try {
    const src = chrome.runtime.getURL('src/content/VideoToolkit.js');
    const module = await import(src);
    const VideoToolkit = module.VideoToolkit;
    new VideoToolkit().init();
  } catch (e) {
    console.error('[Universal Video Toolkit] Failed to load module:', e);
  }
})();
