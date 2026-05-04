import { httpJson, matchesAllQueryWords, buildDescription } from './base.js';

const ENDPOINT = 'https://openaccess-api.clevelandart.org/api/artworks/';

function itemHaystack(item) {
  const creators = (item.creators || []).map((c) => c.description || '').join(' ');
  return [
    item.title,
    creators,
    item.description,
    item.technique,
    item.department,
    item.creditline,
    item.culture,
  ].filter(Boolean).join(' ');
}

function normalize(item) {
  const images = item.images || {};
  const web = images.web?.url;
  const print = images.print?.url;
  if (!web) return null;
  const creators = (item.creators || []).map((c) => c.description).filter(Boolean).join('; ') || null;
  return {
    id: `cleveland:${item.id}`,
    sourceId: 'cleveland',
    sourceName: 'Cleveland Museum of Art',
    thumbnailUrl: web,
    fullUrl: print || web,    // skip `full` (TIFF — not browser-renderable)
    width: images.web?.width ? Number(images.web.width) : null,
    height: images.web?.height ? Number(images.web.height) : null,
    title: item.title || 'Untitled',
    creator: creators,
    sourceUrl: item.url,
    license: 'cc0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    description: buildDescription(
      item.creation_date ? `Date: ${item.creation_date}` : null,
      item.technique ? `Technique: ${item.technique}` : null,
      item.department ? `Department: ${item.department}` : null,
      item.description || null,
      item.creditline ? `Credit: ${item.creditline}` : null,
    ),
  };
}

export default {
  id: 'cleveland',
  displayName: 'Cleveland Art',
  category: 'art',
  requiresKey: false,
  rateLimit: { requestsPerSecond: 5 },
  cacheTtlMs: 6 * 60 * 60 * 1000,
  cacheVersion: 2,   // bumped: client-side relevance filter

  async search(query, { page = 1, perPage = 20, strict = false, signal } = {}) {
    const params = new URLSearchParams({
      q: query,
      limit: String(perPage),
      skip: String((page - 1) * perPage),
      has_image: '1',
      cc0: '1',
    });
    const data = await httpJson(`${ENDPOINT}?${params}`, { signal });
    const results = (data.data || [])
      .filter((it) => matchesAllQueryWords(query, itemHaystack(it), { strict }))
      .map(normalize)
      .filter(Boolean);
    const total = data.info?.total ?? null;
    return {
      results,
      hasMore: total != null && page * perPage < total,
      totalCount: total,
    };
  },
};
