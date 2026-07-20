import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import type { VideoToolkit } from '../VideoToolkit';
import { Pill } from './Pill';
import { Bar } from './Bar';
import { FlashOSD } from './FlashOSD';
import { Toast } from './Toast';
import { DownloadPicker } from './DownloadPicker';
import { BarTooltip } from './BarTooltip';

interface Props {
  toolkit: VideoToolkit;
  hostEl: HTMLElement;
  isYT: boolean;
}

export function ToolbarRoot({ toolkit, hostEl, isYT }: Props) {
  const { store } = toolkit;
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);

  const pillRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const offset = useRef({ x: 0, y: 0 });
  const rafPending = useRef(false);
  const prevVideoRef = useRef<HTMLVideoElement | null>(null);

  const placeBar = useCallback(() => {
    const video = store.currentVideo;
    if (!video || !video.isConnected) {
      store.hideAll(toolkit.recorder.isRecording(video));
      return;
    }
    const r = video.getBoundingClientRect();
    if (r.width < 80 || r.height < 60) {
      store.hideAll(toolkit.recorder.isRecording(video));
      return;
    }
    const hr = hostEl.getBoundingClientRect();
    const left = r.left - hr.left + 6 + offset.current.x + 'px';
    const top = r.top - hr.top + 6 + offset.current.y + 'px';
    if (barRef.current) {
      barRef.current.style.left = left;
      barRef.current.style.top = top;
    }
    if (pillRef.current) {
      pillRef.current.style.left = left;
      pillRef.current.style.top = top;
    }
  }, [store, toolkit, hostEl]);

  const placeBarRAF = useCallback(() => {
    if (rafPending.current) return;
    rafPending.current = true;
    requestAnimationFrame(() => {
      rafPending.current = false;
      placeBar();
    });
  }, [placeBar]);

  // Reposition whenever the attached video or visibility changes; reset the
  // drag offset when the video itself changes (unless the user pinned it).
  useEffect(() => {
    if (state.currentVideo !== prevVideoRef.current) {
      if (!store.pinned) offset.current = { x: 0, y: 0 };
      prevVideoRef.current = state.currentVideo;
    }
    placeBar();
  }, [state.currentVideo, state.visible, placeBar, store]);

  useEffect(() => {
    window.addEventListener('scroll', placeBarRAF, true);
    window.addEventListener('resize', placeBarRAF);
    return () => {
      window.removeEventListener('scroll', placeBarRAF, true);
      window.removeEventListener('resize', placeBarRAF);
    };
  }, [placeBarRAF]);

  // Fullscreen: re-parent the shadow host into whatever becomes
  // document.fullscreenElement, and fade the overlay in on mouse movement /
  // out after a few seconds idle, mirroring native player chrome.
  useEffect(() => {
    let fsMoveHandler: (() => void) | null = null;
    let fsIdleTimer: ReturnType<typeof setTimeout> | null = null;

    const handler = () => {
      store.hideAll(false);
      store.setBar({ fullscreen: !!document.fullscreenElement });

      const container = document.fullscreenElement || document.body || document.documentElement;
      if (container && hostEl.parentElement !== container) container.appendChild(hostEl);
      placeBar();

      if (document.fullscreenElement) {
        hostEl.style.transition = 'opacity 0.25s ease';
        fsMoveHandler = () => {
          hostEl.style.opacity = '1';
          hostEl.style.pointerEvents = 'auto';
          if (fsIdleTimer) clearTimeout(fsIdleTimer);
          fsIdleTimer = setTimeout(() => {
            // Holding the mouse still to read a tooltip produces no further
            // mousemove events, so this timer keeps counting down from
            // whenever the bar was entered — not from when the user stopped
            // to look at something. Bail out here too, not just on raw
            // :hover, so fading the host mid-read can't yank a tooltip away
            // (dropping pointer-events forces an immediate hit-test
            // recompute, which can itself fire mouseout on whatever's hovered).
            const stillEngaged =
              barRef.current?.matches(':hover') || pillRef.current?.matches(':hover') || store.getSnapshot().tooltipTarget !== null;
            if (!stillEngaged) {
              hostEl.style.opacity = '0';
              hostEl.style.pointerEvents = 'none';
            }
          }, 3000);
        };
        document.addEventListener('mousemove', fsMoveHandler);
      } else {
        if (fsMoveHandler) document.removeEventListener('mousemove', fsMoveHandler);
        fsMoveHandler = null;
        if (fsIdleTimer) clearTimeout(fsIdleTimer);
        hostEl.style.opacity = '';
        hostEl.style.pointerEvents = '';
        hostEl.style.transition = '';
      }
    };

    document.addEventListener('fullscreenchange', handler);
    return () => {
      document.removeEventListener('fullscreenchange', handler);
      if (fsMoveHandler) document.removeEventListener('mousemove', fsMoveHandler);
      if (fsIdleTimer) clearTimeout(fsIdleTimer);
    };
  }, [store, hostEl, placeBar]);

  // Drag — shared by the pill and the expanded bar.
  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      const t = e.target as HTMLElement;
      if (t.closest('button, input') || t.classList.contains('sep') || t.closest('#picker')) return;
      let startX = e.clientX;
      let startY = e.clientY;
      if (barRef.current) barRef.current.style.cursor = 'grabbing';
      if (pillRef.current) pillRef.current.style.cursor = 'grabbing';
      const move = (ev: MouseEvent) => {
        offset.current.x += ev.clientX - startX;
        offset.current.y += ev.clientY - startY;
        startX = ev.clientX;
        startY = ev.clientY;
        placeBar();
      };
      const up = () => {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
        if (barRef.current) barRef.current.style.cursor = 'grab';
        if (pillRef.current) pillRef.current.style.cursor = 'grab';
      };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
      e.preventDefault();
    },
    [placeBar],
  );

  return (
    <>
      <Pill
        ref={pillRef}
        label={state.pillLabel}
        visible={state.visible === 'pill'}
        faded={state.faded}
        onMouseEnter={() => {
          store.cancelHide();
          store.expand();
        }}
        onMouseDown={onDragStart}
      />
      <Bar
        ref={barRef}
        toolkit={toolkit}
        state={state}
        isYT={isYT}
        onMouseEnter={() => {
          store.cancelHide();
          store.cancelCollapse();
        }}
        onMouseLeave={() => store.scheduleCollapse()}
        onMouseDown={onDragStart}
        onCollapse={() => store.collapse()}
        onTogglePin={() => {
          const next = !store.pinned;
          store.setPinned(next);
          store.toast(next ? 'Overlay position pinned' : 'Overlay position unpinned', 1200);
        }}
      />
      <FlashOSD flash={state.flash} hostEl={hostEl} />
      <Toast toast={state.toast} barRef={barRef} hostEl={hostEl} currentVideo={state.currentVideo} />
      <DownloadPicker picker={state.picker} barRef={barRef} toolkit={toolkit} />
      <BarTooltip target={state.tooltipTarget} />
    </>
  );
}
