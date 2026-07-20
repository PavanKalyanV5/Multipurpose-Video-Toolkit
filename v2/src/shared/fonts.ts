// Self-hosted Inter (via @fontsource) rather than a Google Fonts CDN link —
// extension pages have no business making an external network request just
// to render text, and the default MV3 CSP for extension pages disallows
// remote stylesheets/fonts anyway.
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
