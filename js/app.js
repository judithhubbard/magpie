import * as state from './state.js';
import { startSearch, loadMore, topUpTab } from './search.js';
import { init as initTabs }     from './ui/tabs.js';
import { init as initStatus }   from './ui/status.js';
import { init as initGrid }     from './ui/grid.js';
import { init as initFilters }  from './ui/filters.js';
import { init as initOptions }  from './ui/options.js';
import { init as initSettings } from './ui/settings.js';
import { init as initSaved }    from './ui/saved.js';
import { init as initAbout }    from './ui/about.js';
import { readUrlParams, applyUrlParams, clearUrlParams } from './url-params.js';
import { initEmbedding } from './embedding.js';

state.load();
initEmbedding();

const searchInput      = document.getElementById('search-input');
const resolutionFilter = document.getElementById('resolution-filter');

function syncInputsToActiveTab() {
  const tab = state.getActiveTab();
  searchInput.value      = tab?.query      || '';
  resolutionFilter.value = tab?.resolution || '';
  searchInput.focus();
}

function runSearchFromInputs() {
  const tab = state.getActiveTab();
  if (!tab) return;
  // Options are global — search.js reads them from state directly.
  startSearch(tab.id, searchInput.value.trim(), {
    resolution: resolutionFilter.value,
  });
}

// Each init is wrapped so a failure in one UI module doesn't prevent the
// rest (especially the search-input handler below) from being set up.
function safeInit(name, fn) {
  try { fn(); }
  catch (err) { console.error(`init ${name} failed:`, err); }
}

safeInit('tabs',     () => initTabs({ onSwitch: () => {
  syncInputsToActiveTab();
  const tab = state.getActiveTab();
  if (tab) topUpTab(tab.id);
}}));
safeInit('status',   () => initStatus());
safeInit('grid',     () => initGrid({ onLoadMore: () => {
  const tab = state.getActiveTab();
  if (tab) loadMore(tab.id);
}}));
safeInit('filters',  () => initFilters({ onChange: () => {
  if (searchInput.value.trim()) runSearchFromInputs();
}}));
safeInit('options',  () => initOptions({ onChange: () => {
  if (searchInput.value.trim()) runSearchFromInputs();
}}));
safeInit('settings', () => initSettings());
safeInit('saved',    () => initSaved());
safeInit('about',    () => initAbout());

searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') runSearchFromInputs();
});
resolutionFilter.addEventListener('change', () => {
  if (searchInput.value.trim()) runSearchFromInputs();
});

// Keyboard shortcuts.
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement !== searchInput) {
    e.preventDefault();
    searchInput.focus();
    searchInput.select();
  }
  if ((e.metaKey || e.ctrlKey) && e.key === 't') {
    e.preventDefault();
    state.addTab();
  }
});

// Initial render + restore searches for previously-saved tabs.
syncInputsToActiveTab();

// Apply URL-param overrides (session-only — see js/url-params.js). If `q` is
// present, it runs a fresh search and bypasses the saved-tab top-up.
const urlParams = readUrlParams();
const urlParamsApplied = applyUrlParams(urlParams, searchInput);

try {
  if (urlParams.q) {
    runSearchFromInputs();
  } else {
    const initialTab = state.getActiveTab();
    if (initialTab) topUpTab(initialTab.id);
  }
} catch (err) {
  console.error('initial search on load failed:', err);
}

if (urlParamsApplied) clearUrlParams();
