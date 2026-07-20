/**
 * Shared rule-matching logic for the custom CSS/JS injector.
 *
 * Pattern syntax mirrors Tampermonkey-style @match/@exclude: a comma-separated
 * list of glob patterns (`*` = any characters), each tested against the full
 * URL. A leading `!` marks an exclude pattern. A URL matches the rule if it
 * matches at least one include pattern and none of the exclude patterns.
 *
 * Bare URLs (no `*` anywhere) are auto-expanded so pasting a plain page URL
 * "just works" for the whole site rather than only that exact page — see
 * normalizePattern(). A pattern that already contains `*` is left exactly as
 * typed, since the author has already expressed explicit intent.
 *
 * Note: the actual document_start injector (src/rules/injector.js) duplicates
 * this logic inline rather than importing it. That's deliberate, not an
 * oversight — content scripts declared in manifest.json can't use static ES
 * module imports, and a dynamic import() at document_start would add fetch
 * latency at exactly the point we're trying to minimize (every millisecond
 * before matching CSS applies is a flash of the un-styled page). This module
 * exists for the rules management page, which isn't timing-sensitive.
 */
export function matchesRule(rule, href) {
  if (!rule || !rule.enabled || !rule.urlPattern) return false;
  const { includes, excludes } = splitPatterns(rule.urlPattern);
  if (!includes.length) return false;
  try {
    if (!includes.some((p) => globToRegExp(p).test(href))) return false;
    if (excludes.some((p) => globToRegExp(p).test(href))) return false;
    return true;
  } catch {
    return false; // malformed pattern — treat as no-match, not a crash
  }
}

export function splitPatterns(raw) {
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
  const includes = [];
  const excludes = [];
  for (const p of parts) {
    if (p.startsWith('!')) excludes.push(normalizePattern(p.slice(1).trim()));
    else includes.push(normalizePattern(p));
  }
  return { includes, excludes };
}

/**
 * A bare URL/domain with no `*` is expanded to cover the whole site under it:
 *   https://www.instagram.com/   -> https://www.instagram.com/*
 *   https://www.instagram.com    -> https://www.instagram.com/*
 *   instagram.com                -> *://instagram.com/*
 * Left untouched if it already contains a `*` anywhere — that's explicit intent.
 */
export function normalizePattern(pattern) {
  if (!pattern) return pattern;
  if (pattern.includes('*')) return pattern;
  let p = pattern.trim();
  p = p.replace(/^(https?|ftp|\*):\/\//i, '');
  p = p.replace(/^www\./i, '');
  p = '*://*' + p;
  return p.endsWith('/') ? p + '*' : p + '/*';
}

/** Normalizes every pattern in a raw comma-separated field, preserving `!` excludes. */
export function normalizePatternList(raw) {
  return raw
    .split(',')
    .map((part) => {
      const trimmed = part.trim();
      if (!trimmed) return '';
      const isExclude = trimmed.startsWith('!');
      const body = isExclude ? trimmed.slice(1).trim() : trimmed;
      if (!body) return '';
      const normalized = normalizePattern(body);
      return isExclude ? '!' + normalized : normalized;
    })
    .filter(Boolean)
    .join(', ');
}

export function globToRegExp(pattern) {
  const escaped = pattern.split('*').map(escapeRegExp).join('.*');
  return new RegExp('^' + escaped + '$');
}

function escapeRegExp(s) {
  return s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}
