import { createRoot, type Root } from 'react-dom/client';
import { SPEEDS, BOOSTS, EQ_BANDS, EQ_PRESETS, formatTime, formatStreamTime } from '../shared/constants';
import { SessionManager } from '../shared/SessionManager';
import { AudioBooster } from '../shared/AudioBooster';
import { ABLoopManager } from '../shared/ABLoopManager';
import { VideoRecorder } from '../shared/VideoRecorder';
import { StatsTracker } from '../shared/StatsTracker';
import type { ActiveVideoState, MediaItem, RuntimeMessage, StorageShape, SubtitlePayload, SubtitleStyle } from '../shared/types';
import { UIStore } from './UIStore';
import { VideoScanner } from './VideoScanner';
import { NetworkTracker } from './NetworkTracker';
import { ToolbarRoot } from './components/ToolbarRoot';
import toolbarCss from './toolbar.css?inline';

const YT_RE = /(^|\.)youtube\.com$|(^|\.)youtu\.be$/;

export class VideoToolkit {
  // Sub-systems (public so VideoScanner / React components can reach them)
  session = new SessionManager();
  booster = new AudioBooster();
  abLoop = new ABLoopManager();
  recorder = new VideoRecorder();
  stats = new StatsTracker();
  store = new UIStore();
  netTracker = new NetworkTracker();
  scanner: VideoScanner | null = null; // created in #activate()

  #site = location.hostname;
  #isYT = YT_RE.test(location.hostname);
  #rotations = new WeakMap<HTMLVideoElement, number>(); // video -> current rotation degrees (0/90/180/270)
  #rotationObservers = new WeakMap<HTMLVideoElement, MutationObserver>(); // reasserts rotation if the site wipes it
  #cinemaVideos = new WeakSet<HTMLVideoElement>();
  #reactRoot: Root | null = null;
  #hostEl: HTMLElement | null = null;

  // Global settings — off by default; the user opts a site in via the popup
  // (or flips the "Enabled everywhere" master switch to cover every site).
  enabled = false;
  seekStep = 5;
  autoplayBlock = false;
  pauseOffscreen = false;

  /**
   * Entry point — called once on injection, on *every* page (Chrome has no
   * manifest-level way to only inject on approved sites while still keeping
   * the "hover to reveal controls" UX, since that needs the script present
   * before you know which video you'll hover). What we *can* control is how
   * much work happens before we know the site is enabled: this does only a
   * storage read and a lightweight change-listener on a disabled site — no
   * shadow DOM, no React mount, no document-wide MutationObserver, no
   * mousemove/keydown listeners — until the site is actually enabled.
   */
  async init() {
    await this.#loadSettings();
    this.#listenStorageChanges(); // cheap; needed even while disabled so enabling later activates without a reload
    if (this.enabled) this.#activate();
  }

  /** Everything that used to run unconditionally — now only once the site is actually enabled. */
  #activate() {
    if (this.scanner) return; // already activated this page load

    this.#hostEl = document.createElement('uvt-toolbar-host');
    this.#hostEl.style.cssText = 'position:fixed;z-index:2147483647;top:0;left:0;width:0;height:0;';
    (document.body || document.documentElement).appendChild(this.#hostEl);
    const shadowRoot = this.#hostEl.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = toolbarCss;
    shadowRoot.appendChild(style);

    const mountPoint = document.createElement('div');
    shadowRoot.appendChild(mountPoint);
    this.#reactRoot = createRoot(mountPoint);
    this.#reactRoot.render(<ToolbarRoot toolkit={this} hostEl={this.#hostEl} isYT={this.#isYT} />);

    this.scanner = new VideoScanner(this);
    this.store.setTimeUpdateHandler(() => this.refreshPill());
    this.scanner.scan(document);
    this.scanner.observe();
    this.#bindMouseMove();
    this.#bindKeyboard();
    this.#bindMessages();
    this.netTracker.start((stats) => {
      const v = this.store.currentVideo;
      if (v) {
        this.store.setBar({ videoSpeed: stats.videoSpeed, deviceSpeed: stats.deviceSpeed });
      }
    });
  }

