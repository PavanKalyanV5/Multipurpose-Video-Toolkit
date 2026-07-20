import { useEffect, useRef } from 'react';
import { FLASH_ICONS } from '../icons';
import type { FlashIconKey } from '../UIStore';

interface FlashState {
  icon: FlashIconKey | null;
  text: string;
  video: HTMLVideoElement | null;
  ms: number;
  nonce: number;
}

interface Props {
  flash: FlashState;
  hostEl: HTMLElement;
}

export function FlashOSD({ flash, hostEl }: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (flash.nonce === 0 || !flash.video || !flash.video.isConnected) return;
    const el = elRef.current;
    if (!el) return;
    const r = flash.video.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    const hr = hostEl.getBoundingClientRect();
    el.style.left = r.left - hr.left + r.width / 2 + 'px';
    el.style.top = r.top - hr.top + r.height / 2 + 'px';

    // Restart the transition even if a flash is already mid-fade, so rapid
    // repeats (e.g. holding the speed key) each get their own clean pulse.
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => el.classList.remove('show'), flash.ms);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flash.nonce]);

  return (
    <div id="flash" ref={elRef}>
      <span id="flashIcon" dangerouslySetInnerHTML={{ __html: flash.icon ? FLASH_ICONS[flash.icon] : '' }} />
      <span id="flashText">{flash.text}</span>
    </div>
  );
}
