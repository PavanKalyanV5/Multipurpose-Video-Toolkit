export interface NetworkStats {
  videoSpeed: string;
  deviceSpeed: string;
  videoBps: number;
  deviceMbps: number;
}

/**
 * NetworkTracker — Measures real-time video network consumption speed
 * vs. total device receiving connection speed.
 *
 * Incorporates per-chunk active throughput measurement, TimeRanges-aware
 * buffer tracking, and idle-pause persistence to handle YouTube's
 * burst-and-idle chunk streaming behavior accurately.
 */
export class NetworkTracker {
  #lastSampleTime = 0;
  #lastBufferedEnd = -1;
  #lastActiveVideoBps = 0;
  #videoSpeedBps = 0;
  #deviceSpeedBps = 0;
  #intervalId: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.#lastSampleTime = performance.now();
  }

  start(onUpdate: (stats: NetworkStats) => void, intervalMs = 1000): void {
    if (this.#intervalId) return;
    this.#intervalId = setInterval(() => {
      const stats = this.measure();
      if (onUpdate) onUpdate(stats);
    }, intervalMs);
  }

  stop(): void {
    if (this.#intervalId) {
      clearInterval(this.#intervalId);
      this.#intervalId = null;
    }
  }

  measure(video: HTMLVideoElement | null = null): NetworkStats {
    const now = performance.now();
    const windowMs = 4000;
    const cutoff = now - windowMs;

    let mediaBytes = 0;
    let mediaActiveDurationSec = 0;
    let totalBytes = 0;

    try {
      const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      for (let i = entries.length - 1; i >= 0; i--) {
        const entry = entries[i];
        const endTime = entry.responseEnd || entry.startTime;
        if (endTime < cutoff) break;

        const size = entry.transferSize || entry.encodedBodySize || entry.decodedBodySize || 0;
        totalBytes += size;

        const isMedia =
          entry.initiatorType === 'media' ||
          entry.initiatorType === 'audio' ||
          entry.initiatorType === 'video' ||
          /[\/_.-](video|audio|m4s|ts|webm|mp4|m3u8|mpd|googlevideo|videoplayback)[\/_.-]?/i.test(entry.name);

        if (isMedia && size > 0) {
          mediaBytes += size;
          const fetchDuration = Math.max(0.05, (entry.responseEnd - entry.startTime) / 1000);
          mediaActiveDurationSec += fetchDuration;
        }
      }
    } catch {}

    const windowDurationSec = windowMs / 1000;
    let calculatedTotalBps = totalBytes / windowDurationSec;

    // 1. Per-chunk throughput calculation (measures true bandwidth during active fetch)
    let hasActiveFetch = false;
    let calculatedVideoBps = 0;
    if (mediaBytes > 0 && mediaActiveDurationSec > 0) {
      calculatedVideoBps = mediaBytes / mediaActiveDurationSec;
      hasActiveFetch = true;
    }

    // 2. Secondary fallback via TimeRanges-aware buffer progression
    let currentRangeEnd = -1;
    if (video && video.buffered && video.buffered.length > 0) {
      try {
        for (let i = 0; i < video.buffered.length; i++) {
          if (video.buffered.start(i) <= video.currentTime && video.currentTime <= video.buffered.end(i) + 0.5) {
            currentRangeEnd = video.buffered.end(i);
            break;
          }
        }
        if (currentRangeEnd < 0) {
          currentRangeEnd = video.buffered.end(video.buffered.length - 1);
        }

        if (!video.paused && this.#lastBufferedEnd >= 0 && currentRangeEnd > this.#lastBufferedEnd) {
          const deltaBufferSec = currentRangeEnd - this.#lastBufferedEnd;
          const deltaWallSec = (now - this.#lastSampleTime) / 1000;
          if (deltaWallSec > 0 && deltaBufferSec < 60) {
            const height = video.videoHeight || 720;
            const estimatedBitrateBps = height >= 1080 ? 5000000 / 8 : height >= 720 ? 2500000 / 8 : 1200000 / 8;
            const estimatedBufferBps = (deltaBufferSec / deltaWallSec) * estimatedBitrateBps;

            if (!hasActiveFetch && estimatedBufferBps > 1000) {
              calculatedVideoBps = estimatedBufferBps;
              hasActiveFetch = true;
            }
          }
        }
        this.#lastBufferedEnd = currentRangeEnd;
      } catch {}
    } else if (video && video.paused) {
      this.#lastBufferedEnd = -1;
    }
    this.#lastSampleTime = now;

    // 3. Idle persistence & EMA smoothing
    if (hasActiveFetch) {
      this.#lastActiveVideoBps = calculatedVideoBps;
      this.#videoSpeedBps = this.#videoSpeedBps === 0
        ? calculatedVideoBps
        : this.#videoSpeedBps * 0.5 + calculatedVideoBps * 0.5;
    } else if (video && !video.paused && this.#lastActiveVideoBps > 0) {
      this.#videoSpeedBps = this.#videoSpeedBps * 0.92;
    } else {
      this.#videoSpeedBps = this.#videoSpeedBps * 0.4;
      if (this.#videoSpeedBps < 500) this.#videoSpeedBps = 0;
    }

    this.#deviceSpeedBps = this.#deviceSpeedBps * 0.5 + calculatedTotalBps * 0.5;

    let deviceMbpsStr = '';
    let rawDownlinkMbps = 0;
    const navConn = (navigator as unknown as { connection?: { downlink?: number } }).connection;
    if (navConn && typeof navConn.downlink === 'number') {
      rawDownlinkMbps = navConn.downlink;
      deviceMbpsStr = `${rawDownlinkMbps.toFixed(1)} Mbps`;
    } else {
      const activeMbps = (this.#deviceSpeedBps * 8) / 1000000;
      deviceMbpsStr = `${activeMbps.toFixed(1)} Mbps`;
    }

    return {
      videoSpeed: this.formatBytes(this.#videoSpeedBps),
      deviceSpeed: deviceMbpsStr,
      videoBps: this.#videoSpeedBps,
      deviceMbps: rawDownlinkMbps,
    };
  }

  formatBytes(bytesPerSec: number): string {
    if (bytesPerSec < 1024) return `${Math.round(bytesPerSec)} B/s`;
    if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
    return `${(bytesPerSec / (1024 * 1024)).toFixed(2)} MB/s`;
  }
}
