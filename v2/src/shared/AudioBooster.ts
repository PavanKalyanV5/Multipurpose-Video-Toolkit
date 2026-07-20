import { BOOSTS, EQ_BANDS } from './constants';

interface AudioEntry {
  ctx: AudioContext;
  gain: GainNode;
  compressor: DynamicsCompressorNode;
  eqFilters: BiquadFilterNode[];
  i: number;
  normalized: boolean;
}

export class AudioBooster {
  #map = new WeakMap<HTMLVideoElement, AudioEntry>();

  /**
   * Get or create the audio graph for a video. Chain:
   * src -> eq[0] -> eq[1] -> … -> eq[n-1] -> gain -> [compressor if normalized] -> destination
   * Returns null on failure (e.g. the player already routes its own audio).
   */
  #getEntry(video: HTMLVideoElement): AudioEntry | null {
    const existing = this.#map.get(video);
    if (existing) return existing;
    try {
      const ctx = new AudioContext();
      const src = ctx.createMediaElementSource(video);
      const gain = ctx.createGain();
      const compressor = ctx.createDynamicsCompressor(); // built, only patched into the chain when normalize is on

      const eqFilters = EQ_BANDS.map((freq, i) => {
        const f = ctx.createBiquadFilter();
        f.frequency.value = freq;
        f.type = i === 0 ? 'lowshelf' : i === EQ_BANDS.length - 1 ? 'highshelf' : 'peaking';
        if (f.type === 'peaking') f.Q.value = 1;
        f.gain.value = 0;
        return f;
      });
      for (let i = 0; i < eqFilters.length - 1; i++) eqFilters[i].connect(eqFilters[i + 1]);
      src.connect(eqFilters[0]);
      eqFilters[eqFilters.length - 1].connect(gain);
      gain.connect(ctx.destination);

      const entry: AudioEntry = { ctx, gain, compressor, eqFilters, i: 0, normalized: false };
      this.#map.set(video, entry);
      return entry;
    } catch {
      return null;
    }
  }

  /** Toggles a DynamicsCompressorNode in/out of the chain to even out quiet/loud parts. Returns entry or null. */
  toggleNormalize(video: HTMLVideoElement): AudioEntry | null {
    const entry = this.#getEntry(video);
    if (!entry) return null;
    entry.ctx.resume();
    entry.gain.disconnect();
    entry.compressor.disconnect();
    if (entry.normalized) {
      entry.gain.connect(entry.ctx.destination);
    } else {
      entry.gain.connect(entry.compressor).connect(entry.ctx.destination);
    }
    entry.normalized = !entry.normalized;
    return entry;
  }

  /** Returns true if loudness normalization is currently active for this video. */
  isNormalized(video: HTMLVideoElement): boolean {
    return this.#map.get(video)?.normalized ?? false;
  }

  /** Sets one EQ band's gain in dB (-12..12). Returns entry or null. */
  setEqBand(video: HTMLVideoElement, bandIndex: number, gainDb: number): AudioEntry | null {
    const entry = this.#getEntry(video);
    if (!entry || !entry.eqFilters[bandIndex]) return null;
    entry.ctx.resume();
    entry.eqFilters[bandIndex].gain.value = gainDb;
    return entry;
  }

  /** Sets all EQ bands at once (presets / session restore). Returns entry or null. */
  setEqAll(video: HTMLVideoElement, gains: number[]): AudioEntry | null {
    const entry = this.#getEntry(video);
    if (!entry) return null;
    entry.ctx.resume();
    entry.eqFilters.forEach((f, i) => {
      if (gains[i] !== undefined) f.gain.value = gains[i];
    });
    return entry;
  }

  /** Current per-band gains in dB, or all-zero if no graph exists yet. */
  getEqGains(video: HTMLVideoElement): number[] {
    const entry = this.#map.get(video);
    return entry ? entry.eqFilters.map((f) => f.gain.value) : EQ_BANDS.map(() => 0);
  }

  /** True if any band is off flat — used to show an "EQ active" indicator. */
  isEqActive(video: HTMLVideoElement): boolean {
    const entry = this.#map.get(video);
    return entry ? entry.eqFilters.some((f) => f.gain.value !== 0) : false;
  }

  /** Set boost by discrete BOOSTS[] index (legacy / session compat). Returns entry or null. */
  setDiscreteBoost(video: HTMLVideoElement, index: number): AudioEntry | null {
    const entry = this.#getEntry(video);
    if (!entry) return null;
    entry.ctx.resume();
    entry.i = index;
    entry.gain.gain.value = BOOSTS[index];
    return entry;
  }

  /** Set boost by raw float gain value (continuous slider). Returns entry or null. */
  setContinuousGain(video: HTMLVideoElement, gainValue: number): AudioEntry | null {
    const entry = this.#getEntry(video);
    if (!entry) return null;
    entry.ctx.resume();
    entry.gain.gain.value = gainValue;
    entry.i = 0;
    return entry;
  }

  /** Returns the current boost index for a video, or 0 if none. */
  getIndex(video: HTMLVideoElement): number {
    return this.#map.get(video)?.i ?? 0;
  }

  /** Returns the current raw gain value for a video, or 1. */
  getGain(video: HTMLVideoElement): number {
    return this.#map.get(video)?.gain.gain.value ?? 1;
  }

  /** Returns true if the video has a boosted gain applied. */
  isBoosted(video: HTMLVideoElement): boolean {
    return (this.#map.get(video)?.gain.gain.value ?? 1) > 1;
  }

  /** Closes and forgets the audio graph for a video that's been removed from the DOM. */
  release(video: HTMLVideoElement) {
    const entry = this.#map.get(video);
    if (!entry) return;
    try {
      entry.ctx.close();
    } catch {
      /* already closed */
    }
    this.#map.delete(video);
  }
}
