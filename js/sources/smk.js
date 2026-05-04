import { httpJson, matchesAllQueryWords, buildDescription } from './base.js';
import { normalizeLicenseCode, licenseUrlFromCode } from '../attribution.js';

const ENDPOINT = 'https://api.smk.dk/api/v1/art/search';

function pickTitle(titles) {
  if (!Array.isArray(titles) || !titles.length) return 'Untitled';
  return titles[0]?.title || 'Untitled';
}

function pickCreator(production) {
  if (!Array.isArray(production) || !production.length) return null;
  const names = production.map((p) => p.creator).filter(Boolean);
  return names.join('; ') || null;
}

function pickDate(production_date) {
  if (!Array.isArray(production_date) || !production_date.length) return null;
  return production_date[0]?.period || null;
}

function itemHaystack(item) {
  const titles = (item.titles || []).map((t) => t.title || '').join(' ');
  const creators = (item.production || []).map((p) => p.creator || '').join(' ');
  const desc = Array.isArray(item.content_description)
    ? item.content_description.join(' ')
    : item.content_description || '';
  return [titles, creators, desc].filter(Boolean).join(' ');
}

function normalize(item) {
  if (!item.image_thumbnail) return null;
  const license = normalizeLicenseCode(item.rights) || (item.public_domain ? 'pdm' : null);
  if (!license) return null;
  const description = Array.isArray(item.content_description)
    ? item.content_description.join('\n\n')
    : item.content_description || null;
  return {
    id: `smk:${item.object_number || item.id}`,
    sourceId: 'smk',
    sourceName: 'Statens Museum for Kunst',
    thumbnailUrl: item.image_thumbnail,
    fullUrl: item.image_native || item.image_thumbnail,
    width: item.image_width || null,
    height: item.image_height || null,
    title: pickTitle(item.titles),
    creator: pickCreator(item.production),
    sourceUrl: `https://open.smk.dk/en/artwork/image/${encodeURIComponent(item.object_number || item.id)}`,
    license,
    licenseUrl: item.rights || licenseUrlFromCode(license),
    description: buildDescription(
      pickDate(item.production_date) ? `Date: ${pickDate(item.production_date)}` : null,
      description,
    ),
  };
}

export default {
  id: 'smk',
  displayName: 'SMK',
  category: 'art',
  requiresKey: false,
  rateLimit: { requestsPerSecond: 5 },
  cacheTtlMs: 6 * 60 * 60 * 1000,
  cacheVersion: 2,   // bumped: client-side relevance filter

  async search(query, { page = 1, perPage = 20, strict = false, signal } = {}) {
    const params = new URLSearchParams({
      keys: query,
      offset: String((page - 1) * perPage),
      rows: String(perPage),
      filters: '[has_image:true],[public_domain:true]',
    });
    const data = await httpJson(`${ENDPOINT}?${params}`, { signal });
    const results = (data.items || [])
      .filter((it) => matchesAllQueryWords(query, itemHaystack(it), { strict }))
      .map(normalize)
      .filter(Boolean);
    const total = data.found ?? null;
    return {
      results,
      hasMore: total != null && page * perPage < total,
      totalCount: total,
    };
  },
};
