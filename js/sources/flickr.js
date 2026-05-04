import { httpJson, buildDescription } from './base.js';

const ENDPOINT = 'https://api.flickr.com/services/rest/';

// Flickr license IDs → our normalized codes.
// https://www.flickr.com/services/api/flickr.photos.licenses.getInfo.html
const LICENSE_MAP = {
  '1':  'by-nc-sa',
  '2':  'by-nc',
  '3':  'by-nc-nd',
  '4':  'by',
  '5':  'by-sa',
  '6':  'by-nd',
  '7':  'pdm',         // No known copyright restrictions
  '8':  'pdm',         // US Government Work
  '9':  'cc0',
  '10': 'pdm',
};

const ALL_CC_LICENSE_IDS = '1,2,3,4,5,6,7,8,9,10';

function pickFlickrLicenseIds({ commercial, derivatives }) {
  // Build the comma-separated list of license IDs to request.
  let ids = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
  if (commercial)  ids = ids.filter((id) => !['1', '2', '3'].includes(id));   // exclude NC variants
  if (derivatives) ids = ids.filter((id) => !['3', '6'].includes(id));         // exclude ND variants
  return ids.join(',');
}

function normalize(photo) {
  // We request extras=url_m,url_l,owner_name,license,date_taken,description.
  const license = LICENSE_MAP[String(photo.license)] || null;
  if (!license) return null;
  return {
    id: `flickr:${photo.id}`,
    sourceId: 'flickr',
    sourceName: 'Flickr',
    thumbnailUrl: photo.url_m || photo.url_n || photo.url_z,
    fullUrl:      photo.url_l || photo.url_o || photo.url_m,
    width: photo.width_l ? Number(photo.width_l) : (photo.width_m ? Number(photo.width_m) : null),
    height: photo.height_l ? Number(photo.height_l) : (photo.height_m ? Number(photo.height_m) : null),
    title: photo.title || 'Untitled',
    creator: photo.ownername || photo.owner || null,
    sourceUrl: `https://www.flickr.com/photos/${photo.owner}/${photo.id}`,
    license,
    licenseUrl: license === 'cc0'
      ? 'https://creativecommons.org/publicdomain/zero/1.0/'
      : license === 'pdm'
        ? 'https://creativecommons.org/publicdomain/mark/1.0/'
        : `https://creativecommons.org/licenses/${license}/2.0/`,
    description: buildDescription(
      photo.description?._content?.trim() || null,
      photo.datetaken ? `Taken: ${photo.datetaken}` : null,
    ),
  };
}

export default {
  id: 'flickr',
  displayName: 'Flickr',
  category: 'stock',
  requiresKey: true,
  keyHelpUrl: 'https://www.flickr.com/services/api/keys/',
  rateLimit: { requestsPerSecond: 5, requestsPerHour: 3600 },
  cacheTtlMs: 60 * 60 * 1000,
  cacheVersion: 1,

  async search(query, { page = 1, perPage = 20, commercial, derivatives, safeSearch = true, signal, apiKey } = {}) {
    const params = new URLSearchParams({
      method: 'flickr.photos.search',
      api_key: apiKey,
      text: query,
      license: pickFlickrLicenseIds({ commercial, derivatives }),
      content_type: '1',                 // photos only (not screenshots/illustrations)
      media: 'photos',
      per_page: String(perPage),
      page: String(page),
      extras: 'url_m,url_l,url_o,owner_name,license,date_taken,description',
      format: 'json',
      nojsoncallback: '1',
      sort: 'relevance',
      safe_search: safeSearch ? '1' : '3',   // 1=safe, 3=unrestricted
    });
    const data = await httpJson(`${ENDPOINT}?${params}`, { signal });
    if (data.stat !== 'ok') {
      throw new Error(`Flickr error: ${data.message || 'unknown'}`);
    }
    const photos = data.photos?.photo || [];
    const results = photos.map(normalize).filter(Boolean);
    return {
      results,
      hasMore: page < (data.photos?.pages || 0),
      totalCount: data.photos?.total ? Number(data.photos.total) : null,
    };
  },
};
