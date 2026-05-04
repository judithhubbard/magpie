import { httpJson, buildDescription } from './base.js';

const ENDPOINT = 'https://pixabay.com/api/';

function normalize(item) {
  return {
    id: `pixabay:${item.id}`,
    sourceId: 'pixabay',
    sourceName: 'Pixabay',
    thumbnailUrl: item.webformatURL || item.previewURL,
    fullUrl:      item.largeImageURL || item.webformatURL,
    width: item.imageWidth ?? null,
    height: item.imageHeight ?? null,
    title: item.tags ? item.tags.split(',').slice(0, 3).map((t) => t.trim()).join(', ') : 'Untitled',
    creator: item.user || null,
    sourceUrl: item.pageURL,
    license: 'pixabay',
    licenseUrl: 'https://pixabay.com/service/license-summary/',
    description: buildDescription(
      item.tags ? `Tags: ${item.tags}` : null,
      item.type ? `Type: ${item.type}` : null,
      'Note: Pixabay Content License — free for any use including commercial. Attribution appreciated.',
    ),
  };
}

export default {
  id: 'pixabay',
  displayName: 'Pixabay',
  category: 'stock',
  requiresKey: true,
  keyHelpUrl: 'https://pixabay.com/api/docs/',
  rateLimit: { requestsPerSecond: 1, requestsPerHour: 5000 },
  // Pixabay's terms require caching responses for at least 24 hours.
  cacheTtlMs: 24 * 60 * 60 * 1000,
  cacheVersion: 1,

  async search(query, { page = 1, perPage = 20, signal, apiKey } = {}) {
    const params = new URLSearchParams({
      key: apiKey,
      q: query,
      page: String(page),
      per_page: String(perPage),
      safesearch: 'true',
    });
    const data = await httpJson(`${ENDPOINT}?${params}`, { signal });
    const results = (data.hits || []).map(normalize).filter((r) => r.thumbnailUrl);
    const total = data.totalHits ?? null;
    return {
      results,
      hasMore: total != null && page * perPage < total,
      totalCount: total,
    };
  },
};
