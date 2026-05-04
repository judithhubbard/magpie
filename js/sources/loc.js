import { httpJson, matchesAllQueryWords, buildDescription, looksAdult } from './base.js';

const ENDPOINT = 'https://www.loc.gov/photos/';

// LOC returns image_url as an array of multiple sizes (smallest first,
// roughly). Strip URL fragments (LOC appends #h=...&w=... metadata).
function pickThumbAndFull(imageUrls) {
  if (!Array.isArray(imageUrls) || imageUrls.length === 0) return { thumb: null, full: null };
  const clean = imageUrls.map((u) => String(u).split('#')[0]);
  return { thumb: clean[0], full: clean[clean.length - 1] };
}

// Real LOC image content is served from tile.loc.gov; placeholder icons
// (group-of-images.svg, book.svg, etc.) and collection homepage cards live
// under www.loc.gov/static/. Only accept tile.loc.gov URLs as real images.
function isRealImage(url) {
  return typeof url === 'string' && url.includes('://tile.loc.gov/');
}

function asString(maybeArray) {
  if (Array.isArray(maybeArray)) return maybeArray.filter(Boolean).join(', ');
  return maybeArray || null;
}

function itemHaystack(item) {
  return [
    item.title,
    Array.isArray(item.description) ? item.description.join(' ') : item.description,
    Array.isArray(item.subject)     ? item.subject.join(' ')     : item.subject,
  ].filter(Boolean).join(' ');
}

function normalize(item) {
  const { thumb, full } = pickThumbAndFull(item.image_url);
  if (!thumb || !isRealImage(thumb)) return null;
  const description = Array.isArray(item.description) ? item.description.join('\n') : item.description || null;
  const date = item.date || (Array.isArray(item.dates) ? item.dates[0] : null);
  const partOf = (Array.isArray(item.partof) ? item.partof : []).slice(0, 3);
  return {
    id: `loc:${item.id}`,
    sourceId: 'loc',
    sourceName: 'Library of Congress',
    thumbnailUrl: thumb,
    fullUrl: full,
    width: null,
    height: null,
    title: item.title || 'Untitled',
    creator: asString(item.contributor) || asString(item.creator) || null,
    sourceUrl: item.id,   // LOC's `id` is already a URL like http://www.loc.gov/item/...
    license: 'pdm',
    licenseUrl: 'https://www.loc.gov/legal/',
    description: buildDescription(
      date ? `Date: ${date}` : null,
      description,
      partOf.length ? `From: ${partOf.join(', ')}` : null,
      'Note: most LOC digitized items have no known copyright restrictions, but rights vary — verify on the source page.',
    ),
  };
}

export default {
  id: 'loc',
  displayName: 'Library of Congress',
  category: 'historical',
  requiresKey: false,
  rateLimit: { requestsPerSecond: 5 },
  cacheTtlMs: 6 * 60 * 60 * 1000,
  cacheVersion: 5,   // bumped: client-side adult-content filter

  async search(query, { page = 1, perPage = 20, strict = false, safeSearch = true, signal } = {}) {
    const params = new URLSearchParams({
      q: query,
      fo: 'json',
      c: String(perPage),
      sp: String(page),
    });
    const data = await httpJson(`${ENDPOINT}?${params}`, { signal });
    const results = (data.results || [])
      .filter((it) => !safeSearch || !looksAdult(itemHaystack(it)))
      .filter((it) => matchesAllQueryWords(query, itemHaystack(it), { strict }))
      .map(normalize)
      .filter(Boolean);
    const totalPages = data.pagination?.of ?? 0;
    return {
      results,
      hasMore: page < totalPages,
      totalCount: data.pagination?.total ?? null,
    };
  },
};
