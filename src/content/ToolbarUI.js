import { SPEEDS, BOOSTS, formatTime, formatStreamTime } from './constants.js';

// Trusted, static icon markup for the center-of-video flash — never built from
// page-derived text (e.g. caption track labels), so innerHTML here is safe.
const FLASH_ICONS = {
  speed:    '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  seekFwd:  '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="2 5 11 12 2 19"/><polygon points="13 5 22 12 13 19"/></svg>',
  seekBack: '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="11 19 2 12 11 5"/><polygon points="22 19 13 12 22 5"/></svg>',
  mute:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z" fill="currentColor" stroke="none"/><line x1="22" y1="2" x2="2" y2="22"/></svg>',
  unmute:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z" fill="currentColor" stroke="none"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/></svg>',
  loop:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>',
  volume:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z" fill="currentColor" stroke="none"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/></svg>',
  cc:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M7 10.5h3M7 13.5h2M14 10.5h3M14 13.5h2"/></svg>',
  autoplay: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>',
  seekStep: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg>',
  // Thin single chevrons (vs. the bold double-triangle seek icons) so a frame
  // step reads visually distinct from a regular multi-second seek.
  frameFwd: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg>',
  frameBack: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 6 9 12 15 18"/></svg>',
  camera:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3.2"/></svg>',
  link:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
  fullscreen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>',
  rotateLeft:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>',
  rotateRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>',
  solo:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none"/></svg>',
  cinema:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" stroke="none"/></svg>',
  normalize:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="4" y1="7" x2="4" y2="17"/><line x1="12" y1="7" x2="12" y2="17"/><line x1="20" y1="7" x2="20" y2="17"/></svg>',
  eq:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="10" y1="21" x2="10" y2="4"/><line x1="16" y1="21" x2="16" y2="10"/><line x1="20" y1="21" x2="20" y2="16"/></svg>',
  netSpeed: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20" stroke-width="3"/></svg>',
};

export class ToolbarUI {
  // Public DOM refs used by VideoToolkit
  bar; pill; spdEl; recBtn; recLabel; loopBtn; volBtn; volLabel; ccBtn; muteBtn; pinBtn; fullscreenBtn;
  soloBtn; cinemaBtn; normalizeBtn;
  #root; #host; #msgEl; #flashEl; #flashIconEl; #flashTextEl; #picker;

  #offsetX = 0;
  #offsetY = 0;
  #rafPending = false;
  #isDragging = false;
  #dragStartX = 0;
  #dragStartY = 0;

  // Timers
  #hideTimer = null;
  #collapseTimer = null;
  #idleTimer = null;
  #fsIdleTimer = null;

  #expandedState = false;
  #pinned = false;
  #video = null; // video currently attached to the toolbar
  #timeupdateWired = new WeakSet(); // videos that already have our timeupdate listener

  /** Callback injected by VideoToolkit so UI actions can reach the orchestrator */
  #callbacks = {};

  constructor() {
    this.#host = document.createElement('uvt-toolbar-host');
    this.#host.style.cssText = 'position:fixed;z-index:2147483647;top:0;left:0;width:0;height:0;';
    this.#root = this.#host.attachShadow({ mode: 'closed' });
  }

  setTemplate(htmlText) {
    this.#root.innerHTML = htmlText;

    // Inject stylesheet link into shadow root
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('src/content/toolbar.css');
    this.#root.appendChild(link);

    this.#queryRefs();
  }

