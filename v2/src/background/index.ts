import type { MediaItem, RuntimeMessage } from '../shared/types';

/* Universal Video Toolkit — background service worker */

// First install only — the toolkit is opt-in per site by design (see
// VideoToolkit.tsx), so a fresh install otherwise does *nothing* until you
// find the popup yourself. This is the one time we proactively explain that.
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/welcome/index.html') });
  }
});

/* --- media sniffer: remembers real media file URLs per tab, with size + res hints --- */
const mediaByTab: Record<number, MediaItem[]> = {};

function resHint(url: string): string {
  const m = url.match(/[/_.-](144|240|360|480|540|720|1080|1440|2160)[pP]?[/_.-]/) || url.match(/(\d{3,4})[pP][/_.-]/);
  return m ? m[1] + 'p' : '';
}

chrome.webRequest.onResponseStarted.addListener(
  (d) => {
    if (d.tabId < 0) return;
    const headers = d.responseHeaders || [];
    const get = (n: string) => {
      const h = headers.find((x) => x.name.toLowerCase() === n);
      return h ? h.value || '' : '';
    };
    const ct = get('content-type');
    // policy compliance: never index YouTube-served media
    if (/googlevideo\.com|youtube\.com|youtu\.be|ytimg\.com/i.test(d.url)) return;
    const isMedia = /video\/(mp4|webm|quicktime)/i.test(ct) || /\.(mp4|webm|mov|m4v)(\?|$)/i.test(d.url);
    if (!isMedia) return;

    let url = d.url;
    try {
      // strip byte-range params (Instagram-style) to get the whole file
      const u = new URL(url);
      ['bytestart', 'byteend', 'range', 'rn', 'rbuf'].forEach((p) => u.searchParams.delete(p));
      url = u.toString();
    } catch {
      /* malformed URL — use as-is */
    }

    // total size: prefer Content-Range "bytes 0-999/TOTAL", else Content-Length
    let size = 0;
    const cr = get('content-range');
    const crm = cr && cr.match(/\/(\d+)\s*$/);
    if (crm) size = parseInt(crm[1], 10);
    else size = parseInt(get('content-length'), 10) || 0;

    const arr = (mediaByTab[d.tabId] = mediaByTab[d.tabId] || []);
    const existing = arr.find((e) => e.url === url);
    if (existing) {
      existing.size = Math.max(existing.size, size);
      existing.time = Date.now();
    } else {
      arr.push({ url, size, hint: resHint(url), time: Date.now() });
      if (arr.length > 20) arr.shift();
    }
    // Show a badge dot so the user knows something is downloadable. The tab
    // can close between the request completing and this running — catch
    // rather than let it become an unhandled rejection in the worker.
    chrome.action.setBadgeText({ tabId: d.tabId, text: '●' }).catch(() => {});
    chrome.action.setBadgeBackgroundColor({ tabId: d.tabId, color: '#38bdf8' }).catch(() => {});
  },
  { urls: ['<all_urls>'], types: ['media', 'xmlhttprequest', 'other'] },
  ['responseHeaders'],
);

chrome.tabs.onRemoved.addListener((id) => {
  delete mediaByTab[id];
  chrome.storage.local.remove(`uvt_active_${id}`);
  // The tab is already gone by the time this fires — setBadgeText on it
  // reliably rejects with "No tab with id", so just swallow it.
  chrome.action.setBadgeText({ tabId: id, text: '' }).catch(() => {});
});