  // ── Settings load ─────────────────────────────────────────────────────────────
  // Enablement is opt-in: off everywhere unless the site is on the allowlist,
  // or the "Enabled everywhere" master switch is on.
  #loadSettings(): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.get(
        ['uvtGlobal', 'uvtEnabledSites', 'uvtSpeeds', 'uvtSeekStep', 'uvtAutoplayBlock', 'uvtPauseOffscreen', 'uvtSubtitleStyle'],
        (r: StorageShape) => {
          const enabledSites: string[] = r.uvtEnabledSites || [];
          this.enabled = r.uvtGlobal === true || enabledSites.includes(this.#site);
          this.seekStep = r.uvtSeekStep || 5;
          this.autoplayBlock = r.uvtAutoplayBlock === true;
          this.pauseOffscreen = r.uvtPauseOffscreen === true;
          const siteSpeed = (r.uvtSpeeds || {})[this.#site] || 1;
          if (siteSpeed !== 1 && !this.session.get('rate')) this.session.save({ rate: siteSpeed });
          if (r.uvtSubtitleStyle) this.#applySubtitleStyle(r.uvtSubtitleStyle);
          resolve();
        },
      );
    });
  }

  #listenStorageChanges() {
    chrome.storage.onChanged.addListener(() => {
      chrome.storage.local.get(['uvtGlobal', 'uvtEnabledSites'], (r: StorageShape) => {
        const wasEnabled = this.enabled;
        const enabledSites: string[] = r.uvtEnabledSites || [];
        this.enabled = r.uvtGlobal === true || enabledSites.includes(this.#site);

        if (!this.enabled) {
          if (this.scanner) this.store.hideAll(false); // only if we ever actually mounted anything to hide
          return;
        }
        if (wasEnabled) return;
        // Just got switched on from the popup.
        if (this.scanner) this.findDefaultVideo(); // already set up earlier this page load — just re-detect
        else this.#activate(); // never set up at all — do the full activation now, for the first time
      });
    });
  }

  // ── Pill/bar attach — the single place a video becomes "current" ─────────────
  /** Attaches the overlay to a video and fully resyncs pill + bar state for it. */
  showPill(video: HTMLVideoElement) {
    this.store.showPill(video);
    this.#refreshBar(video);
    this.refreshPill();
    this.reportState(video);
  }

  #refreshBar(video: HTMLVideoElement) {
    const netStats = this.netTracker.measure(video);
    this.store.setBar({
      rate: video.playbackRate,
      loop: video.loop,
      muted: video.muted,
      volPct: Math.round(this.booster.getGain(video) * 100),
      boosted: this.booster.isBoosted(video),
      normalized: this.booster.isNormalized(video),
      cinema: this.#cinemaVideos.has(video),
      cc: Array.from(video.textTracks || []).some((t) => t.mode === 'showing'),
      recording: this.recorder.isRecording(video),
      videoSpeed: netStats.videoSpeed,
      deviceSpeed: netStats.deviceSpeed,
    });
  }

  refreshPill() {
    const video = this.store.currentVideo;
    if (!video) return;
    const streamStr = formatStreamTime(video.currentTime, video.duration);
    const ts = streamStr ? ` · ${streamStr}` : '';
    const boostGain = this.booster.getGain(video);
    const boostLabel = boostGain > 1 ? ` · ${Math.round(boostGain * 100)}%` : '';
    const recLabel = this.recorder.isRecording(video) ? `Rec (${formatTime(this.recorder.elapsedSeconds(video))}) · ` : '';
    this.store.setPill(`${recLabel}${video.playbackRate}x${boostLabel}${ts}`);
  }

  // ── Button action dispatch (called by React components) ──────────────────────
  handleAction(action: string, arg?: number) {
    const video = this.store.currentVideo;
    if (!video) return;
    this.stats.logAction(action);
    switch (action) {
      case 'setRate':
        this.#setRate(video, arg!);
        break;
      case 'seek':
        this.#seek(video, arg!);
        break;
      case 'mute':
        this.#toggleMute(video);
        break;
      case 'loop':
        this.#toggleLoop(video);
        break;
      case 'solo':
        this.#soloAudio(video);
        break;
      case 'pip':
        this.#togglePip(video);
        break;
      case 'fullscreen':
        this.#toggleFullscreen(video);
        break;
      case 'rotate':
        this.#rotate(video, arg! as -1 | 1);
        break;
      case 'cinema':
        this.#toggleCinema(video);
        break;
      case 'vol':
        this.#cycleBoost(video);
        break;
      case 'normalize':
        this.#toggleNormalize(video);
        break;
      case 'cc':
        this.#cycleCaptions(video);
        break;
      case 'shot':
        this.#screenshot(video);
        break;
      case 'copyTs':
        this.#copyTimestamp(video);
        break;
      case 'rec':
        this.#toggleRecord(video);
        break;
      case 'dl':
        this.#triggerDownload(video);
        break;
      case 'netSpeed': {
        const stats = this.netTracker.measure(video);
        this.store.toast(`Network: ${stats.videoSpeed} · ${stats.deviceSpeed}`, 2600);
        break;
      }
    }
  }

  // ── Individual action handlers ────────────────────────────────────────────────
  #setRate(video: HTMLVideoElement, rate: number) {
    video.playbackRate = rate;
    this.store.setBar({ rate });
    this.session.saveSpeed(rate);
    this.session.save({ rate });
    this.store.flash('speed', rate + 'x', 900, video);
    this.reportState(video);
    if (this.#isYT && chrome.runtime?.id) {
      try {
        chrome.runtime.sendMessage({ type: 'uvt-inject-speed', rate } satisfies RuntimeMessage).catch(() => {});
      } catch {
        /* extension context invalidated */
      }
    }
  }

  #seek(video: HTMLVideoElement, direction: number) {
    video.currentTime = Math.max(0, Math.min(video.duration || 1e9, video.currentTime + direction * this.seekStep));
    this.store.flash(direction > 0 ? 'seekFwd' : 'seekBack', (direction > 0 ? '+' : '−') + this.seekStep + 's', 700, video);
  }

  /** Single-frame nudge — pauses first (stepping through frames while playing isn't perceptible). */
  #frameStep(video: HTMLVideoElement, direction: number) {
    if (!video.paused) video.pause();
    const FRAME = 1 / 30; // no reliable cross-site fps signal; 30fps is a safe, common default
    video.currentTime = Math.max(0, Math.min(video.duration || 1e9, video.currentTime + direction * FRAME));
    this.store.flash(direction > 0 ? 'frameFwd' : 'frameBack', direction > 0 ? '+1 frame' : '−1 frame', 500, video);
  }

  #toggleMute(video: HTMLVideoElement) {
    video.muted = !video.muted;
    this.store.setBar({ muted: video.muted });
    // Sites like Instagram/TikTok-style feeds hand you a brand-new <video> element
    // per item, muted by default (autoplay policy) — without this, every single
    // new item would need re-unmuting by hand. Remembering it here means it now
    // rides the same session.applyTo() reapplication as loop/boost/cc/eq.
    this.session.save({ muted: video.muted });
    this.store.flash(video.muted ? 'mute' : 'unmute', video.muted ? 'Muted' : 'Unmuted', 800, video);
  }

  #toggleLoop(video: HTMLVideoElement) {
    video.loop = !video.loop;
    this.store.setBar({ loop: video.loop });
    this.session.save({ loop: video.loop });
    this.store.flash('loop', video.loop ? 'Loop On' : 'Loop Off', 900, video);
    this.reportState(video);
  }

  /** One-shot: mutes every other <video> on the page. Handy for feeds/pages that autoplay several at once. */
  #soloAudio(video: HTMLVideoElement) {
    let muted = 0;
    document.querySelectorAll('video').forEach((v) => {
      if (v !== video && !v.muted) {
        v.muted = true;
        muted++;
      }
    });
    this.store.flash('solo', muted ? `Muted ${muted} other${muted > 1 ? 's' : ''}` : 'Nothing else playing', 900, video);
  }

  async #togglePip(video: HTMLVideoElement) {
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await video.requestPictureInPicture();
    } catch {
      this.store.toast('Picture-in-picture unavailable for this player.');
    }
  }

  /**
   * Always fullscreens the bare <video>, never a parent container. Shadow DOM
   * click events are composed (they bubble out past the shadow boundary into
   * the real page), so if our overlay's host ever lived inside a site's
   * "click anywhere on this card" post/ad wrapper during fullscreen, clicking
   * our own buttons would bubble straight into the site's handler. Fullscreening
   * the video only means our overlay goes invisible during fullscreen (<video>
   * doesn't render children), but that's a purely cosmetic tradeoff — keyboard
   * shortcuts still work, since they're bound at the document level.
   */
  async #toggleFullscreen(video: HTMLVideoElement) {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        this.store.flash('fullscreen', 'Fullscreen Off', 700, video);
        return;
      }
      await video.requestFullscreen();
      this.store.flash('fullscreen', 'Fullscreen On', 700, video);
    } catch {
      this.store.toast('Fullscreen unavailable for this player.');
    }
  }

  /** direction: -1 rotates left (CCW), +1 rotates right (CW), stepping 90° at a time with wraparound. */
  #rotate(video: HTMLVideoElement, direction: -1 | 1) {
    const cur = this.#rotations.get(video) || 0;
    const next = (cur + direction * 90 + 360) % 360; // +360 keeps the result positive for the left/-90 case
    this.#rotations.set(video, next);
    this.#applyRotation(video, next);
    this.store.flash(direction < 0 ? 'rotateLeft' : 'rotateRight', next === 0 ? 'Rotation Reset' : next + '°', 700, video);
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
  #applyRotation(video: HTMLVideoElement, deg: number) {
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
  #toggleCinema(video: HTMLVideoElement) {
    if (this.#cinemaVideos.has(video)) {
      video.style.boxShadow = video.dataset.uvtOrigBoxShadow || '';
      if (video.dataset.uvtOrigPosition !== undefined) video.style.position = video.dataset.uvtOrigPosition;
      delete video.dataset.uvtOrigBoxShadow;
      delete video.dataset.uvtOrigPosition;
      this.#cinemaVideos.delete(video);
      this.store.setBar({ cinema: false });
      this.store.flash('cinema', 'Cinema Mode Off', 700, video);
    } else {
      video.dataset.uvtOrigBoxShadow = video.style.boxShadow || '';
      if (getComputedStyle(video).position === 'static') {
        video.dataset.uvtOrigPosition = video.style.position || '';
        video.style.position = 'relative';
      }
      video.style.boxShadow = '0 0 0 9999px rgba(0,0,0,.88)';
      this.#cinemaVideos.add(video);
      this.store.setBar({ cinema: true });
      this.store.flash('cinema', 'Cinema Mode On', 700, video);
    }
  }

  #cycleBoost(video: HTMLVideoElement) {
    const cur = this.booster.getIndex(video);
    const next = (cur + 1) % BOOSTS.length;
    const entry = this.booster.setDiscreteBoost(video, next);
    if (!entry) {
      this.store.toast('Boost unavailable: this player already routes its own audio.');
      return;
    }
    this.store.setBar({ volPct: Math.round(BOOSTS[next] * 100), boosted: next > 0 });
    this.session.save({ boost: next, boostGain: BOOSTS[next] });
    this.store.flash('volume', Math.round(BOOSTS[next] * 100) + '%', 800, video);
    this.reportState(video);
  }

  /** Patches a DynamicsCompressorNode in/out of the audio chain to even out quiet/loud parts. */
  #toggleNormalize(video: HTMLVideoElement) {
    const entry = this.booster.toggleNormalize(video);
    if (!entry) {
      this.store.toast('Normalization unavailable: this player already routes its own audio.');
      return;
    }
    this.store.setBar({ normalized: entry.normalized });
    this.store.flash('normalize', entry.normalized ? 'Normalize On' : 'Normalize Off', 800, video);
  }

  #cycleCaptions(video: HTMLVideoElement) {
    const tracks = Array.from(video.textTracks || []);
    if (!tracks.length) {
      this.store.toast('This player exposes no caption tracks to cycle.');
      return;
    }
    const cur = tracks.findIndex((t) => t.mode === 'showing');
    tracks.forEach((t) => (t.mode = 'hidden'));
    const next = cur + 1;
    if (next < tracks.length) {
      tracks[next].mode = 'showing';
      this.store.setBar({ cc: true });
      this.session.save({ cc: true });
      this.store.flash('cc', 'CC: ' + (tracks[next].label || tracks[next].language || 'Track ' + (next + 1)), 1000, video);
    } else {
      this.store.setBar({ cc: false });
      this.session.save({ cc: false });
      this.store.flash('cc', 'CC Off', 800, video);
    }
    this.reportState(video);
  }

  #screenshot(video: HTMLVideoElement) {
    try {
      const c = document.createElement('canvas');
      c.width = video.videoWidth;
      c.height = video.videoHeight;
      c.getContext('2d')!.drawImage(video, 0, 0);
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
      this.store.flash('camera', 'Saved + Copied', 900, video);
    } catch {
      this.store.toast('Screenshot blocked: this video is cross-origin protected.');
    }
  }

  #copyTimestamp(video: HTMLVideoElement) {
    const t = Math.floor(video.currentTime);
    let url: string;
    try {
      const u = new URL(location.href);
      if (this.#isYT) u.searchParams.set('t', t + 's'); // native YouTube deep-link param
      else u.hash = 't=' + t; // Media Fragments syntax elsewhere
      url = u.toString();
    } catch {
      url = location.href;
    }

    if (!navigator.clipboard?.writeText) {
      this.store.toast('Clipboard access unavailable here.');
      return;
    }
    navigator.clipboard.writeText(url).then(
      () => this.store.flash('link', formatTime(t) + ' link copied', 1000, video),
      () => this.store.toast('Could not copy to clipboard.'),
    );
  }

  #toggleRecord(video: HTMLVideoElement) {
    const started = this.recorder.toggle(video, {
      onStart: () => {
        this.store.setBar({ recording: true });
      },
      onStop: () => {
        this.store.setBar({ recording: false });
      },
    });
    if (started === false) {
      this.store.toast('Recording blocked for this video (protected or cross-origin).');
    } else if (this.recorder.isRecording(video)) {
      this.store.toast('Recording what plays. Keep the tab open; press Stop to save.', 3200);
    }
  }

  #triggerDownload(video: HTMLVideoElement) {
    this.store.hidePicker();
    const items: MediaItem[] = [];
    let direct = video.currentSrc || video.src || '';
    if (!direct) {
      const s = video.querySelector('source');
      direct = s ? s.src : '';
    }
    const usable = direct && !direct.startsWith('blob:') && !direct.startsWith('mediasource:');
    if (usable) items.push({ url: direct, size: 0, hint: video.videoHeight ? video.videoHeight + 'p' : '', time: Date.now(), label: 'player source' });

    chrome.runtime.sendMessage({ type: 'uvt-media-list' } satisfies RuntimeMessage, (resp: { items?: MediaItem[] } | undefined) => {
      const sniffed = (resp?.items || [])
        .slice()
        .sort((a, b) => b.time - a.time)
        .map((it) => ({ ...it, label: 'detected' }));
      for (const it of sniffed) if (!items.some((x) => x.url === it.url)) items.push(it);

      if (!items.length) {
        this.store.toast('No downloadable file found — stream is segmented. Use ⏺ Rec to capture instead.');
        return;
      }
      if (items.length === 1) {
        chrome.runtime.sendMessage({ type: 'uvt-download', url: items[0].url, site: this.#site } satisfies RuntimeMessage);
        this.store.toast('Download started…', 1600);
        return;
      }
      this.store.setPicker(items, this.#site);
    });
  }

  startDownload(url: string) {
    if (chrome.runtime?.id) {
      try {
        chrome.runtime.sendMessage({ type: 'uvt-download', url, site: this.#site } satisfies RuntimeMessage);
      } catch {
        /* extension context invalidated */
      }
    }
    this.store.hidePicker();
    this.store.toast('Download started…', 1600);
  }

  // ── Mousemove hit-test fallback ────────────────────────────────────────────
  #bindMouseMove() {
    let last = 0;
    document.addEventListener(
      'mousemove',
      (e) => {
        if (!this.enabled) return;
        const now = Date.now();
        if (now - last < 300) return;
        last = now;
        // Safe: only bound from inside #activate(), which sets this.scanner first.
        for (const v of this.scanner!.cachedVideos) {
          const r = v.getBoundingClientRect();
          if (r.width >= 80 && r.height >= 60 && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
            this.store.cancelHide();
            if (v !== this.store.currentVideo) this.showPill(v);
            return;
          }
        }
      },
      true,
    );
  }

  // ── Global keyboard shortcuts (Alt + key) ─────────────────────────────────────
  #bindKeyboard() {
    document.addEventListener(
      'keydown',
      (e) => {
        if (!this.enabled || !e.altKey || e.ctrlKey || e.metaKey) return;
        const target = e.target as HTMLElement;
        if (['INPUT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable) return;
        const k = e.key;
        // Alt+Left/Right is the browser's native back/forward shortcut. Only steal
        // it while the overlay is actively visible (user is engaged with a video) —
        // otherwise let navigation through untouched.
        if ((k === 'ArrowLeft' || k === 'ArrowRight') && !this.store.isEngaged()) return;
        const v = this.scanner!.shortcutTarget();
        if (!v) return;
        let handled = true;
        let actionName: string | null = null;
        if (k === 'ArrowLeft') {
          this.#seek(v, -1);
          actionName = 'seek';
        } else if (k === 'ArrowRight') {
          this.#seek(v, +1);
          actionName = 'seek';
        } else if (k === 'ArrowUp') {
          const cur = SPEEDS.findIndex((s) => s >= v.playbackRate);
          const i = Math.min(SPEEDS.length - 1, (cur === -1 ? SPEEDS.length : cur) + 1);
          this.#setRate(v, SPEEDS[i]);
          actionName = 'setRate';
        } else if (k === 'ArrowDown') {
          const i = Math.max(0, SPEEDS.findIndex((s) => s >= v.playbackRate) - 1);
          this.#setRate(v, SPEEDS[i]);
          actionName = 'setRate';
        } else if (k.toLowerCase() === 'p') {
          if (document.pictureInPictureElement) document.exitPictureInPicture();
          else v.requestPictureInPicture().catch(() => {});
          actionName = 'pip';
        } else if (k.toLowerCase() === 'm') {
          this.#toggleMute(v);
          actionName = 'mute';
        } else if (k.toLowerCase() === 'f') {
          this.#toggleFullscreen(v);
          actionName = 'fullscreen';
        } else if (k.toLowerCase() === 'r') {
          this.#rotate(v, e.shiftKey ? -1 : +1); // Alt+R rotates right, Alt+Shift+R rotates left
          actionName = 'rotate';
        } else if (k === ',') {
          this.#frameStep(v, -1);
          actionName = 'frameStep';
        } else if (k === '.') {
          this.#frameStep(v, +1);
          actionName = 'frameStep';
        } else if (k === '[' || k === ']' || k === '\\') {
          this.abLoop.handle(v, k, (msg, ms) => this.store.flash('loop', msg, ms, v));
          actionName = 'abloop';
        } else handled = false;
        if (actionName) this.stats.logAction(actionName);
        if (handled) {
          e.preventDefault();
          e.stopPropagation();
        }
      },
      true,
    );
  }

  // ── Chrome message listener ───────────────────────────────────────────────────
  #bindMessages() {
    chrome.runtime.onMessage.addListener((msg: RuntimeMessage, _sender, sendResponse) => {
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
            this.store.toast('No video found yet — subtitles will attach automatically once one appears.', 2400);
          } else {
            videos.forEach((v) => this.applySubtitleToVideo(v, p.subtitle!));
            this.store.toast('Subtitles injected.', 1600);
          }
        }

        // Also page-wide, not tied to a specific video — the injected <track>
        // renders via the browser's native ::cue box regardless of which
        // element it's attached to.
        if (p.subtitleStyle !== undefined) {
          this.#applySubtitleStyle(p.subtitleStyle);
          this.store.toast('Subtitle style updated.', 1000);
          this.stats.logAction('subtitleStyle');
        }

        const video = this.#resolveTargetVideo();
        if (!video) return;

        if (p.rate !== undefined) {
          this.#setRate(video, p.rate);
          this.stats.logAction('setRate');
        }
        if (p.loop !== undefined) {
          video.loop = p.loop;
          this.store.setBar({ loop: video.loop });
          this.session.save({ loop: video.loop });
          this.store.flash('loop', video.loop ? 'Loop On' : 'Loop Off', 900, video);
          this.reportState(video);
          this.stats.logAction('loop');
        }
        if (p.boost !== undefined) {
          this.booster.setDiscreteBoost(video, p.boost);
          this.session.save({ boost: p.boost });
          this.store.flash('volume', `${[100, 150, 200, 300][p.boost]}%`, 800, video);
          this.reportState(video);
          this.stats.logAction('vol');
        }
        if (p.boostGain !== undefined) {
          const entry = this.booster.setContinuousGain(video, p.boostGain);
          if (entry) {
            this.store.setBar({ volPct: Math.round(p.boostGain * 100), boosted: p.boostGain > 1 });
            this.session.save({ boostGain: p.boostGain });
            this.store.flash('volume', Math.round(p.boostGain * 100) + '%', 700, video);
            this.reportState(video);
            this.stats.logAction('vol');
          }
        }
        if (p.cc !== undefined) {
          const tracks = Array.from(video.textTracks || []);
          if (tracks.length) {
            tracks.forEach((t) => (t.mode = p.cc ? 'showing' : 'hidden'));
            this.store.setBar({ cc: p.cc });
            this.session.save({ cc: p.cc });
            this.store.flash('cc', p.cc ? 'CC On' : 'CC Off', 800, video);
            this.stats.logAction('cc');
          } else if (p.cc) {
            this.store.toast('No caption tracks found', 1200);
          }
          this.reportState(video);
        }
        if (p.action === 'pip') {
          this.#togglePip(video);
          this.stats.logAction('pip');
        }
        if (p.seekStep !== undefined) {
          this.seekStep = p.seekStep;
          this.store.flash('seekStep', 'Seek Step ' + p.seekStep + 's', 900, video);
          this.stats.logAction('seekStep');
        }
        if (p.autoplayBlock !== undefined) {
          this.autoplayBlock = p.autoplayBlock;
          this.store.flash('autoplay', 'Autoplay Block ' + (p.autoplayBlock ? 'On' : 'Off'), 900, video);
          this.stats.logAction('autoplayBlock');
        }
        if (p.pauseOffscreen !== undefined) {
          this.pauseOffscreen = p.pauseOffscreen;
          this.store.flash('autoplay', 'Pause Off-Screen ' + (p.pauseOffscreen ? 'On' : 'Off'), 900, video);
          this.stats.logAction('pauseOffscreen');
        }
        if (p.eqBand !== undefined) {
          const entry = this.booster.setEqBand(video, p.eqBand.index, p.eqBand.gain);
          if (entry) {
            this.session.save({ eq: this.booster.getEqGains(video) });
            this.store.flash('eq', EQ_BANDS[p.eqBand.index] + ' Hz ' + (p.eqBand.gain > 0 ? '+' : '') + p.eqBand.gain + ' dB', 500, video);
            this.stats.logAction('eq');
          }
        }
        if (p.eqPreset !== undefined) {
          const preset = EQ_PRESETS[p.eqPreset];
          if (preset) {
            const entry = this.booster.setEqAll(video, preset.gains);
            if (entry) {
              this.session.save({ eq: preset.gains });
              this.store.flash('eq', preset.label + ' EQ', 800, video);
              this.stats.logAction('eqPreset');
            }
          }
        }
      }
    });
  }

  // ── State helpers ─────────────────────────────────────────────────────────────
  #getActiveState(video: HTMLVideoElement | null): ActiveVideoState {
    return {
      hasVideo: !!video,
      rate: video ? video.playbackRate : 1,
      loop: video ? video.loop : false,
      boost: video ? this.booster.getIndex(video) : 0,
      boostGain: video ? this.booster.getGain(video) : 1,
      cc: video ? Array.from(video.textTracks || []).some((t) => t.mode === 'showing') : false,
      eq: video ? this.booster.getEqGains(video) : EQ_BANDS.map(() => 0),
    };
  }

  reportState(video: HTMLVideoElement | null) {
    // Don't let a disabled site leak an "active video" record into storage —
    // the popup would otherwise show live-looking controls that silently do
    // nothing, since #bindMessages ignores patches while disabled.
    if (!video || !this.enabled) return;
    if (!chrome.runtime?.id) return;
    try {
      chrome.runtime
        .sendMessage({ type: 'uvt-report-state', state: this.#getActiveState(video) } satisfies RuntimeMessage)
        .catch(() => {});
    } catch {
      /* extension context invalidated */
    }
  }

  findDefaultVideo() {
    if (this.store.currentVideo) return;
    // Reuse the same "biggest, in-viewport, actually-playing" heuristic as
    // keyboard shortcuts — picking merely the first <video> in DOM order falls
    // over on pages that preload multiple videos (YouTube Shorts, feeds), where
    // it can silently attach to one that isn't the one on screen. Deliberately
    // no unfiltered `document.querySelector('video')` fallback here: this runs
    // on every DOM mutation the page makes (ads, chat, player UI re-renders),
    // so an unfiltered fallback would auto-show the pill for any stray video
    // anywhere on the page — including tiny/off-screen ones — every time
    // nothing is currently attached, with no user interaction involved at all.
    const v = this.scanner?.shortcutTarget();
    if (v) this.showPill(v);
  }

  /** The video popup-driven changes should act on — re-attaches the overlay to it if needed. */
  #resolveTargetVideo(): HTMLVideoElement | null {
    const best = this.scanner?.shortcutTarget() ?? null;
    const video = best || this.store.currentVideo || document.querySelector('video');
    if (video && video !== this.store.currentVideo) this.showPill(video);
    return video;
  }

  // ── Subtitle injection (public — also called by VideoScanner on newly wired videos) ──
  applySubtitleToVideo(video: HTMLVideoElement, subtitle: SubtitlePayload) {
    if (!subtitle) return;
    const { text, format, lang } = subtitle;
    let vttText = text;
    if (format === 'srt') {
      vttText = 'WEBVTT\n\n' + text.replace(/(\d\d:\d\d:\d\d),(\d\d\d)/g, '$1.$2');
    }

    video.querySelectorAll('.uvt-subtitle-track').forEach((t) => {
      const track = t as HTMLTrackElement;
      if (track.src?.startsWith('blob:')) URL.revokeObjectURL(track.src);
      track.remove();
    });

    const blobUrl = URL.createObjectURL(new Blob([vttText], { type: 'text/vtt' }));
    const track = document.createElement('track');
    track.className = 'uvt-subtitle-track';
    track.kind = 'subtitles';
    track.label = 'Custom Injected Subtitles';
    track.srclang = lang || 'en';
    track.src = blobUrl;
    track.default = true;
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
   */
  #applySubtitleStyle(style: SubtitleStyle) {
    let el = document.getElementById('uvt-subtitle-style') as HTMLStyleElement | null;
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