  #queryRefs() {
    const $ = (id) => this.#root.getElementById(id);
    this.bar       = $('bar');
    this.pill      = $('pill');
    this.spdEl     = $('spd');
    this.recBtn    = $('rec');
    this.recLabel  = $('recLabel');
    this.loopBtn   = $('loop');
    this.volBtn    = $('vol');
    this.volLabel  = $('volLabel');
    this.ccBtn     = $('cc');
    this.muteBtn   = $('mute');
    this.pinBtn    = $('pin');
    this.fullscreenBtn = $('fullscreen');
    this.soloBtn      = $('solo');
    this.cinemaBtn    = $('cinema');
    this.normalizeBtn = $('normalize');
    this.netSpeedBtn  = $('netSpeed');
    this.netSpeedLabel = $('netSpeedLabel');
    this.#msgEl      = $('msg');
    this.#flashEl    = $('flash');
    this.#flashIconEl = $('flashIcon');
    this.#flashTextEl = $('flashText');
    this.#picker     = $('picker');
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────
  /**
   * @param {{ onButtonClick: Function, onSpeedEdit: Function }} callbacks
   */
  mount(callbacks) {
    this.#callbacks = callbacks;
    this.#attachHost();
    this.#bindBarEvents();
    this.#bindDrag();
    this.#bindFullscreen();
    this.#bindSpeedEdit();
    this.#root.getElementById('collapseBtn').addEventListener('click', () => this.collapse());
    // Hide dl and rec buttons on YouTube (Web Store policy)
    const isYT = /(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(location.hostname);
    if (isYT) {
      this.#root.getElementById('dl').style.display = 'none';
      this.recBtn.style.display = 'none';
    }
  }

  #attachHost() {
    const container = document.fullscreenElement || document.body || document.documentElement;
    if (container && this.#host.parentElement !== container) container.appendChild(this.#host);
  }

  // ── Button wiring (delegated to VideoToolkit via callbacks) ──────────────────
  #bindBarEvents() {
    const btn = (id) => this.#root.getElementById(id);
    const on  = (id, fn) => btn(id).addEventListener('click', () => this.#video && fn(this.#video));

    on('slower', (v) => {
      const i = Math.max(0, SPEEDS.findIndex((s) => s >= v.playbackRate) - 1);
      this.#callbacks.onButtonClick('setRate', v, SPEEDS[i]);
    });
    on('faster', (v) => {
      const cur = SPEEDS.findIndex((s) => s >= v.playbackRate);
      const i = Math.min(SPEEDS.length - 1, (cur === -1 ? SPEEDS.length : cur) + 1);
      this.#callbacks.onButtonClick('setRate', v, SPEEDS[i]);
    });
    on('back',  (v) => this.#callbacks.onButtonClick('seek', v, -1));
    on('fwd',   (v) => this.#callbacks.onButtonClick('seek', v, +1));
    on('mute',  (v) => this.#callbacks.onButtonClick('mute', v));
    on('loop',  (v) => this.#callbacks.onButtonClick('loop', v));
    on('solo',  (v) => this.#callbacks.onButtonClick('solo', v));
    on('pip',   (v) => this.#callbacks.onButtonClick('pip', v));
    on('fullscreen', (v) => this.#callbacks.onButtonClick('fullscreen', v));
    on('rotateLeft',  (v) => this.#callbacks.onButtonClick('rotate', v, -1));
    on('rotateRight', (v) => this.#callbacks.onButtonClick('rotate', v, +1));
    on('cinema', (v) => this.#callbacks.onButtonClick('cinema', v));
    on('vol',   (v) => this.#callbacks.onButtonClick('vol', v));
    on('normalize', (v) => this.#callbacks.onButtonClick('normalize', v));
    on('cc',    (v) => this.#callbacks.onButtonClick('cc', v));
    on('shot',  (v) => this.#callbacks.onButtonClick('shot', v));
    on('copyTs',(v) => this.#callbacks.onButtonClick('copyTs', v));
    on('rec',   (v) => this.#callbacks.onButtonClick('rec', v));
    on('dl',    (v) => this.#callbacks.onButtonClick('dl', v));
    on('netSpeed', (v) => this.#callbacks.onButtonClick('netSpeed', v));
    btn('pin').addEventListener('click', () => {
      this.#pinned = !this.#pinned;
      this.pinBtn.classList.toggle('active', this.#pinned);
      this.toast(this.#pinned ? 'Overlay position pinned' : 'Overlay position unpinned', 1200);
    });

    this.pill.addEventListener('mouseenter', () => {
      clearTimeout(this.#hideTimer);
      this.expand();
    });
    this.bar.addEventListener('mouseenter', () => {
      clearTimeout(this.#hideTimer);
      clearTimeout(this.#collapseTimer);
    });
    this.bar.addEventListener('mouseleave', () => this.#scheduleCollapse());
    window.addEventListener('scroll', () => this.#placeBarRAF(), true);
    window.addEventListener('resize', () => this.#placeBarRAF());
  }

  // ── Custom speed text input ──────────────────────────────────────────────────
  #bindSpeedEdit() {
    this.spdEl.addEventListener('click', () => {
      if (!this.#video) return;
      const input = document.createElement('input');
      input.type = 'number';
      input.min = '0.1'; input.max = '16'; input.step = '0.1';
      input.value = this.#video.playbackRate;
      input.style.cssText =
        'width:42px;background:rgba(255,255,255,.1);border:1px solid #38bdf8;' +
        'border-radius:4px;color:#38bdf8;font:bold 12px Inter,sans-serif;text-align:center;padding:1px 2px;';
      this.spdEl.replaceWith(input);
      input.focus(); input.select();
      const commit = () => {
        const val = Math.min(16, Math.max(0.1, parseFloat(input.value) || 1));
        input.replaceWith(this.spdEl);
        this.spdEl.textContent = val + 'x';
        this.#callbacks.onButtonClick('setRate', this.#video, val);
      };
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { input.replaceWith(this.spdEl); }
      });
    });
  }

  // ── Drag ─────────────────────────────────────────────────────────────────────
  #bindDrag() {
    const dragMove = (e) => {
      this.#offsetX += e.clientX - this.#dragStartX;
      this.#offsetY += e.clientY - this.#dragStartY;
      this.#dragStartX = e.clientX;
      this.#dragStartY = e.clientY;
      this.#placeBar();
    };
    const dragEnd = () => {
      document.removeEventListener('mousemove', dragMove);
      document.removeEventListener('mouseup', dragEnd);
      this.bar.style.cursor = 'grab';
      this.pill.style.cursor = 'grab';
    };
    const dragStart = (e) => {
      if (e.button !== 0) return;
      const t = e.target;
      // Use closest() rather than a tagName check on e.target directly — button
      // icons are now nested <svg>/<span> children, so a click can bubble up
      // from one of those instead of landing on the <button> itself.
      if (t.closest('button, input') || t.classList.contains('sep') || t.closest('#picker')) return;
      this.#dragStartX = e.clientX;
      this.#dragStartY = e.clientY;
      this.bar.style.cursor = 'grabbing';
      this.pill.style.cursor = 'grabbing';
      document.addEventListener('mousemove', dragMove);
      document.addEventListener('mouseup', dragEnd);
      e.preventDefault();
    };
    this.bar.addEventListener('mousedown', dragStart);
    this.pill.addEventListener('mousedown', dragStart);
  }

  // ── Fullscreen ───────────────────────────────────────────────────────────────
  #bindFullscreen() {
    const handler = () => {
      // Hide tooltip/toolbar completely on any fullscreen change to reset state
      this.hideAll();
      this.fullscreenBtn?.classList.toggle('active', !!document.fullscreenElement);

      this.#attachHost();
      this.#placeBar();
      if (document.fullscreenElement) {
        this.#host.style.transition = 'opacity 0.25s ease';
        const fsMove = () => {
          this.#host.style.opacity = '1';
          this.#host.style.pointerEvents = 'auto';
          clearTimeout(this.#fsIdleTimer);
          this.#fsIdleTimer = setTimeout(() => {
            if (!this.bar.matches(':hover') && !this.pill.matches(':hover')) {
              this.#host.style.opacity = '0';
              this.#host.style.pointerEvents = 'none';
            }
          }, 3000);
        };
        // Listen on document during fullscreen so we capture movements reliably
        document.addEventListener('mousemove', fsMove);
        this._fsMoveHandler = fsMove;
      } else {
        if (this._fsMoveHandler) {
          document.removeEventListener('mousemove', this._fsMoveHandler);
          this._fsMoveHandler = null;
        }
        clearTimeout(this.#fsIdleTimer);
        this.#host.style.opacity = '';
        this.#host.style.pointerEvents = '';
        this.#host.style.transition = '';
      }
    };
    document.addEventListener('fullscreenchange', handler);
    document.addEventListener('webkitfullscreenchange', handler);
  }

  // ── Positioning ──────────────────────────────────────────────────────────────
  #placeBar() {
    if (!this.#video || !this.#video.isConnected) { this.hideAll(); return; }
    this.#attachHost();
    const r = this.#video.getBoundingClientRect();
    if (r.width < 80 || r.height < 60) { this.hideAll(); return; }
    const hr = this.#host.getBoundingClientRect();
    const left = (r.left - hr.left + 6 + this.#offsetX) + 'px';
    const top  = (r.top  - hr.top  + 6 + this.#offsetY) + 'px';
    this.bar.style.left  = left;
    this.bar.style.top   = top;
    this.pill.style.left = left;
    this.pill.style.top  = top;
  }

  #placeBarRAF() {
    if (this.#rafPending) return;
    this.#rafPending = true;
    requestAnimationFrame(() => { this.#rafPending = false; this.#placeBar(); });
  }

  // ── Pill label ───────────────────────────────────────────────────────────────
  /**
   * @param {AudioBooster} booster
   * @param {VideoRecorder} recorder
   */
  updatePill(booster, recorder) {
    if (!this.#video) return;
    const streamStr = formatStreamTime(this.#video.currentTime, this.#video.duration);
    const ts = streamStr ? ` · ${streamStr}` : '';
    const boostGain = booster.getGain(this.#video);
    const boostLabel = boostGain > 1 ? ` · ${Math.round(boostGain * 100)}%` : '';
    const recLabel = recorder.isRecording(this.#video)
      ? `Rec (${formatTime(recorder.elapsedSeconds(this.#video))}) · `
      : '';
    this.pill.textContent = `${recLabel}${this.#video.playbackRate}x${boostLabel}${ts}`;
  }

  syncBar(video, booster, cinemaActive, netStats = null) {
    this.spdEl.textContent  = video.playbackRate + 'x';
    this.loopBtn.classList.toggle('active', video.loop);
    this.muteBtn.classList.toggle('active', video.muted);
    const gain = booster.getGain(video);
    this.volLabel.textContent = Math.round(gain * 100) + '%';
    this.volBtn.classList.toggle('active', booster.isBoosted(video));
    this.normalizeBtn.classList.toggle('active', booster.isNormalized(video));
    this.cinemaBtn.classList.toggle('active', !!cinemaActive);
    if (netStats && this.netSpeedLabel) {
      this.netSpeedLabel.textContent = netStats.videoSpeed;
    }
    this.ccBtn.classList.toggle(
      'active',
      Array.from(video.textTracks || []).some((t) => t.mode === 'showing')
    );
  }

  // ── Toast notification ───────────────────────────────────────────────────────
  toast(text, ms = 2600) {
    this.#msgEl.textContent = text;
    this.#msgEl.style.display = 'block';
    this.#positionMsg();
    clearTimeout(this.#msgEl._h);
    this.#msgEl._h = setTimeout(() => (this.#msgEl.style.display = 'none'), ms);
  }

  /**
   * Position the toast. Prefers the bar's last known position (already
   * accounts for drag offset), but the bar may never have been placed yet —
   * e.g. a value changed from the popup before the user ever hovered the
   * video — so fall back to the video's own bounding box, and finally to a
   * fixed corner, rather than silently rendering with no position at all.
   */
  #positionMsg() {
    if (this.bar.style.left) {
      this.#msgEl.style.left = this.bar.style.left;
      this.#msgEl.style.top  = parseInt(this.bar.style.top || '40', 10) + 36 + 'px';
      return;
    }
    if (this.#video && this.#video.isConnected) {
      const r  = this.#video.getBoundingClientRect();
      const hr = this.#host.getBoundingClientRect();
      this.#msgEl.style.left = Math.max(8, r.left - hr.left + 6) + 'px';
      this.#msgEl.style.top  = Math.max(8, r.top  - hr.top  + 6) + 'px';
      return;
    }
    this.#msgEl.style.left = '16px';
    this.#msgEl.style.top  = '16px';
  }

  // ── Center-of-video OSD flash ─────────────────────────────────────────────────
  /**
   * Big, glanceable flash centered over the video — mirrors YouTube's native
   * readout for playback speed / seek / volume. Takes the video explicitly
   * (rather than relying on whichever video the toolbar last attached to) so
   * it's always anchored to the video that actually changed, even if it was
   * driven by a keyboard shortcut or the popup before any hover happened.
   *
   * @param {HTMLVideoElement} video
   * @param {keyof FLASH_ICONS|null} iconKey - key into FLASH_ICONS, or null/omitted for no icon
   * @param {string} text - always set via textContent, safe even for page-derived strings (caption labels)
   */
  flash(video, iconKey, text, ms = 900) {
    if (!video || !video.isConnected) return;
    this.#attachHost();
    const r  = video.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    const hr = this.#host.getBoundingClientRect();
    this.#flashEl.style.left = (r.left - hr.left + r.width  / 2) + 'px';
    this.#flashEl.style.top  = (r.top  - hr.top  + r.height / 2) + 'px';
    this.#flashIconEl.innerHTML = FLASH_ICONS[iconKey] || ''; // trusted set only, never page-derived
    this.#flashTextEl.textContent = text;
    // Restart the transition even if a flash is already mid-fade, so rapid
    // repeats (e.g. holding the speed key) each get their own clean pulse.
    this.#flashEl.classList.remove('show');
    void this.#flashEl.offsetWidth;
    this.#flashEl.classList.add('show');
    clearTimeout(this.#flashEl._h);
    this.#flashEl._h = setTimeout(() => this.#flashEl.classList.remove('show'), ms);
  }

  // ── Show / hide / expand / collapse ─────────────────────────────────────────
  showPill(video) {
    if (!this.#callbacks.isEnabled?.()) return;
    const changed = this.#video !== video;
    if (changed && !this.#pinned) { this.#offsetX = 0; this.#offsetY = 0; }
    this.#video = video;
    this.#callbacks.onPillShow?.(video);   // let toolkit update pill + report state
    this.#placeBar();
    if (!this.#timeupdateWired.has(video)) {
      this.#timeupdateWired.add(video);
      video.addEventListener('timeupdate', () => {
        if (video === this.#video) this.#callbacks.onTimeUpdate?.();
      });
    }
    if (!this.#expandedState || changed) {
      this.#expandedState = false;
      this.bar.classList.remove('show');
      this.pill.classList.add('show');
    }
    this.#wake();
  }

  expand() {
    if (!this.#video) return;
    this.#expandedState = true;
    clearTimeout(this.#collapseTimer);
    this.#callbacks.onExpand?.(this.#video);
    this.bar.classList.add('show');
    this.pill.classList.remove('show');
    this.#placeBar();
    this.#wake();
  }

  collapse() {
    this.#expandedState = false;
    this.bar.classList.remove('show');
    if (this.#video) {
      this.#callbacks.onCollapse?.();
      this.pill.classList.add('show');
      this.#wake();
    }
  }

  hideAll() {
    this.#expandedState = false;
    this.bar.classList.remove('show');
    if (this.#callbacks.isRecording?.()) {
      this.#callbacks.onCollapse?.();
      this.pill.classList.add('show');
      this.pill.classList.remove('faded');
      return;
    }
    this.pill.classList.remove('show');
    this.#video = null;
  }

  scheduleHide() {
    clearTimeout(this.#hideTimer);
    this.#hideTimer = setTimeout(() => this.hideAll(), 700);
  }

  cancelHide() {
    clearTimeout(this.#hideTimer);
  }

  #scheduleCollapse() {
    clearTimeout(this.#collapseTimer);
    this.#collapseTimer = setTimeout(() => this.collapse(), 450);
  }

  #wake() {
    this.pill.classList.remove('faded');
    clearTimeout(this.#idleTimer);
    this.#idleTimer = setTimeout(() => {
      if (!this.#expandedState) this.pill.classList.add('faded');
    }, 2000);
  }

  get currentVideo() { return this.#video; }

  /** True while the overlay is actively visible to the user (hovered pill or expanded bar). */
  get isEngaged() {
    return (this.pill.classList.contains('show') && !this.pill.classList.contains('faded'))
        || this.bar.classList.contains('show');
  }

  // ── Download picker ───────────────────────────────────────────────────────────
  showDownloadPicker(items, site) {
    const picker = this.#picker;
    picker.innerHTML = '';
    
    const h = document.createElement('div');
    h.className = 'ph';
    h.textContent = `Choose file to download (${items.length} found)`;
    picker.appendChild(h);

    const list = document.createElement('div');
    list.className = 'p-list';

    const fmtSize = (b) => (b > 0 ? (b / 1048576).toFixed(1) + ' MB' : 'size ?');
    items.forEach((it) => {
      const b = document.createElement('button');
      b.className = 'pi';
      b.textContent = [it.hint || 'res ?', fmtSize(it.size), it.label].filter(Boolean).join(' · ');
      b.title = it.url;
      b.addEventListener('click', () => {
        if (chrome.runtime?.id) {
          try { chrome.runtime.sendMessage({ type: 'uvt-download', url: it.url, site }); } catch {}
        }
        picker.style.display = 'none';
        this.toast('Download started…', 1600);
      });
      list.appendChild(b);
    });
    picker.appendChild(list);

    const exportBtn = document.createElement('button');
    exportBtn.className = 'pi';
    exportBtn.textContent = `Export all ${items.length} URLs as .txt`;
    exportBtn.addEventListener('click', () => {
      const text = items.map((it) => it.url).join('\n');
      const a = document.createElement('a');
      a.download = `media-urls-${site}-${Date.now()}.txt`;
      a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      picker.style.display = 'none';
      this.toast('URL list downloaded.', 1400);
    });
    picker.appendChild(exportBtn);

    const c = document.createElement('button');
    c.className = 'pi pc';
    c.textContent = 'Cancel — tip: switch quality in the player to make more resolutions appear here';
    c.addEventListener('click', () => (picker.style.display = 'none'));
    picker.appendChild(c);
    
    picker.style.left    = this.bar.style.left;
    picker.style.top     = parseInt(this.bar.style.top || '40', 10) + 36 + 'px';
    picker.style.display = 'flex';
  }

  hidePicker() { this.#picker.style.display = 'none'; }
}
