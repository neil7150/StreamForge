# Android implementation checkpoint — 20 October 2026

## Scope and evidence

This checkpoint implements the main source foundations of the Android plan. It does **not** certify that the application is finished, lightweight on a device, or ready for delivery.

No APK was generated or installed. The latest checkpoint regenerated Android configuration, compiled the internal Go ARM64 AAR and Kotlin library, and ran Kotlin JVM tests through a restricted Gradle task graph. No app compilation, assembly, packaging or Expo native run was executed. Expo regeneration replaced the ignored Android directory, removing its old September debug APK; that older artifact was not used to verify these changes.

Primary reference device: **Nothing Phone 2a Plus, Android 16, 8 GB RAM**, supplied by the user. A lower-end device is still needed to support claims about lower-end performance. Installed React Native configuration requires Android API 24 or newer; compatibility across that range remains untested.

## Implemented source milestones

| Milestone | What changed | Evidence and limits |
|---|---|---|
| Validation/baseline | Added `npm run validate:mobile`, explicit HTTPS backend configuration and visible catalog failures. Removed sample-content fallbacks. Engine no longer starts during browsing. | TypeScript and deterministic tests; actual backend URL still needed. |
| Durable data and accounts | AsyncStorage-backed hydration gate, save-error/retry state, one secure credential record, secure provider keys, account-specific libraries, serialized refresh and generation guards. | Storage and account-race tests use injected adapters; Android SecureStore/process-death behavior remains unverified. |
| Playback ownership | Unique attempts, cancellation, serialized replacement, retry of unchanged URLs, full-magnet/file-index resume and stable movie/episode identity. | Controller tests; actual native integration remains pending. |
| Files and resource control | Real file metadata/selection, episode matching with manual choice on ambiguity, reader-driven demand, bounded read-ahead/readers, selected-file stats and transfer rates. | Go unit tests; codec compatibility, peer behavior and performance require a device. |
| Cache | Rolling 512 MiB payload cache, least-recently-used eviction of verified pieces outside active reader windows, completion invalidation, storage-error cancellation, cleanup, actual size/clear operations and free-space guards. | Unit tests and a synthetic local torrent larger than its cache; filesystem overhead is additional. Android performance remains unverified. |
| Local media server | Synchronous listener binding, session-token authorization, native-only administration, request cancellation, Range/HEAD behavior and forced-close shutdown fallback. | Go HTTP/reader tests; Android network-security handling remains pending. |
| Native integration | Compiled updated Go bindings and Kotlin module, fixed zero-argument coroutine overloads, added process-wide daemon ownership and lifecycle generation checks, and surfaced stopped-engine statistics errors. | Five Kotlin JVM tests, Go bridge tests and library compilation passed. Actual Android event delivery and JNI loading remain pending. |
| UI behavior | Removed unsupported playback toggles, corrected diagnostics, added subtitle key entry, request invalidation, bounded Browse results, virtualized episodes and series watchlist navigation. | Source/type checks; no physical layout, touch or accessibility verification yet. |
| Release preparation | Tracked ARM64/shrinking/signing configuration, pinned gomobile/NDK selection, 16 KiB library linker flags and ELF verification, release command and explicit build-invocation guard. | Regenerated native configuration and library compilation verified; APK signing, app linking and release optimization remain unverified. |

## Source validation

Run from the repository root:

```powershell
npm run validate:mobile
```

The validator directly runs TypeScript, JavaScript tests, Go tests, JavaScript plugin syntax checks and Windows script parsing. It does not invoke npm Android lifecycle hooks or generate native artifacts.

Separate native-library validation:

```powershell
npm run validate:mobile:native
```

This builds an internal AAR and compiles/tests only `:streamforge-torrent-daemon`. A strict Gradle init script whitelists the Kotlin library compile/test entry points and rejects any app task or APK packaging task in their graph. It never installs anything or starts an emulator. It requires an already-generated native project and Android toolchain; it does not silently run prebuild.

Latest result: mobile/core TypeScript passed; **24 JavaScript tests passed** (17 mobile regressions plus seven shared-core tests); engine/server Go tests passed; both config plugins and Android PowerShell scripts passed syntax checks. Git whitespace validation passed.

Native checkpoint results:

