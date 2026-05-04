import { httpJson, matchesAllQueryWords, buildDescription } from './base.js';

const ENDPOINT = 'https://search.idigbio.org/v2/search/records';
const MEDIA_BASE = 'https://api.idigbio.org/v2/media';

// iDigBio's fulltext search expands across many indexed fields including
// locality, collector, and notes — so a query like "Ithaca Falls" can match
// a fungus specimen collected near Ithaca even though neither word is in
// its taxonomy. Filter results down to those whose taxonomic identity
// (common name / scientific name / family) actually matches the query.
function recordHaystack(record) {
  const data = record.data || {};
  const idx = record.indexTerms || {};
  return [
    data['dwc:vernacularName'] || idx.commonname,
    data['dwc:scientificName'] || idx.scientificname,
    data['dwc:family']         || idx.family,
    data['dwc:genus']          || idx.genus,
  ].filter(Boolean).join(' ');
}

function normalize(record) {
  const mediaUuid = record.indexTerms?.mediarecords?.[0];
  if (!mediaUuid) return null;
  const data = record.data || {};
  const sciName = data['dwc:scientificName'] || record.indexTerms?.scientificname || null;
  const commonName = data['dwc:vernacularName'] || record.indexTerms?.commonname;
  const family = data['dwc:family'] || record.indexTerms?.family;
  const country = data['dwc:country'] || record.indexTerms?.country;
  const institution = data['dwc:institutionCode'] || record.indexTerms?.institutioncode;
  return {
    id: `idigbio:${record.uuid}`,
    sourceId: 'idigbio',
    sourceName: 'iDigBio',
    thumbnailUrl: `${MEDIA_BASE}/${mediaUuid}?size=thumbnail`,
    fullUrl:      `${MEDIA_BASE}/${mediaUuid}?size=fullsize`,
    width: null,
    height: null,
    title: commonName || sciName || 'Specimen',
    creator: data['dwc:recordedBy'] || institution || null,
    sourceUrl: `https://www.idigbio.org/portal/records/${record.uuid}`,
    // iDigBio aggregates from US natural history collections; most are PD
    // for digital reproductions but rights vary — caveat in description.
    license: 'pdm',
    licenseUrl: 'https://creativecommons.org/publicdomain/mark/1.0/',
    description: buildDescription(
      sciName ? `Scientific name: ${sciName}` : null,
      family ? `Family: ${family}` : null,
      data['dwc:basisOfRecord'] ? `Basis: ${data['dwc:basisOfRecord'].toLowerCase()}` : null,
      institution ? `Institution: ${institution}` : null,
      country ? `Country: ${country}` : null,
      'Note: iDigBio specimen rights vary by source institution — verify on the source page before commercial use.',
    ),
  };
}

export default {
  id: 'idigbio',
  displayName: 'iDigBio',
  category: 'science',
  requiresKey: false,
  rateLimit: { requestsPerSecond: 3 },
  cacheTtlMs: 6 * 60 * 60 * 1000,
  cacheVersion: 2,   // bumped: client-side relevance filter on taxonomy

  async search(query, { page = 1, perPage = 20, strict = false, signal } = {}) {
    // iDigBio's `mq` substring-match is unreliable (returns all records for
    // many inputs). `rq` with `type: fulltext` works correctly on
    // scientificname; for common names we fall back to exact-match.
    const tryQuery = async (rq) => {
      const params = new URLSearchParams({
        rq: JSON.stringify(rq),
        limit: String(perPage),
        offset: String((page - 1) * perPage),
      });
      return httpJson(`${ENDPOINT}?${params}`, { signal });
    };

    // Try exact common-name match first (best for English queries like
    // "fox" or "oak"). iDigBio's scientificname fulltext does aggressive
    // tokenization that matches unrelated taxa, so we use it only as a
    // fallback for genus/species-style queries.
    let data = await tryQuery({ hasImage: true, commonname: query });

    if (!data.items?.length) {
      data = await tryQuery({
        hasImage: true,
        scientificname: { type: 'fulltext', value: query },
      });
    }

    const results = (data.items || [])
      .filter((it) => matchesAllQueryWords(query, recordHaystack(it), { strict }))
      .map(normalize)
      .filter(Boolean);
    const total = data.itemCount ?? null;
    return {
      results,
      hasMore: total != null && page * perPage < total,
      totalCount: total,
    };
  },
};
