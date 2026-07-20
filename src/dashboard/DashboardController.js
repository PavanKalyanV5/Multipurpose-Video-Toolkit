const STATS_KEY = 'uvtStats';

const ACTION_LABELS = {
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
];

class DashboardController {
  #els = {};

  constructor() {
    this.#els = {
      empty:        document.getElementById('empty'),
      content:      document.getElementById('content'),
      resetBtn:     document.getElementById('resetBtn'),
      kpiWatchTime: document.getElementById('kpiWatchTime'),
      kpiWatchSub:  document.getElementById('kpiWatchSub'),
      kpiSites:     document.getElementById('kpiSites'),
      kpiActions:   document.getElementById('kpiActions'),
      kpiTopSite:   document.getElementById('kpiTopSite'),
      kpiTopSiteSub: document.getElementById('kpiTopSiteSub'),
      trendChart:   document.getElementById('trendChart'),
      sitesChart:   document.getElementById('sitesChart'),
      actionsChart: document.getElementById('actionsChart'),
      exportBtn:    document.getElementById('exportBtn'),
      importBtn:    document.getElementById('importBtn'),
      importFile:   document.getElementById('importFile'),
    };
  }

  init() {
    this.#load();
    this.#els.resetBtn.addEventListener('click', () => this.#resetStats());
    this.#els.exportBtn.addEventListener('click', () => this.#exportSettings());
    this.#els.importBtn.addEventListener('click', () => this.#els.importFile.click());
    this.#els.importFile.addEventListener('change', () => this.#importSettings());
  }

  #exportSettings() {
    chrome.storage.local.get(EXPORT_KEYS, (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.download = `uvt-settings-${Date.now()}.json`;
      a.href = URL.createObjectURL(blob);
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    });
  }

  #importSettings() {
    const file = this.#els.importFile.files[0];
    this.#els.importFile.value = ''; // allow re-selecting the same file next time
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let data;
      try {
        data = JSON.parse(reader.result);
      } catch {
        alert('That file isn\'t valid JSON — nothing was imported.');
        return;
      }
      // Only accept keys we actually recognize, so a random JSON file can't
      // dump arbitrary junk into the extension's storage.
      const toImport = {};
      let count = 0;
      for (const key of EXPORT_KEYS) {
        if (data[key] !== undefined) { toImport[key] = data[key]; count++; }
      }
      if (!count) { alert('No recognizable settings found in that file.'); return; }
      chrome.storage.local.set(toImport, () => {
        alert(`Imported ${count} setting${count === 1 ? '' : 's'}. Reload any open tabs to apply.`);
      });
    };
    reader.readAsText(file);
  }

  #load() {
    chrome.storage.local.get([STATS_KEY], (r) => this.#render(r[STATS_KEY]));
  }

  #render(stats) {
    const hasData = stats && (stats.totalWatchMs > 0 || stats.totalActions > 0);
    this.#els.empty.style.display = hasData ? 'none' : 'flex';
    this.#els.content.style.display = hasData ? 'block' : 'none';
    if (!hasData) return;

    this.#renderKpis(stats);
    this.#renderTrend(stats.daily || {});
    this.#renderSites(stats.bySite || {});
    this.#renderActions(stats.actionCounts || {});
  }

  #renderKpis(stats) {
    const sites = Object.entries(stats.bySite || {});
    const topSite = sites.slice().sort((a, b) => b[1].watchMs - a[1].watchMs)[0];

    this.#els.kpiWatchTime.textContent = formatDuration(stats.totalWatchMs);
    this.#els.kpiWatchSub.textContent = `across ${sites.length} site${sites.length === 1 ? '' : 's'}`;
    this.#els.kpiSites.textContent = String(sites.length);
    this.#els.kpiActions.textContent = formatCompact(stats.totalActions);
    this.#els.kpiTopSite.textContent = topSite ? topSite[0] : '—';
    this.#els.kpiTopSiteSub.textContent = topSite ? formatDuration(topSite[1].watchMs) + ' watched' : 'No data yet';
  }

  #renderTrend(daily) {
    const el = this.#els.trendChart;
    el.innerHTML = '';
    const days = lastNDays(7);
    const values = days.map((d) => daily[d] || 0);
    const max = Math.max(...values, 1);

    days.forEach((day, i) => {
      const ms = values[i];
      const col = document.createElement('div');
      col.className = 'trend-col';

      const value = document.createElement('div');
      value.className = 'trend-value';
      value.textContent = ms > 0 ? formatDuration(ms, true) : '';

      const bar = document.createElement('div');
      bar.className = 'trend-bar';
      // floor so a nonzero-but-tiny value still shows a sliver, never a hairline
      const pct = ms > 0 ? Math.max(4, Math.round((ms / max) * 100)) : 0;
      requestAnimationFrame(() => { bar.style.height = pct + '%'; });

      const label = document.createElement('div');
      label.className = 'trend-day';
      label.textContent = dayLabel(day);

      col.appendChild(value);
      col.appendChild(bar);
      col.appendChild(label);
      el.appendChild(col);
    });

    const baseline = document.createElement('div');
    baseline.className = 'trend-baseline';
    el.style.position = 'relative';
    el.appendChild(baseline);
  }

  #renderSites(bySite) {
    const rows = Object.entries(bySite)
      .map(([site, v]) => ({ label: site, value: v.watchMs }))
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
    renderBarList(this.#els.sitesChart, rows, formatDuration);
  }

  #renderActions(actionCounts) {
    const entries = Object.entries(actionCounts).sort((a, b) => b[1] - a[1]);
    const top = entries.slice(0, 7).map(([name, count]) => ({ label: ACTION_LABELS[name] || name, value: count }));
    const restTotal = entries.slice(7).reduce((sum, [, c]) => sum + c, 0);
    if (restTotal > 0) top.push({ label: 'Other', value: restTotal });
    renderBarList(this.#els.actionsChart, top, (n) => String(n));
  }

  #resetStats() {
    if (!confirm('Reset all usage stats? This cannot be undone.')) return;
    chrome.storage.local.remove(STATS_KEY, () => this.#load());
  }
}