- Go ARM64 library generation, generated Java binding signature inspection, Kotlin module compilation and **five Kotlin JVM lifecycle tests** passed (zero failures/errors).
- Compilation exposed ambiguous zero-argument Expo coroutine lambdas; explicit `->` lambdas fixed those errors. AsyncStorage's KSP compiler plugin is aligned with the root Expo toolchain in tracked configuration.
- The first native library had 4 KiB LOAD alignment. NDK r27 linker flags now set both maximum and common page sizes to 16 KiB. The AAR verifier rejected that initial library and accepted the rebuilt library's four LOAD segments and GNU_RELRO layout. See [Android's native-library guidance](https://developer.android.com/guide/practices/page-sizes). This does not certify other libraries or ZIP alignment in an unbuilt APK.
- Current internal ARM64 AAR: **13,166,077 bytes**, built without symbol stripping. This compressed library size is not an APK size or memory measurement.
- Recorded toolchain: Go 1.27.0; gomobile `v0.0.0-20260908204917-8b95e45f8d3e`; NDK 27.1.12297006; JDK 17.0.20.1; Gradle 9.3.1; Kotlin 2.1.20; compile/target SDK 36, minimum 24.
- `go test -race ./engine ./server ./mobile -count=1 -timeout=180s` passed on Windows, using CGO, the installed GCC and `CGO_CFLAGS='-O2 -g -std=gnu17'`. The first compiler attempt failed because libutp's C typedef conflicts with the newer compiler's default language mode; selecting C17 fixed compilation. This is a host concurrency check, not an Android race-detector or stress result.
- Restricted temp-file permissions blocked the initial sandboxed C compilation. The same library build succeeded outside the sandbox. An initially uncached Gradle dependency required online resolution before the library task graph could be inspected. These failed attempts were not represented as passing checks.

The additional Metro export check packages only JS/assets into the ignored mobile `.expo/source-check/` directory. It does not produce an APK and does not verify Kotlin compilation or native linking.

Latest Metro/Hermes export passed after dependency updates: 2,597 modules, a **3,344,444-byte bytecode bundle**, 17 assets and an inspection source map. Temporary compiler files stay inside the workspace. This bundle size is not an APK-size measurement or a device-performance result.

The cache integration fixture streams **32 MiB through a 12 MiB cache** using two local torrent clients, verifies the full SHA-256 digest, seeks back to evicted beginning data and to the tail, probes both concurrently, then cancels with readers open and checks cleanup. Five repeated runs passed. Public trackers, DHT and peer discovery are disabled in the fixture. The initial sandbox run could not transfer through loopback and timed out; the unrestricted local run and full validator passed. This proves the source integration in this environment, not Android decoder behavior. The fast validator uses CGO disabled; the separate host race run above also passed with CGO enabled.

Regression coverage includes:

- Storage hydration, simulated restart, write failure and retry.
- Atomic credential-record writes, secure-key routing and visible keystore-read failure.
- Distinct account/guest namespaces and malformed preference recovery.
- Late login/refresh/cloud responses, serialized refresh and persisted local deletion markers.
- Cancellation before/during setup, repeated cleanup and same-source retry.
- Query invalidation before the next debounced request.
- Exact episode selection, non-video rejection and ambiguous packs.
- Rolling cache budget enforcement, least-recently-used eviction, multiple protected reader windows, whole-piece reservations for unfinished writes, re-download, deletion failure, missing/truncated cache recovery, unsupported piece sizes, cancellation of a blocked reader and single release.
- Authorized full/range/tail/HEAD requests, invalid ranges, missing tokens, removed administration routes and occupied listener ports.

## Product policies in this checkpoint

- Foreground playback only. Backgrounding pauses/saves playback and closes the JS-owned torrent attempt; Kotlin also stops the daemon after a five-second background grace period.
- Native daemon start/stop calls are serialized on worker threads. Background-stop tickets become invalid after foreground transitions; destroyed/older module instances cannot stop a newer owner's daemon. Lifecycle callbacks update atomic state without waiting for native shutdown. A lifecycle transition during startup disposes that startup result. A stopped engine is reported as a retryable statistics error instead of an empty success object.
- One torrent playback session at a time, with up to four concurrent media readers and 8 MiB read-ahead per reader.
- No background seeding or offline download support. Native uploads are disabled in this initial configuration; peer limits need real-world tuning.
- Verified pieces outside all active 8 MiB reader windows can be evicted and downloaded again after a backward seek. Eviction immediately clears storage completion and queues a torrent completion refresh outside the storage lock. The refresh worker cannot race torrent disposal. Full-piece reservations include unfinished/sparse writes. If active or unfinished pieces leave no safe eviction candidate, playback stops with a clear storage error instead of growing disk use.
- Source metadata is bounded to 32,768 pieces and piece sizes at most 64 MiB. These guards leave space for multiple reader windows within the 512 MiB payload budget; unusually large-piece sources require another source. Evicted bytes depend on peer availability when requested again. Continuous long-form playback still requires the device test below.
- If a cached file disappears or is truncated, a read invalidates its completion so it can be fetched again; an unexpected filesystem read error cancels work. This recovery has local storage tests, not an Android low-storage result.
- At least 1 GiB free storage is required at start, with a 256 MiB emergency floor checked during stats polling. These are conservative guardrails, not measured optimal values.
- Guest library data stays separate when signing in. There is no automatic guest/account merge.
- Local deletion markers prevent an older cloud snapshot from restoring removed items. Markers are scoped per account, bounded to 1,000 per collection, and cleared by explicitly adding the same item again. Full multi-device conflict resolution remains outside the evidence of the current tests.
- History uploads are throttled; final account snapshots are also attempted at logout. Local saving remains available when the backend is unavailable.
- Autoplay-next, automatic source fallback and transcoding controls are hidden. Direct playback reports unsupported media rather than fabricating codec information.

## What the user should test after an authorized native build

These are **pending**, not passed. Do not generate a build just to run them without permission.

| Test | Steps | Expected result |
|---|---|---|
| Catalog truthfulness | Open with a working backend, then disable connectivity and retry. | Real titles when reachable; an error/retry state when unreachable; no sample titles disguised as live results. |
| Data restart | Change quality/language, save a movie and series, watch part of a legal video, force-close and reopen. | Preferences, watchlist and exact playback position are restored. No startup screen is shown permanently. |
| Accounts | Sign into A, save entries, sign out, sign into B; repeat with slow network. | A's library is absent from B and guest state; late responses do not restore A. |
| Offline deletion | Delete a saved entry offline, reopen, reconnect and sign in again. | The old cloud entry does not immediately reappear. Explicit re-add works. |
| Exact episodes | Use a season pack, request one episode and use manual file choice for ambiguous names. | Correct episode plays; files such as samples/images are not silently selected. |
| Resume | Exit an episode, reopen it from Library/Continue Watching. | Original magnet and selected file are used; a different episode in the pack has separate progress. |
| Cancellation/retry | Leave while metadata loads; rapidly open another source; retry the same source after an error. | No abandoned attempt continues; old callbacks do not stop the newer source; retry reloads playback. |
| Seek/network loss | Seek near the start/end, disable Wi-Fi, restore it and retry. | Correct ranges play; stalls/errors remain visible and recoverable. |
| Background/rotation | Rotate, background, lock/unlock, return and retry. | Playback pauses/stops according to policy, progress survives and the prior orientation policy is restored. |
| Native shutdown race | Background for longer than five seconds, return and immediately retry playback; repeat rapid background/foreground changes during source preparation. | A delayed shutdown does not kill the replacement session; interrupted startup does not leave native work running. |
| Subtitles | Save a valid subtitle key, choose a language, play, then select Off. | Matching available cues appear and Off removes them; changing subtitle settings does not restart the torrent session. |
| Cache | Check displayed usage, stop playback, clear it; try clearing during playback. | Real usage is shown, stopped-session files clear, active playback is protected and failures are reported honestly. |
| Rolling cache and low storage | Play a controlled source larger than 512 MiB beyond the quota; seek back to early data and near the end. Separately test low free storage. | Playback continues by reclaiming old verified pieces; cache payload stays within 512 MiB; seeks re-download when necessary. Low space or no safely evictable capacity produces a clear error and stops native work. |
| Reliability | Repeat open/seek/close 20 times and run a 30-minute controlled playback test. | No crash/ANR or persistent session/readers; record process memory, battery, heat and cache growth. |
| Release independence | Following separate release-build approval, launch without Metro and install a signed update. | JS/assets are bundled, signing/version are correct, saved data survives upgrade. |

For failures, record the step, expected/actual behavior, Android version, source/file identity and approximate time. Keep credentials and media session tokens out of shared logs.

## Remaining gates and limitations

1. A real HTTPS backend endpoint has not been supplied or tested.
2. Updated Go bindings and Kotlin library compile together, but complete app linking, JNI loading, SecureStore/AsyncStorage runtime behavior and Android lifecycle delivery remain unverified. An explicitly authorized APK build is needed for those device checks.
3. Rolling-cache source integration now passes, but continuous playback, multi-reader range behavior, disk use and repeated seeks must be verified on Android with a controlled source larger than 512 MiB.
4. Compatible dependency updates reduced the mobile audit from 34 package entries (including one critical) to **23 entries: 16 high, seven moderate, zero critical**. The remaining report traces to three underlying packages in development/build tooling; it does not establish 23 vulnerabilities in the APK. See `android-dependency-review.md` for paths, fixes, source reachability and remaining release work. No forced framework downgrade or incompatible override was applied.
5. Actual APK size, process PSS, launch time, frame behavior, battery and thermal use have not been measured. Roadmap numbers remain targets.
6. Physical UI/accessibility tests, audio interruptions/headphone behavior, Android 16 networking, process death and signing/update checks remain pending.
7. Host Go race-detector checks now pass. Android-specific native stress checks, 16 KiB runtime testing, all-library alignment and final APK ZIP alignment remain pending.

The next checkpoint must resolve native integration and the relevant device tests before marking these milestones device-verified. APK generation continues to require explicit user authorization.
