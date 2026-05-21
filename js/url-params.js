// Read session-only overrides from window.location.search so Magpie can be
// embedded (e.g. in an iframe) with a pre-filled search and filter set.
//
// Supported params:
//   q          — pre-populate the search input; auto-run when present
//   commercial — 1/true/yes forces the Commercial Use option on
//   sources    — comma-separated source IDs; enables those, disables the rest
//
// Overrides apply to in-memory state only; localStorage is not touched, so
// the user's saved preferences are restored on a param-less reload.

import * as state from './state.js';
import { ALL_SOURCES } from './sources/index.js';

const TRUTHY = new Set(['1', 'true', 'yes']);

function isTruthy(raw) {
  return raw != null && TRUTHY.has(raw.trim().toLowerCase());
}

export function readUrlParams(search = window.location.search) {
  const params = new URLSearchParams(search);
  const out = {};

  const q = params.get('q');
  if (q && q.trim()) out.q = q.trim();

  if (isTruthy(params.get('commercial'))) out.commercial = true;

  const sourcesRaw = params.get('sources');
  if (sourcesRaw != null) {
    const validIds = new Set(ALL_SOURCES.map((s) => s.id));
    const ids = sourcesRaw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => validIds.has(s));
    if (ids.length) out.sources = ids;
  }

  return out;
}

// Apply parsed params to in-memory state. Returns true if any were applied.
// `searchInputEl` is the search-input DOM node; its value is set when `q` is
// present. Settings overrides are propagated via state.subscribe so the UI
// re-renders.
export function applyUrlParams(parsed, searchInputEl) {
  let applied = false;
  if (parsed.commercial === true) {
    state.applyOptionOverride('commercial', true);
    applied = true;
  }
  if (parsed.sources) {
    state.applySourceOverrides(parsed.sources);
    applied = true;
  }
  if (parsed.q && searchInputEl) {
    searchInputEl.value = parsed.q;
    applied = true;
  }
  return applied;
}

// Strip the query string so a refresh doesn't re-trigger the auto-search and
// the URL bar stays clean. Pathname + hash are preserved.
export function clearUrlParams() {
  try {
    history.replaceState(null, '', window.location.pathname + window.location.hash);
  } catch {
    /* sandboxed iframe or unsupported — best-effort */
  }
}
