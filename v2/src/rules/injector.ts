import type { CustomRule, RuntimeMessage, StorageShape } from '../shared/types';

/* Universal Video Toolkit — custom per-site CSS/JS rule injector.
 * Deliberately self-contained (no shared imports beyond types, which are
 * erased at compile time) — registered at document_start (see
 * manifest.config.ts) so there's zero extra latency before matching CSS can
 * apply. The main toolbar (src/content/main.tsx) stays on document_idle
 * since it isn't timing-sensitive; this one is, so it's split out.
 */
declare global {
  interface Window {
    __uvtRulesInjected?: boolean;
  }
}

if (!window.__uvtRulesInjected) {
  window.__uvtRulesInjected = true;

  const escapeRegExp = (s: string) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  const globToRegExp = (pattern: string) => new RegExp('^' + pattern.split('*').map(escapeRegExp).join('.*') + '$');

  // A bare URL/domain with no `*` is expanded to cover the whole site under
  // it (https://site.com/ -> https://site.com/*) — see RuleMatcher.ts's
  // normalizePattern() for the canonical version of this.
  const normalizePattern = (pattern: string): string => {
    if (!pattern || pattern.includes('*')) return pattern;
    let p = pattern;
    if (!p.includes('://')) p = '*://' + p;
    return p.endsWith('/') ? p + '*' : p + '/*';
  };

  // Kept in sync with src/shared/RuleMatcher.ts by hand — see that file's
  // header comment for why this isn't a shared import. Pattern syntax:
  // comma-separated globs, `!`-prefixed entries are excludes.
  const matches = (rule: CustomRule, href: string): boolean => {
    if (!rule.enabled || !rule.urlPattern) return false;
    const parts = rule.urlPattern
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    const includes: string[] = [];
    const excludes: string[] = [];
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
  };

  const injectCss = (css: string, id: string) => {
    const style = document.createElement('style');
    style.dataset.uvtRule = id;
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  };

  const runJs = (code: string) => {
    if (!chrome.runtime?.id) return;
    try {
      // Runs in the page's own MAIN world via the background (see
      // background/index.ts's 'uvt-run-rule-js' handler) — a content
      // script's own JS lives in an isolated world and can't touch the
      // page's globals, which is exactly what a "run this on the page" rule
      // needs to do.
      chrome.runtime.sendMessage({ type: 'uvt-run-rule-js', code } satisfies RuntimeMessage).catch(() => {});
    } catch {
      /* extension context invalidated */
    }
  };

  chrome.storage.local.get(['uvtCustomRules'], (r: Pick<StorageShape, 'uvtCustomRules'>) => {
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
}