// ── Shared horizontal bar-list renderer (sequential single-hue, ranked, direct labels) ──
function renderBarList(container, rows, formatValue) {
  container.innerHTML = '';
  if (!rows.length) {
    const empty = document.createElement('div');
    empty.style.cssText = 'color:#64748b;font-size:12px;padding:8px 0;';
    empty.textContent = 'Not enough data yet.';
    container.appendChild(empty);
    return;
  }
  const max = Math.max(...rows.map((r) => r.value), 1);
  rows.forEach((row) => {
    const rowEl = document.createElement('div');
    rowEl.className = 'bar-row';

    const label = document.createElement('div');
    label.className = 'bar-label';
    label.textContent = row.label;
    label.title = row.label;

    const track = document.createElement('div');
    track.className = 'bar-track';
    const fill = document.createElement('div');
    fill.className = 'bar-fill';
    const pct = Math.max(3, Math.round((row.value / max) * 100));
    requestAnimationFrame(() => { fill.style.width = pct + '%'; });
    track.appendChild(fill);

    const value = document.createElement('div');
    value.className = 'bar-value';
    value.textContent = formatValue(row.value);

    rowEl.appendChild(label);
    rowEl.appendChild(track);
    rowEl.appendChild(value);
    container.appendChild(rowEl);
  });
}

function formatDuration(ms, compact = false) {
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return compact ? `${h}h${m ? ' ' + m + 'm' : ''}` : `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return ms > 0 ? '<1m' : '0m';
}

function formatCompact(n) {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

function lastNDays(n) {
  const days = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function dayLabel(isoDate) {
  const d = new Date(isoDate + 'T00:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 2);
}

new DashboardController().init();
