import { useEffect, useRef, useState } from 'react';
import { BarChart } from '@mui/x-charts/BarChart';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import QueryStatsIcon from '@mui/icons-material/QueryStats';
import PublicIcon from '@mui/icons-material/Public';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import { BrandIcon } from '../../shared/BrandIcon';
import { GradientText } from '../../shared/GradientText';
import type { StatsShape, StorageShape } from '../../shared/types';

const STATS_KEY = 'uvtStats';
const CHART_COLOR = '#38bdf8';

const ACTION_LABELS: Record<string, string> = {
  setRate: 'Speed', seek: 'Seek', mute: 'Mute', loop: 'Loop', solo: 'Solo Audio',
  pip: 'Picture-in-Picture', fullscreen: 'Fullscreen', rotate: 'Rotate',
  cinema: 'Cinema Mode', vol: 'Volume Boost', normalize: 'Normalize', cc: 'Captions',
  shot: 'Screenshot', copyTs: 'Copy Link', rec: 'Record', dl: 'Download',
  frameStep: 'Frame Step', abloop: 'A-B Loop', seekStep: 'Seek Step (setting)',
  autoplayBlock: 'Autoplay Block (setting)', pauseOffscreen: 'Pause Off-Screen (setting)',
  eq: 'Equalizer', eqPreset: 'EQ Preset', subtitleStyle: 'Subtitle Style (setting)',
};

const EXPORT_KEYS = [
  'uvtGlobal', 'uvtEnabledSites', 'uvtSpeeds', 'uvtSeekStep',
  'uvtAutoplayBlock', 'uvtPauseOffscreen', 'uvtSubtitleStyle', 'uvtCustomRules',
] as const;

