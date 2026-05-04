import { httpJson } from './base.js';

const ENDPOINT = 'https://api.openverse.org/v1/images/';

// Build a Wikimedia thumbnail URL from an `upload.wikimedia.org/.../commons/`
// original URL. Used because Openverse's own thumbnail proxy is unreliable
// for Wikimedia content (returns 424/403/404 for some files).
//   raster:  .../commons/{a}/{ab}/{file}.jpg → .../commons/thumb/{a}/{ab}/{file}.jpg/{N}px-{file}.jpg
//   vector:  .../commons/{a}/{ab}/{file}.svg → .../commons/thumb/{a}/{ab}/{file}.svg/{N}px-{file}.svg.png
//                                              (Wikimedia rasterizes SVGs to PNG)
function wikimediaThumb(originalUrl, width) {
  try {
    if (!/upload\.wikimedia\.org\/wikipedia\/commons\//.test(originalUrl)) return null;
    const cleanUrl = originalUrl.split('?')[0];
    const filename = cleanUrl.split('/').pop();
    const isVector = /\.svgz?$/i.test(filename);
    const thumbPath = cleanUrl.replace('/wikipedia/commons/', '/wikipedia/commons/thumb/');
    return isVector
      ? `${thumbPath}/${width}px-${filename}.png`
      : `${thumbPath}/${width}px-${filename}`;
  } catch { return null; }
}

function normalize(item) {
  const provider = item.source || item.provider || 'openverse';
  // Openverse's thumbnail proxy is flaky for Wikimedia content (424/404 on
  // many files; can't rasterize SVGs). For Wikimedia content, build URLs
  // against Wikimedia's own thumbnail endpoint. For non-Wikimedia content,
  // use Openverse's proxy (which works fine for Flickr / museum sources).
  const wmThumb = wikimediaThumb(item.url, 500);
  const wmFull  = wikimediaThumb(item.url, 1280);
  const isSvg   = item.filetype === 'svg' || /\.svgz?(\?|$)/i.test(item.url || '');
  let thumbnailUrl, fullUrl;
  if (wmThumb) {
    thumbnailUrl = wmThumb;
    // For raster Wikimedia content, the original is browser-renderable and
    // typically higher quality than 1280px. For SVGs we already rasterized.
    fullUrl = isSvg ? (wmFull || item.url) : item.url;
  } else {
    thumbnailUrl = item.thumbnail || item.url;
    fullUrl      = item.url;
  }
  return {
    id: `openverse:${item.id}`,
    sourceId: 'openverse',
    sourceName: `Openverse · ${provider}`,
    thumbnailUrl,
    fullUrl,
    width: item.width ?? null,
    height: item.height ?? null,
    title: item.title || 'Untitled',
    creator: item.creator || null,
    sourceUrl: item.foreign_landing_url || item.url,
    license: item.license || null,
    licenseUrl: item.license_url || null,
  };
}

export default {
  id: 'openverse',
  displayName: 'Openverse',
  category: 'aggregator',
  requiresKey: false,
  supportsVector: true,
  rateLimit: { requestsPerSecond: 5 },
  cacheTtlMs: 60 * 60 * 1000, // 1 hour
  cacheVersion: 4,            // bumped: all Wikimedia content uses Wikimedia thumbnailer

  async search(query, { page = 1, perPage = 20, resolution, commercial, derivatives, vectorOnly = false, safeSearch = true, signal } = {}) {
    const params = new URLSearchParams({
      q: query,
      page: String(page),
      page_size: String(perPage),
    });
    if (resolution) params.set('size', resolution);
    if (commercial && derivatives) params.set('license_type', 'commercial,modification');
    else if (commercial)           params.set('license_type', 'commercial');
    else if (derivatives)          params.set('license_type', 'modification');
    if (vectorOnly) params.set('extension', 'svg');
    // Default Openverse behavior excludes mature; opt in only when off.
    if (!safeSearch) params.set('mature', 'true');
    const data = await httpJson(`${ENDPOINT}?${params}`, { signal });
    const results = (data.results || []).map(normalize);
    return {
      results,
      hasMore: page < (data.page_count || 0),
      totalCount: data.result_count ?? null,
    };
  },
};
