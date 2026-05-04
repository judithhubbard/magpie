import { httpJson, matchesAllQueryWords, buildDescription } from './base.js';
import { normalizeLicenseCode } from '../attribution.js';
import { iiifImageUrl, IIIF_THUMB } from '../iiif.js';

const ENDPOINT = 'https://api.wellcomecollection.org/catalogue/v2/images';

const ALL_LICENSES = ['cc-by', 'cc-by-sa', 'cc-by-nd', 'cc-by-nc', 'cc-by-nc-sa', 'cc-by-nc-nd', 'pdm', 'cc0'];
function pickLicenses({ commercial, derivatives }) {
  let l = ALL_LICENSES;
  if (commercial)  l = l.filter((c) => !c.includes('-nc'));
  if (derivatives) l = l.filter((c) => !c.endsWith('-nd'));
  return l;
}

// Wellcome's search ranks via authority-record linkage; a search for "Van
// Gogh" returns items whose subject (e.g., "Gachet, Paul Ferdinand") is
// catalogued as Van-Gogh-related but where neither query word actually
// appears in the item's own metadata. Filter those out.
function itemHaystack(item) {
  const src = item.source || {};
  const contributors = (src.contributors || []).map((c) => c.agent?.label || '').join(' ');
  const subjects     = (src.subjects     || []).map((s) => s.label || '').join(' ');
  return [src.title, contributors, subjects].filter(Boolean).join(' ');
}

function normalize(item) {
  const loc = item.locations?.[0];
  if (!loc?.url) return null;
  const license = normalizeLicenseCode(loc.license?.id || loc.license?.url);
  const src = item.source || {};
  const contributors = (src.contributors || [])
    .map((c) => c.agent?.label)
    .filter(Boolean)
    .join(', ') || null;
  return {
    id: `wellcome:${item.id}`,
    sourceId: 'wellcome',
    sourceName: 'Wellcome Collection',
    thumbnailUrl: iiifImageUrl(loc.url, IIIF_THUMB),
    fullUrl:      iiifImageUrl(loc.url, '1500,'),
    width: null,
    height: null,
    title: src.title || 'Untitled',
    creator: contributors,
    sourceUrl: `https://wellcomecollection.org/works/${src.id || item.id}`,
    license,
    licenseUrl: loc.license?.url || null,
    description: buildDescription(
      loc.credit ? `Credit: ${loc.credit}` : null,
      loc.license?.label || null,
    ),
  };
}

export default {
  id: 'wellcome',
  displayName: 'Wellcome',
  category: 'science',
  requiresKey: false,
  rateLimit: { requestsPerSecond: 5 },
  cacheTtlMs: 6 * 60 * 60 * 1000,
  cacheVersion: 2,   // bumped: client-side relevance filter

  async search(query, { page = 1, perPage = 20, commercial, derivatives, strict = false, signal } = {}) {
    const params = new URLSearchParams({
      query,
      page: String(page),
      pageSize: String(perPage),
      'locations.license': pickLicenses({ commercial, derivatives }).join(','),
      include: 'source.contributors',
    });
    const data = await httpJson(`${ENDPOINT}?${params}`, { signal });
    const results = (data.results || [])
      .filter((it) => matchesAllQueryWords(query, itemHaystack(it), { strict }))
      .map(normalize)
      .filter(Boolean);
    const total = data.totalResults ?? null;
    return {
      results,
      hasMore: total != null && page * perPage < total,
      totalCount: total,
    };
  },
};
