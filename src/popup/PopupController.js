import { EQ_PRESETS } from '../content/constants.js';

export class PopupController {
  // ── DOM element references (queried once in constructor) ─────────────────────
  #els = {};

  // ── State ──────────────────────────────────────────────────────────────────
  #host       = '';
  #tabId      = null;
  #frameId    = null;
  #updating   = false; // guard against feedback loops when setting slider values

  constructor() {
    this.#els = {
      globalToggle:   document.getElementById('global'),
      siteToggle:     document.getElementById('site'),
      siteName:       document.getElementById('siteName'),
      activeControls: document.getElementById('activeVideoControls'),
      noVideo:        document.getElementById('noVideo'),
      speedSlider:    document.getElementById('speedSlider'),
      speedValue:     document.getElementById('speedValue'),
      boostSlider:    document.getElementById('boostSlider'),
      boostValue:     document.getElementById('boostValue'),
      loopToggle:     document.getElementById('loopToggle'),
      ccToggle:       document.getElementById('ccToggle'),
      pipBtn:         document.getElementById('pipBtn'),
      subtitleCard:   document.getElementById('subtitleCard'),
      subFileInput:   document.getElementById('subFile'),
      fileBtnLabel:   document.getElementById('fileBtnLabel'),
      fileNameLabel:  document.getElementById('fileName'),
      subUrlInput:    document.getElementById('subUrl'),
      injectBtn:      document.getElementById('injectBtn'),
      subSizeSlider:  document.getElementById('subSizeSlider'),
      subSizeValue:   document.getElementById('subSizeValue'),
      subBgSlider:    document.getElementById('subBgSlider'),
      subBgValue:     document.getElementById('subBgValue'),
      seekStep:       document.getElementById('seekStep'),
      autoplayBlock:  document.getElementById('autoplayBlock'),
      pauseOffscreen: document.getElementById('pauseOffscreen'),
      presetBtns:     Array.from(document.querySelectorAll('.speed-preset')),
      eqCard:         document.getElementById('eqCard'),
      eqSliders:      Array.from(document.querySelectorAll('.eq-slider')),
      eqValues:       Array.from(document.querySelectorAll('.eq-value')),
      eqPresetBtns:   Array.from(document.querySelectorAll('.eq-preset-btn')),
      dashboardBtn:   document.getElementById('dashboardBtn'),
      rulesBtn:       document.getElementById('rulesBtn'),
    };
  }

  // ── Entry point ───────────────────────────────────────────────────────────────
  init() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs?.[0]) return;
      this.#tabId = tabs[0].id;
      try { this.#host = new URL(tabs[0].url).hostname; } catch { this.#host = ''; }
      this.#els.siteName.textContent = this.#host || 'this site';
      this._loadSettings();
      this._fetchVideoState();
    });
    this._bindListeners();
    this._listenContentMessages();
  }

  // ── Settings load ─────────────────────────────────────────────────────────────
  // Opt-in model: everything is off by default. "Enabled everywhere" is a bulk
  // override; otherwise a site only runs once you've added it to the allowlist.
  _loadSettings() {
    chrome.storage.local.get(
      ['uvtGlobal', 'uvtEnabledSites', 'uvtSeekStep', 'uvtAutoplayBlock', 'uvtPauseOffscreen', 'uvtSubtitleStyle'],
      (r) => {
        const { globalToggle, siteToggle, seekStep, autoplayBlock, pauseOffscreen,
                subSizeSlider, subSizeValue, subBgSlider, subBgValue } = this.#els;
        const enabledSites = r.uvtEnabledSites || [];
        globalToggle.checked = r.uvtGlobal === true;
        siteToggle.checked   = this.#host ? enabledSites.includes(this.#host) : false;
        siteToggle.disabled  = !this.#host;
        if (seekStep && r.uvtSeekStep)         seekStep.value     = r.uvtSeekStep;
        if (autoplayBlock)                     autoplayBlock.checked = r.uvtAutoplayBlock === true;
        if (pauseOffscreen)                    pauseOffscreen.checked = r.uvtPauseOffscreen === true;

        const subStyle = r.uvtSubtitleStyle || { fontSize: 20, bgOpacity: 0.7 };
        subSizeSlider.value = subStyle.fontSize;
        subSizeValue.textContent = subStyle.fontSize + 'px';
        subBgSlider.value = Math.round(subStyle.bgOpacity * 100);
        subBgValue.textContent = Math.round(subStyle.bgOpacity * 100) + '%';
      }
    );
  }

  // ── Video state fetch ─────────────────────────────────────────────────────────
  _fetchVideoState() {
    chrome.storage.local.get([`uvt_active_${this.#tabId}`], (res) => {
      const record = res[`uvt_active_${this.#tabId}`];
      if (record?.state?.hasVideo) {
        this.updateUI(record.state, this.#tabId, record.frameId);
      } else {
        chrome.tabs.sendMessage(this.#tabId, { type: 'uvt-get-active-state' }, (resp) => {
          if (chrome.runtime.lastError) { this.showNoVideo(); return; }
          if (resp?.hasVideo) {
            this.updateUI(resp, this.#tabId, 0);
            chrome.storage.local.set({ [`uvt_active_${this.#tabId}`]: { frameId: 0, state: resp } });
          } else {
            this.showNoVideo();
          }
        });
      }
    });
  }

  // ── UI update ─────────────────────────────────────────────────────────────────
  updateUI(state, tabId, frameId) {
    this.#tabId   = tabId;
    this.#frameId = frameId;
    this.#updating = true;
    try {
      const { activeControls, subtitleCard, eqCard, noVideo,
              speedSlider, speedValue, boostSlider, boostValue,
              loopToggle, ccToggle } = this.#els;

      activeControls.style.display = 'block';
      subtitleCard.style.display   = 'block';
      eqCard.style.display         = 'block';
      noVideo.style.display        = 'none';

      speedSlider.value   = state.rate;
      speedValue.textContent = state.rate + 'x';
      this._syncPresetButtons(state.rate);

      // Continuous boost: prefer boostGain float; fall back to legacy discrete index
      const gainVal = state.boostGain !== undefined
        ? state.boostGain
        : ([1, 1.5, 2, 3][state.boost] || 1);
      boostSlider.value      = gainVal;
      boostValue.textContent = Math.round(gainVal * 100) + '%';
      this._syncBoostWarning(gainVal);

      loopToggle.checked = state.loop;
      ccToggle.checked   = state.cc;

      this._syncEq(state.eq || this.#els.eqSliders.map(() => 0));
    } finally {
      this.#updating = false;
    }
  }

  // ── Visual feedback helpers ───────────────────────────────────────────────────
  /** Highlights whichever preset button matches the current speed, if any. */
  _syncPresetButtons(rate) {
    this.#els.presetBtns.forEach((btn) => {
      btn.classList.toggle('active', parseFloat(btn.dataset.speed) === rate);
    });
  }

  /** Reflects the current per-band gains into the sliders/value labels + highlights a matching preset. */
  _syncEq(gains) {
    const { eqSliders, eqValues, eqPresetBtns } = this.#els;
    gains.forEach((g, i) => {
      if (!eqSliders[i]) return;
      eqSliders[i].value = g;
      eqValues[i].textContent = (g > 0 ? '+' : '') + g;
      eqValues[i].classList.toggle('boosted', g > 0);
      eqValues[i].classList.toggle('cut', g < 0);
    });
    const matchedPreset = Object.keys(EQ_PRESETS).find((key) =>
      EQ_PRESETS[key].gains.every((g, i) => g === (gains[i] ?? 0))
    );
    eqPresetBtns.forEach((btn) => btn.classList.toggle('active', btn.dataset.preset === matchedPreset));
  }

  /** Boost past 2x is where Web Audio gain commonly starts clipping — flag it. */
  _syncBoostWarning(gainVal) {
    this.#els.boostValue.classList.toggle('hot', gainVal > 2);
  }

  showNoVideo() {
    const { activeControls, subtitleCard, eqCard, noVideo } = this.#els;
    activeControls.style.display = 'none';
    subtitleCard.style.display   = 'none';
    eqCard.style.display         = 'none';
    noVideo.style.display        = 'flex';
  }

  // ── Send patch to content script ──────────────────────────────────────────────
  _sendPatch(patch) {
    if (this.#updating || !this.#tabId) return;
    chrome.tabs.sendMessage(
      this.#tabId,
      { type: 'uvt-set-state', patch },
      { frameId: this.#frameId ?? 0 }
    );
  }

  // ── Event listeners ───────────────────────────────────────────────────────────
  _bindListeners() {
    const {
      globalToggle, siteToggle, speedSlider, speedValue,
      boostSlider, boostValue, loopToggle, ccToggle,
      pipBtn, seekStep, autoplayBlock, pauseOffscreen,
      subFileInput, fileBtnLabel, fileNameLabel, injectBtn,
      subSizeSlider, subSizeValue, subBgSlider, subBgValue,
    } = this.#els;

    // Global on/off toggle
    globalToggle.addEventListener('change', () => {
      chrome.storage.local.set({ uvtGlobal: globalToggle.checked });
    });

    // Per-site toggle — adds/removes this site from the enabled allowlist
    siteToggle.addEventListener('change', () => {
      chrome.storage.local.get(['uvtEnabledSites'], (r) => {
        let enabledSites = r.uvtEnabledSites || [];
        if (siteToggle.checked) { if (!enabledSites.includes(this.#host)) enabledSites.push(this.#host); }
        else enabledSites = enabledSites.filter((h) => h !== this.#host);
        chrome.storage.local.set({ uvtEnabledSites: enabledSites });
      });
    });

    // Speed slider
    speedSlider.addEventListener('input', () => {
      const val = parseFloat(speedSlider.value);
      speedValue.textContent = val + 'x';
      this._syncPresetButtons(val);
      this._sendPatch({ rate: val });
    });

    // Speed preset buttons
    this.#els.presetBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const val = parseFloat(btn.dataset.speed);
        speedSlider.value      = val;
        speedValue.textContent = val + 'x';
        this._syncPresetButtons(val);
        this._sendPatch({ rate: val });
      });
    });

    // Volume boost (continuous)
    boostSlider.addEventListener('input', () => {
      const val = parseFloat(boostSlider.value);
      boostValue.textContent = Math.round(val * 100) + '%';
      this._syncBoostWarning(val);
      this._sendPatch({ boostGain: val });
    });

    // Loop toggle
    loopToggle.addEventListener('change', () => {
      this._sendPatch({ loop: loopToggle.checked });
    });

    // CC toggle
    ccToggle.addEventListener('change', () => {
      this._sendPatch({ cc: ccToggle.checked });
    });

    // PiP button
    pipBtn.addEventListener('click', () => {
      this._sendPatch({ action: 'pip' });
    });

    // Seek step selector
    seekStep?.addEventListener('change', (e) => {
      const val = parseInt(e.target.value, 10);
      chrome.storage.local.set({ uvtSeekStep: val });
      this._sendPatch({ seekStep: val });
    });

    // Autoplay block toggle
    autoplayBlock?.addEventListener('change', (e) => {
      chrome.storage.local.set({ uvtAutoplayBlock: e.target.checked });
      this._sendPatch({ autoplayBlock: e.target.checked });
    });

    // Pause off-screen videos toggle
    pauseOffscreen?.addEventListener('change', (e) => {
      chrome.storage.local.set({ uvtPauseOffscreen: e.target.checked });
      this._sendPatch({ pauseOffscreen: e.target.checked });
    });

    // Subtitle file preview
    subFileInput.addEventListener('change', () => {
      if (subFileInput.files.length > 0) {
        fileNameLabel.textContent  = subFileInput.files[0].name;
        fileNameLabel.style.display = 'block';
        fileBtnLabel.textContent   = 'Change Subtitle File';
      } else {
        fileNameLabel.textContent  = 'No file selected';
        fileNameLabel.style.display = 'none';
        fileBtnLabel.textContent   = 'Choose Subtitle File (.srt, .vtt)';
      }
    });

    // Subtitle inject button
    injectBtn.addEventListener('click', () => this._handleSubtitleInject());

    // Subtitle style (font size + background opacity) — global, not per-site
    const sendSubtitleStyle = () => {
      const fontSize = parseInt(subSizeSlider.value, 10);
      const bgOpacity = parseInt(subBgSlider.value, 10) / 100;
      chrome.storage.local.set({ uvtSubtitleStyle: { fontSize, bgOpacity } });
      this._sendPatch({ subtitleStyle: { fontSize, bgOpacity } });
    };
    subSizeSlider.addEventListener('input', () => {
      subSizeValue.textContent = subSizeSlider.value + 'px';
      sendSubtitleStyle();
    });
    subBgSlider.addEventListener('input', () => {
      subBgValue.textContent = subBgSlider.value + '%';
      sendSubtitleStyle();
    });

    // Equalizer bands
    this.#els.eqSliders.forEach((slider, index) => {
      slider.addEventListener('input', () => {
        const gain = parseInt(slider.value, 10);
        this.#els.eqValues[index].textContent = (gain > 0 ? '+' : '') + gain;
        this.#els.eqValues[index].classList.toggle('boosted', gain > 0);
        this.#els.eqValues[index].classList.toggle('cut', gain < 0);
        this.#els.eqPresetBtns.forEach((btn) => btn.classList.remove('active')); // manual tweak breaks any preset match
        this._sendPatch({ eqBand: { index, gain } });
      });
    });

    // Equalizer presets
    this.#els.eqPresetBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const preset = btn.dataset.preset;
        this._syncEq(EQ_PRESETS[preset].gains);
        this._sendPatch({ eqPreset: preset });
      });
    });

    // Dashboard button
    this.#els.dashboardBtn?.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
    });

    // Custom rules button
    this.#els.rulesBtn?.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('rules.html') });
    });
  }

  // ── Live state updates from content script ────────────────────────────────────
  // This now arrives via a background-relayed broadcast (see background.js),
  // not directly from the content script — sender.tab is undefined for a
  // message originating in the background, so the tab/frame ids travel in
  // the payload itself rather than being read off `sender`.
  _listenContentMessages() {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg?.type === 'uvt-state-updated' && msg.tabId === this.#tabId) {
        this.updateUI(msg.state, msg.tabId, msg.frameId);
      }
    });
  }

  // ── Subtitle injection ────────────────────────────────────────────────────────
  // Routed through the content script (via _sendPatch) rather than a one-shot
  // chrome.scripting.executeScript into the page: the content script remembers
  // the subtitle for the tab session and reapplies it to any video that appears
  // later, which matters on sites that swap out the <video> element (feeds, ad
  // breaks, quality switches) — a one-shot injection would otherwise vanish.
  async _handleSubtitleInject() {
    if (!this.#tabId) return;
    const { subFileInput, subUrlInput } = this.#els;
    const urlInput = subUrlInput.value.trim();
    const lang = document.getElementById('subLang')?.value || 'en';

    if (subFileInput.files.length > 0) {
      const file   = subFileInput.files[0];
      const format = file.name.toLowerCase().endsWith('.srt') ? 'srt' : 'vtt';
      try {
        const text = await file.text();
        this._sendPatch({ subtitle: { text, format, lang } });
      } catch { alert('Failed to read subtitle file contents.'); }

    } else if (urlInput) {
      try {
        const response = await fetch(urlInput);
        const text = await response.text();
        // Strip query/hash before checking the extension — signed CDN URLs like
        // "sub.srt?token=..." would otherwise be misdetected as VTT.
        const cleanPath = urlInput.split(/[?#]/)[0];
        const format = cleanPath.toLowerCase().endsWith('.srt') ? 'srt' : 'vtt';
        this._sendPatch({ subtitle: { text, format, lang } });
      } catch {
        alert('Failed to fetch subtitle link. The site hosting the file might be blocking external connections (CORS protection).');
      }
    } else {
      alert('Please provide a subtitle file or a valid link.');
    }
  }
}
