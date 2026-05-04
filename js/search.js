import * as state from './state.js';
import * as cache from './cache.js';
import * as rateLimiter from './rate-limiter.js';
import { passesResolutionClientSide, HttpError } from './sources/base.js';
import { passesLicenseFilter } from './attribution.js';
import { ALL_SOURCES } from './sources/index.js';

const PER_PAGE = 20;
const DEFAULT_CACHE_TTL = 60 * 60 * 1000;

// Configure rate limiters once per source.
for (const source of ALL_SOURCES) rateLimiter.configure(source.id, source.rateLimit);

// Track in-flight controllers per (tabId, sourceId) so a new query cancels the old one.
const inflight = new Map();

function flightKey(tabId, sourceId) { return `${tabId}::${sourceId}`; }

function cancelInflight(tabId, sourceId) {
  const key = flightKey(tabId, sourceId);
  const ctrl = inflight.get(key);
  if (ctrl) {
    ctrl.abort();
    inflight.delete(key);
  }
}

function cancelAllForTab(tabId) {
  for (const [key, ctrl] of inflight.entries()) {
    if (key.startsWith(`${tabId}::`)) {
      ctrl.abort();
      inflight.delete(key);
    }
  }
}

export function startSearch(tabId, query, opts = {}) {
  cancelAllForTab(tabId);
  state.setQuery(tabId, query, opts);
  if (!query.trim()) return;
  for (const source of enabledSourcesForTab(tabId)) {
    runOne(tabId, source, 1);
  }
}

// Apply vector-only option filter on top of the user's source enablement.
function enabledSourcesForTab() {
  const all = state.getEnabledSources();
  if (state.getOptions().vectorOnly) return all.filter((s) => s.supportsVector);
  return all;
}

export function loadMore(tabId) {
  const tab = state.getTab(tabId);
  if (!tab || !tab.query) return;
  for (const source of enabledSourcesForTab(tabId)) {
    const ss = state.ensureSourceState(tab, source.id);
    if (!ss.hasMore || ss.status === 'loading' || ss.status === 'queued') continue;
    runOne(tabId, source, (ss.page || 0) + 1);
  }
}

// Fire searches for any enabled source that hasn't been queried yet for the
// active tab's query. Useful after adding new sources or switching to a tab
// whose query predates a newly-enabled source. Cheap when cached.
export function topUpTab(tabId) {
  const tab = state.getTab(tabId);
  if (!tab || !tab.query) return;
  for (const source of enabledSourcesForTab(tabId)) {
    const ss = tab.perSource[source.id];
    const empty = !ss || (ss.results.length === 0 && (!ss.status || ss.status === 'idle'));
    if (empty) runOne(tabId, source, 1);
  }
}

async function runOne(tabId, source, page, attempt = 0) {
  const tab = state.getTab(tabId);
  if (!tab) return;
  const { query, resolution } = tab;
  const { commercial, derivatives, strictMatching, vectorOnly, safeSearch } = state.getOptions();

  cancelInflight(tabId, source.id);
  const ctrl = new AbortController();
  inflight.set(flightKey(tabId, source.id), ctrl);

  state.setSourceStatus(tabId, source.id, 'queued');

  const cacheKey = cache.buildKey([
    source.id, `v${source.cacheVersion ?? 1}`,
    query, page, resolution || '*',
    commercial ? 'C' : '-', derivatives ? 'D' : '-',
    strictMatching ? 'S' : '-',
    vectorOnly ? 'V' : '-',
    safeSearch ? 'F' : '-',
  ]);
  const cached = cache.get(cacheKey);
  if (cached) {
    inflight.delete(flightKey(tabId, source.id));
    applyResults(tabId, source.id, cached, page, /*fromCache=*/ true);
    return;
  }

  try {
    await rateLimiter.acquire(source.id);
    if (ctrl.signal.aborted) return;
    state.setSourceStatus(tabId, source.id, 'loading');

    const apiKey = state.getState().apiKeys[source.id];
    const response = await source.search(query, {
      page,
      perPage: PER_PAGE,
      resolution,
      commercial,
      derivatives,
      strict: strictMatching,
      vectorOnly,
      safeSearch,
      signal: ctrl.signal,
      apiKey,
    });

    if (ctrl.signal.aborted) return;

    const filtered = {
      ...response,
      results: response.results.filter((r) =>
        passesResolutionClientSide(r, resolution) &&
        passesLicenseFilter(r, { commercial, derivatives })
      ),
    };

    cache.set(cacheKey, filtered, source.cacheTtlMs ?? DEFAULT_CACHE_TTL);
    inflight.delete(flightKey(tabId, source.id));
    applyResults(tabId, source.id, filtered, page);
  } catch (err) {
    inflight.delete(flightKey(tabId, source.id));
    if (err.name === 'AbortError' || ctrl.signal.aborted) return;

    if (err instanceof HttpError && err.status === 429 && attempt < 3) {
      const backoff = err.retryAfterMs ?? Math.min(30_000, 2 ** attempt * 1000);
      rateLimiter.noteFailure(source.id, backoff);
      state.setSourceStatus(tabId, source.id, 'rate-limited', { retryInMs: backoff });
      setTimeout(() => runOne(tabId, source, page, attempt + 1), backoff);
      return;
    }
    state.setSourceStatus(tabId, source.id, 'error', { message: err.message });
  }
}

function applyResults(tabId, sourceId, response, page, fromCache = false) {
  const tab = state.getTab(tabId);
  if (!tab) return;
  const ss = state.ensureSourceState(tab, sourceId);
  const fresh = response.results.filter((r) => !ss.rejectedIds.includes(r.id));
  state.appendResults(tabId, sourceId, fresh, response.hasMore, page);
  state.setSourceStatus(tabId, sourceId, 'loaded', {
    count: ss.results.length + (fromCache ? 0 : 0),
    cached: fromCache,
  });
}

// Reject is fast — also trigger a top-up so the grid stays full.
export function rejectAndBackfill(tabId, sourceId, imageId) {
  state.rejectImage(tabId, sourceId, imageId);
  const tab = state.getTab(tabId);
  if (!tab) return;
  const ss = state.ensureSourceState(tab, sourceId);
  if (ss.results.length < PER_PAGE && ss.hasMore) {
    const source = ALL_SOURCES.find((s) => s.id === sourceId);
    if (source) runOne(tabId, source, (ss.page || 0) + 1);
  }
}
