// Maps a license code (lower-case, e.g. "by", "by-sa", "cc0", "pdm") to a
// short human-readable name and a tooltip-friendly explanation.

// Each entry includes `commercial` and `derivatives` flags so we can filter
// uniformly across sources, regardless of whether a given source's API
// natively supports those filters.

const LICENSES = {
  'cc0': {
    name: 'CC0',
    commercial: true, derivatives: true,
    explanation: 'Public domain dedication. No rights reserved — use freely for any purpose, no attribution required (though appreciated).',
  },
  'pdm': {
    name: 'Public Domain',
    commercial: true, derivatives: true,
    explanation: 'No known copyright restrictions. Free to use for any purpose.',
  },
  'by': {
    name: 'CC BY',
    commercial: true, derivatives: true,
    explanation: 'Free to use, including commercially and for derivatives, as long as you credit the creator.',
  },
  'by-sa': {
    name: 'CC BY-SA',
    commercial: true, derivatives: true,
    explanation: 'Free to use commercially and adapt, but you must credit the creator AND release your adaptation under the same license (share-alike).',
  },
  'by-nd': {
    name: 'CC BY-ND',
    commercial: true, derivatives: false,
    explanation: 'Free to use and share commercially with credit, but no derivative works — you may not modify the image.',
  },
  'by-nc': {
    name: 'CC BY-NC',
    commercial: false, derivatives: true,
    explanation: 'Free for non-commercial use with credit. Commercial use requires separate permission.',
  },
  'by-nc-sa': {
    name: 'CC BY-NC-SA',
    commercial: false, derivatives: true,
    explanation: 'Non-commercial use only, with credit, and adaptations must use the same license (share-alike).',
  },
  'by-nc-nd': {
    name: 'CC BY-NC-ND',
    commercial: false, derivatives: false,
    explanation: 'Most restrictive CC license: non-commercial use only, with credit, and no derivative works.',
  },
  'sampling+': {
    name: 'Sampling+',
    commercial: false, derivatives: true,
    explanation: 'Allows sampling and remixing for non-commercial purposes with attribution.',
  },
  'nc-sampling+': {
    name: 'NC Sampling+',
    commercial: false, derivatives: true,
    explanation: 'Non-commercial sampling and remixing with attribution.',
  },
  // Permissive open-source licenses common in icon/code distributions —
  // not formally Creative Commons, but allow commercial use and derivatives.
  'mit': {
    name: 'MIT',
    commercial: true, derivatives: true,
    explanation: 'Permissive open-source license. Free to use commercially and modify, with credit to the original author preserved in copies.',
  },
  'apache-2.0': {
    name: 'Apache 2.0',
    commercial: true, derivatives: true,
    explanation: 'Permissive open-source license. Free to use commercially and modify, with attribution and a notice of any modifications.',
  },
  'isc': {
    name: 'ISC',
    commercial: true, derivatives: true,
    explanation: 'Permissive open-source license, similar to MIT. Free for any use with attribution preserved.',
  },
  'ofl-1.1': {
    name: 'OFL 1.1',
    commercial: true, derivatives: true,
    explanation: 'SIL Open Font License — free for any use including commercial, with restrictions on selling the font itself standalone.',
  },
  // Stock-photo service licenses — each is a custom permissive license.
  'unsplash': {
    name: 'Unsplash License',
    commercial: true, derivatives: true,
    explanation: 'Unsplash License — free for any use including commercial. Attribution appreciated but not required. Cannot resell the unmodified photo or compile competing photo collections.',
  },
  'pexels': {
    name: 'Pexels License',
    commercial: true, derivatives: true,
    explanation: 'Pexels License — free for any use including commercial. Attribution appreciated but not required. Cannot sell unaltered copies.',
  },
  'pixabay': {
    name: 'Pixabay License',
    commercial: true, derivatives: true,
    explanation: 'Pixabay Content License — free for any use including commercial, with or without modifications. Attribution appreciated. Cannot redistribute unaltered.',
  },
};

