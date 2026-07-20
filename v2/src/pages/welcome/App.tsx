import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemAvatar from '@mui/material/ListItemAvatar';
import ListItemText from '@mui/material/ListItemText';
import Avatar from '@mui/material/Avatar';
import Button from '@mui/material/Button';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import SpeedIcon from '@mui/icons-material/Speed';
import GraphicEqIcon from '@mui/icons-material/GraphicEq';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import InsightsIcon from '@mui/icons-material/Insights';
import CodeIcon from '@mui/icons-material/Code';
import SubtitlesIcon from '@mui/icons-material/Subtitles';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import type { SvgIconComponent } from '@mui/icons-material';
import { BrandIcon } from '../../shared/BrandIcon';
import { GradientText } from '../../shared/GradientText';

const STEPS: React.ReactNode[] = [
  <>Go to any site with video, and click the <strong>extension icon</strong> in your toolbar.</>,
  <>Toggle <strong>"Enabled on this site"</strong> — or flip <strong>"Enabled everywhere"</strong> if you'd rather it just always run.</>,
  <>Hover any video on that site to see the control bar. Drag the pill/bar to reposition it.</>,
];

const FEATURES: { Icon: SvgIconComponent; title: string; desc: string }[] = [
  { Icon: SpeedIcon, title: 'Speed, seek, loop, rotate', desc: 'Plus fullscreen and cinema mode for sites without their own.' },
  { Icon: GraphicEqIcon, title: 'Volume boost + 8-band EQ', desc: 'Plus loudness normalization for uneven audio.' },
  { Icon: CameraAltIcon, title: 'Screenshots & recording', desc: 'Screenshots copy to clipboard automatically too.' },
  { Icon: InsightsIcon, title: 'Usage dashboard', desc: 'Local-only stats — watch time, top sites, feature use.' },
  { Icon: CodeIcon, title: 'Custom CSS/JS rules', desc: 'Inject your own code per site, with a real code editor.' },
  { Icon: SubtitlesIcon, title: 'Subtitle injection', desc: '.srt/.vtt from a file or URL, styling controls included.' },
];

export function App() {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', p: { xs: 3, md: 7 } }}>
      <Box sx={{ maxWidth: 620, width: '100%' }}>
        <Stack direction="row" alignItems="center" gap={1.75} sx={{ mb: 3.5 }}>
          <BrandIcon sx={{ fontSize: 34, color: 'primary.main', filter: 'drop-shadow(0 0 10px rgba(56,189,248,.45))' }} />
          <Box>
            <GradientText variant="h4" sx={{ fontSize: 26 }}>Welcome</GradientText>
            <Typography variant="body2" sx={{ color: 'text.disabled' }}>Universal Video Toolkit is installed — one thing to know before it does anything</Typography>
          </Box>
        </Stack>

        <Card sx={{ mb: 2 }}>
          <CardContent sx={{ p: '22px 24px !important' }}>
            <Typography variant="subtitle2" sx={{ fontSize: 11, color: '#78c8ff', textTransform: 'uppercase', mb: 1.5 }}>It's off everywhere by default</Typography>
            <List disablePadding>
              {STEPS.map((step, i) => (
                <ListItem key={i} divider={i < STEPS.length - 1} sx={{ px: 0, py: 1.25 }}>
                  <ListItemAvatar sx={{ minWidth: 40 }}>
                    <Avatar sx={{ width: 24, height: 24, fontSize: 12, fontWeight: 700, bgcolor: 'rgba(56,189,248,0.12)', color: 'primary.main', border: '1px solid rgba(56,189,248,0.35)' }}>
                      {i + 1}
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText primary={<Typography variant="body2" sx={{ lineHeight: 1.6, color: 'text.primary' }}>{step}</Typography>} />
                </ListItem>
              ))}
            </List>
            <Stack direction="row" gap={1.25} sx={{ mt: 2, p: 1.75, bgcolor: 'rgba(56,189,248,0.05)', border: '1px solid rgba(56,189,248,0.15)', borderRadius: 2 }}>
              <InfoOutlinedIcon sx={{ fontSize: 16, color: 'primary.main', mt: 0.25, flexShrink: 0 }} />
              <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
                <strong style={{ color: '#cbd5e1' }}>Why opt-in?</strong> So it only ever does something on sites you've actually chosen, instead of quietly running everywhere. Your site list is remembered — you only do this once per site.
              </Typography>
            </Stack>
          </CardContent>
        </Card>

        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="subtitle2" sx={{ fontSize: 11, color: '#78c8ff', textTransform: 'uppercase', mb: 1.5 }}>What's in here</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.25 }}>
              {FEATURES.map(({ Icon, title, desc }) => (
                <Stack key={title} direction="row" gap={1.25} sx={{ p: 1.25, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.02)' }}>
                  <Box sx={{ color: 'primary.main', mt: 0.25, flexShrink: 0 }}><Icon fontSize="small" /></Box>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{title}</Typography>
                    <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', lineHeight: 1.4 }}>{desc}</Typography>
                  </Box>
                </Stack>
              ))}
            </Box>
          </CardContent>
        </Card>

        <Button
          fullWidth
          variant="outlined"
          size="large"
          startIcon={<CheckCircleOutlineIcon />}
          onClick={() => window.close()}
          sx={{ bgcolor: 'rgba(56,189,248,0.1)', borderColor: 'rgba(56,189,248,0.3)' }}
        >
          Got it — close this tab
        </Button>
      </Box>
    </Box>
  );
}
