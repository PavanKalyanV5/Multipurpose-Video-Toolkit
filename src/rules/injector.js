/* Universal Video Toolkit — custom per-site CSS/JS rule injector.
 * Deliberately a separate, plain (non-module) content script registered at
 * document_start (see manifest.json) — kept fully self-contained with no
 * imports so there's zero extra latency before matching CSS can apply. The
 * main toolbar (content.js) stays on document_idle since it isn't
 * timing-sensitive; this one is, so it's split out.
 */
(function () {
  if (window.__uvtRulesInjected) return;
  window.__uvtRulesInjected = true;

  function escapeRegExp(s) {
    return s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }

  function globToRegExp(pattern) {
    return new RegExp('^' + pattern.split('*').map(escapeRegExp).join('.*') + '$');
  }

  // A bare URL/domain with no `*` is expanded to cover the whole site under
  // it (https://site.com/ -> https://site.com/*) — see RuleMatcher.js's
  // normalizePattern() for the canonical version of this.
  function normalizePattern(pattern) {
    if (!pattern) return pattern;
    if (pattern.includes('*')) return pattern;
    let p = pattern.trim();
    p = p.replace(/^(https?|ftp|\*):\/\//i, '');
    p = p.replace(/^www\./i, '');
    p = '*://*' + p;
    return p.endsWith('/') ? p + '*' : p + '/*';
  }

  // Kept in sync with src/rules/RuleMatcher.js by hand — see that file's
  // header comment for why this isn't a shared import. Pattern syntax:
  // comma-separated globs, `!`-prefixed entries are excludes.
  function matches(rule, href) {
    if (!rule.enabled || !rule.urlPattern) return false;
    const parts = rule.urlPattern.split(',').map((p) => p.trim()).filter(Boolean);
    const includes = [];
    const excludes = [];
    for (const p of parts) {
      if (p.startsWith('!')) excludes.push(normalizePattern(p.slice(1).trim()));
      else includes.push(normalizePattern(p));
    }
    if (!includes.length) return false;
    try {
      if (!includes.some((p) => globToRegExp(p).test(href))) return false;
      if (excludes.some((p) => globToRegExp(p).test(href))) return false;
      return true;
    } catch {
      return false;
    }
  }

  function injectCss(css, id) {
    const style = document.createElement('style');
    style.dataset.uvtRule = id;
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }

  function runJs(code) {
    if (!chrome.runtime?.id) return;
    try {
      // Runs in the page's own MAIN world via the background (see
      // background.js's 'uvt-run-rule-js' handler) — a content script's own
      // JS lives in an isolated world and can't touch the page's globals,
      // which is exactly what a "run this on the page" rule needs to do.
      chrome.runtime.sendMessage({ type: 'uvt-run-rule-js', code }).catch(() => {});
    } catch {}
  }

  chrome.storage.local.get(['uvtCustomRules'], (r) => {
    const rules = r.uvtCustomRules || [];
    if (!rules.length) return;
    const href = location.href;

    for (const rule of rules) {
      if (!matches(rule, href)) continue;
      if (rule.css) injectCss(rule.css, rule.id);
      if (rule.js) {
        if (rule.runAt === 'idle' && document.readyState !== 'complete') {
          window.addEventListener('load', () => runJs(rule.js), { once: true });
        } else {
          runJs(rule.js);
        }
      }
    }
  });
})();
