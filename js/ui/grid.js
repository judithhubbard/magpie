import * as state from '../state.js';
import { rejectAndBackfill } from '../search.js';
import { describeLicense } from '../attribution.js';
import { looksAdult } from '../sources/base.js';
import { openLightbox } from './lightbox.js';
import { IS_EMBEDDED, postSelect, isAttached, onAttachedChange } from '../embedding.js';

const grid = document.getElementById('results-grid');
const loadMoreBtn = document.getElementById('load-more');

export function init({ onLoadMore }) {
  state.subscribe((event) => {
    if (['results:append', 'results:reject', 'tab:select', 'tab:query',
         'tab:add', 'tab:close', 'status:change', 'filter:source',
         'saved:add', 'saved:remove', 'saved:clear',
         'options:change'].includes(event.type)) {
      safeRender();
    }
  });
  onAttachedChange(safeRender);
  grid.addEventListener('click', handleClick);
  loadMoreBtn.addEventListener('click', onLoadMore);
  safeRender();
}

// Wrap render so a single bad result/state can't blank the whole UI.
function safeRender() {
  try { render(); }
  catch (err) {
    console.error('grid render failed:', err);
    grid.replaceChildren(emptyState(`Render error: ${err.message}. Open Settings → Clear cached results, then refresh.`));
  }
}

// Render-time safe-search filter — applied even to results that came from a
// stale cache or persisted tab state. Catches anything with adult-content
// keywords in title or description, regardless of when it was fetched.
function passesSafeSearch(image) {
  if (!state.getOptions().safeSearch) return true;
  return !looksAdult(image.title) && !looksAdult(image.description);
}

function getMergedResults(tab) {
  const perSource = tab.perSource || {};
  // If a source filter is set, show only that source's results, in order.
  if (tab.sourceFilter) {
    const arr = perSource[tab.sourceFilter]?.results;
    return Array.isArray(arr) ? arr.filter(passesSafeSearch) : [];
  }
  // Otherwise round-robin across sources so the user sees variety up top.
  const lists = Object.entries(perSource)
    .filter(([, ss]) => ss && Array.isArray(ss.results))
    .map(([sid, ss]) => ({ sid, results: ss.results.filter(passesSafeSearch), idx: 0 }));
  const merged = [];
  let progress = true;
  while (progress) {
    progress = false;
    for (const lane of lists) {
      if (lane.idx < lane.results.length) {
        merged.push(lane.results[lane.idx++]);
        progress = true;
      }
    }
  }
  return merged;
}

function render() {
  const tab = state.getActiveTab();
  if (!tab) { grid.replaceChildren(); loadMoreBtn.hidden = true; return; }

  if (!tab.query) {
    grid.replaceChildren(introState());
    loadMoreBtn.hidden = true;
    return;
  }

  const merged = getMergedResults(tab);
  const perSourceVals = Object.values(tab.perSource || {}).filter(Boolean);
  if (!merged.length) {
    const anyLoading = perSourceVals.some(
      (ss) => ss.status === 'loading' || ss.status === 'queued'
    );
    grid.replaceChildren(emptyState(anyLoading ? 'Searching…' : 'No results yet.'));
    loadMoreBtn.hidden = true;
    return;
  }

  grid.replaceChildren(...merged.map(renderTile));

  const anyMore = perSourceVals.some((ss) => ss.hasMore);
  loadMoreBtn.hidden = !anyMore;
}

