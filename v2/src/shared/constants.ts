export const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3] as const;
export const BOOSTS = [1, 1.5, 2, 3] as const; // legacy step values kept for session compat

// 8-band graphic EQ — standard-ish ISO-adjacent center frequencies (Hz).
// First/last bands are shelf filters (they extend to the spectrum edge);
// the six in between are peaking filters. Gains are in dB, -12..+12.
export const EQ_BANDS = [60, 150, 400, 1000, 2400, 6000, 12000, 16000] as const;

export interface EqPreset {
  label: string;
  gains: number[];
}

export const EQ_PRESETS: Record<string, EqPreset> = {
  flat: { label: 'Flat', gains: [0, 0, 0, 0, 0, 0, 0, 0] },
  bass: { label: 'Bass', gains: [7, 5, 3, 0, -1, -2, -2, -2] },
  vocal: { label: 'Vocal', gains: [-2, -1, 2, 4, 4, 2, 0, -1] },
  treble: { label: 'Treble', gains: [-2, -2, -1, 0, 2, 4, 6, 7] },
  loudness: { label: 'Loudness', gains: [6, 3, 0, -3, -3, 0, 3, 6] },
};

export function formatTime(totalSeconds: number): string {
  const s = Math.floor(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`;
}

export function formatStreamTime(currentTime: number, duration: number): string {
  if (!isFinite(currentTime) || currentTime < 0) return '';
  const cur = formatTime(currentTime);
  if (isFinite(duration) && duration > 0) {
    return `${cur} / ${formatTime(duration)}`;
  }
  return cur;
}