const UNKNOWN = {
  name: 'Unknown',
  commercial: false, derivatives: false,
  explanation: 'License unknown — verify before use.',
};

// Normalize various source-specific license string formats to our canonical
// codes ("by", "by-sa", "cc0", "pdm", etc.). Handles:
//   "cc-by-sa-4.0", "CC BY 4.0", "cc-zero", "pd", "public domain",
//   "http://creativecommons.org/licenses/by-nc/3.0/", etc.
export function normalizeLicenseCode(raw) {
  if (!raw) return null;
  let code = String(raw).toLowerCase().trim();

  // CC license URLs → extract the path component.
  if (code.startsWith('http')) {
    const m = code.match(/\/(licenses|publicdomain)\/([a-z0-9-]+)/);
    if (m) {
      const [, kind, slug] = m;
      if (kind === 'publicdomain' && slug === 'zero') return 'cc0';
      if (kind === 'publicdomain' && slug === 'mark') return 'pdm';
      code = slug;
    }
  }

  code = code.replace(/\s+/g, '-');
  if (['pd', 'pdm', 'public-domain', 'public-domain-mark', 'publicdomain'].includes(code)) return 'pdm';
  if (['cc0', 'cc-0', 'cc-zero'].includes(code)) return 'cc0';
  // Preserve permissive open-source licenses (MIT / Apache / ISC / OFL),
  // including their version suffixes.
  if (code === 'mit' || code === 'isc') return code;
  if (code === 'apache-2.0' || code.startsWith('apache-')) return 'apache-2.0';
  if (code === 'ofl-1.1' || code.startsWith('ofl-') || code === 'sil-ofl') return 'ofl-1.1';
  if (['unsplash', 'pexels', 'pixabay'].includes(code)) return code;
  if (code.startsWith('cc-')) code = code.slice(3);
  code = code.replace(/-\d+(\.\d+)?$/, '');   // strip version suffix
  return code;
}

// Build a canonical Creative Commons URL for a normalized license code.
export function licenseUrlFromCode(code) {
  const c = normalizeLicenseCode(code);
  if (!c) return null;
  if (c === 'cc0') return 'https://creativecommons.org/publicdomain/zero/1.0/';
  if (c === 'pdm') return 'https://creativecommons.org/publicdomain/mark/1.0/';
  if (/^by(-(sa|nd|nc|nc-sa|nc-nd))?$/.test(c)) return `https://creativecommons.org/licenses/${c}/4.0/`;
  return null;
}

export function describeLicense(rawCode) {
  if (!rawCode) return UNKNOWN;
  const code = normalizeLicenseCode(rawCode);
  return LICENSES[code] ?? {
    name: String(rawCode).toUpperCase(),
    commercial: false, derivatives: false,
    explanation: 'License terms vary — check the source page before using.',
  };
}

// Returns true if the image's license satisfies the active filter requirements.
// `commercial` / `derivatives` are booleans; when true, the image MUST allow that use.
export function passesLicenseFilter(image, { commercial, derivatives }) {
  if (!commercial && !derivatives) return true;
  const desc = describeLicense(image.license);
  if (commercial && !desc.commercial) return false;
  if (derivatives && !desc.derivatives) return false;
  return true;
}

// Build a copy-pasteable attribution line.
export function formatAttribution({ title, creator, sourceName, sourceUrl, license, licenseUrl }) {
  const titlePart = title ? `"${title}"` : 'Untitled';
  const byPart = creator ? ` by ${creator}` : '';
  const viaPart = sourceName ? `, via ${sourceName}` : '';
  const { name } = describeLicense(license);
  const licensePart = ` (${name}${licenseUrl ? `: ${licenseUrl}` : ''})`;
  const linkPart = sourceUrl ? `. ${sourceUrl}` : '';
  return `${titlePart}${byPart}${viaPart}${licensePart}${linkPart}`;
}
