import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Switch from '@mui/material/Switch';
import Slider from '@mui/material/Slider';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Divider from '@mui/material/Divider';
import Tooltip from '@mui/material/Tooltip';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import PublicIcon from '@mui/icons-material/Public';
import LanguageIcon from '@mui/icons-material/Language';
import FastForwardIcon from '@mui/icons-material/FastForward';
import BlockIcon from '@mui/icons-material/Block';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import SpeedIcon from '@mui/icons-material/Speed';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import LoopIcon from '@mui/icons-material/Loop';
import ClosedCaptionIcon from '@mui/icons-material/ClosedCaption';
import PictureInPictureAltIcon from '@mui/icons-material/PictureInPictureAlt';
import GraphicEqIcon from '@mui/icons-material/GraphicEq';
import SubtitlesIcon from '@mui/icons-material/Subtitles';
import TranslateIcon from '@mui/icons-material/Translate';
import FormatSizeIcon from '@mui/icons-material/FormatSize';
import OpacityIcon from '@mui/icons-material/Opacity';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import CodeIcon from '@mui/icons-material/Code';
import DashboardIcon from '@mui/icons-material/Dashboard';
import SettingsIcon from '@mui/icons-material/Settings';
import TuneIcon from '@mui/icons-material/Tune';
import MovieFilterIcon from '@mui/icons-material/MovieFilter';
import { BrandIcon } from '../shared/BrandIcon';
import { GradientText } from '../shared/GradientText';
import { EQ_BANDS, EQ_PRESETS } from '../shared/constants';
import type { ActiveVideoState, RuntimeMessage, StatePatch, StorageShape, SubtitleStyle } from '../shared/types';

const SPEED_PRESETS = [0.5, 1, 1.5, 2];
const SUB_LANGS: [string, string][] = [
  ['en', 'English'], ['ar', 'Arabic (RTL)'], ['es', 'Spanish'], ['fr', 'French'],
  ['de', 'German'], ['ja', 'Japanese'], ['ko', 'Korean'], ['zh', 'Chinese'],
  ['pt', 'Portuguese'], ['hi', 'Hindi'],
];

/** A settings row: icon + label on the left, an arbitrary control on the right. */
function SettingRow({ icon, label, control }: { icon: React.ReactNode; label: React.ReactNode; control: React.ReactNode }) {
  return (
    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ py: 1 }}>
      <Stack direction="row" alignItems="center" gap={1}>
        <Box sx={{ color: 'text.secondary', display: 'flex' }}>{icon}</Box>
        <Typography variant="body2" sx={{ color: 'text.primary', fontWeight: 500 }}>{label}</Typography>
      </Stack>
      {control}
    </Stack>
  );
}

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Stack direction="row" alignItems="center" gap={0.75} sx={{ mb: 1 }}>
      <Box sx={{ color: 'primary.light', display: 'flex', fontSize: 14 }}>{icon}</Box>
      <Typography variant="subtitle2" sx={{ fontSize: 10.5, color: '#78c8ff', textTransform: 'uppercase' }}>{children}</Typography>
    </Stack>
  );
}

