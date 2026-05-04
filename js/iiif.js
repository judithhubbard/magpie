// IIIF Image API URL builder.
// Spec: https://iiif.io/api/image/3.0/  (also handles 2.x — same path shape)
//
// Pattern: {base}/{region}/{size}/{rotation}/{quality}.{format}
// We always use region=full, rotation=0, quality=default, format=jpg.
// The only variable is the size descriptor, which varies by source preference.

export function iiifImageUrl(base, sizeDescriptor) {
  const clean = String(base || '').replace(/\/info\.json$/, '').replace(/\/$/, '');
  return `${clean}/full/${sizeDescriptor}/0/default.jpg`;
}

// Standard sizes — most sources use these. `!W,H` means "fit within W×H,
// preserving aspect"; `W,` means "exactly W pixels wide, height auto".
export const IIIF_THUMB = '!400,400';
export const IIIF_FULL  = '!1500,1500';

// Returns true if `url`'s host ends with any of `knownHosts`.
export function isIiifHost(url, knownHosts) {
  try {
    const u = new URL(url);
    return knownHosts.some((h) => u.hostname.endsWith(h));
  } catch { return false; }
}
