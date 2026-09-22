# StreamForge mobile progress review — 2026-09-18

Scope: targeted follow-up to the September 12 mobile audit, covering the mobile app, shared stores, and Go torrent daemon. This is not a fresh verification of all 82 historical findings or the desktop application. Source inspection establishes implementation progress; it does not establish Android runtime success.

## Progress confirmed

- PlayerScreen now renders expo-video's VideoView and calls native playback controls. expo-video is declared in dependencies and app plugins. The old simulated playback clock is gone.
- Library lists now have separate keys, fixing the changing-numColumns crash.
- Series genres normalize strings and objects; episode lookup accepts episode_number.
- Movie sources accept magnet_links; movie, series, and search play actions now pass the full magnet URI.
- LoginScreen checks authentication state before navigating back after login/register.
- All three configured image assets exist and are nonempty.
- The obvious Go source compilation blockers were corrected: constructor name and unused imports/variable. A successful Go build is still unverified.
- Engine cache paths now use an application-owned child directory when given a parent path.
- Player handles absent infoHash with an error view and measures scrubber width from layout. The validation guard introduces a conditional-hooks concern described below.

## Remaining bugs and regressions

P0 means blocks real torrent playback; P1 means a significant correctness/resource/data issue; P2 means narrower UX or conditional failure.

| Priority | Finding and impact | Evidence | Suggested change |
|---|---|---|---|
| P0 | Real torrent playback remains unwired. There is no Android bridge/AAR source in the mobile tree and no daemon-start call. Missing native methods still return a fabricated ready stream pointed at localhost. | apps/mobile/src/native/torrent-engine.ts:45; apps/mobile/src/App.tsx:39 | Implement and build the native bridge; wait for confirmed server readiness; reject unsupported/unavailable native playback instead of returning fake success. |
| P1 | Playback time events are never enabled. expo-video defaults timeUpdateEventInterval to zero, so elapsed time, scrubber progress and subtitle cues do not update during normal playback. History can still read player.currentTime on its timer. | apps/mobile/src/screens/PlayerScreen.tsx:105 and :235; node_modules/expo-video/src/VideoPlayer.types.ts:98 | Set a positive event interval in player setup. Once events work, stabilize saveProgress so changing currentTime does not repeatedly tear down its timer and save on each update. |
| P1 | File selection is still lost. Series passes no source.fileIndex, Player defaults a missing episode index to zero, movie playback ignores fileIndex, and Go serves the largest file regardless of the file selected by AddStream. Multi-file torrents can play the wrong episode. | apps/mobile/src/screens/SeriesDetailScreen.tsx:137; apps/mobile/src/screens/PlayerScreen.tsx:132; services/torrent-daemon/engine/engine.go:123 | Preserve selected file identity from source through native session and HTTP reader. Use explicit automatic-selection semantics, validate indexes, and select only eligible media files. |
| P1 | Player unmount only unsubscribes progress; it never cleans up the torrent. Each HTTP request creates a reader which is never closed. Seeking and repeated playback accumulate resources once the daemon is connected. | apps/mobile/src/screens/PlayerScreen.tsx:196; services/torrent-daemon/engine/engine.go:146; services/torrent-daemon/server/stream_server.go:111 | Own playback sessions centrally; cancel pending starts, release sessions on exit, return a closeable reader, and defer reader closure with request cancellation. |
| P1 | Sample selection is based on arbitrary hash/title matches. Any title containing bunny or sintel can silently play a fixed sample URL instead of the selected torrent. | apps/mobile/src/screens/PlayerScreen.tsx:70 | Require an explicit sample source type/direct URL. Never infer playback source from a display title or hash substring. |
| P1 | Player errors only turn off buffering; users get no error message or retry action. Native Go ERROR strings can also be treated as stream URLs. | apps/mobile/src/screens/PlayerScreen.tsx:230; apps/mobile/src/native/torrent-engine.ts:55; services/torrent-daemon/mobile/bridge.go:81 | Surface typed errors and retry/change-source controls. Validate native responses before passing a URL to the player. |
| P1 | History keys use torrent hashes, so episodes in one season pack overwrite each other. Library resume omits the stored magnet and selected file and assumes movieId is a hash. A fresh engine cannot reconstruct that session. | apps/mobile/src/screens/PlayerScreen.tsx:266; apps/mobile/src/screens/LibraryScreen.tsx:153 | Separate content identity from torrent/session identity. Persist magnet and selected file plus episode identity, and reconstruct the session on resume. |
| P1 | Mobile durable persistence remains absent. The adapter falls back to memory and App does not configure mobile storage. Its synchronous contract cannot accept AsyncStorage unchanged. | packages/core/src/stores/storage-adapter.ts:1; apps/mobile/src/App.tsx:39 | Add explicit asynchronous hydration/bootstrap for settings and library; persist credentials using platform secure storage. |
| P1 | Logout leaves user history/watchlist intact. Login merges globally keyed local data into the next account, and later sync can upload that combined data. | packages/core/src/stores/authStore.ts:79; packages/core/src/stores/userDataStore.ts:69 and :203 | Scope persisted data by account; clear/switch in-memory state on logout; reject late responses from previous authentication sessions. |
| P1 | Engine/bridge lifecycle remains unsafe: AddStream holds the engine lock during metadata wait; startup returns before bind succeeds and ignores errors; asynchronous startup reads a mutable global server pointer. | services/torrent-daemon/engine/engine.go:70; services/torrent-daemon/mobile/bridge.go:46 | Separate readiness and metadata states, use cancellation and session generations, and pass stable server references into goroutines. |
| P2 | Missing-infoHash guard returns before most hooks. Updating params from an invalid to a valid request on the same mounted Player changes hook count and can crash. | apps/mobile/src/screens/PlayerScreen.tsx:56 | Put parameter validation in a wrapper and mount a separate player component only for valid requests. |
| P2 | Magnet deep links still discard the magnet and are dropped if navigation is not ready. | apps/mobile/src/App.tsx:47 | Queue the initial link until navigation readiness and forward the complete parsed playback request. |
| P2 | Torrent event sets have no producer; peer/speed indicators remain zero. Clear Cache only shows a success alert, while native clearCache is a no-op. Settings still advertises SDK 52. | apps/mobile/src/native/torrent-engine.ts:185; apps/mobile/src/screens/SettingsScreen.tsx:66 and :256 | Wire actual stats and cache operations; derive diagnostics from runtime configuration. |

