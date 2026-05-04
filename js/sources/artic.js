import { httpJson, matchesAllQueryWords, buildDescription, stripHtml } from './base.js';
import { iiifImageUrl } from '../iiif.js';

const SEARCH_ENDPOINT = 'https://api.artic.edu/api/v1/artworks/search';
const IIIF_BASE = 'https://www.artic.edu/iiif/2';
const FIELDS = [
  'id', 'title', 'artist_display', 'date_display', 'description',
  'image_id', 'is_public_domain', 'credit_line', 'department_title',
  'medium_display', 'thumbnail',
].join(',');

function itemHaystack(item) {
  return [
    item.title,
    item.artist_display,
    stripHtml(item.description),
    item.medium_display,
    item.department_title,
    item.credit_line,
  ].filter(Boolean).join(' ');
}

function normalize(item) {
  if (!item.image_id) return null;          // not all results have viewable images
  if (!item.is_public_domain) return null;  // hide rights-restricted items
  return {
    id: `artic:${item.id}`,
    sourceId: 'artic',
    sourceName: 'Art Institute of Chicago',
    thumbnailUrl: iiifImageUrl(`${IIIF_BASE}/${item.image_id}`, '400,'),
    fullUrl:      iiifImageUrl(`${IIIF_BASE}/${item.image_id}`, '1500,'),
    width: null,
    height: null,
    title: item.title || 'Untitled',
    creator: (item.artist_display || '').split('\n')[0] || null,
    sourceUrl: `https://www.artic.edu/artworks/${item.id}`,
    license: 'cc0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    description: buildDescription(
      item.date_display ? `Date: ${item.date_display}` : null,
      item.medium_display ? `Medium: ${item.medium_display}` : null,
      item.department_title ? `Department: ${item.department_title}` : null,
      stripHtml(item.description) || null,
      item.credit_line ? `Credit: ${item.credit_line}` : null,
    ),
  };
}

export default {
  id: 'artic',
  displayName: 'Art Institute',
  category: 'art',
  requiresKey: false,
  rateLimit: { requestsPerSecond: 5 },
  cacheTtlMs: 6 * 60 * 60 * 1000,
  cacheVersion: 2,   // bumped: client-side relevance filter

  async search(query, { page = 1, perPage = 20, strict = false, signal } = {}) {
    const params = new URLSearchParams({
      q: query,
      limit: String(perPage),
      page: String(page),
      fields: FIELDS,
      'query[term][is_public_domain]': 'true',
    });
    const data = await httpJson(`${SEARCH_ENDPOINT}?${params}`, { signal });
    const results = (data.data || [])
      .filter((it) => matchesAllQueryWords(query, itemHaystack(it), { strict }))
      .map(normalize)
      .filter(Boolean);
    const total = data.pagination?.total ?? null;
    return {
      results,
      hasMore: total != null && page * perPage < total,
      totalCount: total,
    };
  },
};
