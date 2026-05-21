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
