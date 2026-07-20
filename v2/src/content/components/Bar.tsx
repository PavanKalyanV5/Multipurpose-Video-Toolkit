import { forwardRef, useEffect, useRef, useState } from 'react';
import { SPEEDS } from '../../shared/constants';
import type { UIState } from '../UIStore';
import type { VideoToolkit } from '../VideoToolkit';

interface Props {
  toolkit: VideoToolkit;
  state: UIState;
  isYT: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onMouseDown: (e: React.MouseEvent) => void;
  onCollapse: () => void;
  onTogglePin: () => void;
}

export const Bar = forwardRef<HTMLDivElement, Props>(function Bar(
  { toolkit, state, isYT, onMouseEnter, onMouseLeave, onMouseDown, onCollapse, onTogglePin },
  ref,
) {
  const { bar, visible, pinned } = state;
  const [editingSpeed, setEditingSpeed] = useState(false);
  const [speedDraft, setSpeedDraft] = useState('');
  const speedInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingSpeed) {
      speedInputRef.current?.focus();
      speedInputRef.current?.select();
    }
  }, [editingSpeed]);

  const act = (action: string, arg?: number) => toolkit.handleAction(action, arg);

  const onSlower = () => {
    const i = Math.max(0, SPEEDS.findIndex((s) => s >= bar.rate) - 1);
    act('setRate', SPEEDS[i]);
  };
  const onFaster = () => {
    const cur = SPEEDS.findIndex((s) => s >= bar.rate);
    const i = Math.min(SPEEDS.length - 1, (cur === -1 ? SPEEDS.length : cur) + 1);
    act('setRate', SPEEDS[i]);
  };

  const commitSpeed = () => {
    const val = Math.min(16, Math.max(0.1, parseFloat(speedDraft) || 1));
    setEditingSpeed(false);
    act('setRate', val);
  };

  // Tooltip delegation: one listener pair on the bar rather than one per
  // button. First tooltip in a "session" gets a short show delay (so
  // sweeping the mouse across the bar doesn't flash one per button); hopping
  // straight to an adjacent button while already showing one — or within
  // 300ms of the last one closing — shows instantly, matching how
  // OS-native and IDE tooltip groups behave.
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastHideAtRef = useRef(0);

  const handleTipOver = (e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest('[aria-label]') as HTMLElement | null;
    if (!el || el === state.tooltipTarget) return;
    if (showTimerRef.current) clearTimeout(showTimerRef.current);
    const warm = state.tooltipTarget !== null || Date.now() - lastHideAtRef.current < 300;
    if (warm) toolkit.store.setTooltipTarget(el);
    else showTimerRef.current = setTimeout(() => toolkit.store.setTooltipTarget(el), 400);
  };

  const handleTipOut = (e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest('[aria-label]');
    const related = e.relatedTarget as Node | null;
    if (el && related && el.contains(related)) return; // stayed within the same labeled element
    if (showTimerRef.current) clearTimeout(showTimerRef.current);
    lastHideAtRef.current = Date.now();
    toolkit.store.setTooltipTarget(null);
  };

  const handleTipFocus = (e: React.FocusEvent) => {
    const el = (e.target as HTMLElement).closest('[aria-label]') as HTMLElement | null;
    if (el) toolkit.store.setTooltipTarget(el);
  };

  const handleTipBlur = () => toolkit.store.setTooltipTarget(null);

  return (
    <div
      id="bar"
      ref={ref}
      className={visible === 'bar' ? 'show' : ''}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onMouseDown={onMouseDown}
      onMouseOver={handleTipOver}
      onMouseOut={handleTipOut}
      onFocus={handleTipFocus}
      onBlur={handleTipBlur}
    >
      <button aria-label="Slower" onClick={onSlower}>&minus;</button>
      {editingSpeed ? (
        <input
          ref={speedInputRef}
          className="spd-input"
          type="number"
          min="0.1"
          max="16"
          step="0.1"
          value={speedDraft}
          onChange={(e) => setSpeedDraft(e.target.value)}
          onBlur={commitSpeed}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitSpeed();
            }
            if (e.key === 'Escape') setEditingSpeed(false);
          }}
        />
      ) : (
        <span
          id="spd"
          aria-label="Click to enter custom speed"
          onClick={() => {
            setSpeedDraft(String(bar.rate));
            setEditingSpeed(true);
          }}
        >
          {bar.rate}x
        </span>
      )}
      <button aria-label="Faster" onClick={onFaster}>+</button>
      <span className="sep" />
      <button aria-label="Back" onClick={() => act('seek', -1)}>
        <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="11 19 2 12 11 5" /><polygon points="22 19 13 12 22 5" /></svg>
      </button>
      <button aria-label="Forward" onClick={() => act('seek', 1)}>
        <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="2 5 11 12 2 19" /><polygon points="13 5 22 12 13 19" /></svg>
      </button>
      <button id="mute" className={bar.muted ? 'active' : ''} aria-label="Toggle mute" onClick={() => act('mute')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 5 6 9H2v6h4l5 4V5z" fill="currentColor" stroke="none" />
          <path d="M15.5 8.5a5 5 0 0 1 0 7" />
          <path d="M19 5a10 10 0 0 1 0 14" />
          <line className="mute-slash" x1="22" y1="2" x2="2" y2="22" />
        </svg>
      </button>
      <button className={bar.loop ? 'active' : ''} aria-label="Toggle loop" onClick={() => act('loop')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m17 2 4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" />
          <path d="m7 22-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" />
        </svg>
      </button>
      <button aria-label="Mute every other video on this page" onClick={() => act('solo')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none" />
        </svg>
      </button>
      <span className="sep" />
      <button aria-label="Picture-in-picture" onClick={() => act('pip')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><rect x="14" y="11" width="7" height="5" rx="1" />
        </svg>
      </button>
      <button
        className={bar.fullscreen ? 'active' : ''}
        aria-label="Fullscreen (great for Reels/Shorts-style players with no native fullscreen)"
        onClick={() => act('fullscreen')}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M21 8V5a2 2 0 0 0-2-2h-3" /><path d="M3 16v3a2 2 0 0 0 2 2h3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" />
        </svg>
      </button>
      <button aria-label="Rotate video 90° left" onClick={() => act('rotate', -1)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" />
        </svg>
      </button>
      <button aria-label="Rotate video 90° right" onClick={() => act('rotate', 1)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" />
        </svg>
      </button>
      <button className={bar.cinema ? 'active' : ''} aria-label="Cinema mode — dim the page around the video" onClick={() => act('cinema')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" stroke="none" />
        </svg>
      </button>
      <span className="sep" />
      <button className={bar.boosted ? 'active' : ''} aria-label="Volume boost" onClick={() => act('vol')}>
        <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
        <span>{bar.volPct}%</span>
      </button>
      <button className={bar.normalized ? 'active' : ''} aria-label="Loudness normalization — evens out quiet/loud parts" onClick={() => act('normalize')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
          <line x1="4" y1="7" x2="4" y2="17" /><line x1="12" y1="7" x2="12" y2="17" /><line x1="20" y1="7" x2="20" y2="17" />
        </svg>
      </button>
      <button className={bar.cc ? 'active' : ''} aria-label="Cycle caption tracks" onClick={() => act('cc')}>CC</button>
      <button aria-label="Screenshot frame (saves + copies to clipboard)" onClick={() => act('shot')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" /><circle cx="12" cy="13" r="3.2" />
        </svg>
      </button>
      <button aria-label="Copy timestamped link" onClick={() => act('copyTs')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      </button>
      {!isYT && (
        <button id="rec" className={bar.recording ? 'active' : ''} aria-label="Record playing video to .webm" onClick={() => act('rec')}>
          <svg viewBox="0 0 24 24">
            <circle className="rec-dot" cx="12" cy="12" r="10" fill="currentColor" />
            <rect className="rec-square" x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
          </svg>
          <span>{bar.recording ? 'Stop' : 'Rec'}</span>
        </button>
      )}
      {!isYT && (
        <button aria-label="Download (direct sources only)" onClick={() => act('dl')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </button>
      )}
      <span className="sep" />
      <button className={pinned ? 'active' : ''} aria-label="Pin overlay position" onClick={onTogglePin}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="17" x2="12" y2="22" />
          <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
        </svg>
      </button>
      <button aria-label="Collapse toolbar" onClick={onCollapse}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
      </button>
    </div>
  );
});
