export class SessionManager {
  #SS_KEY = 'uvtSession';
  #site = location.hostname;
  #data = {};

  constructor() {
    try { this.#data = JSON.parse(sessionStorage.getItem(this.#SS_KEY)) || {}; } catch {}
  }

  get(key) { return this.#data[key]; }

  save(patch) {
    Object.assign(this.#data, patch);
    try { sessionStorage.setItem(this.#SS_KEY, JSON.stringify(this.#data)); } catch {}
  }

  /** Save per-site playback speed to chrome.storage.local */
  saveSpeed(rate) {
    chrome.storage.local.get(['uvtSpeeds'], (r) => {
      const m = r.uvtSpeeds || {};
      if (rate === 1) delete m[this.#site];
      else m[this.#site] = rate;
      chrome.storage.local.set({ uvtSpeeds: m });
    });
  }

  /** Apply all remembered settings to a newly-playing video */
  applyTo(video, booster) {
    const rate = this.#data.rate;
    if (rate && rate !== 1) video.playbackRate = rate;
    // Prefer the continuous boostGain (kept up to date by both the popup slider
    // and the overlay's discrete cycle button) over the legacy discrete index.
    if (this.#data.boostGain && this.#data.boostGain !== 1) booster.setContinuousGain(video, this.#data.boostGain);
    else if (this.#data.boost) booster.setDiscreteBoost(video, this.#data.boost);
    if (this.#data.eq && this.#data.eq.some((g) => g !== 0)) booster.setEqAll(video, this.#data.eq);
    // Explicit check for `!== undefined` — we want to reapply *either* an
    // explicit unmute (false) or an explicit mute (true), whichever the user
    // last chose, not just "if truthy".
    if (this.#data.muted !== undefined) video.muted = this.#data.muted;
    if (this.#data.loop) video.loop = true;
    if (this.#data.cc) {
      const tracks = Array.from(video.textTracks || []);
      if (tracks.length) {
        tracks.forEach((t) => (t.mode = 'hidden'));
        tracks[0].mode = 'showing';
      }
    }
  }
}
