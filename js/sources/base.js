// Shared contract for image sources.
//
// Every source module exports a default object of shape:
//   {
//     id: string,                     // stable identifier
//     displayName: string,
//     requiresKey: boolean,
//     keyHelpUrl?: string,            // where users get the key
//     rateLimit: { requestsPerSecond, requestsPerHour? },
//     cacheTtlMs?: number,            // override default cache TTL
//     cacheVersion?: number,          // bump when adapter behavior changes
//                                     // (e.g. new query parameters, different
//                                     //  normalization). Old cached entries
//                                     //  are then ignored.
//     search(query, opts) -> Promise<{ results, hasMore, totalCount }>
//   }
//
// `search` opts: { page, perPage, resolution, signal, apiKey }
// `results` is an array of NormalizedImage:
//   {
//     id, sourceId, thumbnailUrl, fullUrl, width, height,
//     title, creator, sourceUrl, sourceName,
//     license, licenseUrl,
//     description?,   // optional human-readable description / notes shown in lightbox
//   }

export const RESOLUTION_BUCKETS = {
  small:  { minWidth: 0,    maxWidth: 640 },
  medium: { minWidth: 640,  maxWidth: 1920 },
  large:  { minWidth: 1920, maxWidth: Infinity },
};

export function passesResolutionClientSide(image, resolution) {
  if (!resolution) return true;
  const bucket = RESOLUTION_BUCKETS[resolution];
  if (!bucket || !image.width) return true;
  return image.width >= bucket.minWidth;
}

// Categories used to group sources in the UI. Each source declares its
// `category` from this map. Order here is the display order in the menu.
export const CATEGORIES = {
  aggregator:   'Aggregators',
  encyclopedic: 'Encyclopedic',
  science:      'Science & nature',
  historical:   'Cultural & historical',
  art:          'Art museums',
  icons:        'Icons & clipart',
  stock:        'Stock photography',
};

// Some sources (LOC, Wikimedia Commons) match query terms with OR-style
// relevance ranking across full-text of digitized books, descriptions, and
// categories. That returns hits like Whistler's enemies-book (or "Mlle
// Silly" actress photos) for a query of "silly cat". Filter out results
// where not every significant query word appears somewhere in the result's
// own metadata (title / description / subject / categories).

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'of', 'and', 'or', 'in', 'on', 'at', 'to', 'for',
  'with', 'by', 'from', 'as', 'is', 'are', 'was', 'were', 'be', 'this', 'that',
]);

export function significantQueryWords(query) {
  return String(query || '')
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w && !STOP_WORDS.has(w));
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Keyword-based safe-search filter for sources that have no native one
// (Wikimedia, Internet Archive, LOC). Imperfect — relies on adult content
// being labeled with one of these substrings somewhere in the searchable
// metadata. Catches the obvious cases. Used by sources whose content can
// include user uploads or unrestricted archival material.
const ADULT_KEYWORDS = [
  'nude', 'naked', 'nudity', 'sex', 'sexual', 'porn', 'erotic', 'fetish',
  'fellatio', 'blowjob', 'cunnilingus', 'masturbat', 'orgasm', 'intercourse',
  'penis', 'penises', 'vulva', 'vulvas', 'vagina', 'vaginas', 'genital', 'genitalia',
  'breast', 'breasts', 'topless', 'nipple', 'nipples',
  'bdsm', 'fisting', 'pubic', 'foreskin', 'circumcis', 'nsfw', 'xxx',
];

export function looksAdult(text) {
  if (!text) return false;
  const lower = String(text).toLowerCase();
  return ADULT_KEYWORDS.some((kw) => lower.includes(kw));
}

// Returns true iff every significant word in `query` appears in `haystack`.
// Default: case-insensitive substring match ("cat" matches "category").
// `strict: true`: whole-word match ("cat" matches "cat" alone but not
// "cats", "category", or "cathedral"). If the query is all stop words, passes.
export function matchesAllQueryWords(query, haystack, { strict = false } = {}) {
  const words = significantQueryWords(query);
  if (words.length === 0) return true;
  const hay = String(haystack || '').toLowerCase();
  if (!strict) return words.every((w) => hay.includes(w));
  return words.every((w) => new RegExp(`\\b${escapeRegex(w)}\\b`, 'i').test(hay));
}

// Compose a multi-line description from optional parts. Empty/falsy parts
// drop out; if everything is empty, returns null. Used pervasively by
// source adapters to avoid the `[a,b,c].filter(Boolean).join('\n\n')` boilerplate.
export function buildDescription(...parts) {
  const out = parts.filter(Boolean).join('\n\n');
  return out || null;
}

// Strip HTML tags and trim. Used for source metadata that comes back as
// embedded HTML (Wikimedia Artist field, Art Institute description, etc.).
export function stripHtml(html) {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = String(html);
  return (tmp.textContent || '').trim();
}

export class HttpError extends Error {
  constructor(message, { status, retryAfterMs } = {}) {
    super(message);
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

export async function httpJson(url, { signal, headers } = {}) {
  const response = await fetch(url, { signal, headers });
  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After');
    const retryAfterMs = retryAfter ? Number(retryAfter) * 1000 : 30_000;
    throw new HttpError('Rate limited', { status: 429, retryAfterMs });
  }
  if (!response.ok) {
    throw new HttpError(`HTTP ${response.status}`, { status: response.status });
  }
  return response.json();
}
