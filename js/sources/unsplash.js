import { httpJson, buildDescription } from './base.js';

const ENDPOINT = 'https://api.unsplash.com/search/photos';

function normalize(item) {
  const urls = item.urls || {};
  const user = item.user || {};
  return {
    id: `unsplash:${item.id}`,
    sourceId: 'unsplash',
    sourceName: 'Unsplash',
    thumbnailUrl: urls.small || urls.thumb,
    fullUrl:      urls.regular || urls.full || urls.small,
    width: item.width ?? null,
    height: item.height ?? null,
    title: item.description || item.alt_description || 'Untitled',
    creator: user.name || user.username || null,
    sourceUrl: item.links?.html || `https://unsplash.com/photos/${item.id}`,
    license: 'unsplash',
    licenseUrl: 'https://unsplash.com/license',
    description: buildDescription(
      item.description || item.alt_description || null,
      user.location ? `Location: ${user.location}` : null,
      'Note: Unsplash License — attribution to the photographer is appreciated but not required.',
    ),
  };
}

export default {
  id: 'unsplash',
  displayName: 'Unsplash',
  category: 'stock',
  requiresKey: true,
  keyHelpUrl: 'https://unsplash.com/developers',
  rateLimit: { requestsPerSecond: 2, requestsPerHour: 50 },   // demo tier
  cacheTtlMs: 60 * 60 * 1000,
  cacheVersion: 1,

  async search(query, { page = 1, perPage = 20, safeSearch = true, signal, apiKey } = {}) {
    const params = new URLSearchParams({
      query,
      page: String(page),
      per_page: String(perPage),
      content_filter: safeSearch ? 'high' : 'low',
    });
    const data = await httpJson(`${ENDPOINT}?${params}`, {
      signal,
      headers: { Authorization: `Client-ID ${apiKey}` },
    });
    const results = (data.results || []).map(normalize).filter((r) => r.thumbnailUrl);
    const total = data.total ?? null;
    return {
      results,
      hasMore: page < (data.total_pages || 0),
      totalCount: total,
    };
  },
};
