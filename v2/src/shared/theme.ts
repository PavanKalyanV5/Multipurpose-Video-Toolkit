import { createTheme } from '@mui/material/styles';

// Shared brand palette across all extension pages — cyan/purple gradient
// accent on a near-black surface, matching the video-overlay toolbar so the
// whole extension (popup, rules editor, dashboard, welcome tab) reads as one
// product rather than four differently-styled screens.
const ACCENT = '#38bdf8';
const ACCENT_2 = '#a855f7';
const PAGE_BG = '#0e111a';
const SURFACE = 'rgba(255,255,255,0.03)';
const SURFACE_BORDER = 'rgba(255,255,255,0.08)';

export const theme = createTheme({
  cssVariables: false,
  palette: {
    mode: 'dark',
    primary: { main: ACCENT, contrastText: '#04121c' },
    secondary: { main: ACCENT_2 },
    error: { main: '#ef4444' },
    warning: { main: '#fb923c' },
    success: { main: '#22c55e' },
    background: { default: PAGE_BG, paper: '#12151f' },
    text: { primary: '#e2e8f0', secondary: '#94a3b8', disabled: '#475569' },
    divider: SURFACE_BORDER,
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: '"Inter", system-ui, -apple-system, sans-serif',
    button: { textTransform: 'none', fontWeight: 600 },
    h1: { fontWeight: 700 },
    h2: { fontWeight: 700 },
    h6: { fontWeight: 700 },
    subtitle2: { fontWeight: 700, letterSpacing: 0.6 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          background: `linear-gradient(135deg, ${PAGE_BG} 0%, #151824 100%)`,
          minHeight: '100vh',
        },
        '*::-webkit-scrollbar': { width: 8, height: 8 },
        '*::-webkit-scrollbar-track': { background: 'rgba(255,255,255,0.02)' },
        '*::-webkit-scrollbar-thumb': { background: 'rgba(56,189,248,0.25)', borderRadius: 4 },
        '*::-webkit-scrollbar-thumb:hover': { background: 'rgba(56,189,248,0.45)' },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          background: SURFACE,
          border: `1px solid ${SURFACE_BORDER}`,
          borderRadius: 14,
          boxShadow: '0 4px 12px rgba(0,0,0,.15)',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: { borderRadius: 8, fontWeight: 600 },
      },
      defaultProps: { disableElevation: true },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600 },
      },
    },
    MuiSwitch: {
      styleOverrides: {
        root: { padding: 8 },
        track: { borderRadius: 20 },
      },
    },
    MuiTooltip: {
      defaultProps: { arrow: true },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: { borderRadius: 8 },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: { borderRadius: 8 },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: 8 },
      },
    },
  },
});
