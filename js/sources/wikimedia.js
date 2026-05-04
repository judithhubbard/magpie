import { httpJson, matchesAllQueryWords, stripHtml, looksAdult } from './base.js';
import { normalizeLicenseCode, licenseUrlFromCode } from '../attribution.js';

const ENDPOINT = 'https://commons.wikimedia.org/w/api.php';

function meta(extmetadata, key) {
  return extmetadata?.[key]?.value;
}

function titleFromFilename(pageTitle) {
  return String(pageTitle || '')
    .replace(/^File:/i, '')
    .replace(/\.[^.]+$/, '')
    .replace(/_/g, ' ');
}

// Wikimedia only serves thumbnails at widths it has explicitly generated
// (via the API or prior cache hits). Constructing arbitrary `Npx-...` URLs
// returns HTTP 400. So for `fullUrl` we use the original file URL for
// formats the browser renders natively, and fall back to the API-generated
// thumbnail (typically PNG) for everything else (TIFF, etc.).
const BROWSER_RENDERABLE = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
]);

// Build a text haystack from a Wikimedia page object for relevance filtering.
// Wikimedia search matches across categories and full-text — without this we
// get hits like "Mlle Silly" actress photos for a "silly cat" query.
function pageHaystack(page) {
  const ext = page.imageinfo?.[0]?.extmetadata || {};
  return [
    titleFromFilename(page.title),
    stripHtml(meta(ext, 'ImageDescription')),
    String(meta(ext, 'Categories') || '').replace(/\|/g, ' '),
  ].filter(Boolean).join(' ');
}

// Wikimedia has no native safe-search API and `-deepcat:` exclusions are
// unreliable (explicit images live in many narrow categories outside the
// standard "Sexual content" / "Nudity" hierarchies). Use the shared
// looksAdult() keyword filter against title + categories.
function isAdultContent(page) {
  const ext = page.imageinfo?.[0]?.extmetadata || {};
  return looksAdult(titleFromFilename(page.title) + ' ' + (meta(ext, 'Categories') || ''));
}

function normalize(page) {
  const info = page.imageinfo?.[0];
  if (!info) return null;
  const ext = info.extmetadata || {};
  const license = normalizeLicenseCode(meta(ext, 'License') || meta(ext, 'LicenseShortName'));
  const thumbUrl = info.thumburl || info.url;
  const fullUrl = BROWSER_RENDERABLE.has(info.mime) ? info.url : thumbUrl;
  const description = stripHtml(meta(ext, 'ImageDescription')) || null;
  return {
    id: `wikimedia:${page.pageid}`,
    sourceId: 'wikimedia',
    sourceName: 'Wikimedia Commons',
    thumbnailUrl: thumbUrl,
    fullUrl,
    width: info.width ?? null,
    height: info.height ?? null,
    title: titleFromFilename(page.title),
    creator: stripHtml(meta(ext, 'Artist')) || null,
    sourceUrl: page.fullurl || `https://commons.wikimedia.org/?curid=${page.pageid}`,
    license,
    licenseUrl: meta(ext, 'LicenseUrl') || licenseUrlFromCode(license),
    description,
  };
}

export default {
  id: 'wikimedia',
  displayName: 'Wikimedia',
  category: 'encyclopedic',
  requiresKey: false,
  supportsVector: true,
  rateLimit: { requestsPerSecond: 5 },
  cacheTtlMs: 60 * 60 * 1000,
  cacheVersion: 4,   // bumped: client-side adult-content filter via category keywords

  async search(query, { page = 1, perPage = 20, strict = false, vectorOnly = false, safeSearch = true, signal } = {}) {
    const filetype = vectorOnly ? 'filetype:drawing' : 'filetype:bitmap|drawing';
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      generator: 'search',
      gsrsearch: `${query} ${filetype}`,
      gsrnamespace: '6',
      gsrlimit: String(perPage),
      gsroffset: String((page - 1) * perPage),
      prop: 'imageinfo|info',
      iiprop: 'url|size|mime|extmetadata',
      iiurlwidth: '500',
      inprop: 'url',
      origin: '*',
    });
    const data = await httpJson(`${ENDPOINT}?${params}`, { signal });
    const pages = data.query?.pages || {};
    const sorted = Object.values(pages).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    const results = sorted
      .filter((p) => !safeSearch || !isAdultContent(p))
      .filter((p) => matchesAllQueryWords(query, pageHaystack(p), { strict }))
      .map(normalize)
      .filter(Boolean);
    return {
      results,
      hasMore: !!data.continue,
      totalCount: null,   // generator=search doesn't return totalhits
    };
  },
};
