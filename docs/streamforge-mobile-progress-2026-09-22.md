# StreamForge mobile progress — 2026-09-22

## Current state

The project has moved beyond a UI scaffold and now has a working Android native build artifact, but the artifact is not connected to React Native yet. Direct URL playback can use `expo-video`; torrent playback cannot work in the app until the native module wrapper exists.

### Completed

- Expo SDK 57 / React Native 0.86 mobile application scaffold and navigation.
- `expo-video` player with real playback events, seeking, subtitles, visible errors, retry, progress saving, and player-session cleanup.
- Catalog/source fixes for backend magnet fields, series genres, episode numbers, and provider file indexes.
- Go torrent engine, localhost range server, gomobile bridge, selected-file retention, and HTTP reader cleanup.
- Android Studio, Android SDK, platform/build tools, command-line tools, gomobile, and NDK 27.2.12479018 installed.
- Android binding generated successfully with API 21. The output is `services/torrent-daemon/streamforge.aar` (54,645,139 bytes) plus `streamforge-sources.jar`.
- The AAR contains native libraries for armeabi-v7a, arm64-v8a, x86, and x86_64. Its generated Java API is `mobile.Mobile` with `startDaemon`, `stopDaemon`, `addMagnet`, `cleanupStream`, and `getStats`.

### Verification performed

- Mobile TypeScript: passed.
- Shared core TypeScript: passed.
- Shared core tests: 7 passed, 0 failed.
- Daemon: `CGO_ENABLED=0 go test ./...` passed; the daemon currently has no Go test files.
- AAR generation: passed with `gomobile bind -target=android -androidapi=21 -o streamforge.aar ./mobile`.
- ADB: installed and working, but no emulator or physical device is connected.
- Emulator executable exists, but no AVD or Android system image was found.

## P0 next: connect the AAR to Expo

1. Create a local Expo module, for example `apps/mobile/modules/torrent-daemon`.
2. Put the AAR in the module's Android `libs` directory and add it as a Gradle dependency.
3. Implement an Expo Kotlin module named `TorrentDaemon` that wraps `mobile.Mobile`.
4. Expose `startDaemon`, `stopDaemon`, `addMagnet`, `cleanupStream`, and `getStats` as asynchronous methods. `addMagnet` may block for metadata for up to 45 seconds and must run off the Android main thread.
5. Start the daemon with the app cache directory, then poll `http://127.0.0.1:8888/health` before declaring it ready. The Go bridge currently returns before socket binding is confirmed.
6. Replace the JavaScript adapter's optional/fabricated methods with the real module contract. `removeTorrent`, `notifySeek`, and `updatePlaybackPosition` are not present in the generated AAR.
7. Allow cleartext localhost traffic for `127.0.0.1` in the Android network configuration.
8. Generate the native Android project/development build and confirm `NativeModules.TorrentDaemon` is available.

Acceptance gate: a development build starts the daemon, adds a legal test torrent, receives a local stream URL, plays and seeks through `expo-video`, reports a failed source visibly, and releases the torrent when leaving the player.

## P0 test target

Create an Android Virtual Device with an installed system image, or connect a USB-debugging-enabled Android device. `adb devices` currently returns no targets. A physical device is preferable for torrent networking, lifecycle, storage, and thermal testing; an emulator is still useful for module-loading and basic playback checks.

## P1 after native playback

- Add mobile persistence hydration using AsyncStorage-compatible asynchronous storage; keep credentials in secure platform storage.
- Scope watchlist/history by account and prevent late auth/sync responses from crossing logout/account changes.
- Use episode-specific history identity and persist magnet plus selected file index so resume can reconstruct the torrent session.
- Produce real progress events or poll `getStats`; normalize Go's `peers` field to the JavaScript `numPeers` contract.
- Add reader/session cancellation, server-start readiness, forced shutdown fallback, cache quota, and real cache clearing.
- Fix Settings' SDK 52 label and no-op clear-cache confirmation.

## P2 release hardening

- Add native range/server tests, lifecycle tests, mobile integration tests, and account-isolation regression tests.
- Test background/foreground, rotation restoration, network loss, rapid seeking, multi-file episode selection, and repeated open/close cycles.
- Split release builds by ABI or otherwise review the 54.6 MB multi-ABI AAR contribution.
- Add mobile/core/daemon checks to the root validation workflow.

## Repository risk

The mobile app, shared packages, torrent daemon, AAR, and docs are all untracked, while many desktop/backend files are modified. Create a scoped source-control checkpoint before native integration. Do not commit every dirty file as one change; select the mobile/core/daemon/docs work deliberately and decide whether generated AAR/JAR files belong in Git or in a reproducible build/release artifact flow.