// "webNavigation" isn't in permissions, so onCommitted isn't available — use
// tabs.onUpdated (status 'loading' = a fresh top-level navigation just started)
// to clear stale per-tab state instead. Avoids requesting an extra permission.
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    delete mediaByTab[tabId]; // fresh page, fresh list
    chrome.storage.local.remove(`uvt_active_${tabId}`);
    chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((msg: RuntimeMessage, sender, sendResponse) => {
  if (msg?.type === 'uvt-inject-speed') {
    const tabId = sender.tab ? sender.tab.id! : -1;
    if (tabId !== -1) {
      chrome.scripting
        .executeScript({
          target: { tabId, frameIds: [sender.frameId || 0] },
          world: 'MAIN',
          func: (rate: number) => {
            try {
              const player = document.querySelector('.html5-video-player') as (HTMLElement & { setPlaybackRate?: (r: number) => void }) | null;
              if (player && typeof player.setPlaybackRate === 'function') {
                player.setPlaybackRate(rate);
              }
            } catch {
              /* not YouTube's player API — ignore */
            }
          },
          args: [msg.rate],
        })
        .catch((e) => console.error(e));
    }
    return;
  }

  if (msg?.type === 'uvt-run-rule-js') {
    // Custom per-site JS rules run in the page's own MAIN world (not the
    // content script's isolated world) so they can touch the page's own
    // globals — exactly what a user-script-style rule is for. This is
    // inherently arbitrary code execution with full page privileges; the
    // rules page warns about that, this handler just does what it's told.
    //
    // Deliberately NOT `func: (code) => eval(code)`: that calls eval() as
    // *page* code once injected, which is subject to the page's own CSP —
    // sites that disallow 'unsafe-eval' (Instagram and most React/webpack
    // bundled sites do) silently block every rule with zero visible error.
    // Instead, the Function is constructed here, in the background script's
    // own context (governed by *our* extension CSP — see manifest.config.ts's
    // 'unsafe-eval' allowance) — chrome.scripting.executeScript injects a
    // function by re-parsing its source directly in the target world, which
    // is exempt from the target page's CSP entirely.
    const tabId = sender.tab ? sender.tab.id! : -1;
    if (tabId !== -1 && typeof msg.code === 'string') {
      let userFn: () => void;
      try {
        userFn = new Function(msg.code) as () => void;
      } catch (e) {
        console.error('[Universal Video Toolkit] Custom rule JS failed to parse:', e);
        return;
      }
      chrome.scripting
        .executeScript({
          target: { tabId, frameIds: [sender.frameId ?? 0] },
          world: 'MAIN',
          func: userFn,
        })
        .catch((e) => console.error('[Universal Video Toolkit] Custom rule JS error:', e));
    }
    return;
  }

  if (msg?.type === 'uvt-report-state') {
    const tabId = sender.tab ? sender.tab.id! : -1;
    const frameId = sender.frameId ?? 0;
    if (tabId !== -1) {
      chrome.storage.local.set({ [`uvt_active_${tabId}`]: { frameId, state: msg.state } });
      // Broadcast so an *already-open* popup updates live. tabs.sendMessage()
      // only reaches content scripts in that tab (which don't need this back —
      // they're the ones who reported it); runtime.sendMessage() is what
      // actually reaches the popup. Since it comes from the background here,
      // sender.tab is undefined on the receiving end, so tabId/frameId travel
      // in the payload instead of being inferred from the sender.
      chrome.runtime
        .sendMessage({ type: 'uvt-state-updated', tabId, frameId, state: msg.state } satisfies RuntimeMessage)
        .catch(() => {});
    }
    return;
  }

  if (msg?.type === 'uvt-media-list') {
    const tabId = sender.tab ? sender.tab.id! : -1;
    sendResponse({ items: mediaByTab[tabId] || [] });
    return;
  }

  if (msg?.type === 'uvt-download' && msg.url) {
    if (/googlevideo\.com|youtube\.com|youtu\.be/i.test(msg.url)) return;
    // derive a safe filename from the URL, fall back to a timestamped name
    let name = 'video';
    try {
      const u = new URL(msg.url);
      const last = u.pathname.split('/').filter(Boolean).pop() || '';
      if (last && /\.(mp4|webm|mov|m4v|ogg|ogv|mkv)$/i.test(last)) name = last;
      else name = `video-${(msg.site || u.hostname).replace(/[^a-z0-9.-]/gi, '_')}-${Date.now()}.mp4`;
    } catch {
      name = `video-${Date.now()}.mp4`;
    }
    chrome.downloads.download({ url: msg.url, filename: name, saveAs: false });
  }
});
