import { httpJson, buildDescription } from './base.js';

const ENDPOINT = 'https://api.pexels.com/v1/search';

function normalize(photo) {
  const src = photo.src || {};
  return {
    id: `pexels:${photo.id}`,
    sourceId: 'pexels',
    sourceName: 'Pexels',
    thumbnailUrl: src.medium || src.small,
    fullUrl:      src.large2x || src.large || src.medium,
    width: photo.width ?? null,
    height: photo.height ?? null,
    title: photo.alt || `Photo by ${photo.photographer || 'Unknown'}`,
    creator: photo.photographer || null,
    sourceUrl: photo.url,
    license: 'pexels',
    licenseUrl: 'https://www.pexels.com/license/',
    description: buildDescription(
      photo.alt || null,
      photo.photographer_url ? `Photographer page: ${photo.photographer_url}` : null,
      'Note: Pexels License — attribution appreciated but not required.',
    ),
  };
}

export default {
  id: 'pexels',
  displayName: 'Pexels',
  category: 'stock',
  requiresKey: true,
  keyHelpUrl: 'https://www.pexels.com/api/',
  rateLimit: { requestsPerSecond: 5, requestsPerHour: 200 },
  cacheTtlMs: 60 * 60 * 1000,
  cacheVersion: 1,

  async search(query, { page = 1, perPage = 20, signal, apiKey } = {}) {
    const params = new URLSearchParams({
      query,
      page: String(page),
      per_page: String(perPage),
    });
    const data = await httpJson(`${ENDPOINT}?${params}`, {
      signal,
      headers: { Authorization: apiKey },
    });
    const results = (data.photos || []).map(normalize).filter((r) => r.thumbnailUrl);
    const total = data.total_results ?? null;
    return {
      results,
      hasMore: !!data.next_page,
      totalCount: total,
    };
  },
};
