import { httpJson } from './base.js';

const ENDPOINT = 'https://images-api.nasa.gov/search';

function findLink(links, rel) {
  return links?.find((l) => l.rel === rel && l.render === 'image')?.href || null;
}

function deriveOriginalUrl(thumbUrl) {
  if (!thumbUrl) return null;
  return thumbUrl.replace(/~(thumb|small|medium|large)\.(jpg|jpeg|png|gif)(?=$|\?)/i, '~orig.$2');
}

function normalize(item) {
  const data = item.data?.[0] || {};
  const thumb = findLink(item.links, 'preview');
  if (!thumb) return null;
  const canonical = findLink(item.links, 'canonical') || deriveOriginalUrl(thumb);
  const credit = data.secondary_creator || data.center || 'NASA';
  return {
    id: `nasa:${data.nasa_id}`,
    sourceId: 'nasa',
    sourceName: 'NASA',
    thumbnailUrl: thumb,
    fullUrl: canonical || thumb,
    width: null,    // not present in search response
    height: null,
    title: data.title || 'Untitled',
    creator: credit,
    sourceUrl: `https://images.nasa.gov/details/${encodeURIComponent(data.nasa_id || '')}`,
    license: 'pdm',   // most NASA imagery; lightbox notes verification
    licenseUrl: 'https://www.nasa.gov/nasa-brand-center/images-and-media/',
    description: data.description || null,
  };
}

export default {
  id: 'nasa',
  displayName: 'NASA',
  category: 'science',
  requiresKey: false,
  rateLimit: { requestsPerSecond: 5, requestsPerHour: 1000 },
  cacheTtlMs: 6 * 60 * 60 * 1000,   // NASA collection is stable; cache longer

  async search(query, { page = 1, perPage = 20, signal } = {}) {
    const params = new URLSearchParams({
      q: query,
      media_type: 'image',
      page: String(page),
      page_size: String(perPage),
    });
    const data = await httpJson(`${ENDPOINT}?${params}`, { signal });
    const items = data.collection?.items || [];
    const results = items.map(normalize).filter(Boolean);
    const total = data.collection?.metadata?.total_hits ?? null;
    return {
      results,
      hasMore: total != null && page * perPage < total,
      totalCount: total,
    };
  },
};
