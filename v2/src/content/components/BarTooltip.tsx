import { useEffect, useRef, useState } from 'react';
import { computePosition, offset, flip, shift, arrow, autoUpdate } from '@floating-ui/dom';

interface Props {
  target: HTMLElement | null;
}

const OPPOSITE_SIDE: Record<string, string> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

/**
 * A single shared tooltip, positioned via floating-ui instead of pure CSS —
 * unlike a `::after`-based bubble anchored dead-center under its button, this
 * one measures real viewport space and flips/shifts to avoid clipping when a
 * button sits near the edge of the screen (e.g. the bar hugging a full-width
 * video player). Rendered as a sibling of #bar in ToolbarRoot, not nested
 * inside it — #bar has its own `transform`, which would otherwise turn this
 * element's `position: fixed` into something relative to the bar instead of
 * the viewport.
 */
export function BarTooltip({ target }: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const arrowRef = useRef<HTMLDivElement>(null);
  const [label, setLabel] = useState('');

  useEffect(() => {
    if (!target) return;
    // Keep showing the outgoing label while this fades out, rather than
    // popping to blank text for the last frame of the exit transition.
    setLabel(target.getAttribute('aria-label') || '');
  }, [target]);

  useEffect(() => {
    const el = elRef.current;
    const arrowEl = arrowRef.current;
    if (!target || !el || !arrowEl) return;

    const update = () => {
      computePosition(target, el, {
        strategy: 'fixed',
        placement: 'top',
        middleware: [offset(9), flip({ padding: 8 }), shift({ padding: 8 }), arrow({ element: arrowEl, padding: 8 })],
      }).then(({ x, y, placement, middlewareData }) => {
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        const side = placement.split('-')[0];
        arrowEl.dataset.side = side;
        if (middlewareData.arrow) {
          const { x: ax, y: ay } = middlewareData.arrow;
          arrowEl.style.left = ax != null ? `${ax}px` : '';
          arrowEl.style.top = ay != null ? `${ay}px` : '';
          (['top', 'bottom', 'left', 'right'] as const).forEach((s) => (arrowEl.style[s] = ''));
          arrowEl.style[OPPOSITE_SIDE[side] as 'top' | 'bottom' | 'left' | 'right'] = '-4px';
        }
      });
    };

    return autoUpdate(target, el, update);
  }, [target]);

  return (
    <div id="bartip" ref={elRef} className={target ? 'show' : ''}>
      {label}
      <div id="bartip-arrow" ref={arrowRef} />
    </div>
  );
}
