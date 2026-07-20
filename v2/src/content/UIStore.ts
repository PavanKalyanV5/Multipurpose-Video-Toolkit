import type { MediaItem } from '../shared/types';

export type FlashIconKey =
  | 'speed'
  | 'seekFwd'
  | 'seekBack'
  | 'mute'
  | 'unmute'
  | 'loop'
  | 'volume'
  | 'cc'
  | 'autoplay'
  | 'seekStep'
  | 'frameFwd'
  | 'frameBack'
  | 'camera'
  | 'link'
  | 'fullscreen'
  | 'rotateLeft'
  | 'rotateRight'
  | 'solo'
  | 'cinema'
  | 'normalize'
  | 'eq';

export interface BarSync {
  rate: number;
  loop: boolean;
  muted: boolean;
  volPct: number;
  boosted: boolean;
  normalized: boolean;
  cinema: boolean;
  cc: boolean;
  recording: boolean;
  fullscreen: boolean;
}

interface FlashState {
  icon: FlashIconKey | null;
  text: string;
  video: HTMLVideoElement | null;
  ms: number;
  nonce: number;
}

interface ToastState {
  text: string;
  ms: number;
  nonce: number;
}

interface PickerState {
  items: MediaItem[];
  site: string;
}

export interface UIState {
  currentVideo: HTMLVideoElement | null;
  visible: 'none' | 'pill' | 'bar';
  faded: boolean;
  pinned: boolean;
  pillLabel: string;
  bar: BarSync;
  flash: FlashState;
  toast: ToastState | null;
  picker: PickerState | null;
  tooltipTarget: HTMLElement | null;
}

const DEFAULT_BAR: BarSync = {
  rate: 1,
  loop: false,
  muted: false,
  volPct: 100,
  boosted: false,
  normalized: false,
  cinema: false,
  cc: false,
  recording: false,
  fullscreen: false,
};

/**
 * External store (React 18/19 useSyncExternalStore-compatible) that stands in
 * for the old ToolbarUI's direct DOM manipulation. VideoToolkit owns one
 * instance and mutates it in response to video events / button actions; the
 * React tree in ToolbarRoot.tsx subscribes and renders whatever it reflects.
 * Positioning (drag, scroll/resize placement) is intentionally kept out of
 * this reactive state — it happens every animation frame and would cause a
 * React re-render storm, so it's handled imperatively via refs in the
 * component tree instead, matching the original's performance profile.
 */
export class UIStore {
  #state: UIState = {
    currentVideo: null,
    visible: 'none',
    faded: false,
    pinned: false,
    pillLabel: '▶ 1x',
    bar: DEFAULT_BAR,
    flash: { icon: null, text: '', video: null, ms: 900, nonce: 0 },
    toast: null,
    picker: null,
    tooltipTarget: null,
  };
  #listeners = new Set<() => void>();
  #timeupdateWired = new WeakSet<HTMLVideoElement>();
  #onTimeUpdate: (() => void) | null = null;
  #hideTimer: ReturnType<typeof setTimeout> | null = null;
  #collapseTimer: ReturnType<typeof setTimeout> | null = null;
  #idleTimer: ReturnType<typeof setTimeout> | null = null;
  #toastHideTimer: ReturnType<typeof setTimeout> | null = null;

  subscribe = (cb: () => void): (() => void) => {
    this.#listeners.add(cb);
    return () => this.#listeners.delete(cb);
  };

  getSnapshot = (): UIState => this.#state;

  /** Registers the single callback fired on timeupdate for whichever video is currently shown. */
  setTimeUpdateHandler(cb: () => void) {
    this.#onTimeUpdate = cb;
  }

  #set(patch: Partial<UIState>) {
    this.#state = { ...this.#state, ...patch };
    this.#listeners.forEach((l) => l());
  }

  get currentVideo(): HTMLVideoElement | null {
    return this.#state.currentVideo;
  }

  isEngaged(): boolean {
    return (this.#state.visible === 'pill' && !this.#state.faded) || this.#state.visible === 'bar';
  }

  showPill(video: HTMLVideoElement) {
    const changed = this.#state.currentVideo !== video;
    this.#set({
      currentVideo: video,
      visible: this.#state.visible === 'bar' && !changed ? 'bar' : 'pill',
    });
    if (!this.#timeupdateWired.has(video)) {
      this.#timeupdateWired.add(video);
      video.addEventListener('timeupdate', () => {
        if (video === this.#state.currentVideo) this.#onTimeUpdate?.();
      });
    }
    this.#wake();
  }

  expand() {
    if (!this.#state.currentVideo) return;
    if (this.#collapseTimer) clearTimeout(this.#collapseTimer);
    this.#set({ visible: 'bar' });
    this.#wake();
  }

  collapse() {
    if (!this.#state.currentVideo) return;
    this.#set({ visible: 'pill' });
    this.#wake();
  }

  /** @param keepPillIfRecording - true while this video is actively recording, so the pill survives a mouse-out */
  hideAll(keepPillIfRecording: boolean) {
    if (keepPillIfRecording) {
      this.#set({ visible: 'pill', faded: false });
      return;
    }
    this.#set({ visible: 'none', currentVideo: null });
  }

  scheduleHide(keepPillIfRecording: boolean) {
    if (this.#hideTimer) clearTimeout(this.#hideTimer);
    this.#hideTimer = setTimeout(() => this.hideAll(keepPillIfRecording), 700);
  }

  cancelHide() {
    if (this.#hideTimer) clearTimeout(this.#hideTimer);
  }

  scheduleCollapse() {
    if (this.#collapseTimer) clearTimeout(this.#collapseTimer);
    this.#collapseTimer = setTimeout(() => this.collapse(), 450);
  }

  cancelCollapse() {
    if (this.#collapseTimer) clearTimeout(this.#collapseTimer);
  }

  #wake() {
    this.#set({ faded: false });
    if (this.#idleTimer) clearTimeout(this.#idleTimer);
    this.#idleTimer = setTimeout(() => {
      if (this.#state.visible !== 'bar') this.#set({ faded: true });
    }, 2000);
  }

  setPinned(pinned: boolean) {
    this.#set({ pinned });
  }

  get pinned(): boolean {
    return this.#state.pinned;
  }

  setPill(label: string) {
    this.#set({ pillLabel: label });
  }

  setBar(patch: Partial<BarSync>) {
    this.#set({ bar: { ...this.#state.bar, ...patch } });
  }

  flash(icon: FlashIconKey | null, text: string, ms: number, video: HTMLVideoElement) {
    this.#set({ flash: { icon, text, video, ms, nonce: this.#state.flash.nonce + 1 } });
  }

  toast(text: string, ms = 2600) {
    if (this.#toastHideTimer) clearTimeout(this.#toastHideTimer);
    this.#set({ toast: { text, ms, nonce: (this.#state.toast?.nonce ?? 0) + 1 } });
    this.#toastHideTimer = setTimeout(() => this.#set({ toast: null }), ms);
  }

  setPicker(items: MediaItem[], site: string) {
    this.#set({ picker: { items, site } });
  }

  hidePicker() {
    this.#set({ picker: null });
  }

  setTooltipTarget(el: HTMLElement | null) {
    if (el === this.#state.tooltipTarget) return;
    this.#set({ tooltipTarget: el });
  }
}
