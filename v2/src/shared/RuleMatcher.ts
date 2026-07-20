import type { CustomRule } from './types';

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
 * Note: the actual document_start injector (src/rules/injector.ts) duplicates
 * this logic inline rather than importing it. That's deliberate, not an
 * oversight — a dynamic import() at document_start would add fetch latency at
 * exactly the point we're trying to minimize (every millisecond before
 * matching CSS applies is a flash of the un-styled page). This module is used
 * by the rules management page, which isn't timing-sensitive.
 */
export function matchesRule(rule: CustomRule, href: string): boolean {
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

export function splitPatterns(raw: string): { includes: string[]; excludes: string[] } {
  const parts = raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  const includes: string[] = [];
  const excludes: string[] = [];
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
export function normalizePattern(pattern: string): string {
  if (!pattern || pattern.includes('*')) return pattern;
  let p = pattern;
  if (!p.includes('://')) p = '*://' + p; // bare domain/path — match any scheme
  return p.endsWith('/') ? p + '*' : p + '/*';
}

/** Normalizes every pattern in a raw comma-separated field, preserving `!` excludes. */
export function normalizePatternList(raw: string): string {
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

export function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.split('*').map(escapeRegExp).join('.*');
  return new RegExp('^' + escaped + '$');
}

function escapeRegExp(s: string): string {
  return s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}
