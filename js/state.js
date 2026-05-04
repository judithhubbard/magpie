import { ALL_SOURCES } from './sources/index.js';

const STORAGE_KEY = 'imgsearch:state:v1';

let state = {
  tabs: [],
  activeTabId: null,
  apiKeys: {},          // sourceId -> key
  enabledSources: {},   // sourceId -> bool (global)
  options: {            // search options, global across all tabs
    commercial: false,
    derivatives: false,
    strictMatching: false,
    vectorOnly: false,
    safeSearch: true,   // default ON; applies where the source supports it
  },
  saved: [],            // bookmarked NormalizedImages, global across tabs
};

const subscribers = new Set();

function notify(event) {
  for (const fn of subscribers) fn(event, state);
}

export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function getState() { return state; }
export function getActiveTab() { return state.tabs.find((t) => t.id === state.activeTabId) || null; }
export function getTab(id)     { return state.tabs.find((t) => t.id === id) || null; }

function nextTabId() { return 'tab-' + Math.random().toString(36).slice(2, 9); }

function blankTab(label = 'New search') {
  return {
    id: nextTabId(),
    label,
    query: '',
    resolution: '',
    sourceFilter: null,   // when set to a sourceId, grid only shows that source's results
    perSource: {},   // sourceId -> { results, page, hasMore, status, statusDetail, rejectedIds }
  };
}

function blankSourceState() {
  return {
    results: [],
    page: 0,
    hasMore: true,
    status: 'idle',          // idle | queued | loading | loaded | error | rate-limited | disabled
    statusDetail: null,
    rejectedIds: [],
  };
}

export function ensureSourceState(tab, sourceId) {
  if (!tab.perSource[sourceId]) tab.perSource[sourceId] = blankSourceState();
  return tab.perSource[sourceId];
}

export function addTab(label) {
  const tab = blankTab(label);
  state.tabs.push(tab);
  state.activeTabId = tab.id;
  persist();
  notify({ type: 'tab:add', tabId: tab.id });
  return tab;
}

export function closeTab(id) {
  const idx = state.tabs.findIndex((t) => t.id === id);
  if (idx < 0) return;
  state.tabs.splice(idx, 1);
  if (state.activeTabId === id) {
    state.activeTabId = state.tabs[Math.max(0, idx - 1)]?.id || null;
  }
  if (state.tabs.length === 0) addTab();
  persist();
  notify({ type: 'tab:close', tabId: id });
}

export function selectTab(id) {
  if (state.activeTabId === id) return;
  state.activeTabId = id;
  persist();
  notify({ type: 'tab:select', tabId: id });
}

export function setQuery(tabId, query, opts = {}) {
  const tab = getTab(tabId);
  if (!tab) return;
  tab.query = query;
  tab.resolution = opts.resolution || '';
  tab.label = query || 'New search';
  tab.perSource = {};   // reset results on new query
  persist();
  notify({ type: 'tab:query', tabId });
}

// Search options are GLOBAL — applying everywhere and persisted across
// sessions. Toggling an option re-triggers the active tab's search; other
// tabs pick up the new options on their next search or tab switch.
export function getOptions() {
  return state.options;
}

export function setOption(key, value) {
  state.options[key] = value;
  persist();
  notify({ type: 'options:change', key });
}

// Toggle the per-tab source filter. If `sourceId` matches the current
// filter, clear it; otherwise set it (or set to null to clear explicitly).
export function setSourceFilter(tabId, sourceId) {
  const tab = getTab(tabId);
  if (!tab) return;
  if (sourceId == null) tab.sourceFilter = null;
  else if (tab.sourceFilter === sourceId) tab.sourceFilter = null;
  else tab.sourceFilter = sourceId;
  persist();
  notify({ type: 'filter:source', tabId, sourceFilter: tab.sourceFilter });
}

export function appendResults(tabId, sourceId, results, hasMore, page) {
  const tab = getTab(tabId);
  if (!tab) return;
  const ss = ensureSourceState(tab, sourceId);
  const seen = new Set(ss.results.map((r) => r.id));
  for (const r of results) if (!seen.has(r.id)) ss.results.push(r);
  ss.hasMore = hasMore;
  ss.page = page;
  persist();
  notify({ type: 'results:append', tabId, sourceId });
}

