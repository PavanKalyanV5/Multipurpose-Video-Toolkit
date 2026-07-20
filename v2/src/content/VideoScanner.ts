import type { AudioBooster } from '../shared/AudioBooster';
import type { SessionManager } from '../shared/SessionManager';
import type { StatsTracker } from '../shared/StatsTracker';
import type { VideoRecorder } from '../shared/VideoRecorder';
import type { SubtitlePayload } from '../shared/types';
import type { UIStore } from './UIStore';

interface VideoWithUvtFlags extends HTMLVideoElement {
  _uvtAutoPausedOffscreen?: boolean;
  _uvtUserPlay?: boolean;
}

/** Narrow view of VideoToolkit that VideoScanner needs — avoids a circular import with the orchestrator. */
export interface ScannerHost {
  enabled: boolean;
  autoplayBlock: boolean;
  pauseOffscreen: boolean;
  session: SessionManager;
  booster: AudioBooster;
  recorder: VideoRecorder;
  stats: StatsTracker;
  store: UIStore;
  applySubtitleToVideo(video: HTMLVideoElement, subtitle: SubtitlePayload): void;
  refreshPill(): void;
  reportState(video: HTMLVideoElement): void;
  findDefaultVideo(): void;
  showPill(video: HTMLVideoElement): void;
}

export class VideoScanner {
  #seen = new WeakSet<HTMLVideoElement>();
  #speedApplied = new WeakSet<HTMLVideoElement>();
  #toolkit: ScannerHost;

  cachedVideos: HTMLVideoElement[] = [];

  // One shared observer for every video rather than one per element — cheaper,
  // and lets toggling the "pause off-screen" setting take effect immediately
  // without needing to re-wire anything (the check happens inside the callback).
  #offscreenObserver = new IntersectionObserver(
    (entries) => {
      const tk = this.#toolkit;
      if (!tk.enabled || !tk.pauseOffscreen) return;
      for (const entry of entries) {
        const video = entry.target as VideoWithUvtFlags;
        if (entry.isIntersecting) {
          if (video._uvtAutoPausedOffscreen) {
            video._uvtAutoPausedOffscreen = false;
            video.play().catch(() => {});
          }
        } else if (!video.paused) {
          video._uvtAutoPausedOffscreen = true;
          video.pause();
        }
      }
    },
    { threshold: 0 },
  );

  constructor(toolkit: ScannerHost) {
    this.#toolkit = toolkit;
  }

  /** Wire event listeners to a newly discovered video. */
  wire(video: VideoWithUvtFlags) {
    if (this.#seen.has(video)) return;
    this.#seen.add(video);

    // Sites that swap out the <video> element (feed scrolling, ad breaks, quality
    // switches) would otherwise lose an injected subtitle track — reapply it here
    // as soon as the new element is discovered, no playback/gesture required.
    const subtitle = this.#toolkit.session.get('subtitle');
    if (subtitle) this.#toolkit.applySubtitleToVideo(video, subtitle);

    this.#offscreenObserver.observe(video);

    video.addEventListener('play', () => {
      const tk = this.#toolkit;
      if (tk.autoplayBlock && !video._uvtUserPlay) {
        video.pause();
        tk.store.toast('Autoplay blocked — press play to continue.', 2000);
        return;
      }
      if (tk.enabled && !this.#speedApplied.has(video)) {
        this.#speedApplied.add(video);
        tk.session.applyTo(video, tk.booster);
      }
      if (video === tk.store.currentVideo) tk.reportState(video);
      // Single shared timer, not per-video — approximates "time spent watching
      // something on this page" rather than precise per-video accounting; see
      // StatsTracker for why that's the right fidelity for a personal dashboard.
      if (tk.enabled) tk.stats.startWatch();
    });

    video.addEventListener('click', () => {
      video._uvtUserPlay = true;
    });
    video.addEventListener('pause', () => {
      video._uvtUserPlay = false;
      this.#toolkit.stats.stopWatch();
    });
    video.addEventListener('ended', () => this.#toolkit.stats.stopWatch());
    video.addEventListener('ratechange', () => {
      if (video !== this.#toolkit.store.currentVideo) return;
      this.#toolkit.store.setBar({ rate: video.playbackRate });
      this.#toolkit.refreshPill();
      this.#toolkit.reportState(video);
    });
    video.addEventListener('mouseenter', () => {
      this.#toolkit.store.cancelHide();
      this.#toolkit.showPill(video);
    });
    video.addEventListener('mouseleave', () => {
      this.#toolkit.store.scheduleHide(this.#toolkit.recorder.isRecording(video));
    });
  }

  /** Scan a DOM node for video elements. */
  scan(node: ParentNode) {
    node.querySelectorAll?.('video').forEach((v) => this.wire(v as VideoWithUvtFlags));
    this.cachedVideos = Array.from(document.querySelectorAll('video'));
    // Auto-attaches the (minimal, unobtrusive) pill to the best candidate
    // video with no hover needed — safe now that findDefaultVideo() only
    // ever picks a properly-sized, in-viewport video (see its own comment):
    // this runs on every DOM mutation the page makes, so it would be a
    // problem if it could grab the wrong element, but showing just the pill
    // for the right one is exactly the intended "ready before you hover" UX.
    this.#toolkit.findDefaultVideo();
  }

  /** Start the MutationObserver that picks up dynamically added/removed videos. */
  observe() {
    new MutationObserver((muts) => {
      let removed = false;
      for (const m of muts) {
        m.addedNodes.forEach((n) => n.nodeType === 1 && this.scan(n as Element));
        m.removedNodes.forEach((n) => {
          if (n.nodeType !== 1) return;
          const el = n as Element;
          const videos = el.matches?.('video') ? [el as HTMLVideoElement] : Array.from(el.querySelectorAll?.('video') || []);
          if (videos.length) {
            removed = true;
            videos.forEach((v) => {
              this.#toolkit.booster.release(v);
              this.#offscreenObserver.unobserve(v);
            });
          }
        });
      }
      if (removed) this.cachedVideos = Array.from(document.querySelectorAll('video'));
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  /** Find the best video target for keyboard shortcuts. */
  shortcutTarget(): HTMLVideoElement | null {
    let best: HTMLVideoElement | null = null;
    let bestScore = 0;
    for (const v of document.querySelectorAll('video')) {
      const r = v.getBoundingClientRect();
      if (r.width < 80 || r.height < 60 || r.bottom < 0 || r.top > innerHeight) continue;
      const score = r.width * r.height + (v.paused ? 0 : 1e9);
      if (score > bestScore) {
        bestScore = score;
        best = v;
      }
    }
    return best;
  }
}
