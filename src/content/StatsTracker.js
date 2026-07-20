const STATS_KEY = 'uvtStats';
const MAX_DAILY_DAYS = 30;
const FLUSH_MS = 20000;

/**
 * Local-only usage stats for the dashboard: watch time (total, per-site, daily
 * trend) and action counts (speed changes, boosts, loops, etc.). One instance
 * per content-script injection; watch-time tracking is intentionally a single
 * timer (not per-video) — on a page with multiple simultaneously-playing
 * videos this approximates "time spent with something playing" rather than
 * precise per-video accounting, which is the right level of fidelity for a
 * personal-use dashboard.
 */
export class StatsTracker {
  #site = location.hostname;
  #watchStartMs = null;
  #flushTimer = null;

  /** Call when playback actually starts (already gated on the site being enabled). */
  startWatch() {
    if (this.#watchStartMs) return;
    this.#watchStartMs = Date.now();
    this.#flushTimer = setInterval(() => this.#flushWatch(), FLUSH_MS);
  }

  /** Call on pause/ended — flushes any accumulated time and stops the timer. */
  stopWatch() {
    if (!this.#watchStartMs) return;
    this.#flushWatch();
    clearInterval(this.#flushTimer);
    this.#flushTimer = null;
  }

  #flushWatch() {
    if (!this.#watchStartMs) return;
    const now = Date.now();
    const elapsed = now - this.#watchStartMs;
    this.#watchStartMs = now;
    if (elapsed <= 0) return;
    this.#mutate((s) => {
      s.totalWatchMs += elapsed;
      this.#siteEntry(s).watchMs += elapsed;
      const day = todayKey();
      s.daily[day] = (s.daily[day] || 0) + elapsed;
    });
  }

  /** Records one use of a named action (e.g. 'setRate', 'loop', 'vol', 'shot'). */
  logAction(name) {
    if (!name) return;
    this.#mutate((s) => {
      s.totalActions++;
      this.#siteEntry(s).actions++;
      s.actionCounts[name] = (s.actionCounts[name] || 0) + 1;
    });
  }

  #siteEntry(s) {
    if (!s.bySite[this.#site]) s.bySite[this.#site] = { watchMs: 0, actions: 0 };
    return s.bySite[this.#site];
  }

  #mutate(fn) {
    if (!chrome.runtime?.id) return;
    try {
      chrome.storage.local.get([STATS_KEY], (r) => {
        const s = r[STATS_KEY] || { totalWatchMs: 0, totalActions: 0, bySite: {}, daily: {}, actionCounts: {} };
        fn(s);
        const days = Object.keys(s.daily).sort();
        if (days.length > MAX_DAILY_DAYS) {
          for (const d of days.slice(0, days.length - MAX_DAILY_DAYS)) delete s.daily[d];
        }
        chrome.storage.local.set({ [STATS_KEY]: s });
      });
    } catch {}
  }
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}
