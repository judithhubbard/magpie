// Iframe-embedding bridge.
//
// When Magpie is hosted inside another page (e.g. Forager), each result
// card gets a "Select" button. Clicking it postMessages the image's
// attribution string to the parent so the host can auto-fill its own form.
//
// All behavior is gated on iframe detection — standalone visits see no
// change.

import { formatAttribution } from './attribution.js';

function detectEmbedded() {
  try { return window.self !== window.top; }
  catch { return true; }   // cross-origin access throws → we're framed
}

export const IS_EMBEDDED = detectEmbedded();

// Apply a root-level class so CSS can show/hide embed-only UI without each
// component having to re-check IS_EMBEDDED.
export function initEmbedding() {
  if (IS_EMBEDDED) document.documentElement.classList.add('magpie-embedded');
}

// Build the same attribution string the Copy-attribution button produces.
export function attributionFor(image) {
  return formatAttribution({
    title: image.title,
    creator: image.creator,
    sourceName: image.sourceName,
    sourceUrl: image.sourceUrl,
    license: image.license,
    licenseUrl: image.licenseUrl,
  });
}

// Send the selected image to the parent window. No-op when not embedded.
export function postSelect(image) {
  if (!IS_EMBEDDED) return false;
  try {
    window.parent.postMessage(
      { type: 'magpie:select', attribution: attributionFor(image), caption: '' },
      '*',
    );
    return true;
  } catch (err) {
    console.warn('[embedding] postMessage failed:', err);
    return false;
  }
}

// ---- attached-URL tracking ----
//
// Forager posts { type: 'forager:attached-urls', urls: [...] } whenever the
// list of photos on the active species changes (on iframe load + after each
// add). Magpie compares each result's URLs against the set and renders a
// passive "in catalog" chip in place of Select on matches.

const attached = new Set();
const attachedListeners = new Set();

export function onAttachedChange(fn) {
  attachedListeners.add(fn);
  return () => attachedListeners.delete(fn);
}

// Normalize a URL so thumbnail/full-size variants and source-page URLs from
// the same image collapse to a single key. Conservative — unknown hosts pass
// through with only query/hash/trailing-slash stripped.
export function normalizeUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let u;
  try { u = new URL(raw); }
  catch { return raw.trim().replace(/\/+$/, '') || null; }
  u.hash = '';
  u.search = '';

  // Wikimedia thumb URLs:
  //   /wikipedia/commons/thumb/a/ab/File.jpg/800px-File.jpg
  // collapse to the original:
  //   /wikipedia/commons/a/ab/File.jpg
  if (/(^|\.)wikimedia\.org$/.test(u.hostname) && u.pathname.includes('/thumb/')) {
    const m = u.pathname.match(/^(.*?)\/thumb\/([0-9a-f])\/([0-9a-f]{2})\/([^/]+)\/[^/]+$/i);
    if (m) u.pathname = `${m[1]}/${m[2]}/${m[3]}/${m[4]}`;
  }

  // iNaturalist photo URLs:
  //   /photos/12345/medium.jpg → /photos/12345/*.jpg
  // so square/small/medium/large/original collapse to one key.
  if (/inaturalist\.org$/.test(u.hostname) || /static\.inaturalist\.org$/.test(u.hostname)) {
    u.pathname = u.pathname.replace(
      /\/(square|small|medium|large|original)\.(jpg|jpeg|png|gif)$/i,
      '/*.$2',
    );
  }

  return (u.toString().replace(/\/+$/, '')) || null;
}

function setAttachedUrls(urls) {
  attached.clear();
  for (const u of urls) {
    const n = normalizeUrl(u);
    if (n) attached.add(n);
  }
  for (const fn of attachedListeners) {
    try { fn(); } catch (err) { console.error('[embedding] listener failed:', err); }
  }
}

// Compare an image's known URLs (source page + direct image URLs) against
// the attached set. Returns true on any match.
export function isAttached(image) {
  if (attached.size === 0 || !image) return false;
  const candidates = [image.sourceUrl, image.fullUrl, image.thumbnailUrl];
  for (const c of candidates) {
    const n = normalizeUrl(c);
    if (n && attached.has(n)) return true;
  }
  return false;
}

if (IS_EMBEDDED) {
  window.addEventListener('message', (ev) => {
    const data = ev.data;
    if (!data || data.type !== 'forager:attached-urls') return;
    setAttachedUrls(Array.isArray(data.urls) ? data.urls : []);
  });
}