export function setSourceStatus(tabId, sourceId, status, statusDetail = null) {
  const tab = getTab(tabId);
  if (!tab) return;
  const ss = ensureSourceState(tab, sourceId);
  ss.status = status;
  ss.statusDetail = statusDetail;
  notify({ type: 'status:change', tabId, sourceId });
}

export function rejectImage(tabId, sourceId, imageId) {
  const tab = getTab(tabId);
  if (!tab) return;
  const ss = ensureSourceState(tab, sourceId);
  if (!ss.rejectedIds.includes(imageId)) ss.rejectedIds.push(imageId);
  ss.results = ss.results.filter((r) => r.id !== imageId);
  persist();
  notify({ type: 'results:reject', tabId, sourceId, imageId });
}

// ---- saved (global bookmarks) ----

export function isSaved(imageId) {
  return state.saved.some((s) => s.id === imageId);
}

export function getSaved() {
  return state.saved.slice();
}

export function saveImage(image) {
  if (isSaved(image.id)) return;
  state.saved.push(image);
  persist();
  notify({ type: 'saved:add', imageId: image.id });
}

export function unsaveImage(imageId) {
  const before = state.saved.length;
  state.saved = state.saved.filter((s) => s.id !== imageId);
  if (state.saved.length === before) return;
  persist();
  notify({ type: 'saved:remove', imageId });
}

export function clearSaved() {
  if (!state.saved.length) return;
  state.saved = [];
  persist();
  notify({ type: 'saved:clear' });
}

export function setApiKey(sourceId, key) {
  if (key) state.apiKeys[sourceId] = key;
  else delete state.apiKeys[sourceId];
  persist();
  notify({ type: 'apiKey:change', sourceId });
}

// Source enablement is GLOBAL (shared across all tabs and persisted across
// sessions). Toggling a source applies everywhere — new tabs inherit the
// current setting rather than starting all-on.
export function setSourceEnabled(sourceId, enabled) {
  if (enabled) delete state.enabledSources[sourceId];   // back to default-on
  else state.enabledSources[sourceId] = false;
  persist();
  notify({ type: 'source:toggle', sourceId });
}

export function isSourceEnabled(sourceId) {
  return state.enabledSources?.[sourceId] !== false;   // default ON
}

export function getEnabledSources() {
  const apiKeys = state.apiKeys || {};
  return ALL_SOURCES.filter((s) =>
    isSourceEnabled(s.id) && (!s.requiresKey || apiKeys[s.id])
  );
}

// ---- persistence ----

function persist() {
  try {
    const safe = {
      ...state,
      tabs: state.tabs.map((t) => ({
        ...t,
        // keep only enough per-source state to restore (results, rejectedIds, page, hasMore)
        // drop transient status fields
        perSource: Object.fromEntries(
          Object.entries(t.perSource).map(([sid, ss]) => [
            sid,
            {
              results: ss.results,
              page: ss.page,
              hasMore: ss.hasMore,
              rejectedIds: ss.rejectedIds,
              status: 'idle',
              statusDetail: null,
            },
          ])
        ),
      })),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
  } catch {
    /* quota or serialization error — fall back to in-memory only */
  }
}

export function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state = { ...state, ...parsed };
    }
  } catch { /* ignore */ }
  // Defensive: defaults in case stored state predates current shape.
  if (!state.apiKeys || typeof state.apiKeys !== 'object') state.apiKeys = {};
  if (!state.enabledSources || typeof state.enabledSources !== 'object') state.enabledSources = {};
  if (!state.options || typeof state.options !== 'object') {
    state.options = { commercial: false, derivatives: false, strictMatching: false, vectorOnly: false, safeSearch: true };
  }
  if (typeof state.options.safeSearch !== 'boolean') state.options.safeSearch = true;
  if (!Array.isArray(state.saved)) state.saved = [];
  for (const tab of state.tabs) {
    if (!tab.perSource || typeof tab.perSource !== 'object') tab.perSource = {};
    // dropped: per-tab enablement and options are now global
    delete tab.enabledSources;
    delete tab.commercial;
    delete tab.derivatives;
    delete tab.strictMatching;
    delete tab.vectorOnly;
  }
  if (!state.tabs.length) {
    addTab();
  } else if (!state.tabs.find((t) => t.id === state.activeTabId)) {
    state.activeTabId = state.tabs[0].id;
  }
}
