# Android search and playback improvements

Implemented locally after the first standalone APK phone test. The user reported
that the existing APK launches and plays smoothly after a slow start. This is
user-reported baseline evidence, not a pass for every device checklist item.

## Changes

- Search uses a single metadata search and a virtualized section list headed
  **Movies** and **TV Show**, with counts, posters, years, ratings, and artwork
  failure placeholders. Provider relevance order is preserved within each type.
  Launching a movie source from search preserves its artwork for watch history.
- The player provides **Fit**, **Fill / crop**, and **Stretch**. Fit remains the
  migration/default value; the selected mode is persisted with local settings.
- The seek control has an 8 dp track, 16 dp thumb and 48 dp touch target. Dragging
  previews the target and commits one seek at release; cancellation discards it.
  Duration and positions are bounded. Seeking does not change play/pause state.
- **CC / Audio** exposes the native player's subtitle and audio track lists.
  Embedded subtitles need no account, API key, server, extraction, or new player.
  Off is available, preferred languages match two/three-letter codes, and manual
  choices remain active for the current source. Native captions retain the
  Android renderer/accessibility styling; the lower caption band is reserved
  beneath the raised timeline so these captions remain unobstructed.
- Included SRT/VTT sidecars are explicitly selectable from the same torrent.
  Matching release filenames rank first, obvious other episodes are excluded,
  and selection never silently chooses a different episode. Caption delay is
  adjustable by 0.5 seconds, limited to +/-30 seconds, with Reset. Text captions
  render above visible controls. Off/embedded/sidecar choices are mutually
  exclusive, and subtitle selection does not restart the torrent.
- Existing online subtitles are optional, require a user-supplied key, and now
  use explicit search/result selection with visible failures. No automatic
  download of the first online result occurs.
- Startup shows metadata discovery versus video preparation. **Info** shows
  metadata time, first native video byte, player ready, first picture, current
  connected peers, MiB/s, and buffering events after the first frame. These
  diagnostics are ephemeral and do not record credentials or peer addresses.
  Native first-byte timing starts at native session creation; UI timings start
  when the playback attempt begins. Neither is a decoder-only benchmark.
- Source counts say **reported seeders**; runtime counts say **connected peers**.
  Engine limits stay at 24 established / 8 half-open connections, 8 MiB reader
  readahead, and a 512 MiB disk cache. DHT/PEX retain the enabled library defaults;
  the full selected magnet reaches AddMagnet. There is no evidence yet that a
  higher connection cap would improve this phone's startup. No speed gain is
  claimed before a later device comparison.

## Native interface and bounds

Session file metadata classifies `.srt`/`.vtt` files as `subtitle` (existing video
selection still only accepts video files). A loopback-only
`GET /subtitle/{sessionId}?token={sessionToken}&index={fileIndex}` endpoint uses
the existing random session capability. It verifies the token, active/ready
session, index, extension, positive size and 2 MiB limit. Requests time out after
20 seconds. Reads use the same verified torrent data, bounded cache, reader
limit and cancellation lifecycle as video; no full-video download is started.
The client cancels stale subtitle requests on source changes, Off, background,
or unmount. No filesystem path or arbitrary remote URL is accepted as a sidecar.

`TorrentProgress.firstVideoByteMs` is optional so existing desktop callers remain
compatible. Native statistics add that metric. No Kotlin bridge signature or
protocol-version change is required. A new APK would need the rebuilt Go library;
the existing installed APK does not contain these changes.

## Verification and limits

- Full `npm run validate:mobile` passed: mobile/core TypeScript, the then-current
  58 JavaScript cases, Go daemon and backend suites, and script/plugin checks.
- The final combined JavaScript run passed all 59 cases (52 mobile + 7 shared),
  including catalog grouping/poster preservation and the five playback policy
  tests. Final mobile and core TypeScript also passed.
- Focused Go engine/server tests passed after adding the real local-torrent
  subtitle fixture: exact verified subtitle bytes, request/session cancellation,
  stale/invalid file access, video-file rejection, HTTP authorization, size limits,
  and reader cleanup. The existing larger-than-cache streaming and head/tail/
  backward-seek fixture also passed.
- The enhanced cold-container fixture read verified header and tail data before
  streaming the body, then completed the bounded-cache/backward-seek checks. The
  local synthetic header/tail probe took 71.4 ms in this run. This is a test-fixture
  result, not a claim about phone or public-swarm startup speed.
- `npm run validate:mobile:native -- -Offline -StripSymbols` passed with the
  installed Android SDK: refreshed ARM64 Go AAR, 16 KiB LOAD/RELRO verification,
  Kotlin compilation, and all five native lifecycle tests. Only whitelisted
  library tasks ran. No APK was generated or installed.
- The final production Android JS/assets export passed at
  `apps/mobile/.expo/playback-update-export`. With matching source-map export
  options, Hermes bytecode is 3,380,108 bytes versus the previous 3,359,024 bytes:
  +21,084 bytes (about 0.63%). Only the four new app modules entered the inventory;
  LoginScreen and the previously checked advisory-bearing tooling remain absent.
  Source maps are local inspection artifacts, not intended APK assets. No npm
  dependency was added. A future APK size must be measured after authorization.

Embedded format support depends on the existing Android decoder. SRT/VTT sidecar
parsing does not add broad ASS styling, bitmap extraction or transcoding support.
An empty track list is explained rather than promising that every release has
captions. Borders encoded inside the video are not automatically detected/cropped.
Phone layout, gestures, audio/embedded subtitle rendering, startup improvement,
heat and memory still require a later explicitly authorized APK and phone test.

## Next phone checks, after separate APK authorization

1. Search **Your Name** and a title shared by movies/shows. Check posters, headings,
   count/order, details, direct source launch and Continue Watching artwork.
2. Use a video with multiple embedded subtitles/audio languages; switch languages
   and Off while playing and paused. Check captions with controls visible/hidden.
3. Use a torrent containing matching SRT/VTT subtitles; select them, change delay,
   seek far forward/back, choose Off, and verify another episode is not selected.
4. Try a video without captions and an unavailable/malformed sidecar. Check that
   errors remain clear and playback continues. Online search is optional.
5. Compare Fit/Fill/Stretch, exit/reopen the app, and check the saved mode. Drag and
   tap the timeline at both edges, cancel a drag and seek while paused.
6. Compare Info startup times on the same source/network over several attempts.
   Test retry, background/return, saved resume and a longer playback session.

The initial implementation did not include a GitHub push or additional APK.
The user subsequently authorized pushing the fixes and building the next local
test APK, in that order. The new build uses version `1.0.1-test`, version code 2,
with the same test application ID and signing identity so it can update the
existing test installation. Artifact verification and delivery are recorded
separately after a successful build.
