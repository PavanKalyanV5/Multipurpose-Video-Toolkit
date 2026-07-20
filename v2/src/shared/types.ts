export interface SubtitlePayload {
  text: string;
  format: 'srt' | 'vtt';
  lang: string;
}

export interface SubtitleStyle {
  fontSize: number;
  bgOpacity: number;
}

export interface ActiveVideoState {
  hasVideo: boolean;
  rate: number;
  loop: boolean;
  boost: number;
  boostGain: number;
  cc: boolean;
  eq: number[];
}

export interface EqBandPatch {
  index: number;
  gain: number;
}

/** Patch sent from the popup (or keyboard shortcuts) to the content script's active video. */
export interface StatePatch {
  rate?: number;
  loop?: boolean;
  boost?: number;
  boostGain?: number;
  cc?: boolean;
  action?: 'pip';
  seekStep?: number;
  autoplayBlock?: boolean;
  pauseOffscreen?: boolean;
  eqBand?: EqBandPatch;
  eqPreset?: string;
  subtitle?: SubtitlePayload;
  subtitleStyle?: SubtitleStyle;
}

export interface CustomRule {
  id: string;
  name: string;
  enabled: boolean;
  urlPattern: string;
  css: string;
  js: string;
  runAt: 'start' | 'idle';
}

export interface SiteStat {
  watchMs: number;
  actions: number;
}

export interface StatsShape {
  totalWatchMs: number;
  totalActions: number;
  bySite: Record<string, SiteStat>;
  daily: Record<string, number>;
  actionCounts: Record<string, number>;
}

export interface MediaItem {
  url: string;
  size: number;
  hint: string;
  time: number;
  label?: string;
}

/** chrome.storage.local shape — one place documenting every key the extension reads/writes. */
export interface StorageShape {
  uvtGlobal?: boolean;
  uvtEnabledSites?: string[];
  uvtSpeeds?: Record<string, number>;
  uvtSeekStep?: number;
  uvtAutoplayBlock?: boolean;
  uvtPauseOffscreen?: boolean;
  uvtSubtitleStyle?: SubtitleStyle;
  uvtCustomRules?: CustomRule[];
  uvtStats?: StatsShape;
  uvtSession?: SessionData;
  [key: `uvt_active_${string}`]: { frameId: number; state: ActiveVideoState } | undefined;
}

export interface SessionData {
  rate?: number;
  boost?: number;
  boostGain?: number;
  eq?: number[];
  muted?: boolean;
  loop?: boolean;
  cc?: boolean;
  subtitle?: SubtitlePayload;
}

// ── Runtime messages ──────────────────────────────────────────────────────
export type RuntimeMessage =
  | { type: 'uvt-inject-speed'; rate: number }
  | { type: 'uvt-run-rule-js'; code: string }
  | { type: 'uvt-report-state'; state: ActiveVideoState }
  | { type: 'uvt-state-updated'; tabId: number; frameId: number; state: ActiveVideoState }
  | { type: 'uvt-media-list' }
  | { type: 'uvt-download'; url: string; site: string }
  | { type: 'uvt-get-active-state' }
  | { type: 'uvt-set-state'; patch: StatePatch };
