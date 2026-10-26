# Metadata timeout and discovery follow-up — 26 October 2026

## Phone report and confirmed boundary

The user reported Farzi failing on Wi-Fi with a listing showing 24 seeders.
Other sources start after approximately 30 seconds or longer, with two connected
peers/seeders and a reported speed of 1–2 (the precise unit was not confirmed).
The screenshot is a `prepareSession` rejection for `timed out waiting for torrent
metadata`. That is the engine's 45-second file-list discovery timeout, before
video decoding or embedded-subtitle handling. The source/provider/episode and
live tracker health have not been independently verified. Reported seeders and
live reachable peers are distinct measurements; increasing the current 24-peer
cap would not by itself explain or fix two established connections.

## Source changes

- Expose real native known, pending, connecting, active and connected-seeder
  counts, metadata availability and elapsed preparation time. Poll the preparing
  session as well as a ready session, so the discovery screen no longer hides
  all connection activity until metadata has already arrived.
- Tolerate only the expected early `session not active` polling race. Storage or
  engine errors remain fatal/visible; a subsequent cancellation rejection cannot
  replace the original failure message. Stale polling results are still scoped
  to the current session, and polling stops after cancellation/engine shutdown.
- Separate the UI metadata and video-loading phase budgets. Previously the
  60-second UI timer included the entire native metadata wait, leaving as little
  as 15 seconds for video startup. Video preparation now starts its own timer.
  The native metadata limit remains 45 seconds; no indefinitely increasing waits
  or automatic retries are introduced.
- Replace raw Java/module rejection text with an explanation and a visible
  **Choose another source** action. Decoder compatibility is not blamed for an
  earlier file-list failure.
- Normalize native magnet trackers at the final mobile entry point. Preserve
  valid supplied HTTP/HTTPS/UDP trackers (including private tracker URLs) without
  adding public trackers to them. Filter unsupported WebSocket tracker entries
  because this native client disables WebTorrent. For trackerless magnets, use
  at most eight existing configured HTTPS/UDP fallback URLs. Preserve the hash,
  display name, direct-peer, exact-source and selected-file hints. This uses the
  existing tracker list; current public tracker availability is not certified.
- Retain up to 64 public DHT routing contacts in process memory for 15 minutes,
  restoring them into the next engine instance alongside its normal bootstrap
  behavior. This avoids discarding all learned routing contacts on every retry.
  No sockets, active engine, media hashes or disk files are retained by this
  cache. Private/local addresses are excluded, Clear cache drops the hints, and
  process termination clears them. Normal background/exit cleanup still stops
  the native engine; there is no idle/background torrent networking feature.

The shared optional `TorrentProgress.discovery` fields and native stats JSON
are additive. The native bridge's method signatures/protocol version stay the
same; the desktop engine constructor continues without the mobile hint cache.
No account, owned backend, new npm dependency or larger piece-cache limit was
introduced.

## Verification

- Full source validation passed: 64 JavaScript tests (57 mobile + 7 shared),
  mobile/core TypeScript, Go engine/mobile/server and backend suites, plus
  script/plugin syntax checks. Final magnet-protocol and routing-copy assertions
  were checked again with focused tests.
- New tests cover native tracker compatibility/bounds, preservation of supplied
  trackers and magnet hints, friendly timeout text, separate timeout categories,
  and distinguishing registration races from storage failures.
- A controlled local peer supplies real magnet metadata after preparation has
  started. Tests observe statistics while metadata is absent, complete the BEP 9
  exchange, verify selected-file readiness, then verify cancellation cleanup.
- Routing-hint tests cover bounds, public-address filtering, owned IP bytes,
  expiration and Clear cache. Existing bounded streaming, cold header/tail reads,
  seeking, subtitle reads and cancellation regressions remain in the Go suite.
- Native library validation passed: the updated ARM64 AAR passed its 16 KiB
  LOAD/RELRO check, Kotlin compilation succeeded, and all five lifecycle tests
  passed. Evidence is in `.cache/discovery-native-validation.log`. No app/APK
  assembly task ran; this remains separate from phone tests.

No new APK was generated, installed or uploaded for this follow-up. The installed
`1.0.1-test` remains the earlier build. Farzi availability and faster startup on
the user's Wi-Fi are **not yet proven fixed**. A later separately authorized APK
must test the same source/network, discovery-stage peer counts, metadata time,
first-picture time, another release, retries and background/exit cleanup.
