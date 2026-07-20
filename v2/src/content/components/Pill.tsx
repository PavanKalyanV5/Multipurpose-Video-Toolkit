import { forwardRef } from 'react';

interface Props {
  label: string;
  visible: boolean;
  faded: boolean;
  onMouseEnter: () => void;
  onMouseDown: (e: React.MouseEvent) => void;
}

export const Pill = forwardRef<HTMLDivElement, Props>(function Pill({ label, visible, faded, onMouseEnter, onMouseDown }, ref) {
  const className = visible ? (faded ? 'show faded' : 'show') : '';
  return (
    <div id="pill" ref={ref} className={className} onMouseEnter={onMouseEnter} onMouseDown={onMouseDown}>
      {label}
    </div>
  );
});
