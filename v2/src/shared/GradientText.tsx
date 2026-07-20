import Typography, { type TypographyProps } from '@mui/material/Typography';

/** The cyan-to-purple gradient page title treatment shared across every extension page. */
export function GradientText(props: TypographyProps) {
  return (
    <Typography
      {...props}
      sx={{
        background: 'linear-gradient(90deg, #38bdf8 0%, #a855f7 100%)',
        backgroundClip: 'text',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        ...props.sx,
      }}
    />
  );
}
