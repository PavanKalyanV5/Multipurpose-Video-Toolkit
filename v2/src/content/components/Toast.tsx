import { useEffect, useRef } from 'react';

interface ToastState {
  text: string;
  ms: number;
  nonce: number;
}

interface Props {
  toast: ToastState | null;
  barRef: React.RefObject<HTMLDivElement | null>;
  hostEl: HTMLElement;
  currentVideo: HTMLVideoElement | null;
}

/**
 * Prefers the bar's last known position (already accounts for drag offset),
 * but the bar may never have been placed yet — e.g. a value changed from the
 * popup before the user ever hovered the video — so falls back to the
 * video's own bounding box, and finally to a fixed corner, rather than
 * silently rendering with no position at all.
 */
export function Toast({ toast, barRef, hostEl, currentVideo }: Props) {
  const elRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!toast || toast.nonce === 0) return;
    const el = elRef.current;
    if (!el) return;
    const bar = barRef.current;
    if (bar && bar.style.left) {
      el.style.left = bar.style.left;
      el.style.top = parseInt(bar.style.top || '40', 10) + 36 + 'px';
    } else if (currentVideo && currentVideo.isConnected) {
      const r = currentVideo.getBoundingClientRect();
      const hr = hostEl.getBoundingClientRect();
      el.style.left = Math.max(8, r.left - hr.left + 6) + 'px';
      el.style.top = Math.max(8, r.top - hr.top + 6) + 'px';
    } else {
      el.style.left = '16px';
      el.style.top = '16px';
    }
    el.style.display = 'block';
    const hideTimer = setTimeout(() => {
      el.style.display = 'none';
    }, toast.ms);
    return () => clearTimeout(hideTimer);
  }, [toast, barRef, hostEl, currentVideo]);

  return (
    <div id="msg" ref={elRef}>
      {toast?.text}
    </div>
  );
}