function renderTile(image) {
  const tile = document.createElement('div');
  tile.className = 'tile';
  tile.dataset.imageId = image.id;
  tile.dataset.sourceId = image.sourceId;

  const spinner = document.createElement('div');
  spinner.className = 'tile-spinner';
  tile.appendChild(spinner);

  const img = document.createElement('img');
  img.loading = 'lazy';
  img.decoding = 'async';
  img.src = image.thumbnailUrl;
  img.alt = image.title || '';
  img.className = 'loading';
  img.addEventListener('load', () => { img.classList.remove('loading'); spinner.remove(); }, { once: true });
  img.addEventListener('error', () => {
    spinner.remove();
    tile.classList.add('error');
    console.warn('[grid] image failed to load:', image.thumbnailUrl, '— full:', image.fullUrl);
  }, { once: true });
  tile.appendChild(img);

  const meta = document.createElement('div');
  meta.className = 'tile-meta';
  const src = document.createElement('span');
  src.className = 'tile-source';
  src.textContent = image.sourceName || image.sourceId;
  meta.appendChild(src);

  const lic = document.createElement('span');
  lic.className = 'tile-license';
  const desc = describeLicense(image.license);
  lic.textContent = desc.name;
  lic.title = desc.explanation;
  meta.appendChild(lic);
  tile.appendChild(meta);

  const reject = document.createElement('button');
  reject.className = 'tile-reject';
  reject.textContent = '×';
  reject.title = 'Reject (hide this image)';
  reject.dataset.action = 'reject';
  tile.appendChild(reject);

  const saved = state.isSaved(image.id);
  const bookmark = document.createElement('button');
  bookmark.className = 'tile-bookmark' + (saved ? ' saved' : '');
  bookmark.textContent = saved ? '★' : '☆';
  bookmark.title = saved ? 'Remove from saved' : 'Save for later';
  bookmark.dataset.action = 'bookmark';
  tile.appendChild(bookmark);

  if (IS_EMBEDDED) {
    if (isAttached(image)) {
      const chip = document.createElement('span');
      chip.className = 'tile-attached';
      chip.textContent = '✓ In catalog';
      chip.title = 'Already added to this species’s photos';
      tile.appendChild(chip);
    } else {
      const select = document.createElement('button');
      select.className = 'tile-select';
      select.textContent = '📥 Select';
      select.title = 'Send this image’s attribution to the host page';
      select.dataset.action = 'select';
      tile.appendChild(select);
    }
  }

  return tile;
}

function emptyState(text) {
  const div = document.createElement('div');
  div.className = 'empty-state';
  div.style.gridColumn = '1 / -1';
  div.textContent = text;
  return div;
}

// First-load intro: a brief one-liner about what Magpie is, plus a CTA.
function introState() {
  const wrap = document.createElement('div');
  wrap.className = 'empty-state intro-state';
  wrap.style.gridColumn = '1 / -1';

  const lead = document.createElement('p');
  lead.className = 'intro-lead';
  lead.textContent = 'Magpie searches 20+ free and Creative Commons image collections — Wikimedia, NASA, the Library of Congress, iNaturalist, museum archives, scientific databases, and more — in one query.';

  const cta = document.createElement('p');
  cta.className = 'intro-cta';
  cta.textContent = 'Type a query above to start.';

  wrap.append(lead, cta);
  return wrap;
}

function handleClick(e) {
  const tile = e.target.closest('.tile');
  if (!tile) return;
  const imageId = tile.dataset.imageId;
  const sourceId = tile.dataset.sourceId;
  const tab = state.getActiveTab();
  if (!tab) return;

  if (e.target.dataset.action === 'reject') {
    e.stopPropagation();
    rejectAndBackfill(tab.id, sourceId, imageId);
    return;
  }

  if (e.target.dataset.action === 'bookmark') {
    e.stopPropagation();
    const image = tab.perSource[sourceId]?.results.find((r) => r.id === imageId);
    if (!image) return;
    if (state.isSaved(imageId)) state.unsaveImage(imageId);
    else state.saveImage(image);
    return;
  }

  if (e.target.dataset.action === 'select') {
    e.stopPropagation();
    const image = tab.perSource[sourceId]?.results.find((r) => r.id === imageId);
    if (!image) return;
    const sent = postSelect(image);
    flashSelect(e.target, sent);
    if (sent) tile.classList.add('selected-flash');
    setTimeout(() => tile.classList.remove('selected-flash'), 800);
    return;
  }

  // Find the image and open the lightbox.
  const image = tab.perSource[sourceId]?.results.find((r) => r.id === imageId);
  if (image) openLightbox(image);
}

function flashSelect(btn, sent) {
  const original = btn.textContent;
  btn.textContent = sent ? '✓ Sent' : '✗ Failed';
  btn.classList.add(sent ? 'sent' : 'failed');
  setTimeout(() => {
    btn.textContent = original;
    btn.classList.remove('sent', 'failed');
  }, 1200);
}
