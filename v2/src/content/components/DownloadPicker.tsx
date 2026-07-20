import { useEffect, useRef } from 'react';
import type { MediaItem } from '../../shared/types';
import type { VideoToolkit } from '../VideoToolkit';

interface PickerState {
  items: MediaItem[];
  site: string;
}

interface Props {
  picker: PickerState | null;
  barRef: React.RefObject<HTMLDivElement | null>;
  toolkit: VideoToolkit;
}

function fmtSize(b: number): string {
  return b > 0 ? (b / 1048576).toFixed(1) + ' MB' : 'size ?';
}

export function DownloadPicker({ picker, barRef, toolkit }: Props) {
  const elRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!picker) return;
    const el = elRef.current;
    const bar = barRef.current;
    if (!el || !bar) return;
    el.style.left = bar.style.left;
    el.style.top = parseInt(bar.style.top || '40', 10) + 36 + 'px';
  }, [picker, barRef]);

  const exportUrls = () => {
    if (!picker) return;
    const text = picker.items.map((it) => it.url).join('\n');
    const a = document.createElement('a');
    a.download = `media-urls-${picker.site}-${Date.now()}.txt`;
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    toolkit.store.hidePicker();
    toolkit.store.toast('URL list downloaded.', 1400);
  };

  return (
    <div id="picker" ref={elRef} className={picker ? 'show' : ''}>
      {picker && (
        <>
          <div className="ph">Choose file to download ({picker.items.length} found)</div>
          <div className="p-list">
            {picker.items.map((it) => (
              <button key={it.url} className="pi" title={it.url} onClick={() => toolkit.startDownload(it.url)}>
                {[it.hint || 'res ?', fmtSize(it.size), it.label].filter(Boolean).join(' · ')}
              </button>
            ))}
          </div>
          <button className="pi" onClick={exportUrls}>
            Export all {picker.items.length} URLs as .txt
          </button>
          <button className="pi pc" onClick={() => toolkit.store.hidePicker()}>
            Cancel — tip: switch quality in the player to make more resolutions appear here
          </button>
        </>
      )}
    </div>
  );
}
