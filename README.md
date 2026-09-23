# CobePhim browser-player add-on

This repository now contains two independent pieces:

- `addon-server.mjs`: Nuvio/Stremio-compatible manifest/catalog/meta/stream bridge.
- `scanner.mjs` and `render-scanner.mjs`: diagnostic browser scanners kept for investigation.

## Why browser-player mode

The September 23 investigation identified JW Player 8.51.3 + hls.js/MSE. The observed HLS response used a non-standard `#ENC-AESGCM` wrapper and the browser produced a blob-backed video. No standard HLS/DASH/MP4 URL suitable for a normal Nuvio stream recipe was demonstrated.

Therefore the add-on does not decrypt, proxy, rewrite, or bypass the provider stream. Its stream response uses `externalUrl` to open the provider-authorized episode/player page.

## Run

`npm start`

Endpoints:

- `/manifest.json`
- `/catalog/series/cobephim.json`
- `/meta/series/cobephim%3Ade-che-dai-han%3A775372.json`
- `/stream/series/cobephim%3Ade-che-dai-han%3A775372.json`
- `/health`

The current commit intentionally contains one verified sample episode. Site-wide catalog ingestion is a separate next step; it must map public CobePhim metadata to stable add-on IDs without attempting to defeat the site's playback controls.