## Checks performed

- Mobile TypeScript check: passed.
- Shared core TypeScript check: passed.
- Shared core tests: 7 passed, 0 failed, using `node --test --experimental-test-isolation=none packages/core/tests/core-policies.test.ts`.
- The installed expo-video type documentation explicitly states that timeUpdate events are disabled at interval zero; no interval assignment is present in PlayerScreen.
- Go was not available on PATH. Go compilation, gomobile binding, Android packaging, emulator/device playback and runtime race/resource behavior remain unverified.
- Existing tests cover utility/policy happy paths, not player lifecycle, account isolation, native integration, or range streaming.

## Suggested implementation order and acceptance gates

1. **Finish the direct-video player.** Enable timing events, show errors, remove title-based sample substitution, stabilize progress saves, and separate the validation wrapper. Verify play/pause, seeking, subtitles, duration and resume on an Android device with an explicit legal sample URL.
2. **Complete one real torrent playback path.** Build the Go library and Android module, start the server with a readiness result, preserve magnet/file identity, and disable fake success. Demonstrate a legal torrent playing on-device, including a selected non-largest file.
3. **Make session cleanup reliable.** Add cancellation, reader closure, proper shutdown, cache ownership/quota and stats. Repeatedly start, seek, exit and restart; check that readers/connections/storage do not grow without bound. Exercise Go race and HTTP range tests.
4. **Finish persistence and identity.** Add hydrated mobile storage, protected credentials, account isolation, episode-specific history and resume reconstruction. Verify cold restart, offline start, logout and two-account switching.
5. **Harden discovery and delivery.** Revisit remaining historical search/pagination cancellation and DTO issues; verify API connectivity from a real device; add boundaries and actionable failures; run release build and lifecycle/network-loss tests. Add mobile/core/native checks to the root validation workflow.

## Changes made in this follow-up

- Split invalid playback requests into a wrapper so the player component has a stable hook order.
- Enabled expo-video `timeUpdate` events at 250 ms and made progress saving use stable refs instead of recreating its interval on every time update.
- Removed title/hash-based sample-video selection; only an explicit `streamURL` is treated as a direct stream.
- Added visible playback errors and cleanup of an active torrent session when the player unmounts.
- Made the mobile torrent adapter reject invalid magnets, missing native support, daemon `ERROR:` responses and invalid URLs instead of fabricating success.
- Forwarded provider file indexes through movie, series and search source selection.
- Updated the daemon to remember the selected file for each torrent and close a closeable HTTP reader after `ServeContent` finishes.

Current assessment: meaningful progress from the initial scaffold toward a direct-video prototype; still not a demonstrated working Android torrent streamer. An overall percentage would overstate confidence while the native path and device tests remain absent.

## Build environment update — 2026-09-18

- Installed Go 1.27.0 and gomobile, and recorded `golang.org/x/mobile/cmd/gobind` as the daemon module tool dependency.
- Installed Android Studio. Its first-run SDK/NDK setup is still required because no Android SDK directory was present and the desktop setup wizard is not available to this automation session.
- `CGO_ENABLED=0 go test ./...` passes for the daemon packages. The normal CGO build fails in `github.com/anacrolix/go-libutp` because that version declares `typedef uint8 bool`, which conflicts with the Go 1.27 C toolchain. The module declares Go 1.26.0; the official 1.26 toolchain retry was stopped after its download became impractically slow. Test the native binding with Go 1.26 after obtaining that toolchain.
- `gomobile bind -target=android` now reaches Android SDK discovery and fails only because the SDK has not yet been provisioned.
- Android Studio has since provisioned the SDK and platform tools; command-line tools and NDK 27.2.12479018 were added. `gomobile bind -target=android -androidapi=21 -o streamforge.aar ./mobile` now succeeds and produces `services/torrent-daemon/streamforge.aar` (about 54.6 MB).
- The AAR is not yet integrated into an Expo local Android module, and `NativeModules.TorrentDaemon` is still absent at runtime. The next implementation step is the Kotlin/Expo module wrapper, daemon startup/readiness wiring, and a development-build test on a device or emulator.
