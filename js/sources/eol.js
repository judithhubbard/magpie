import { httpJson, buildDescription } from './base.js';
import { normalizeLicenseCode } from '../attribution.js';

// EOL needs two API calls per "page": one search call to find taxa, then
// one detail call per taxon to fetch its images. We cap both fanouts to
// keep the load bounded.
const SEARCH_ENDPOINT = 'https://eol.org/api/search/1.0.json';
const PAGE_ENDPOINT   = 'https://eol.org/api/pages/1.0';
const TAXA_PER_PAGE   = 4;
const IMAGES_PER_TAXON = 6;

const ALL_LICENSES = ['cc-by', 'cc-by-sa', 'cc-by-nd', 'cc-by-nc', 'cc-by-nc-sa', 'cc-by-nc-nd', 'pd', 'cc-zero'];
function pickLicenses({ commercial, derivatives }) {
  let l = ALL_LICENSES;
  if (commercial)  l = l.filter((c) => !c.includes('-nc'));
  if (derivatives) l = l.filter((c) => !c.endsWith('-nd'));
  return l;
}

function normalizeImage(taxon, dataObject) {
  if (!dataObject.eolMediaURL) return null;
  if (!String(dataObject.dataType || '').endsWith('StillImage')) return null;
  const license = normalizeLicenseCode(dataObject.license);
  if (!license) return null;
  const creator = dataObject.rightsHolder
    || dataObject.agents?.find((a) => a.role === 'photographer')?.full_name
    || dataObject.agents?.[0]?.full_name
    || null;
  return {
    id: `eol:${dataObject.identifier}`,
    sourceId: 'eol',
    sourceName: 'Encyclopedia of Life',
    thumbnailUrl: dataObject.eolThumbnailURL || dataObject.eolMediaURL,
    fullUrl: dataObject.eolMediaURL,
    width: dataObject.width || null,
    height: dataObject.height || null,
    title: dataObject.title || taxon.scientificName || 'Untitled',
    creator,
    sourceUrl: dataObject.source || `https://eol.org/pages/${taxon.identifier}`,
    license,
    licenseUrl: dataObject.license,
    description: buildDescription(
      taxon.scientificName ? `Scientific name: ${taxon.scientificName}` : null,
      dataObject.description || null,
    ),
  };
}

export default {
  id: 'eol',
  displayName: 'EOL',
  category: 'science',
  requiresKey: false,
  rateLimit: { requestsPerSecond: 3 },
  cacheTtlMs: 6 * 60 * 60 * 1000,
  cacheVersion: 1,

  async search(query, { page = 1, perPage = 20, commercial, derivatives, signal } = {}) {
    // Step 1: search for matching taxa.
    const searchParams = new URLSearchParams({ q: query, page: String(page) });
    const searchData = await httpJson(`${SEARCH_ENDPOINT}?${searchParams}`, { signal });
    const taxa = (searchData.results || []).slice(0, TAXA_PER_PAGE);
    if (!taxa.length) return { results: [], hasMore: false, totalCount: 0 };

    // Step 2: fetch images for each top taxon in parallel.
    const licenses = pickLicenses({ commercial, derivatives }).join('|');
    const concepts = await Promise.all(
      taxa.map(async (t) => {
        try {
          const params = new URLSearchParams({
            images_per_page: String(IMAGES_PER_TAXON),
            details: 'true',
            taxonomy: 'false',
            synonyms: 'false',
            vernacular_names: 'false',
            licenses,
            cache_ttl: '3600',
          });
          const d = await httpJson(`${PAGE_ENDPOINT}/${t.id}.json?${params}`, { signal });
          return d.taxonConcept || null;
        } catch {
          return null;
        }
      })
    );

    const results = [];
    for (const tc of concepts) {
      if (!tc?.dataObjects) continue;
      for (const obj of tc.dataObjects) {
        const img = normalizeImage(tc, obj);
        if (img) results.push(img);
      }
    }

    const itemsPerPage = searchData.itemsPerPage || 30;
    const totalResults = searchData.totalResults || 0;
    return {
      results,
      hasMore: page * itemsPerPage < totalResults,
      totalCount: totalResults,
    };
  },
};
