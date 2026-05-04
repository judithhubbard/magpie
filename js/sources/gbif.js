import { httpJson, matchesAllQueryWords, buildDescription } from './base.js';
import { normalizeLicenseCode, licenseUrlFromCode } from '../attribution.js';
import { iiifImageUrl, isIiifHost } from '../iiif.js';

const ENDPOINT = 'https://api.gbif.org/v1/occurrence/search';

// GBIF's `q` param matches across many indexed fields — including locality,
// collector, and dataset descriptions — so a query like "Ithaca Falls" can
// surface a serviceberry collected near Ithaca even though it has nothing
// to do with what the user is searching for. Filter to results whose own
// taxonomic identity actually matches the query words.
//
// Also strip taxonomic authority off scientific names — GBIF's
// `scientificName` is e.g. "Dipogon Fox, 1897" where "Fox" is the namer of
// the species. A "fox" query shouldn't surface insects described by Walter
// Fox just because the surname's in the name.
function stripAuthority(name) {
  if (!name) return name;
  // Cut at the first " Author" pattern: a space followed by a capitalized
  // word that's not part of the canonical Genus-species binomial.
  // Common patterns: " Linnaeus, 1758", " (Fabricius, 1776)", " Fox, 1897"
  return String(name)
    .replace(/\s*\(?[A-Z][^,()]*,\s*\d{3,4}.*$/, '')   // "Author, YYYY" with optional parens
    .trim();
}

function occurrenceHaystack(occ) {
  return [
    occ.species,
    stripAuthority(occ.scientificName),
    occ.genericName,
    occ.family,
    occ.order,
    occ.vernacularName,
    occ.kingdom,
  ].filter(Boolean).join(' ');
}

function pickPhoto(occurrence) {
  // First StillImage media entry with a usable URL.
  const media = occurrence.media || [];
  return media.find((m) => m.type === 'StillImage' && m.identifier) || null;
}

// Known IIIF image servers that host GBIF media. Returning a IIIF-sized URL
// is more reliable than the bare media identifier (which can serve an
// inconsistent default representation).
const IIIF_HOSTS = ['data.nhm.ac.uk'];

function normalize(occurrence) {
  const photo = pickPhoto(occurrence);
  if (!photo) return null;
  const license = normalizeLicenseCode(photo.license || occurrence.license);
  if (!license) return null;
  // Prefer the raw `scientificName` (which often includes a now-synonymized
  // identification) so the user can see why a result matched their query.
  // The accepted/resolved species name (if different) goes in the description.
  const fullSciName = occurrence.scientificName || null;
  const acceptedSpecies = occurrence.species || null;
  const dataset = occurrence.publisher || occurrence.datasetKey || null;
  const iiif = isIiifHost(photo.identifier, IIIF_HOSTS);
  const showAccepted = acceptedSpecies && fullSciName
    && !stripAuthority(fullSciName).toLowerCase().includes(acceptedSpecies.toLowerCase());
  return {
    id: `gbif:${occurrence.key}-${photo.identifier?.slice(-32) || ''}`,
    sourceId: 'gbif',
    sourceName: 'GBIF',
    thumbnailUrl: iiif ? iiifImageUrl(photo.identifier, '!400,400') : photo.identifier,
    fullUrl:      iiif ? iiifImageUrl(photo.identifier, '!1500,1500') : photo.identifier,
    width: null,
    height: null,
    title: fullSciName || acceptedSpecies || photo.title || 'Specimen',
    creator: photo.creator || photo.rightsHolder || null,
    sourceUrl: `https://www.gbif.org/occurrence/${occurrence.key}`,
    license,
    licenseUrl: photo.license || licenseUrlFromCode(license),
    description: buildDescription(
      showAccepted ? `Accepted name: ${acceptedSpecies}` : null,
      occurrence.basisOfRecord ? `Basis: ${occurrence.basisOfRecord.toLowerCase().replace(/_/g, ' ')}` : null,
      dataset ? `Source institution: ${dataset}` : null,
      occurrence.country ? `Country: ${occurrence.country}` : null,
    ),
  };
}

export default {
  id: 'gbif',
  displayName: 'GBIF',
  category: 'science',
  requiresKey: false,
  rateLimit: { requestsPerSecond: 5 },
  cacheTtlMs: 6 * 60 * 60 * 1000,
  cacheVersion: 5,   // bumped: title shows raw scientificName so matches are obvious

  async search(query, { page = 1, perPage = 20, strict = false, signal } = {}) {
    const params = new URLSearchParams({
      q: query,
      mediaType: 'StillImage',
      limit: String(perPage),
      offset: String((page - 1) * perPage),
    });
    const data = await httpJson(`${ENDPOINT}?${params}`, { signal });
    const results = (data.results || [])
      .filter((occ) => matchesAllQueryWords(query, occurrenceHaystack(occ), { strict }))
      .map(normalize)
      .filter(Boolean);
    const total = data.count ?? null;
    return {
      results,
      hasMore: total != null && page * perPage < total,
      totalCount: total,
    };
  },
};