export function App() {
  const tabIdRef = useRef<number | null>(null);
  const frameIdRef = useRef(0);

  const [host, setHost] = useState('');
  const [globalEnabled, setGlobalEnabled] = useState(false);
  const [siteEnabled, setSiteEnabled] = useState(false);
  const [seekStep, setSeekStep] = useState(5);
  const [autoplayBlock, setAutoplayBlock] = useState(false);
  const [pauseOffscreen, setPauseOffscreen] = useState(false);
  const [subStyle, setSubStyle] = useState<SubtitleStyle>({ fontSize: 20, bgOpacity: 0.7 });
  const [loaded, setLoaded] = useState(false);

  const [video, setVideo] = useState<ActiveVideoState | null>(null);

  const [subFile, setSubFile] = useState<File | null>(null);
  const [subUrl, setSubUrl] = useState('');
  const [subLang, setSubLang] = useState('en');
  const [subError, setSubError] = useState('');
  const [subBusy, setSubBusy] = useState(false);

  const sendPatch = useCallback((patch: StatePatch) => {
    if (!tabIdRef.current) return;
    chrome.tabs.sendMessage(tabIdRef.current, { type: 'uvt-set-state', patch } satisfies RuntimeMessage, { frameId: frameIdRef.current });
  }, []);

  const updateUI = useCallback((state: ActiveVideoState, tabId: number, frameId: number) => {
    tabIdRef.current = tabId;
    frameIdRef.current = frameId;
    setVideo(state);
  }, []);

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab?.id) {
        setLoaded(true);
        return;
      }
      const tabId = tab.id;
      tabIdRef.current = tabId;
      let h = '';
      try {
        h = new URL(tab.url || '').hostname;
      } catch {
        h = '';
      }
      setHost(h);

      chrome.storage.local.get(
        ['uvtGlobal', 'uvtEnabledSites', 'uvtSeekStep', 'uvtAutoplayBlock', 'uvtPauseOffscreen', 'uvtSubtitleStyle'],
        (r: StorageShape) => {
          setGlobalEnabled(r.uvtGlobal === true);
          setSiteEnabled(h ? (r.uvtEnabledSites || []).includes(h) : false);
          if (r.uvtSeekStep) setSeekStep(r.uvtSeekStep);
          setAutoplayBlock(r.uvtAutoplayBlock === true);
          setPauseOffscreen(r.uvtPauseOffscreen === true);
          setSubStyle(r.uvtSubtitleStyle || { fontSize: 20, bgOpacity: 0.7 });
        },
      );

      chrome.storage.local.get([`uvt_active_${tabId}`], (res: StorageShape) => {
        const record = res[`uvt_active_${tabId}`];
        if (record?.state?.hasVideo) {
          updateUI(record.state, tabId, record.frameId);
          setLoaded(true);
          return;
        }
        chrome.tabs.sendMessage(tabId, { type: 'uvt-get-active-state' } satisfies RuntimeMessage, (resp: ActiveVideoState | undefined) => {
          if (chrome.runtime.lastError) {
            setVideo(null);
          } else if (resp?.hasVideo) {
            updateUI(resp, tabId, 0);
            chrome.storage.local.set({ [`uvt_active_${tabId}`]: { frameId: 0, state: resp } });
          } else {
            setVideo(null);
          }
          setLoaded(true);
        });
      });
    });
  }, [updateUI]);

  // Live updates from an already-open tab, relayed via the background so a
  // popup that was open before a change happened still reflects it.
  useEffect(() => {
    const listener = (msg: RuntimeMessage) => {
      if (msg?.type === 'uvt-state-updated' && msg.tabId === tabIdRef.current) {
        updateUI(msg.state, msg.tabId, msg.frameId);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [updateUI]);

  const onGlobalToggle = (checked: boolean) => {
    setGlobalEnabled(checked);
    chrome.storage.local.set({ uvtGlobal: checked });
  };

  const onSiteToggle = (checked: boolean) => {
    setSiteEnabled(checked);
    chrome.storage.local.get(['uvtEnabledSites'], (r: StorageShape) => {
      let enabledSites = r.uvtEnabledSites || [];
      if (checked) {
        if (!enabledSites.includes(host)) enabledSites = [...enabledSites, host];
      } else {
        enabledSites = enabledSites.filter((h) => h !== host);
      }
      chrome.storage.local.set({ uvtEnabledSites: enabledSites });
    });
  };

  const onSpeedChange = (val: number) => {
    setVideo((v) => (v ? { ...v, rate: val } : v));
    sendPatch({ rate: val });
  };

  const onBoostChange = (val: number) => {
    setVideo((v) => (v ? { ...v, boostGain: val } : v));
    sendPatch({ boostGain: val });
  };

  const onEqBandChange = (index: number, gain: number) => {
    setVideo((v) => {
      if (!v) return v;
      const eq = v.eq.slice();
      eq[index] = gain;
      return { ...v, eq };
    });
    sendPatch({ eqBand: { index, gain } });
  };

  const onEqPreset = (key: string) => {
    setVideo((v) => (v ? { ...v, eq: EQ_PRESETS[key].gains.slice() } : v));
    sendPatch({ eqPreset: key });
  };

  const onSeekStepChange = (val: number) => {
    setSeekStep(val);
    chrome.storage.local.set({ uvtSeekStep: val });
    sendPatch({ seekStep: val });
  };

  const onSubStyleChange = (patch: Partial<SubtitleStyle>) => {
    const next = { ...subStyle, ...patch };
    setSubStyle(next);
    chrome.storage.local.set({ uvtSubtitleStyle: next });
    sendPatch({ subtitleStyle: next });
  };

  const handleSubtitleInject = async () => {
    setSubError('');
    setSubBusy(true);
    try {
      if (subFile) {
        const format = subFile.name.toLowerCase().endsWith('.srt') ? 'srt' : 'vtt';
        try {
          const text = await subFile.text();
          sendPatch({ subtitle: { text, format, lang: subLang } });
        } catch {
          setSubError('Failed to read subtitle file contents.');
        }
      } else if (subUrl.trim()) {
        try {
          const response = await fetch(subUrl.trim());
          const text = await response.text();
          const cleanPath = subUrl.trim().split(/[?#]/)[0];
          const format = cleanPath.toLowerCase().endsWith('.srt') ? 'srt' : 'vtt';
          sendPatch({ subtitle: { text, format, lang: subLang } });
        } catch {
          setSubError('Failed to fetch subtitle link. The site hosting the file might be blocking external connections (CORS protection).');
        }
      } else {
        setSubError('Please provide a subtitle file or a valid link.');
      }
    } finally {
      setSubBusy(false);
    }
  };

  const matchedPreset = useMemo(() => {
    if (!video) return undefined;
    return Object.keys(EQ_PRESETS).find((key) => EQ_PRESETS[key].gains.every((g, i) => g === (video.eq[i] ?? 0)));
  }, [video]);

  const gainVal = video ? video.boostGain : 1;

  if (!loaded) {
    return (
      <Box sx={{ width: 360, height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  return (
    <Box sx={{ width: 360, p: 2 }}>
      <Stack direction="row" alignItems="center" gap={1.25} sx={{ mb: 2 }}>
        <BrandIcon sx={{ fontSize: 24, color: 'primary.main', filter: 'drop-shadow(0 0 8px rgba(56,189,248,.4))' }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <GradientText variant="h6" sx={{ fontSize: 16, lineHeight: 1.2 }}>Universal Video Toolkit</GradientText>
          <Typography variant="caption" sx={{ color: 'text.disabled', fontWeight: 500 }}>Control panel</Typography>
        </Box>
        <Stack direction="row" gap={0.75}>
          <Tooltip title="View & manage enabled sites">
            <IconButton size="small" onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/dashboard/index.html#sites') })} sx={{ border: 1, borderColor: 'divider', bgcolor: 'action.hover' }}>
              <PublicIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Custom CSS/JS rules per site">
            <IconButton size="small" onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/rules/index.html') })} sx={{ border: 1, borderColor: 'divider', bgcolor: 'action.hover' }}>
              <CodeIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Open usage dashboard">
            <IconButton size="small" onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/dashboard/index.html') })} sx={{ border: 1, borderColor: 'divider', bgcolor: 'action.hover' }}>
              <DashboardIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>

      <Card sx={{ mb: 1.5 }}>
        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
          <SectionTitle icon={<SettingsIcon fontSize="inherit" />}>Extension Settings</SectionTitle>
          <Stack divider={<Divider />}>
            <SettingRow
              icon={<PublicIcon fontSize="small" />}
              label="Enabled everywhere"
              control={<Switch size="small" checked={globalEnabled} onChange={(e) => onGlobalToggle(e.target.checked)} />}
            />
            <SettingRow
              icon={<LanguageIcon fontSize="small" />}
              label={<>Enabled on <Chip label={host || 'this site'} size="small" sx={{ height: 20, fontSize: 11, bgcolor: 'rgba(56,189,248,0.08)', color: 'primary.main', border: '1px solid rgba(56,189,248,0.15)' }} /></>}
              control={<Switch size="small" checked={siteEnabled} disabled={!host} onChange={(e) => onSiteToggle(e.target.checked)} />}
            />
            <SettingRow
              icon={<FastForwardIcon fontSize="small" />}
              label="Seek step"
              control={
                <Select size="small" value={seekStep} onChange={(e) => onSeekStepChange(Number(e.target.value))} sx={{ fontSize: 12.5, height: 28 }}>
                  <MenuItem value={5}>5 s</MenuItem>
                  <MenuItem value={10}>10 s</MenuItem>
                  <MenuItem value={30}>30 s</MenuItem>
                </Select>
              }
            />
            <SettingRow
              icon={<BlockIcon fontSize="small" />}
              label="Block autoplay"
              control={<Switch size="small" checked={autoplayBlock} onChange={(e) => { setAutoplayBlock(e.target.checked); chrome.storage.local.set({ uvtAutoplayBlock: e.target.checked }); sendPatch({ autoplayBlock: e.target.checked }); }} />}
            />
            <SettingRow
              icon={<VisibilityOffIcon fontSize="small" />}
              label="Pause off-screen videos"
              control={<Switch size="small" checked={pauseOffscreen} onChange={(e) => { setPauseOffscreen(e.target.checked); chrome.storage.local.set({ uvtPauseOffscreen: e.target.checked }); sendPatch({ pauseOffscreen: e.target.checked }); }} />}
            />
          </Stack>
        </CardContent>
      </Card>

      {video ? (
        <>
          <Card sx={{ mb: 1.5 }}>
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <SectionTitle icon={<MovieFilterIcon fontSize="inherit" />}>Active Video Controls</SectionTitle>

              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Stack direction="row" alignItems="center" gap={1}>
                  <SpeedIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                  <Typography variant="body2" fontWeight={500}>Speed</Typography>
                </Stack>
                <Typography variant="body2" sx={{ color: 'primary.main', fontWeight: 700 }}>{video.rate}x</Typography>
              </Stack>
              <Slider size="small" min={0.25} max={3} step={0.25} value={video.rate} onChange={(_, v) => onSpeedChange(v as number)} sx={{ mt: -0.5 }} />
              <ToggleButtonGroup exclusive size="small" fullWidth value={video.rate} onChange={(_, v) => v !== null && onSpeedChange(v)} sx={{ mb: 1 }}>
                {SPEED_PRESETS.map((s) => (
                  <ToggleButton key={s} value={s} sx={{ fontSize: 11, py: 0.5 }}>{s}×</ToggleButton>
                ))}
              </ToggleButtonGroup>

              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Stack direction="row" alignItems="center" gap={1}>
                  <VolumeUpIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                  <Typography variant="body2" fontWeight={500}>Volume Boost</Typography>
                </Stack>
                <Typography variant="body2" sx={{ color: gainVal > 2 ? 'warning.main' : 'primary.main', fontWeight: 700 }}>{Math.round(gainVal * 100)}%</Typography>
              </Stack>
              <Slider size="small" min={1} max={3} step={0.05} value={gainVal} onChange={(_, v) => onBoostChange(v as number)} sx={{ mt: -0.5, mb: 0.5 }} />

              <Stack divider={<Divider />}>
                <SettingRow
                  icon={<LoopIcon fontSize="small" />}
                  label="Loop Video"
                  control={<Switch size="small" checked={video.loop} onChange={(e) => { setVideo((v) => (v ? { ...v, loop: e.target.checked } : v)); sendPatch({ loop: e.target.checked }); }} />}
                />
                <SettingRow
                  icon={<ClosedCaptionIcon fontSize="small" />}
                  label="Captions (CC)"
                  control={<Switch size="small" checked={video.cc} onChange={(e) => { setVideo((v) => (v ? { ...v, cc: e.target.checked } : v)); sendPatch({ cc: e.target.checked }); }} />}
                />
              </Stack>

              <Button
                fullWidth
                variant="outlined"
                startIcon={<PictureInPictureAltIcon fontSize="small" />}
                onClick={() => sendPatch({ action: 'pip' })}
                sx={{ mt: 1.5, bgcolor: 'rgba(56,189,248,0.08)', borderColor: 'rgba(56,189,248,0.25)' }}
              >
                Toggle Picture-in-Picture
              </Button>
            </CardContent>
          </Card>

          <Card sx={{ mb: 1.5 }}>
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <SectionTitle icon={<GraphicEqIcon fontSize="inherit" />}>Equalizer</SectionTitle>
              <ToggleButtonGroup exclusive size="small" fullWidth value={matchedPreset ?? null} onChange={(_, v) => v && onEqPreset(v)} sx={{ mb: 1.5 }}>
                {Object.entries(EQ_PRESETS).map(([key, preset]) => (
                  <ToggleButton key={key} value={key} sx={{ fontSize: 10.5, py: 0.5, px: 0.5 }}>{preset.label}</ToggleButton>
                ))}
              </ToggleButtonGroup>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-end" sx={{ px: 0.5 }}>
                {EQ_BANDS.map((freq, i) => {
                  const g = video.eq[i] ?? 0;
                  return (
                    <Stack key={freq} alignItems="center" gap={0.5} sx={{ flex: 1 }}>
                      <Typography variant="caption" sx={{ fontSize: 9, color: g > 0 ? 'primary.main' : g < 0 ? 'warning.main' : 'text.disabled', fontVariantNumeric: 'tabular-nums' }}>
                        {g > 0 ? '+' : ''}{g}
                      </Typography>
                      <Slider
                        size="small"
                        orientation="vertical"
                        min={-12}
                        max={12}
                        step={1}
                        value={g}
                        onChange={(_, v) => onEqBandChange(i, v as number)}
                        sx={{ height: 72 }}
                      />
                      <Typography variant="caption" sx={{ fontSize: 8.5, color: 'text.disabled' }}>{freq >= 1000 ? freq / 1000 + 'k' : freq}</Typography>
                    </Stack>
                  );
                })}
              </Stack>
            </CardContent>
          </Card>

          <Card sx={{ mb: 1.5 }}>
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <SectionTitle icon={<SubtitlesIcon fontSize="inherit" />}>Subtitle Injector</SectionTitle>
              <Stack gap={1}>
                <Button
                  component="label"
                  variant="outlined"
                  color="inherit"
                  size="small"
                  startIcon={<UploadFileIcon fontSize="small" />}
                  sx={{ color: 'text.secondary', borderColor: 'divider', justifyContent: 'flex-start' }}
                >
                  {subFile ? 'Change Subtitle File' : 'Choose Subtitle File (.srt, .vtt)'}
                  <input type="file" accept=".srt,.vtt" hidden onChange={(e) => setSubFile(e.target.files?.[0] || null)} />
                </Button>
                {subFile && <Typography variant="caption" sx={{ color: 'primary.main' }}>{subFile.name}</Typography>}

                <Divider sx={{ '&::before, &::after': { borderColor: 'divider' } }}>
                  <Typography variant="caption" sx={{ color: 'text.disabled' }}>OR</Typography>
                </Divider>

                <TextField size="small" placeholder="Paste Subtitle URL (.srt, .vtt)" value={subUrl} onChange={(e) => setSubUrl(e.target.value)} fullWidth />

                <SettingRow
                  icon={<TranslateIcon sx={{ fontSize: 14 }} />}
                  label={<Typography variant="caption" sx={{ color: 'text.secondary' }}>Track language</Typography>}
                  control={
                    <Select size="small" value={subLang} onChange={(e) => setSubLang(e.target.value)} sx={{ fontSize: 11.5, height: 26 }}>
                      {SUB_LANGS.map(([code, label]) => (
                        <MenuItem key={code} value={code}>{label}</MenuItem>
                      ))}
                    </Select>
                  }
                />
                <SettingRow
                  icon={<FormatSizeIcon sx={{ fontSize: 14 }} />}
                  label={<Typography variant="caption" sx={{ color: 'text.secondary' }}>Subtitle size</Typography>}
                  control={
                    <Stack direction="row" alignItems="center" gap={1} sx={{ width: 130 }}>
                      <Slider size="small" min={12} max={36} step={1} value={subStyle.fontSize} onChange={(_, v) => onSubStyleChange({ fontSize: v as number })} />
                      <Typography variant="caption" sx={{ minWidth: 30, textAlign: 'right' }}>{subStyle.fontSize}px</Typography>
                    </Stack>
                  }
                />
                <SettingRow
                  icon={<OpacityIcon sx={{ fontSize: 14 }} />}
                  label={<Typography variant="caption" sx={{ color: 'text.secondary' }}>Background</Typography>}
                  control={
                    <Stack direction="row" alignItems="center" gap={1} sx={{ width: 130 }}>
                      <Slider size="small" min={0} max={100} step={5} value={Math.round(subStyle.bgOpacity * 100)} onChange={(_, v) => onSubStyleChange({ bgOpacity: (v as number) / 100 })} />
                      <Typography variant="caption" sx={{ minWidth: 30, textAlign: 'right' }}>{Math.round(subStyle.bgOpacity * 100)}%</Typography>
                    </Stack>
                  }
                />

                {subError && <Alert severity="error" sx={{ fontSize: 11.5 }}>{subError}</Alert>}

                <Button
                  fullWidth
                  variant="outlined"
                  loading={subBusy}
                  startIcon={<AddCircleOutlineIcon fontSize="small" />}
                  onClick={handleSubtitleInject}
                  sx={{ bgcolor: 'rgba(56,189,248,0.08)', borderColor: 'rgba(56,189,248,0.25)' }}
                >
                  Inject Subtitles
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', p: 3, mb: 1.5, border: '1px dashed', borderColor: 'divider', borderRadius: 2, color: 'text.disabled', textAlign: 'center' }}>
          <MovieFilterIcon sx={{ fontSize: 28, mb: 1, color: '#475569' }} />
          <Typography variant="caption">No active video detected on this page</Typography>
        </Box>
      )}

      <Box sx={{ pt: 1.25, mt: 0.5, borderTop: '1px solid', borderColor: 'divider' }}>
        <Stack direction="row" alignItems="center" gap={0.5} sx={{ mb: 0.75 }}>
          <TuneIcon sx={{ fontSize: 13, color: 'text.disabled' }} />
          <Typography variant="caption" sx={{ color: 'text.disabled', fontWeight: 700 }}>Overlay controls</Typography>
        </Stack>
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1 }}>
          Hover any video — drag pill/bar to reposition.
        </Typography>
        <Stack direction="row" flexWrap="wrap" gap={0.5}>
          {[
            ['←/→', 'seek'], ['↑/↓', 'speed'], ['M', 'mute'], ['P', 'PiP'], ['F', 'fullscreen'],
            ['R', 'rotate →'], ['⇧R', 'rotate ←'], [',/.', 'frame step'], ['[', 'loop start'], [']', 'loop end'], ['\\', 'clear loop'],
          ].map(([key, label]) => (
            <Chip key={key} size="small" label={`Alt+${key} ${label}`} sx={{ fontSize: 10, height: 20, bgcolor: 'action.hover', color: 'text.secondary' }} />
          ))}
        </Stack>
      </Box>
    </Box>
  );
}
