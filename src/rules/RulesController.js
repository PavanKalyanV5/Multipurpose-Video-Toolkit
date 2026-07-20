import { normalizePatternList } from './RuleMatcher.js';

const RULES_KEY = 'uvtCustomRules';

class RulesController {
  #rules = [];
  #selectedId = null;
  #dirty = false;
  #jsEditor = null;
  #cssEditor = null;
  #searchQuery = '';
  #els = {};

  constructor() {
    this.#els = {
      ruleCount:    document.getElementById('ruleCount'),
      addRuleBtn:   document.getElementById('addRuleBtn'),
      searchInput:  document.getElementById('searchInput'),
      ruleList:     document.getElementById('ruleList'),
      noSelection:  document.getElementById('noSelection'),
      editorArea:   document.getElementById('editorArea'),
      nameInput:    document.getElementById('nameInput'),
      patternInput: document.getElementById('patternInput'),
      patternCheck: document.getElementById('patternCheck'),
      saveBtn:      document.getElementById('saveBtn'),
      deleteBtn:    document.getElementById('deleteBtn'),
      runAtSelect:  document.getElementById('runAtSelect'),
    };
  }

  init() {
    const editorOpts = {
      theme: 'material-darker', lineNumbers: true, matchBrackets: true,
      autoCloseBrackets: true, styleActiveLine: true, tabSize: 2, indentUnit: 2,
    };
    this.#jsEditor  = CodeMirror(document.getElementById('jsHost'),  { ...editorOpts, mode: 'javascript' });
    this.#cssEditor = CodeMirror(document.getElementById('cssHost'), { ...editorOpts, mode: 'css' });
    this.#jsEditor.on('change', () => this.#markDirty());
    this.#cssEditor.on('change', () => this.#markDirty());

    this.#els.addRuleBtn.addEventListener('click', () => this.#addRule());
    this.#els.searchInput.addEventListener('input', (e) => {
      this.#searchQuery = e.target.value.toLowerCase();
      this.#renderList();
    });
    this.#els.nameInput.addEventListener('input', () => this.#markDirty());
    this.#els.patternInput.addEventListener('input', () => { this.#markDirty(); this.#syncPatternCheck(); });
    this.#els.runAtSelect.addEventListener('change', () => this.#markDirty());
    this.#els.saveBtn.addEventListener('click', () => this.#save());
    this.#els.deleteBtn.addEventListener('click', () => this.#deleteSelected());

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (this.#selectedId) this.#save();
      }
    });

    this.#load();
  }

  #load() {
    chrome.storage.local.get([RULES_KEY], (r) => {
      this.#rules = r[RULES_KEY] || [];
      this.#renderList();
    });
  }

  #persist(cb) {
    chrome.storage.local.set({ [RULES_KEY]: this.#rules }, cb);
  }

  #addRule() {
    if (!this.#confirmDiscardIfDirty()) return;
    const rule = {
      id: 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      name: 'New rule',
      enabled: true,
      urlPattern: '',
      css: '',
      js: '',
      runAt: 'start',
    };
    this.#rules.unshift(rule);
    this.#persist();
    this.#select(rule.id); // also re-renders the sidebar with the right item highlighted
  }

  #deleteSelected() {
    if (!this.#selectedId) return;
    const rule = this.#rules.find((r) => r.id === this.#selectedId);
    if (!rule) return;
    if (!confirm(`Delete "${rule.name || 'this rule'}"?`)) return;
    this.#rules = this.#rules.filter((r) => r.id !== this.#selectedId);
    this.#persist();
    this.#selectedId = null;
    this.#dirty = false;
    this.#renderList();
    this.#showNoSelection();
  }

  #toggleEnabled(id, enabled) {
    const rule = this.#rules.find((r) => r.id === id);
    if (!rule) return;
    rule.enabled = enabled;
    this.#persist();
    this.#renderList();
  }

  #select(id) {
    if (id === this.#selectedId) return;
    if (!this.#confirmDiscardIfDirty()) return;
    const rule = this.#rules.find((r) => r.id === id);
    if (!rule) return;

    this.#selectedId = id;
    this.#els.nameInput.value = rule.name;
    this.#els.patternInput.value = rule.urlPattern;
    this.#els.runAtSelect.value = rule.runAt || 'start';
    this.#jsEditor.setValue(rule.js || '');
    this.#cssEditor.setValue(rule.css || '');
    this.#syncPatternCheck();
    this.#dirty = false;
    this.#updateSaveBtn();

    this.#els.noSelection.style.display = 'none';
    this.#els.editorArea.style.display = 'flex';
    this.#renderList();

    // CodeMirror can mis-measure itself if it was created (or last updated)
    // while its container was display:none — refresh once actually visible.
    requestAnimationFrame(() => { this.#jsEditor.refresh(); this.#cssEditor.refresh(); });
  }

  #showNoSelection() {
    this.#els.editorArea.style.display = 'none';
    this.#els.noSelection.style.display = 'flex';
  }

  #save() {
    const rule = this.#rules.find((r) => r.id === this.#selectedId);
    if (!rule) return;
    rule.name = this.#els.nameInput.value.trim() || 'Untitled rule';
    // Bare URLs get auto-expanded to cover the whole site (see
    // normalizePatternList) — write the expanded form back into the field so
    // it's obvious what will actually be matched, not a hidden transform.
    rule.urlPattern = normalizePatternList(this.#els.patternInput.value.trim());
    rule.runAt = this.#els.runAtSelect.value;
    rule.js = this.#jsEditor.getValue();
    rule.css = this.#cssEditor.getValue();
    this.#els.nameInput.value = rule.name;
    this.#els.patternInput.value = rule.urlPattern;
    this.#syncPatternCheck();
    this.#persist();
    this.#dirty = false;
    this.#updateSaveBtn();
    this.#renderList();
  }

  #markDirty() {
    this.#dirty = true;
    this.#updateSaveBtn();
  }

  #updateSaveBtn() {
    this.#els.saveBtn.classList.toggle('dirty', this.#dirty);
  }

  #syncPatternCheck() {
    this.#els.patternCheck.classList.toggle('valid', this.#els.patternInput.value.trim().length > 0);
  }

  #confirmDiscardIfDirty() {
    if (!this.#dirty) return true;
    return confirm('Discard unsaved changes to this rule?');
  }

  #renderList() {
    const { ruleList, ruleCount } = this.#els;
    ruleCount.textContent = `Rules (${this.#rules.length})`;
    ruleList.innerHTML = '';

    const q = this.#searchQuery;
    const filtered = this.#rules.filter((r) =>
      !q || r.name.toLowerCase().includes(q) || r.urlPattern.toLowerCase().includes(q)
    );

    if (!filtered.length) {
      const empty = document.createElement('div');
      empty.className = 'sidebar-empty';
      empty.textContent = this.#rules.length
        ? 'No rules match your search.'
        : 'No rules yet — click "New rule" to add your first one.';
      ruleList.appendChild(empty);
      return;
    }

    filtered.forEach((rule) => ruleList.appendChild(this.#buildListItem(rule)));
  }

  #buildListItem(rule) {
    const item = document.createElement('div');
    item.className = 'rule-item'
      + (rule.id === this.#selectedId ? ' active' : '')
      + (rule.enabled ? '' : ' disabled');

    const main = document.createElement('div');
    main.className = 'rule-item-main';
    const name = document.createElement('div');
    name.className = 'rule-item-name';
    name.textContent = rule.name || 'Untitled rule';
    const pattern = document.createElement('div');
    pattern.className = 'rule-item-pattern';
    pattern.textContent = rule.urlPattern || 'No pattern set';
    main.appendChild(name);
    main.appendChild(pattern);
    main.addEventListener('click', () => this.#select(rule.id));

    const label = document.createElement('label');
    label.className = 'switch small';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = rule.enabled;
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('change', () => this.#toggleEnabled(rule.id, input.checked));
    const slider = document.createElement('span');
    slider.className = 'slider';
    label.appendChild(input);
    label.appendChild(slider);

    item.appendChild(main);
    item.appendChild(label);
    return item;
  }
}

new RulesController().init();
