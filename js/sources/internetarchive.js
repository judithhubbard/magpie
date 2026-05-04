import { httpJson, matchesAllQueryWords, buildDescription, looksAdult } from './base.js';
import { normalizeLicenseCode } from '../attribution.js';

const ENDPOINT = 'https://archive.org/advancedsearch.php';

// IA returns items with any kind of license URL when you ask for licenseurl:*.
// We keep only ones whose URL is a Creative Commons or public-domain URL —
// IA also hosts in-copyright items (rightsstatements.org/InC/...) that we
// must exclude.
function isCcLikeLicense(url) {
  return typeof url === 'string' && url.includes('creativecommons.org');
}

function itemHaystack(doc) {
  const desc = Array.isArray(doc.description) ? doc.description.join(' ') : doc.description;
  const subj = Array.isArray(doc.subject)     ? doc.subject.join(' ')     : doc.subject;
  return [doc.title, desc, subj].filter(Boolean).join(' ');
}

function normalize(doc) {
  if (!doc.identifier) return null;
  if (!isCcLikeLicense(doc.licenseurl)) return null;
  const license = normalizeLicenseCode(doc.licenseurl);
  const desc = Array.isArray(doc.description) ? doc.description.join('\n') : doc.description;
  return {
    id: `ia:${doc.identifier}`,
    sourceId: 'internetarchive',
    sourceName: 'Internet Archive',
    thumbnailUrl: `https://archive.org/services/img/${encodeURIComponent(doc.identifier)}`,
    fullUrl:      `https://archive.org/services/img/${encodeURIComponent(doc.identifier)}`,
    width: null,
    height: null,
    title: doc.title || doc.identifier,
    creator: Array.isArray(doc.creator) ? doc.creator.join(', ') : doc.creator || null,
    sourceUrl: `https://archive.org/details/${encodeURIComponent(doc.identifier)}`,
    license,
    licenseUrl: doc.licenseurl,
    description: buildDescription(
      doc.date ? `Date: ${doc.date}` : null,
      desc || null,
    ),
  };
}

export default {
  id: 'internetarchive',
  displayName: 'Internet Archive',
  category: 'historical',
  requiresKey: false,
  rateLimit: { requestsPerSecond: 5 },
  cacheTtlMs: 6 * 60 * 60 * 1000,
  cacheVersion: 2,   // bumped: client-side adult-content filter

  async search(query, { page = 1, perPage = 20, strict = false, safeSearch = true, signal } = {}) {
    const q = `(${query}) AND mediatype:image AND licenseurl:[* TO *]`;
    const params = new URLSearchParams({
      q,
      output: 'json',
      rows: String(perPage),
      page: String(page),
    });
    // fl[] needs to be appended multiple times.
    for (const f of ['identifier', 'title', 'creator', 'description', 'date', 'licenseurl', 'subject']) {
      params.append('fl[]', f);
    }
    const data = await httpJson(`${ENDPOINT}?${params}`, { signal });
    const docs = data.response?.docs || [];
    const results = docs
      .filter((d) => !safeSearch || !looksAdult(itemHaystack(d)))
      .filter((d) => matchesAllQueryWords(query, itemHaystack(d), { strict }))
      .map(normalize)
      .filter(Boolean);
    const total = data.response?.numFound ?? null;
    return {
      results,
      hasMore: total != null && page * perPage < total,
      totalCount: total,
    };
  },
};
