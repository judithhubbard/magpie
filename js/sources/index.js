// Central registry. Adding a new source = import + add to the array.

import openverse       from './openverse.js';
import wikimedia       from './wikimedia.js';
import nasa            from './nasa.js';
import inaturalist     from './inaturalist.js';
import loc             from './loc.js';
import eol             from './eol.js';
import wellcome        from './wellcome.js';
import internetarchive from './internetarchive.js';
import artic           from './artic.js';
import cleveland       from './clevelandart.js';
import gbif            from './gbif.js';
import idigbio         from './idigbio.js';
import smk             from './smk.js';
import vam             from './vam.js';
import davidrumsey     from './davidrumsey.js';
import iconify         from './iconify.js';
import unsplash        from './unsplash.js';
import pexels          from './pexels.js';
import pixabay         from './pixabay.js';
import flickr          from './flickr.js';

export const ALL_SOURCES = [
  openverse, wikimedia,
  nasa, inaturalist, eol, wellcome, gbif, idigbio,
  loc, internetarchive, davidrumsey,
  artic, cleveland, smk, vam,
  iconify,
  unsplash, pexels, pixabay, flickr,
];

export const SOURCES_BY_ID = Object.fromEntries(ALL_SOURCES.map((s) => [s.id, s]));

export function getSource(id) {
  return SOURCES_BY_ID[id];
}
