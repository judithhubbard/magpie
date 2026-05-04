# Magpie

A lightweight, in-browser image search across **20+ free and Creative Commons
sources** — including Wikimedia, Library of Congress, Internet Archive, museum
collections (Art Institute of Chicago, Cleveland Museum of Art, V&A, SMK,
David Rumsey Map Collection), scientific databases (NASA, iNaturalist, EOL,
GBIF, iDigBio, Wellcome), open icon collections (Iconify), and (with a free
key per service) stock photography (Unsplash, Pexels, Pixabay, Flickr).

No backend. No accounts. No tracking. The whole tool is a folder of static
files; everything runs in your browser.

## Try it

**Live**: <https://judithhubbard.github.io/magpie/> — runs in your browser, no install.

**macOS app**: download `Magpie.app.zip` from the
[Releases page](https://github.com/judithhubbard/magpie/releases), unzip,
drag to `/Applications`. First launch: right-click → Open → Open (Gatekeeper
warning for unsigned apps; one time only).

## Features

- **Parallel search** across all enabled sources, with a per-source status strip.
- **License filtering** — narrow to commercial-use / derivative-allowed images.
- **Tabbed searches** — multiple independent queries open at once.
- **Saved images** — bookmark across searches, export as HTML / Markdown / a
  zip-style download set, plus copy formatted attributions.
- **Source filtering** — click any source pill to show only that source's results.
- **Per-source rate limiting** — automatic backoff on 429 responses.
- **Source-relevance filter** — for sources whose APIs match across full-text
  (Wikimedia, LOC, Internet Archive, Wellcome, GBIF, iDigBio, museums),
  client-side filter ensures every result actually contains the query words.
- **Vector-only mode** — limits to SVG content from sources that support it.
- **Safe search** (default on) — applies where supported (Openverse, Pixabay,
  Unsplash, Flickr).
- **Per-image attribution** — every lightbox shows source, creator, license,
  and a copyable formatted attribution string.

## Running

Magpie uses ES modules, which most browsers will not load from `file://`
URLs. Serve the folder with any local HTTP server.

```bash
# from the project folder
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

For other servers (Node, Ruby, etc.) any static-file server pointing at this
folder works.

## Installing as an app (PWA)

Once served, Chrome / Edge / Safari will show an "Install" option in the
address bar. Installing creates a standalone window with the Magpie icon —
no browser chrome — that launches from your dock or home screen.

## Building the macOS .app

For a "double-click to launch" experience on macOS without going through a
browser install:

```bash
./build-app.sh           # produces ./Magpie.app
./build-app.sh --zip     # also produces ./Magpie.app.zip for sharing
```

The build script needs `iconutil` and `osacompile` (built into macOS) and
ImageMagick (`brew install imagemagick`). Recipients of the resulting .app
need only macOS 10.15+ — Python 3 ships with the Command Line Tools and is
all the launcher uses to serve the bundled web files locally.

## API keys

Most sources work with no setup. Four sources require free API keys, entered
into the in-app **Settings** panel (⚙ in the header):

| Source    | Get a key at                                |
| --------- | ------------------------------------------- |
| Unsplash  | <https://unsplash.com/developers>           |
| Pexels    | <https://www.pexels.com/api/>               |
| Pixabay   | <https://pixabay.com/api/docs/>             |
| Flickr    | <https://www.flickr.com/services/api/keys/> |

Keys are stored in your browser's `localStorage` and never leave your
machine except in requests to the corresponding API.

## Project structure

```
index.html           — entry point
icon.svg             — app icon
manifest.json        — PWA metadata
style.css            — all styles
js/
  app.js             — wires everything together
  state.js           — global state + persistence
  search.js          — search orchestrator (rate limiting, caching, retry)
  rate-limiter.js    — per-source token-bucket limiter
  cache.js           — localStorage TTL cache for API responses
  attribution.js     — license normalization + attribution formatting
  iiif.js            — shared IIIF Image API URL builder
  sources/           — one file per image source (the strategy adapters)
    base.js          — shared helpers + source contract
    index.js         — registry of all sources
    openverse.js wikimedia.js nasa.js inaturalist.js eol.js wellcome.js
    gbif.js idigbio.js loc.js internetarchive.js davidrumsey.js
    artic.js clevelandart.js smk.js vam.js iconify.js
    unsplash.js pexels.js pixabay.js flickr.js
  ui/                — UI modules
    tabs.js status.js grid.js lightbox.js filters.js options.js
    settings.js saved.js about.js
```

Adding a new source = one file in `js/sources/` plus a one-line addition to
`js/sources/index.js`. The orchestrator and UI auto-discover it.

## License

The Magpie code is licensed under the [MIT License](./LICENSE).

The Magpie icon is adapted from a CC BY-SA 4.0 photograph; see
[NOTICE](./NOTICE) for attribution and license details.

Search results are licensed individually by each source — verify the license
shown in the lightbox before reusing any image.
