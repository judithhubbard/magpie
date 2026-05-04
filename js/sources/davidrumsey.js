import { httpJson, matchesAllQueryWords, buildDescription } from './base.js';
import { iiifImageUrl, IIIF_THUMB, IIIF_FULL } from '../iiif.js';

const SEARCH_ENDPOINT = 'https://www.davidrumsey.com/luna/servlet/as/search';
const IIIF_BASE       = 'https://www.davidrumsey.com/luna/servlet/iiif';

function normalize(result) {
  const id = result.id;
  if (!id || result.mediaType !== 'Image') return null;
  const iiifBase = `${IIIF_BASE}/${encodeURIComponent(id)}`;
  return {
    id: `davidrumsey:${id}`,
    sourceId: 'davidrumsey',
    sourceName: 'David Rumsey Map Collection',
    thumbnailUrl: iiifImageUrl(iiifBase, IIIF_THUMB),
    fullUrl:      iiifImageUrl(iiifBase, IIIF_FULL),
    width: null,
    height: null,
    title: result.displayName || 'Map',
    creator: null,
    sourceUrl: `https://www.davidrumsey.com/luna/servlet/detail/${encodeURIComponent(id)}`,
    // Entire David Rumsey collection is CC BY-NC-SA 3.0.
    license: 'by-nc-sa',
    licenseUrl: 'https://creativecommons.org/licenses/by-nc-sa/3.0/',
    description: buildDescription(
      result.description || null,
      'Note: David Rumsey collection is CC BY-NC-SA 3.0 — non-commercial only, derivatives must use the same license.',
    ),
  };
}

export default {
  id: 'davidrumsey',
  displayName: 'David Rumsey Maps',
  category: 'historical',
  requiresKey: false,
  rateLimit: { requestsPerSecond: 3 },
  cacheTtlMs: 6 * 60 * 60 * 1000,
  cacheVersion: 1,

  async search(query, { page = 1, perPage = 20, strict = false, signal } = {}) {
    const params = new URLSearchParams({
      q: query,
      fmt: 'json',
      pps: String(perPage),
      os: String((page - 1) * perPage),
      max: String(perPage),
    });
    const data = await httpJson(`${SEARCH_ENDPOINT}?${params}`, { signal });
    const total = parseInt(data.totalResults, 10) || null;
    const results = (data.results || [])
      .filter((r) => matchesAllQueryWords(query, r.displayName || '', { strict }))
      .map(normalize)
      .filter(Boolean);
    return {
      results,
      hasMore: total != null && page * perPage < total,
      totalCount: total,
    };
  },
};
