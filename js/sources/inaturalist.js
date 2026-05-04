import { httpJson, buildDescription } from './base.js';
import { normalizeLicenseCode, licenseUrlFromCode } from '../attribution.js';

const ENDPOINT = 'https://api.inaturalist.org/v1/observations';

const ALL_CC_LICENSES = ['cc0', 'cc-by', 'cc-by-sa', 'cc-by-nd', 'cc-by-nc', 'cc-by-nc-sa', 'cc-by-nc-nd'];

function pickLicensesForFilter({ commercial, derivatives }) {
  let licenses = ALL_CC_LICENSES;
  if (commercial)  licenses = licenses.filter((c) => !c.includes('-nc'));
  if (derivatives) licenses = licenses.filter((c) => !c.endsWith('-nd'));
  return licenses;
}

function upgradeUrl(url, size) {
  if (!url) return null;
  return url.replace(/\/(square|small|medium|large|original)\.(jpg|jpeg|png|gif)(?=$|\?)/i, `/${size}.$2`);
}

function normalize(observation) {
  const photo = (observation.photos || []).find((p) => p.license_code);
  if (!photo) return null;
  const license = normalizeLicenseCode(photo.license_code);
  const taxon = observation.taxon || {};
  const title = taxon.preferred_common_name || taxon.name || 'Observation';
  const creator = observation.user?.name || observation.user?.login || null;

  // Build a description: scientific name + observer notes (if either differs
  // from what's already shown in the title).
  const sciName = taxon.name && taxon.name !== title ? `Scientific name: ${taxon.name}` : null;
  const place = observation.place_guess ? `Observed at: ${observation.place_guess}` : null;
  const obsDescription = (observation.description || '').trim() || null;
  const description = buildDescription(sciName, place, obsDescription);

  return {
    id: `inaturalist:${observation.id}-${photo.id}`,
    sourceId: 'inaturalist',
    sourceName: 'iNaturalist',
    thumbnailUrl: upgradeUrl(photo.url, 'medium'),
    fullUrl: upgradeUrl(photo.url, 'large') || upgradeUrl(photo.url, 'original'),
    width: photo.original_dimensions?.width ?? null,
    height: photo.original_dimensions?.height ?? null,
    title,
    creator,
    sourceUrl: observation.uri,
    license,
    licenseUrl: licenseUrlFromCode(license),
    description,
  };
}

export default {
  id: 'inaturalist',
  displayName: 'iNaturalist',
  category: 'science',
  requiresKey: false,
  rateLimit: { requestsPerSecond: 1, requestsPerHour: 6000 },
  cacheTtlMs: 60 * 60 * 1000,
  cacheVersion: 2,   // bumped when search semantics changed (added search_on=names)

  async search(query, { page = 1, perPage = 20, commercial, derivatives, signal } = {}) {
    const params = new URLSearchParams({
      q: query,
      // Without `search_on=names`, iNat matches across user notes / place
      // names / tags too, surfacing irrelevant results (e.g. an observation of
      // morels mentioning "lesser celandine" in its notes). Restrict to taxon
      // name matches for image-search use.
      search_on: 'names',
      photos: 'true',
      photo_license: pickLicensesForFilter({ commercial, derivatives }).join(','),
      per_page: String(perPage),
      page: String(page),
      order_by: 'votes',
    });
    const data = await httpJson(`${ENDPOINT}?${params}`, { signal });
    const results = (data.results || []).map(normalize).filter(Boolean);
    const total = data.total_results ?? null;
    return {
      results,
      hasMore: total != null && page * perPage < total,
      totalCount: total,
    };
  },
};
