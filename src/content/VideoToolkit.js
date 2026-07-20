import { SPEEDS, BOOSTS, EQ_BANDS, EQ_PRESETS, formatTime } from './constants.js';
import { SessionManager } from './SessionManager.js';
import { AudioBooster } from './AudioBooster.js';
import { ABLoopManager } from './ABLoopManager.js';
import { VideoRecorder } from './VideoRecorder.js';
import { ToolbarUI } from './ToolbarUI.js';
import { VideoScanner } from './VideoScanner.js';
import { StatsTracker } from './StatsTracker.js';

export class VideoToolkit {
  // Sub-systems (public so Scanner/UI callbacks can access them)
  session  = new SessionManager();
  booster  = new AudioBooster();
  abLoop   = new ABLoopManager();
  recorder = new VideoRecorder();
  ui       = new ToolbarUI();
  stats    = new StatsTracker();
  scanner  = null; // created in init() after ui is mounted

  #site    = location.hostname;
  #isYT    = /(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(location.hostname);
  #rotations = new WeakMap(); // video -> current rotation degrees (0/90/180/270)
  #rotationObservers = new WeakMap(); // video -> MutationObserver reasserting the rotation if the site wipes it
  #cinemaVideos = new WeakSet(); // videos currently in cinema/focus mode

  // Global settings — off by default; the user opts a site in via the popup
  // (or flips the "Enabled everywhere" master switch to cover every site).
  enabled        = false;
  seekStep       = 5;
  autoplayBlock  = false;
  pauseOffscreen = false;

  /**
   * Entry point — called once on injection, on *every* page (Chrome has no
   * manifest-level way to only inject on approved sites while still keeping
   * the "hover to reveal controls" UX, since that needs the script present
   * before you know which video you'll hover). What we *can* control is how
   * much work happens before we know the site is enabled: this now does only
   * a storage read and a lightweight change-listener on a disabled site —
   * no toolbar template fetch, no shadow DOM, no document-wide
   * MutationObserver, no mousemove/keydown listeners — instead of the full
   * toolbar setup running unconditionally like it used to.
   */
  async init() {
    await this.#loadSettings();
    this.#listenStorageChanges(); // cheap; needed even while disabled so enabling later activates without a reload
    if (this.enabled) await this.#activate();
  }

  /** Everything that used to run unconditionally in init() — now only once the site is actually enabled. */
  async #activate() {
    if (this.scanner) return; // already activated this page load
    try {
      const res = await fetch(chrome.runtime.getURL('src/content/toolbar.html'));
      const htmlText = await res.text();
      this.ui.setTemplate(htmlText);
    } catch (e) {
      console.error('[Universal Video Toolkit] Failed to load toolbar template:', e);
      return;
    }
    this.scanner = new VideoScanner(this);
    this.ui.mount(this.#buildCallbacks());
    this.scanner.scan(document);
    this.scanner.observe();
    this.#bindMouseMove();
    this.#bindKeyboard();
    this.#bindMessages();
  }

