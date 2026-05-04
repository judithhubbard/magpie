import { httpJson } from './base.js';
import { normalizeLicenseCode } from '../attribution.js';

const SEARCH_ENDPOINT = 'https://api.iconify.design/search';
const RENDER_BASE     = 'https://api.iconify.design';

function normalizeIcon(iconRef, collections) {
  // iconRef format: "prefix:name"
  const [prefix, name] = String(iconRef || '').split(':');
  if (!prefix || !name) return null;
  const collection = collections[prefix] || {};
  const license = normalizeLicenseCode(collection.license?.spdx || collection.license?.title);
  if (!license) return null;
  const author = collection.author?.name || null;
  return {
    id: `iconify:${iconRef}`,
    sourceId: 'iconify',
    sourceName: `Iconify · ${collection.name || prefix}`,
    thumbnailUrl: `${RENDER_BASE}/${prefix}/${name}.svg?width=128`,
    fullUrl:      `${RENDER_BASE}/${prefix}/${name}.svg?width=512`,
    width: null,
    height: null,
    title: name.replace(/-/g, ' '),
    creator: author,
    sourceUrl: `https://icon-sets.iconify.design/${prefix}/${encodeURIComponent(name)}/`,
    license,
    licenseUrl: collection.license?.url || null,
    description: [
      collection.name ? `Icon set: ${collection.name}` : null,
      author && collection.author?.url ? `Author: ${author} (${collection.author.url})` : (author ? `Author: ${author}` : null),
      collection.license?.title ? `License: ${collection.license.title}` : null,
    ].filter(Boolean).join('\n') || null,
  };
}

export default {
  id: 'iconify',
  displayName: 'Iconify',
  category: 'icons',
  requiresKey: false,
  supportsVector: true,
  rateLimit: { requestsPerSecond: 5 },
  cacheTtlMs: 24 * 60 * 60 * 1000,   // icons & licenses are very stable
  cacheVersion: 1,

  async search(query, { page = 1, perPage = 20, signal } = {}) {
    // Iconify's search caps `limit` at 999 and supports `start` for paging.
    const params = new URLSearchParams({
      query,
      limit: String(perPage),
      start: String((page - 1) * perPage),
    });
    const data = await httpJson(`${SEARCH_ENDPOINT}?${params}`, { signal });
    const collections = data.collections || {};
    const results = (data.icons || [])
      .map((ref) => normalizeIcon(ref, collections))
      .filter(Boolean);
    const total = data.total ?? null;
    return {
      results,
      hasMore: total != null && page * perPage < total,
      totalCount: total,
    };
  },
};
