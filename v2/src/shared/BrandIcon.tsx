import SvgIcon, { type SvgIconProps } from '@mui/material/SvgIcon';

/** The extension's mark — a play-button-in-a-frame — shared across popup, rules, dashboard, and welcome. */
export function BrandIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props} viewBox="0 0 24 24" sx={{ fill: 'none', stroke: 'currentColor', strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round', ...props.sx }}>
      <path d="M23 7a2 2 0 0 0-2.45-1.45L16 7V5a2 2 0 0 0-2-2H2a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2l4.55 1.45A2 2 0 0 0 23 17V7z" />
    </SvgIcon>
  );
}