  // ── Settings load ─────────────────────────────────────────────────────────────
  // Enablement is opt-in: off everywhere unless the site is on the allowlist,
  // or the "Enabled everywhere" master switch is on.
  #loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get(
        ['uvtGlobal', 'uvtEnabledSites', 'uvtSpeeds', 'uvtSeekStep', 'uvtAutoplayBlock', 'uvtPauseOffscreen', 'uvtSubtitleStyle'],
        (r) => {
          const enabledSites = r.uvtEnabledSites || [];
          this.enabled        = r.uvtGlobal === true || enabledSites.includes(this.#site);
          this.seekStep       = r.uvtSeekStep || 5;
          this.autoplayBlock  = r.uvtAutoplayBlock === true;
          this.pauseOffscreen = r.uvtPauseOffscreen === true;
          // siteSpeed applied in session.applyTo via uvtSpeeds
          const siteSpeed = (r.uvtSpeeds || {})[this.#site] || 1;
          if (siteSpeed !== 1 && !this.session.get('rate')) this.session.save({ rate: siteSpeed });
          if (r.uvtSubtitleStyle) this.#applySubtitleStyle(r.uvtSubtitleStyle);
          resolve();
        }
      );
    });
  }

  #listenStorageChanges() {
    chrome.storage.onChanged.addListener(() => {
      chrome.storage.local.get(['uvtGlobal', 'uvtEnabledSites'], (r) => {
        const wasEnabled = this.enabled;
        const enabledSites = r.uvtEnabledSites || [];
        this.enabled = r.uvtGlobal === true || enabledSites.includes(this.#site);

        if (!this.enabled) {
          if (this.scanner) this.ui.hideAll(); // only if we ever actually mounted anything to hide
          return;
        }
        if (wasEnabled) return;
        // Just got switched on from the popup.
        if (this.scanner) this.findDefaultVideo(); // already set up earlier this page load — just re-detect
        else this.#activate(); // never set up at all — do the full activation now, for the first time
      });
    });
  }

  // ── Button callback dispatch (called by ToolbarUI) ────────────────────────────
  #buildCallbacks() {
    return {
      isEnabled:    () => this.enabled,
      isRecording:  () => this.recorder.isRecording(this.ui.currentVideo),
      onPillShow:   (v) => { this.ui.updatePill(this.booster, this.recorder); this.reportState(v); },
      onExpand:     (v) => this.ui.syncBar(v, this.booster, this.#cinemaVideos.has(v)),
      onCollapse:   ()  => this.ui.updatePill(this.booster, this.recorder),
      onTimeUpdate: ()  => this.ui.updatePill(this.booster, this.recorder),
      onButtonClick: (action, video, arg) => this.#handleAction(action, video, arg),
    };
  }

  #handleAction(action, video, arg) {
    this.stats.logAction(action);
    switch (action) {
      case 'setRate': this.#setRate(video, arg); break;
      case 'seek':    this.#seek(video, arg); break;
      case 'mute':    this.#toggleMute(video); break;
      case 'loop':    this.#toggleLoop(video); break;
      case 'solo':    this.#soloAudio(video); break;
      case 'pip':     this.#togglePip(video); break;
      case 'fullscreen': this.#toggleFullscreen(video); break;
      case 'rotate':  this.#rotate(video, arg); break;
      case 'cinema':  this.#toggleCinema(video); break;
      case 'vol':     this.#cycleBoost(video); break;
      case 'normalize': this.#toggleNormalize(video); break;
      case 'cc':      this.#cycleCaptions(video); break;
      case 'shot':    this.#screenshot(video); break;
      case 'copyTs':  this.#copyTimestamp(video); break;
      case 'rec':     this.#toggleRecord(video); break;
      case 'dl':      this.#triggerDownload(video); break;
    }
  }

  // ── Individual action handlers ────────────────────────────────────────────────
  #setRate(video, rate) {
    video.playbackRate = rate;
    this.ui.spdEl.textContent = rate + 'x';
    this.session.saveSpeed(rate);
    this.session.save({ rate });
    this.ui.updatePill(this.booster, this.recorder);
    this.ui.flash(video, 'speed', rate + 'x', 900);
    this.reportState(video);
    if (this.#isYT && chrome.runtime?.id) {
      try { chrome.runtime.sendMessage({ type: 'uvt-inject-speed', rate }).catch(() => {}); } catch {}
    }
  }

  #seek(video, direction) {
    video.currentTime = Math.max(0, Math.min(video.duration || 1e9, video.currentTime + direction * this.seekStep));
    this.ui.flash(video, direction > 0 ? 'seekFwd' : 'seekBack', (direction > 0 ? '+' : '−') + this.seekStep + 's', 700);
  }

  /** Single-frame nudge — pauses first (stepping through frames while playing isn't perceptible). */
  #frameStep(video, direction) {
    if (!video.paused) video.pause();
    const FRAME = 1 / 30; // no reliable cross-site fps signal; 30fps is a safe, common default
    video.currentTime = Math.max(0, Math.min(video.duration || 1e9, video.currentTime + direction * FRAME));
    this.ui.flash(video, direction > 0 ? 'frameFwd' : 'frameBack', direction > 0 ? '+1 frame' : '−1 frame', 500);
  }

  #toggleMute(video) {
    video.muted = !video.muted;
    this.ui.muteBtn.classList.toggle('active', video.muted);
    // Sites like Instagram/TikTok-style feeds hand you a brand-new <video> element
    // per item, muted by default (autoplay policy) — without this, every single
    // new item would need re-unmuting by hand. Remembering it here means it now
    // rides the same session.applyTo() reapplication as loop/boost/cc/eq.
    this.session.save({ muted: video.muted });
    this.ui.flash(video, video.muted ? 'mute' : 'unmute', video.muted ? 'Muted' : 'Unmuted', 800);
  }

  #toggleLoop(video) {
    video.loop = !video.loop;
    this.ui.loopBtn.classList.toggle('active', video.loop);
    this.session.save({ loop: video.loop });
    this.ui.flash(video, 'loop', video.loop ? 'Loop On' : 'Loop Off', 900);
    this.reportState(video);
  }

  /** One-shot: mutes every other <video> on the page. Handy for feeds/pages that autoplay several at once. */
  #soloAudio(video) {
    let muted = 0;
    document.querySelectorAll('video').forEach((v) => {
      if (v !== video && !v.muted) { v.muted = true; muted++; }
    });
    this.ui.flash(video, 'solo', muted ? `Muted ${muted} other${muted > 1 ? 's' : ''}` : 'Nothing else playing', 900);
  }

  async #togglePip(video) {
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await video.requestPictureInPicture();
    } catch { this.ui.toast('Picture-in-picture unavailable for this player.'); }
  }

  /**
   * Always fullscreens the bare <video>, never a parent container. That used
   * to prefer a "tight fitting" parent so our overlay stayed visible during
   * fullscreen — but ToolbarUI re-parents our shadow host into whatever
   * becomes document.fullscreenElement, and on sites like Instagram the
   * video's immediate parent is the whole post/ad card, which commonly has a
   * "click anywhere on this card" handler for sponsored posts. Shadow DOM
   * click events are composed (they bubble out past the shadow boundary into
   * the real page), so once our overlay lived inside that card, clicking our
   * *own* buttons bubbled straight into the site's click handler — on an ad
   * post, that's a navigation. Fullscreening the video only means our overlay
   * goes invisible during fullscreen (<video> doesn't render children), but
   * that's a purely cosmetic tradeoff — keyboard shortcuts still work, since
   * they're bound at the document level, not the overlay.
   */
  async #toggleFullscreen(video) {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        this.ui.flash(video, 'fullscreen', 'Fullscreen Off', 700);
        return;
      }
      await video.requestFullscreen();
      this.ui.flash(video, 'fullscreen', 'Fullscreen On', 700);
    } catch { this.ui.toast('Fullscreen unavailable for this player.'); }
  }

  /** direction: -1 rotates left (CCW), +1 rotates right (CW), stepping 90° at a time with wraparound. */
  #rotate(video, direction) {
    const cur = this.#rotations.get(video) || 0;
    const next = (cur + direction * 90 + 360) % 360; // +360 keeps the result positive for the left/-90 case
    this.#rotations.set(video, next);
    this.#applyRotation(video, next);
    this.ui.flash(video, direction < 0 ? 'rotateLeft' : 'rotateRight', next === 0 ? 'Rotation Reset' : next + '°', 700);
  }

  /**
   * Sets (or clears) the rotation transform, and keeps it applied. Two things
   * fight us here on heavily-scripted sites: the site's own CSS can carry a
   * conflicting `!important` rule, and — more commonly on React-driven UIs
   * like Instagram — the framework re-renders the video element on its own
   * schedule and simply rewrites the style attribute back to what *it* thinks
   * it should be, silently wiping out our mutation. `!important` handles the
   * first; a MutationObserver that reasserts the value whenever the style
   * attribute changes handles the second. The observer's own writes would
   * normally re-trigger itself — guarded by checking whether the value is
   * already correct before writing, so it settles after one extra no-op tick
   * instead of looping.
   */
  #applyRotation(video, deg) {
    let observer = this.#rotationObservers.get(video);
    if (deg === 0) {
      observer?.disconnect();
      this.#rotationObservers.delete(video);
      video.style.removeProperty('transform');
      video.style.removeProperty('transform-origin');
      return;
    }

    const r = video.getBoundingClientRect();
    const scale = r.width > 0 && r.height > 0 ? Math.min(r.width / r.height, r.height / r.width) : 1;
    const transformValue = `rotate(${deg}deg) scale(${scale})`;

    const write = () => {
      if (video.style.getPropertyValue('transform') === transformValue) return;
      video.style.setProperty('transform-origin', 'center center', 'important');
      video.style.setProperty('transform', transformValue, 'important');
    };
    write();

    if (!observer) {
      observer = new MutationObserver(write);
      observer.observe(video, { attributes: true, attributeFilter: ['style'] });
      this.#rotationObservers.set(video, observer);
    }
  }

  /**
   * Dims everything around the video via a huge box-shadow "spotlight" on the
   * video itself — simplest reliable way to do this without a separate overlay
   * element (which would need per-site clip-path math to line up). Only forces
   * position:relative when the video is currently static, since overriding an
   * existing relative/absolute/fixed position could break the page's own layout.
   */
  #toggleCinema(video) {
    if (this.#cinemaVideos.has(video)) {
      video.style.boxShadow = video.dataset.uvtOrigBoxShadow || '';
      if (video.dataset.uvtOrigPosition !== undefined) video.style.position = video.dataset.uvtOrigPosition;
      delete video.dataset.uvtOrigBoxShadow;
      delete video.dataset.uvtOrigPosition;
      this.#cinemaVideos.delete(video);
      this.ui.cinemaBtn.classList.remove('active');
      this.ui.flash(video, 'cinema', 'Cinema Mode Off', 700);
    } else {
      video.dataset.uvtOrigBoxShadow = video.style.boxShadow || '';
      if (getComputedStyle(video).position === 'static') {
        video.dataset.uvtOrigPosition = video.style.position || '';
        video.style.position = 'relative';
      }
      video.style.boxShadow = '0 0 0 9999px rgba(0,0,0,.88)';
      this.#cinemaVideos.add(video);
      this.ui.cinemaBtn.classList.add('active');
      this.ui.flash(video, 'cinema', 'Cinema Mode On', 700);
    }
  }

  #cycleBoost(video) {
    const cur  = this.booster.getIndex(video);
    const next = (cur + 1) % BOOSTS.length;
    const entry = this.booster.setDiscreteBoost(video, next);
    if (!entry) { this.ui.toast('Boost unavailable: this player already routes its own audio.'); return; }
    this.ui.volLabel.textContent = Math.round(BOOSTS[next] * 100) + '%';
    this.ui.volBtn.classList.toggle('active', next > 0);
    this.session.save({ boost: next, boostGain: BOOSTS[next] });
    this.ui.flash(video, 'volume', Math.round(BOOSTS[next] * 100) + '%', 800);
    this.ui.updatePill(this.booster, this.recorder);
    this.reportState(video);
  }

  /** Patches a DynamicsCompressorNode in/out of the audio chain to even out quiet/loud parts. */
  #toggleNormalize(video) {
    const entry = this.booster.toggleNormalize(video);
    if (!entry) { this.ui.toast('Normalization unavailable: this player already routes its own audio.'); return; }
    this.ui.normalizeBtn.classList.toggle('active', entry.normalized);
    this.ui.flash(video, 'normalize', entry.normalized ? 'Normalize On' : 'Normalize Off', 800);
  }

  #cycleCaptions(video) {
    const tracks = Array.from(video.textTracks || []);
    if (!tracks.length) { this.ui.toast('This player exposes no caption tracks to cycle.'); return; }
    const cur = tracks.findIndex((t) => t.mode === 'showing');
    tracks.forEach((t) => (t.mode = 'hidden'));
    const next = cur + 1;
    if (next < tracks.length) {
      tracks[next].mode = 'showing';
      this.ui.ccBtn.classList.add('active');
      this.session.save({ cc: true });
      this.ui.flash(video, 'cc', 'CC: ' + (tracks[next].label || tracks[next].language || 'Track ' + (next + 1)), 1000);
    } else {
      this.ui.ccBtn.classList.remove('active');
      this.session.save({ cc: false });
      this.ui.flash(video, 'cc', 'CC Off', 800);
    }
    this.reportState(video);
  }

  #screenshot(video) {
    try {
      const c = document.createElement('canvas');
      c.width = video.videoWidth; c.height = video.videoHeight;
      c.getContext('2d').drawImage(video, 0, 0);
      const a = document.createElement('a');
      a.download = `frame-${this.#site}-${Math.floor(video.currentTime)}s.png`;
      a.href = c.toDataURL('image/png');
      a.click();
      // Best-effort clipboard copy alongside the download — silently skipped
      // if the browser withholds clipboard-write in this context.
      c.toBlob((blob) => {
        if (!blob || !navigator.clipboard?.write) return;
        navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).catch(() => {});
      });
      this.ui.flash(video, 'camera', 'Saved + Copied', 900);
    } catch { this.ui.toast('Screenshot blocked: this video is cross-origin protected.'); }
  }

  #copyTimestamp(video) {
    const t = Math.floor(video.currentTime);
    let url;
    try {
      const u = new URL(location.href);
      if (this.#isYT) u.searchParams.set('t', t + 's'); // native YouTube deep-link param
      else u.hash = 't=' + t;                            // Media Fragments syntax elsewhere
      url = u.toString();
    } catch { url = location.href; }

    if (!navigator.clipboard?.writeText) { this.ui.toast('Clipboard access unavailable here.'); return; }
    navigator.clipboard.writeText(url).then(
      () => this.ui.flash(video, 'link', formatTime(t) + ' link copied', 1000),
      () => this.ui.toast('Could not copy to clipboard.')
    );
  }

  #toggleRecord(video) {
    const started = this.recorder.toggle(video, {
      onStart: () => {
        this.ui.recBtn.classList.add('active');
        this.ui.recLabel.textContent = 'Stop';
        this.ui.updatePill(this.booster, this.recorder);
      },
      onStop: () => {
        this.ui.recBtn.classList.remove('active');
        this.ui.recLabel.textContent = 'Rec';
        this.ui.updatePill(this.booster, this.recorder);
      },
    });
    if (started === false) {
      this.ui.toast('Recording blocked for this video (protected or cross-origin).');
    } else if (this.recorder.isRecording(video)) {
      this.ui.toast('Recording what plays. Keep the tab open; press Stop to save.', 3200);
    }
  }

  #triggerDownload(video) {
    this.ui.hidePicker();
    const items = [];
    let direct = video.currentSrc || video.src || '';
    if (!direct) { const s = video.querySelector('source'); direct = s ? s.src : ''; }
    const usable = direct && !direct.startsWith('blob:') && !direct.startsWith('mediasource:');
    if (usable) items.push({ url: direct, size: 0, hint: video.videoHeight ? video.videoHeight + 'p' : '', label: 'player source' });

    chrome.runtime.sendMessage({ type: 'uvt-media-list' }, (resp) => {
      const sniffed = ((resp?.items) || [])
        .slice().sort((a, b) => b.time - a.time)
        .map((it) => ({ ...it, label: 'detected' }));
      for (const it of sniffed) if (!items.some((x) => x.url === it.url)) items.push(it);

      if (!items.length) {
        this.ui.toast('No downloadable file found — stream is segmented. Use ⏺ Rec to capture instead.');
        return;
      }
      if (items.length === 1) {
        chrome.runtime.sendMessage({ type: 'uvt-download', url: items[0].url, site: this.#site });
        this.ui.toast('Download started…', 1600);
        return;
      }
      this.ui.showDownloadPicker(items, this.#site);
    });
  }

  // ── Mousemove hit-test fallback ────────────────────────────────────────────
  #bindMouseMove() {
    let last = 0;
    document.addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      const now = Date.now();
      if (now - last < 300) return;
      last = now;
      for (const v of this.scanner.cachedVideos) {
        const r = v.getBoundingClientRect();
        if (r.width >= 80 && r.height >= 60 &&
            e.clientX >= r.left && e.clientX <= r.right &&
            e.clientY >= r.top  && e.clientY <= r.bottom) {
          this.ui.cancelHide();
          if (v !== this.ui.currentVideo || !this.ui.pill.classList.contains('show'))
            this.ui.showPill(v);
          return;
        }
      }
      if (this.ui.pill.classList.contains('show') &&
          !this.ui.bar.matches(':hover') && !this.ui.pill.matches(':hover'))
        this.ui.scheduleHide();
    }, true);
  }

  // ── Global keyboard shortcuts (Alt + key) ─────────────────────────────────────
  #bindKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (!this.enabled || !e.altKey || e.ctrlKey || e.metaKey) return;
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName) || e.target.isContentEditable) return;
      const k = e.key;
      // Alt+Left/Right is the browser's native back/forward shortcut. Only steal
      // it while the overlay is actively visible (user is engaged with a video) —
      // otherwise let navigation through untouched.
      if ((k === 'ArrowLeft' || k === 'ArrowRight') && !this.ui.isEngaged) return;
      const v = this.scanner.shortcutTarget();
      if (!v) return;
      let handled = true;
      let actionName = null;
      if      (k === 'ArrowLeft')  { this.#seek(v, -1); actionName = 'seek'; }  // flashes internally
      else if (k === 'ArrowRight') { this.#seek(v, +1); actionName = 'seek'; }  // flashes internally
      else if (k === 'ArrowUp') {
        const cur = SPEEDS.findIndex((s) => s >= v.playbackRate);
        const i = Math.min(SPEEDS.length - 1, (cur === -1 ? SPEEDS.length : cur) + 1);
        this.#setRate(v, SPEEDS[i]); // flashes internally
        actionName = 'setRate';
      } else if (k === 'ArrowDown') {
        const i = Math.max(0, SPEEDS.findIndex((s) => s >= v.playbackRate) - 1);
        this.#setRate(v, SPEEDS[i]); // flashes internally
        actionName = 'setRate';
      } else if (k.toLowerCase() === 'p') {
        if (document.pictureInPictureElement) document.exitPictureInPicture();
        else v.requestPictureInPicture().catch(() => {});
        actionName = 'pip';
      } else if (k.toLowerCase() === 'm') {
        this.#toggleMute(v); // flashes internally
        actionName = 'mute';
      } else if (k.toLowerCase() === 'f') {
        this.#toggleFullscreen(v); // flashes internally
        actionName = 'fullscreen';
      } else if (k.toLowerCase() === 'r') {
        this.#rotate(v, e.shiftKey ? -1 : +1); // Alt+R rotates right, Alt+Shift+R rotates left — flashes internally
        actionName = 'rotate';
      } else if (k === ',') {
        this.#frameStep(v, -1); // flashes internally
        actionName = 'frameStep';
      } else if (k === '.') {
        this.#frameStep(v, +1); // flashes internally
        actionName = 'frameStep';
      } else if (k === '[' || k === ']' || k === '\\') {
        this.abLoop.handle(v, k, (msg, ms) => this.ui.flash(v, 'loop', msg, ms));
        actionName = 'abloop';
      } else handled = false;
      if (actionName) this.stats.logAction(actionName);
      if (handled) { e.preventDefault(); e.stopPropagation(); }
    }, true);
  }

  // ── Chrome message listener ───────────────────────────────────────────────────
  #bindMessages() {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (!this.enabled) return;

      if (msg?.type === 'uvt-get-active-state') {
        this.findDefaultVideo();
        sendResponse(this.#getActiveState(this.#resolveTargetVideo()));
        return;
      }

      if (msg?.type === 'uvt-set-state') {
        const p = msg.patch;

        // Subtitle injection doesn't need a "current" video — it applies to every
        // video on the page now, and is remembered so it also lands on videos that
        // appear later (feeds / streaming sites that swap the <video> element out
        // from under us, e.g. on quality switches or ad breaks).
        if (p.subtitle !== undefined) {
          this.session.save({ subtitle: p.subtitle });
          const videos = document.querySelectorAll('video');
          if (!videos.length) {
            this.ui.toast('No video found yet — subtitles will attach automatically once one appears.', 2400);
          } else {
            videos.forEach((v) => this.applySubtitleToVideo(v, p.subtitle));
            this.ui.toast('Subtitles injected.', 1600);
          }
        }

        // Also page-wide, not tied to a specific video — the injected <track>
        // renders via the browser's native ::cue box regardless of which
        // element it's attached to.
        if (p.subtitleStyle !== undefined) {
          this.#applySubtitleStyle(p.subtitleStyle);
          this.ui.toast('Subtitle style updated.', 1000);
          this.stats.logAction('subtitleStyle');
        }

        const video = this.#resolveTargetVideo();
        if (!video) return;

        if (p.rate       !== undefined) { this.#setRate(video, p.rate); this.stats.logAction('setRate'); }
        if (p.loop       !== undefined) {
          video.loop = p.loop;
          this.ui.loopBtn.classList.toggle('active', video.loop);
          this.session.save({ loop: video.loop });
          this.ui.flash(video, 'loop', video.loop ? 'Loop On' : 'Loop Off', 900);
          this.reportState(video);
          this.stats.logAction('loop');
        }
        if (p.boost      !== undefined) {
          this.booster.setDiscreteBoost(video, p.boost);
          this.session.save({ boost: p.boost });
          this.ui.flash(video, 'volume', `${[100, 150, 200, 300][p.boost]}%`, 800);
          this.ui.updatePill(this.booster, this.recorder);
          this.reportState(video);
          this.stats.logAction('vol');
        }
        if (p.boostGain  !== undefined) {
          const entry = this.booster.setContinuousGain(video, p.boostGain);
          if (entry) {
            this.ui.volLabel.textContent = Math.round(p.boostGain * 100) + '%';
            this.ui.volBtn.classList.toggle('active', p.boostGain > 1);
            this.session.save({ boostGain: p.boostGain });
            this.ui.flash(video, 'volume', Math.round(p.boostGain * 100) + '%', 700);
            this.ui.updatePill(this.booster, this.recorder);
            this.reportState(video);
            this.stats.logAction('vol');
          }
        }
        if (p.cc         !== undefined) {
          const tracks = Array.from(video.textTracks || []);
          if (tracks.length) {
            tracks.forEach((t) => (t.mode = p.cc ? 'showing' : 'hidden'));
            this.ui.ccBtn.classList.toggle('active', p.cc);
            this.session.save({ cc: p.cc });
            this.ui.flash(video, 'cc', p.cc ? 'CC On' : 'CC Off', 800);
            this.stats.logAction('cc');
          } else if (p.cc) { this.ui.toast('No caption tracks found', 1200); }
          this.reportState(video);
        }
        if (p.action     === 'pip')  { this.#togglePip(video); this.stats.logAction('pip'); }
        if (p.seekStep   !== undefined) {
          this.seekStep = p.seekStep;
          this.ui.flash(video, 'seekStep', 'Seek Step ' + p.seekStep + 's', 900);
          this.stats.logAction('seekStep');
        }
        if (p.autoplayBlock !== undefined) {
          this.autoplayBlock = p.autoplayBlock;
          this.ui.flash(video, 'autoplay', 'Autoplay Block ' + (p.autoplayBlock ? 'On' : 'Off'), 900);
          this.stats.logAction('autoplayBlock');
        }
        if (p.pauseOffscreen !== undefined) {
          this.pauseOffscreen = p.pauseOffscreen;
          this.ui.flash(video, 'autoplay', 'Pause Off-Screen ' + (p.pauseOffscreen ? 'On' : 'Off'), 900);
          this.stats.logAction('pauseOffscreen');
        }
        if (p.eqBand     !== undefined) {
          const entry = this.booster.setEqBand(video, p.eqBand.index, p.eqBand.gain);
          if (entry) {
            this.session.save({ eq: this.booster.getEqGains(video) });
            this.ui.flash(video, 'eq', EQ_BANDS[p.eqBand.index] + ' Hz ' + (p.eqBand.gain > 0 ? '+' : '') + p.eqBand.gain + ' dB', 500);
            this.stats.logAction('eq');
          }
        }
        if (p.eqPreset   !== undefined) {
          const preset = EQ_PRESETS[p.eqPreset];
          if (preset) {
            const entry = this.booster.setEqAll(video, preset.gains);
            if (entry) {
              this.session.save({ eq: preset.gains });
              this.ui.flash(video, 'eq', preset.label + ' EQ', 800);
              this.stats.logAction('eqPreset');
            }
          }
        }
      }
    });
  }

  // ── State helpers ─────────────────────────────────────────────────────────────
  #getActiveState(video) {
    return {
      hasVideo: !!video,
      rate:     video ? video.playbackRate : 1,
      loop:     video ? video.loop : false,
      boost:    video ? this.booster.getIndex(video) : 0,
      boostGain: video ? this.booster.getGain(video) : 1,
      cc:       video ? Array.from(video.textTracks || []).some((t) => t.mode === 'showing') : false,
      eq:       video ? this.booster.getEqGains(video) : EQ_BANDS.map(() => 0),
    };
  }

  reportState(video) {
    // Don't let a disabled site leak an "active video" record into storage —
    // the popup would otherwise show live-looking controls that silently do
    // nothing, since #bindMessages ignores patches while disabled.
    if (!video || !this.enabled) return;
    if (!chrome.runtime?.id) return;
    try {
      chrome.runtime.sendMessage({
        type: 'uvt-report-state',
        state: this.#getActiveState(video),
      }).catch(() => {});
    } catch {}
  }

  findDefaultVideo() {
    if (this.ui.currentVideo) return;
    // Reuse the same "biggest, in-viewport, actually-playing" heuristic as
    // keyboard shortcuts — picking merely the first <video> in DOM order falls
    // over on pages that preload multiple videos (YouTube Shorts, feeds), where
    // it can silently attach to one that isn't the one on screen.
    const v = this.scanner.shortcutTarget() || document.querySelector('video');
    if (v) { this.ui.showPill(v); this.reportState(v); }
  }

  /** The video popup-driven changes should act on — re-attaches the overlay to it if needed. */
  #resolveTargetVideo() {
    const best = this.scanner.shortcutTarget();
    const video = best || this.ui.currentVideo || document.querySelector('video');
    if (video && video !== this.ui.currentVideo) this.ui.showPill(video);
    return video;
  }

  // ── Subtitle injection (public — also called by VideoScanner on newly wired videos) ──
  /**
   * @param {HTMLVideoElement} video
   * @param {{ text: string, format: 'srt'|'vtt', lang: string }} subtitle
   */
  applySubtitleToVideo(video, subtitle) {
    if (!subtitle) return;
    const { text, format, lang } = subtitle;
    let vttText = text;
    if (format === 'srt') {
      vttText = 'WEBVTT\n\n' + text.replace(/(\d\d:\d\d:\d\d),(\d\d\d)/g, '$1.$2');
    }

    video.querySelectorAll('.uvt-subtitle-track').forEach((t) => {
      if (t.src?.startsWith('blob:')) URL.revokeObjectURL(t.src);
      t.remove();
    });

    const blobUrl = URL.createObjectURL(new Blob([vttText], { type: 'text/vtt' }));
    const track = document.createElement('track');
    track.className = 'uvt-subtitle-track';
    track.kind      = 'subtitles';
    track.label     = 'Custom Injected Subtitles';
    track.srclang   = lang || 'en';
    track.src       = blobUrl;
    track.default   = true;
    if (lang === 'ar') track.setAttribute('dir', 'rtl');
    video.appendChild(track);

    for (const t of video.textTracks) {
      if (t.label === 'Custom Injected Subtitles') t.mode = 'showing';
    }
  }

  /**
   * Styles the native subtitle cue box via ::cue — applies to every video's
   * captions on the page (ours or the site's own), since it's just a global
   * stylesheet rule, not tied to a specific <track>.
   * @param {{ fontSize?: number, bgOpacity?: number }} style
   */
  #applySubtitleStyle(style) {
    let el = document.getElementById('uvt-subtitle-style');
    if (!el) {
      el = document.createElement('style');
      el.id = 'uvt-subtitle-style';
      (document.head || document.documentElement).appendChild(el);
    }
    const fontSize = style.fontSize || 20;
    const bgOpacity = style.bgOpacity !== undefined ? style.bgOpacity : 0.7;
    el.textContent = `video::cue { font-size: ${fontSize}px; background: rgba(0,0,0,${bgOpacity}); }`;
  }
}
