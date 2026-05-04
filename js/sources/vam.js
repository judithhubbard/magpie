import { httpJson, matchesAllQueryWords, buildDescription } from './base.js';
import { iiifImageUrl, IIIF_THUMB, IIIF_FULL } from '../iiif.js';

const SEARCH_ENDPOINT = 'https://api.vam.ac.uk/v2/objects/search';

function itemHaystack(item) {
  const maker = item._primaryMaker?.name || '';
  return [
    item._primaryTitle,
    maker,
    item.objectType,
    item._primaryPlace,
  ].filter(Boolean).join(' ');
}

function normalize(item) {
  const base = item._images?._iiif_image_base_url;
  if (!base) return null;
  const maker = item._primaryMaker?.name || null;
  return {
    id: `vam:${item.systemNumber}`,
    sourceId: 'vam',
    sourceName: 'V&A',
    thumbnailUrl: iiifImageUrl(base, IIIF_THUMB),
    fullUrl:      iiifImageUrl(base, IIIF_FULL),
    width: null,
    height: null,
    title: item._primaryTitle || item.objectType || 'Untitled',
    creator: maker,
    sourceUrl: `https://collections.vam.ac.uk/item/${encodeURIComponent(item.systemNumber)}/`,
    // V&A's free-access images are CC BY-NC 2.0 UK by default. Higher-res
    // and commercial use require V&A licensing.
    license: 'by-nc',
    licenseUrl: 'https://creativecommons.org/licenses/by-nc/2.0/uk/',
    description: buildDescription(
      item.objectType ? `Object: ${item.objectType}` : null,
      item._primaryDate ? `Date: ${item._primaryDate}` : null,
      item._primaryPlace ? `Place: ${item._primaryPlace}` : null,
      item.accessionNumber ? `Accession no.: ${item.accessionNumber}` : null,
      'Note: V&A images are CC BY-NC 2.0 UK (non-commercial). Commercial use requires V&A licensing.',
    ),
  };
}

export default {
  id: 'vam',
  displayName: 'V&A',
  category: 'art',
  requiresKey: false,
  rateLimit: { requestsPerSecond: 5 },
  cacheTtlMs: 6 * 60 * 60 * 1000,
  cacheVersion: 1,

  async search(query, { page = 1, perPage = 20, strict = false, signal } = {}) {
    const params = new URLSearchParams({
      q: query,
      page: String(page),
      page_size: String(perPage),
      images_exist: 'true',
    });
    const data = await httpJson(`${SEARCH_ENDPOINT}?${params}`, { signal });
    const results = (data.records || [])
      .filter((it) => matchesAllQueryWords(query, itemHaystack(it), { strict }))
      .map(normalize)
      .filter(Boolean);
    const total = data.info?.record_count ?? null;
    return {
      results,
      hasMore: total != null && page * perPage < total,
      totalCount: total,
    };
  },
};