function formatDuration(ms: number, compact = false): string {
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return compact ? `${h}h${m ? ' ' + m + 'm' : ''}` : `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return ms > 0 ? '<1m' : '0m';
}

function formatCompact(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

function lastNDays(n: number): string[] {
  const days: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function dayLabel(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 2);
}

function KpiTile({ label, value, sub, big }: { label: string; value: string; sub: string; big?: boolean }) {
  return (
    <Card>
      <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
        <Typography variant="caption" sx={{ color: 'text.disabled', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</Typography>
        <Typography sx={{ fontSize: big ? 18 : 26, fontWeight: 700, mt: 0.5 }}>{value}</Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>{sub || ' '}</Typography>
      </CardContent>
    </Card>
  );
}

export function App() {
  const [stats, setStats] = useState<StatsShape | null | undefined>(undefined); // undefined = loading
  const [enabledSites, setEnabledSites] = useState<string[]>([]);
  const [newSiteDomain, setNewSiteDomain] = useState('');
  const [siteSearch, setSiteSearch] = useState('');
  const importInputRef = useRef<HTMLInputElement>(null);
  const sitesCardRef = useRef<HTMLDivElement>(null);

  const load = () => {
    chrome.storage.local.get([STATS_KEY, 'uvtEnabledSites'], (r: StorageShape) => {
      setStats(r.uvtStats || null);
      setEnabledSites(r.uvtEnabledSites || []);
    });
  };

  useEffect(() => {
    load();
    if (window.location.hash === '#sites') {
      setTimeout(() => sitesCardRef.current?.scrollIntoView({ behavior: 'smooth' }), 300);
    }
  }, []);

  const addSite = () => {
    let domain = newSiteDomain.trim().toLowerCase();
    if (!domain) return;
    try {
      if (domain.includes('://')) domain = new URL(domain).hostname;
      else domain = domain.split('/')[0].split('?')[0];
    } catch {}
    if (!domain) return;

    if (!enabledSites.includes(domain)) {
      const next = [...enabledSites, domain];
      setEnabledSites(next);
      chrome.storage.local.set({ uvtEnabledSites: next });
      setNewSiteDomain('');
    }
  };

  const removeSite = (domain: string) => {
    const next = enabledSites.filter((s) => s !== domain);
    setEnabledSites(next);
    chrome.storage.local.set({ uvtEnabledSites: next });
  };

  const clearSites = () => {
    if (!confirm('Clear all enabled sites from allowlist?')) return;
    setEnabledSites([]);
    chrome.storage.local.set({ uvtEnabledSites: [] });
  };

  const resetStats = () => {
    if (!confirm('Reset all usage stats? This cannot be undone.')) return;
    chrome.storage.local.remove(STATS_KEY, load);
  };

  const exportSettings = () => {
    chrome.storage.local.get(EXPORT_KEYS as unknown as string[], (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.download = `uvt-settings-${Date.now()}.json`;
      a.href = URL.createObjectURL(blob);
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    });
  };

  const importSettings = () => {
    const file = importInputRef.current?.files?.[0];
    if (importInputRef.current) importInputRef.current.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(reader.result as string);
      } catch {
        alert("That file isn't valid JSON — nothing was imported.");
        return;
      }
      const toImport: Record<string, unknown> = {};
      let count = 0;
      for (const key of EXPORT_KEYS) {
        if (data[key] !== undefined) {
          toImport[key] = data[key];
          count++;
        }
      }
      if (!count) {
        alert('No recognizable settings found in that file.');
        return;
      }
      chrome.storage.local.set(toImport, () => {
        alert(`Imported ${count} setting${count === 1 ? '' : 's'}. Reload any open tabs to apply.`);
      });
    };
    reader.readAsText(file);
  };

  const hasData = !!stats && (stats.totalWatchMs > 0 || stats.totalActions > 0);
  const sites = hasData ? Object.entries(stats!.bySite || {}) : [];
  const topSite = sites.slice().sort((a, b) => b[1].watchMs - a[1].watchMs)[0];

  const days = lastNDays(7);
  const trendData = days.map((d) => ({ day: dayLabel(d), minutes: hasData ? Math.round((stats!.daily?.[d] || 0) / 60000) : 0 }));

  const sitesData = sites
    .map(([site, v]) => ({ label: site, minutes: Math.round(v.watchMs / 60000) }))
    .filter((r) => r.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 6);

  const actionEntries = hasData ? Object.entries(stats!.actionCounts || {}).sort((a, b) => b[1] - a[1]) : [];
  const actionsData = actionEntries.slice(0, 7).map(([n, c]) => ({ label: ACTION_LABELS[n] || n, count: c }));
  const restTotal = actionEntries.slice(7).reduce((sum, [, c]) => sum + c, 0);
  if (restTotal > 0) actionsData.push({ label: 'Other', count: restTotal });

  const filteredSites = enabledSites.filter((s) => s.toLowerCase().includes(siteSearch.trim().toLowerCase()));

  return (
    <Box sx={{ maxWidth: 980, mx: 'auto', p: { xs: 3, md: 5 } }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2} sx={{ mb: 3.5 }}>
        <Stack direction="row" alignItems="center" gap={1.5}>
          <BrandIcon sx={{ fontSize: 26, color: 'primary.main', filter: 'drop-shadow(0 0 8px rgba(56,189,248,.4))' }} />
          <Box>
            <GradientText variant="h5" sx={{ fontSize: 20 }}>Dashboard</GradientText>
            <Typography variant="caption" sx={{ color: 'text.disabled' }}>Your Universal Video Toolkit usage &amp; site settings, tracked locally</Typography>
          </Box>
        </Stack>
        <Button variant="outlined" color="inherit" startIcon={<RestartAltIcon fontSize="small" />} onClick={resetStats} sx={{ color: 'text.secondary', borderColor: 'divider' }}>
          Reset stats
        </Button>
      </Stack>

      <Card sx={{ mb: 2 }}>
        <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, py: '14px !important', px: 2.5 }}>
          <Box>
            <Typography variant="subtitle2" sx={{ fontSize: 11, color: '#78c8ff', textTransform: 'uppercase' }}>Backup &amp; restore</Typography>
            <Typography variant="caption" sx={{ color: 'text.disabled' }}>Settings, custom rules, EQ, and enabled sites — everything except live stats/session state.</Typography>
          </Box>
          <Stack direction="row" gap={1} flexShrink={0}>
            <Button variant="outlined" size="small" startIcon={<FileDownloadIcon fontSize="small" />} onClick={exportSettings} sx={{ color: 'primary.main', borderColor: 'rgba(56,189,248,.3)' }}>
              Export
            </Button>
            <Button variant="outlined" size="small" color="inherit" startIcon={<FileUploadIcon fontSize="small" />} onClick={() => importInputRef.current?.click()} sx={{ color: 'text.secondary', borderColor: 'divider' }}>
              Import
            </Button>
            <input ref={importInputRef} type="file" accept="application/json" hidden onChange={importSettings} />
          </Stack>
        </CardContent>
      </Card>

      <Card ref={sitesCardRef} sx={{ mb: 2 }}>
        <CardContent>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
            <Stack direction="row" alignItems="center" gap={1}>
              <PublicIcon sx={{ color: 'primary.main', fontSize: 18 }} />
              <Typography variant="subtitle2" sx={{ fontSize: 11, color: '#78c8ff', textTransform: 'uppercase' }}>Enabled Sites Allowlist</Typography>
            </Stack>
            <Chip label={`${enabledSites.length} site${enabledSites.length === 1 ? '' : 's'}`} size="small" sx={{ bgcolor: 'rgba(56,189,248,0.15)', color: 'primary.main', fontWeight: 600 }} />
          </Stack>

          <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5} sx={{ mb: 2 }}>
            <TextField
              size="small"
              placeholder="Add domain (e.g. youtube.com)"
              value={newSiteDomain}
              onChange={(e) => setNewSiteDomain(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addSite(); }}
              sx={{ flex: 1 }}
            />
            <Button variant="contained" size="small" startIcon={<AddIcon fontSize="small" />} onClick={addSite} sx={{ bgcolor: 'primary.main', color: '#0f172a', fontWeight: 700 }}>
              Add Site
            </Button>
            <TextField
              size="small"
              placeholder="Search enabled sites..."
              value={siteSearch}
              onChange={(e) => setSiteSearch(e.target.value)}
              InputProps={{ startAdornment: <SearchIcon fontSize="small" sx={{ color: 'text.disabled', mr: 0.5 }} /> }}
              sx={{ width: { xs: '100%', sm: 220 } }}
            />
          </Stack>

          {filteredSites.length === 0 ? (
            <Typography variant="body2" sx={{ color: 'text.disabled', textAlign: 'center', py: 3 }}>
              {enabledSites.length > 0 ? 'No matching sites found.' : 'No site-specific rules added yet. Toggle "Enabled on this site" in the popup or add domains above.'}
            </Typography>
          ) : (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 1.25 }}>
              {filteredSites.map((domain) => (
                <Box key={domain} sx={{ p: 1.25, px: 1.75, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Stack direction="row" alignItems="center" gap={1} sx={{ overflow: 'hidden' }}>
                    <PublicIcon sx={{ fontSize: 16, color: 'primary.main', flexShrink: 0 }} />
                    <Typography variant="body2" fontWeight={600} noWrap>{domain}</Typography>
                  </Stack>
                  <IconButton size="small" color="inherit" onClick={() => removeSite(domain)} sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' } }}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              ))}
            </Box>
          )}

          {enabledSites.length > 0 && (
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
              <Button size="small" color="error" variant="outlined" onClick={clearSites} sx={{ fontSize: 11 }}>
                Clear All Enabled Sites
              </Button>
            </Box>
          )}
        </CardContent>
      </Card>

      {!hasData ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', p: 8, textAlign: 'center', color: 'text.disabled', border: '1px dashed', borderColor: 'divider', borderRadius: 3 }}>
          <QueryStatsIcon sx={{ fontSize: 34, mb: 1.5, color: '#475569' }} />
          <Typography sx={{ color: 'text.secondary', fontWeight: 700, mb: 0.5 }}>No data yet</Typography>
          <Typography variant="body2">Use the toolbar on any enabled site — speed, volume, loop, screenshots — and stats will start showing up here.</Typography>
        </Box>
      ) : (
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1.5, mb: 2.5 }}>
            <KpiTile label="Total watch time" value={formatDuration(stats!.totalWatchMs)} sub={`across ${sites.length} site${sites.length === 1 ? '' : 's'}`} />
            <KpiTile label="Sites tracked" value={String(sites.length)} sub="" />
            <KpiTile label="Actions taken" value={formatCompact(stats!.totalActions)} sub="speed, volume, loop, and more" />
            <KpiTile label="Most active site" big value={topSite ? topSite[0] : '—'} sub={topSite ? formatDuration(topSite[1].watchMs) + ' watched' : 'No data yet'} />
          </Box>

          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Typography variant="subtitle2" sx={{ fontSize: 11, color: '#78c8ff', textTransform: 'uppercase', mb: 1 }}>Watch time — last 7 days</Typography>
              <BarChart
                dataset={trendData}
                xAxis={[{ scaleType: 'band', dataKey: 'day' }]}
                series={[{ dataKey: 'minutes', label: 'Watch time', color: CHART_COLOR, valueFormatter: (v) => formatDuration((v ?? 0) * 60000) }]}
                height={220}
                borderRadius={4}
                grid={{ horizontal: true }}
                slotProps={{ legend: { hidden: true } }}
                sx={{
                  '& .MuiChartsAxis-line, & .MuiChartsAxis-tick': { stroke: 'rgba(255,255,255,0.12)' },
                  '& .MuiChartsAxis-tickLabel': { fill: '#94a3b8' },
                  '& .MuiChartsGrid-line': { stroke: 'rgba(255,255,255,0.06)' },
                }}
              />
            </CardContent>
          </Card>

          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <Card>
              <CardContent>
                <Typography variant="subtitle2" sx={{ fontSize: 11, color: '#78c8ff', textTransform: 'uppercase', mb: 1 }}>Top sites by watch time</Typography>
                {sitesData.length ? (
                  <BarChart
                    dataset={sitesData}
                    layout="horizontal"
                    yAxis={[{ scaleType: 'band', dataKey: 'label' }]}
                    xAxis={[{}]}
                    series={[{ dataKey: 'minutes', label: 'Watch time', color: CHART_COLOR, valueFormatter: (v) => formatDuration((v ?? 0) * 60000) }]}
                    height={Math.max(140, sitesData.length * 34)}
                    margin={{ left: 100 }}
                    borderRadius={4}
                    slotProps={{ legend: { hidden: true } }}
                    sx={{
                      '& .MuiChartsAxis-line, & .MuiChartsAxis-tick': { stroke: 'rgba(255,255,255,0.12)' },
                      '& .MuiChartsAxis-tickLabel': { fill: '#94a3b8' },
                    }}
                  />
                ) : (
                  <Typography variant="body2" sx={{ color: 'text.disabled', py: 1 }}>Not enough data yet.</Typography>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <Typography variant="subtitle2" sx={{ fontSize: 11, color: '#78c8ff', textTransform: 'uppercase', mb: 1 }}>Feature usage</Typography>
                {actionsData.length ? (
                  <BarChart
                    dataset={actionsData}
                    layout="horizontal"
                    yAxis={[{ scaleType: 'band', dataKey: 'label' }]}
                    xAxis={[{}]}
                    series={[{ dataKey: 'count', label: 'Uses', color: '#a855f7' }]}
                    height={Math.max(140, actionsData.length * 34)}
                    margin={{ left: 100 }}
                    borderRadius={4}
                    slotProps={{ legend: { hidden: true } }}
                    sx={{
                      '& .MuiChartsAxis-line, & .MuiChartsAxis-tick': { stroke: 'rgba(255,255,255,0.12)' },
                      '& .MuiChartsAxis-tickLabel': { fill: '#94a3b8' },
                    }}
                  />
                ) : (
                  <Typography variant="body2" sx={{ color: 'text.disabled', py: 1 }}>Not enough data yet.</Typography>
                )}
              </CardContent>
            </Card>
          </Box>
        </>
      )}
      <Divider sx={{ mt: 4 }} />
    </Box>
  );
}
