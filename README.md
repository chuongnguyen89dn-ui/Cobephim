# CobePhim catalog + media resolver add-on

The add-on keeps CobePhim as a catalog/metadata layer while playback is supplied by a separately authorized standards-compatible media source.

## Playback contract

Set `MEDIA_SOURCES_JSON` on the server. Keys are add-on video IDs and values are arrays of normal HTTP HLS/DASH/MP4 sources.

Example:

```json
{
  "cobephim:de-che-dai-han:775372": [
    {
      "name": "Authorized HLS",
      "title": "Source 1",
      "url": "https://media.example.test/video/master.m3u8"
    }
  ]
}
```

If no authorized source is configured, the stream endpoint deliberately returns an empty `streams` array. It never opens the CobePhim webpage.

Endpoints:
- `/manifest.json`
- `/catalog/series/cobephim.json`
- `/meta/series/:id.json`
- `/stream/series/:id.json`
- `/health`

The diagnostic scanners remain in the repository. They are not part of playback.
