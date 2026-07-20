import { useEffect, useMemo, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { css } from '@codemirror/lang-css';
import { EditorView } from '@codemirror/view';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import Switch from '@mui/material/Switch';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Tooltip from '@mui/material/Tooltip';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SaveIcon from '@mui/icons-material/Save';
import CodeIcon from '@mui/icons-material/Code';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import { BrandIcon } from '../../shared/BrandIcon';
import { normalizePatternList } from '../../shared/RuleMatcher';
import type { CustomRule } from '../../shared/types';

const RULES_KEY = 'uvtCustomRules';

const editorTheme = EditorView.theme(
  {
    '&': { backgroundColor: 'transparent', color: '#e2e8f0', height: '100%', fontSize: '12.5px' },
    '.cm-content': { caretColor: '#38bdf8', fontFamily: "'Consolas', 'SF Mono', monospace" },
    '.cm-gutters': { backgroundColor: 'transparent', color: '#475569', border: 'none' },
    '.cm-activeLine': { backgroundColor: 'rgba(56,189,248,0.06)' },
    '.cm-activeLineGutter': { backgroundColor: 'rgba(56,189,248,0.1)' },
    '.cm-selectionBackground, ::selection': { backgroundColor: 'rgba(56,189,248,0.25) !important' },
    '.cm-cursor': { borderLeftColor: '#38bdf8' },
    '&.cm-focused': { outline: 'none' },
  },
  { dark: true },
);

function newRule(): CustomRule {
  return {
    id: 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    name: 'New rule',
    enabled: true,
    urlPattern: '',
    css: '',
    js: '',
    runAt: 'start',
  };
}

export function App() {
  const [rules, setRules] = useState<CustomRule[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [dirty, setDirty] = useState(false);

  const [name, setName] = useState('');
  const [pattern, setPattern] = useState('');
  const [runAt, setRunAt] = useState<'start' | 'idle'>('start');
  const [js, setJs] = useState('');
  const [cssText, setCssText] = useState('');

  useEffect(() => {
    chrome.storage.local.get([RULES_KEY], (r: { [RULES_KEY]?: CustomRule[] }) => {
      setRules(r[RULES_KEY] || []);
      setLoaded(true);
    });
  }, []);

  const persist = (next: CustomRule[]) => {
    setRules(next);
    chrome.storage.local.set({ [RULES_KEY]: next });
  };

  const confirmDiscardIfDirty = (): boolean => {
    if (!dirty) return true;
    return confirm('Discard unsaved changes to this rule?');
  };

  const select = (id: string) => {
    if (id === selectedId) return;
    if (!confirmDiscardIfDirty()) return;
    const rule = rules.find((r) => r.id === id);
    if (!rule) return;
    setSelectedId(id);
    setName(rule.name);
    setPattern(rule.urlPattern);
    setRunAt(rule.runAt || 'start');
    setJs(rule.js || '');
    setCssText(rule.css || '');
    setDirty(false);
  };

  const addRule = () => {
    if (!confirmDiscardIfDirty()) return;
    const rule = newRule();
    persist([rule, ...rules]);
    setSelectedId(rule.id);
    setName(rule.name);
    setPattern(rule.urlPattern);
    setRunAt(rule.runAt);
    setJs(rule.js);
    setCssText(rule.css);
    setDirty(false);
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    const rule = rules.find((r) => r.id === selectedId);
    if (!rule) return;
    if (!confirm(`Delete "${rule.name || 'this rule'}"?`)) return;
    persist(rules.filter((r) => r.id !== selectedId));
    setSelectedId(null);
    setDirty(false);
  };

  const toggleEnabled = (id: string, enabled: boolean) => {
    persist(rules.map((r) => (r.id === id ? { ...r, enabled } : r)));
  };

  const save = () => {
    if (!selectedId) return;
    const finalName = name.trim() || 'Untitled rule';
    const finalPattern = normalizePatternList(pattern.trim());
    setName(finalName);
    setPattern(finalPattern);
    persist(rules.map((r) => (r.id === selectedId ? { ...r, name: finalName, urlPattern: finalPattern, runAt, js, css: cssText } : r)));
    setDirty(false);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (selectedId) save();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, name, pattern, runAt, js, cssText]);

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return rules.filter((r) => !q || r.name.toLowerCase().includes(q) || r.urlPattern.toLowerCase().includes(q));
  }, [rules, searchQuery]);

  const patternValid = pattern.trim().length > 0;

  if (!loaded) return null;

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Box sx={{ width: 280, flexShrink: 0, borderRight: 1, borderColor: 'divider', bgcolor: '#10131d', display: 'flex', flexDirection: 'column' }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2, pt: 2, pb: 1.25 }}>
          <Stack direction="row" alignItems="center" gap={1}>
            <BrandIcon sx={{ fontSize: 16, color: 'primary.main' }} />
            <Typography variant="subtitle2" sx={{ fontSize: 12, color: 'text.secondary', textTransform: 'uppercase' }}>Rules ({rules.length})</Typography>
          </Stack>
          <Button size="small" startIcon={<AddIcon fontSize="small" />} onClick={addRule} sx={{ fontSize: 12 }}>
            New rule
          </Button>
        </Stack>
        <Box sx={{ px: 1.75, pb: 1.25 }}>
          <TextField
            size="small"
            fullWidth
            placeholder="Find…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 16, color: 'text.disabled' }} /></InputAdornment> } }}
          />
        </Box>
        <List sx={{ flex: 1, overflowY: 'auto', px: 1, pb: 1.5 }}>
          {filtered.length === 0 ? (
            <Typography variant="caption" sx={{ display: 'block', p: 2, color: 'text.disabled', textAlign: 'center', lineHeight: 1.6 }}>
              {rules.length ? 'No rules match your search.' : 'No rules yet — click "New rule" to add your first one.'}
            </Typography>
          ) : (
            filtered.map((rule) => (
              <ListItemButton
                key={rule.id}
                selected={rule.id === selectedId}
                onClick={() => select(rule.id)}
                sx={{ mb: 0.25, opacity: rule.enabled ? 1 : 0.5, display: 'flex', alignItems: 'center', gap: 1 }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{rule.name || 'Untitled rule'}</Typography>
                  <Typography variant="caption" noWrap sx={{ display: 'block', color: 'text.disabled', fontFamily: "'Consolas', 'SF Mono', monospace" }}>
                    {rule.urlPattern || 'No pattern set'}
                  </Typography>
                </Box>
                <Switch
                  size="small"
                  checked={rule.enabled}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => toggleEnabled(rule.id, e.target.checked)}
                />
              </ListItemButton>
            ))
          )}
        </List>
      </Box>

      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Alert severity="warning" icon={false} sx={{ borderRadius: 0, py: 0.5 }}>
          <strong>JS runs with full page privileges.</strong> Only paste code you trust. Changes apply next time a matching page loads.
        </Alert>

        {!selectedId ? (
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1.5, color: 'text.disabled' }}>
            <CodeIcon sx={{ fontSize: 40, color: '#334155' }} />
            <Box sx={{ textAlign: 'center' }}>
              <Typography sx={{ color: 'text.secondary', fontWeight: 700 }}>No rule selected</Typography>
              <Typography variant="body2">Pick a rule on the left, or create a new one.</Typography>
            </Box>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <Stack direction="row" alignItems="flex-end" gap={2} sx={{ px: 2.25, py: 1.5, borderBottom: 1, borderColor: 'divider', bgcolor: '#10131d' }}>
              <TextField
                label="Rule name"
                size="small"
                sx={{ width: 200 }}
                value={name}
                onChange={(e) => { setName(e.target.value); setDirty(true); }}
              />
              <TextField
                label="URL pattern"
                size="small"
                fullWidth
                placeholder="https://site.com/*, !https://site.com/excluded/*"
                value={pattern}
                onChange={(e) => { setPattern(e.target.value); setDirty(true); }}
                slotProps={{
                  input: {
                    sx: { fontFamily: "'Consolas', 'SF Mono', monospace", fontSize: 12 },
                    startAdornment: (
                      <InputAdornment position="start">
                        <CheckCircleIcon sx={{ fontSize: 16, color: patternValid ? 'success.main' : 'text.disabled' }} />
                      </InputAdornment>
                    ),
                  },
                }}
              />
              <Stack direction="row" gap={1} sx={{ flexShrink: 0 }}>
                <Button
                  variant="outlined"
                  startIcon={<SaveIcon fontSize="small" />}
                  onClick={save}
                  sx={dirty ? { boxShadow: '0 0 0 1px rgba(56,189,248,.4), 0 0 12px rgba(56,189,248,.25)', bgcolor: 'rgba(56,189,248,0.18)' } : undefined}
                >
                  Save
                </Button>
                <Tooltip title="Delete rule">
                  <IconButton onClick={deleteSelected} sx={{ border: 1, borderColor: 'divider' }}>
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
            </Stack>

            <Box sx={{ flex: 1, display: 'flex', minHeight: 0 }}>
              <Box component={Paper} square sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, borderRight: 1, borderColor: 'divider', bgcolor: 'transparent' }}>
                <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                  <CodeMirror
                    value={js}
                    height="100%"
                    theme={editorTheme}
                    extensions={[javascript()]}
                    basicSetup={{ autocompletion: true, bracketMatching: true, closeBrackets: true, highlightActiveLine: true }}
                    onChange={(v) => { setJs(v); setDirty(true); }}
                  />
                </Box>
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 1.75, py: 0.75, borderTop: 1, borderColor: 'divider', bgcolor: '#10131d' }}>
                  <Chip label="JAVASCRIPT" size="small" sx={{ fontSize: 10, height: 20, bgcolor: 'rgba(56,189,248,0.1)', color: '#78c8ff' }} />
                  <Select
                    size="small"
                    value={runAt}
                    onChange={(e) => { setRunAt(e.target.value as 'start' | 'idle'); setDirty(true); }}
                    sx={{ fontSize: 11, height: 26 }}
                  >
                    <MenuItem value="start">Run: as soon as possible</MenuItem>
                    <MenuItem value="idle">Run: after page loads</MenuItem>
                  </Select>
                </Stack>
              </Box>
              <Box component={Paper} square sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, bgcolor: 'transparent' }}>
                <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                  <CodeMirror
                    value={cssText}
                    height="100%"
                    theme={editorTheme}
                    extensions={[css()]}
                    basicSetup={{ autocompletion: true, bracketMatching: true, closeBrackets: true, highlightActiveLine: true }}
                    onChange={(v) => { setCssText(v); setDirty(true); }}
                  />
                </Box>
                <Stack direction="row" alignItems="center" sx={{ px: 1.75, py: 0.75, borderTop: 1, borderColor: 'divider', bgcolor: '#10131d' }}>
                  <Chip label="CSS" size="small" sx={{ fontSize: 10, height: 20, bgcolor: 'rgba(56,189,248,0.1)', color: '#78c8ff' }} />
                </Stack>
              </Box>
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}
