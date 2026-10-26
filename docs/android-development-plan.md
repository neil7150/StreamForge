# StreamForge Android implementation plan

Prepared: 20 October 2026

## Objective and execution boundary

**Scope update — 26 October 2026:** The user requires an account-free, device-local
Android release. No owned backend, PC server, Botkeep deployment or backend URL is
required. Shared auth/sync/backend implementations are retained for a future
explicitly scoped account feature, not as prerequisites for this release.
Current implementation evidence is in `android-local-first.md` and
`android-implementation-status.md`; these supersede older account/staging tasks
in this historical roadmap. Internet is still needed for direct external metadata,
source discovery and torrent peers. The app is not an offline media catalog.

Deliver a reliable, lightweight Android streaming application as a signed APK. Keep the existing React Native/Expo UI, Kotlin native module, Go torrent engine and native video player.

**Do not generate an APK until the user explicitly authorizes an APK build.** This includes debug, development and release APKs, Expo run commands that build an APK, and Gradle assemble tasks. Source changes, static analysis, unit tests and release-configuration preparation can proceed within an authorized implementation task. Device validation requiring a new binary must wait at the build gate; tests against an existing installation must be identified as testing that older version.

This document is a roadmap, not a claim that the work is implemented or that performance targets have been achieved.

Implementation evidence, current limitations and per-milestone user tests are tracked in `android-implementation-status.md`. Source implementation has begun; no APK build has been authorized or performed in this work.

## Starting point

- Nine mobile screens and navigation exist.
- Kotlin wraps the Go AAR; daemon readiness is checked before returning.
- The player uses expo-video and native events.
- Mobile and core TypeScript checks passed during the review; seven shared-core tests passed.
- The existing debug APK is 248,343,604 bytes and includes four CPU architectures. This is not the projected release size.
- No fresh device playback or performance validation was completed during the review.
- Persistence, cache management, session correctness, real backend configuration and release packaging remain incomplete.
- Older September notes predate the implemented native wrapper. Use current source and this plan for sequencing.

## First-release scope

Include:

- Android catalog browsing, search and movie/episode details.
- Magnet input and deep links.
- Source selection and exact video-file selection for multi-file torrents.
- Foreground playback with seek, pause, retry, visible errors and reliable resume.
- Watchlist, history and preferences that survive process death.
- Device-local library and preferences, with no login/register/cloud sync.
- Subtitles supported by the current player path, with clear unavailable states.
- Cache usage display, real clearing and bounded storage.
- Standalone signed APK delivery after explicit build approval.

Defer:

- Accounts, login, cloud sync and the owned backend; preserved source is future work.

- Offline download management, background downloading/seeding, transcoding, casting, picture-in-picture, recommendations and new social features.
- Autoplay-next and automatic source fallback until the basic session lifecycle passes its tests. Hide their controls in the first release if they are deferred.
- Broad format promises. Prefer direct playback; unsupported codecs must produce an actionable error.

Proposed lifecycle policy: foreground playback only for v1. Save progress and pause on backgrounding; stop torrent activity after a short bounded grace period. Define audio-focus and screen-lock behavior explicitly. Background playback would be a separate scope change with its own Android lifecycle work.

## Architecture rules

1. A playback controller owns session creation, cancellation, file selection, retry and disposal.
2. Screens render state and send user actions; they do not independently own the torrent engine.
3. Separate content identity, torrent/file identity and playback-attempt identity.
4. Kotlin owns native lifecycle and dispatch; Go owns readers, piece requests, torrent state and cache files.
5. Media bytes travel directly from Go's loopback server to the native player, never through JS.
6. Persist user data through a mobile storage service; credentials use platform-backed secure storage.
7. Keep generated Android settings reproducible through tracked configuration/plugins.
8. Add dependencies only to solve a concrete gap; inspect their native size and maintenance cost.

The existing `streamforge-mobile-architecture.md` contains the more detailed data-flow proposal.

## Phase 0 — Establish the baseline and scope

Tasks:

- Record current check results, repository revision, existing artifact size and known limitations.
- Inventory every visible control against its actual behavior; mark each implemented, partial, unsupported or deferred.
- Define the supported Android/device range from installed dependencies and the intended test devices.
- Choose reference devices: one lower-end physical phone and one typical ARM64 phone.
- Keep mobile/core checks separate from desktop checks; add a validation entry point that never builds an APK.
- Decide where the test/staging HTTPS backend will run and how public configuration enters the mobile bundle.

Acceptance:

- Every first-release feature has an owner layer and testable completion condition.
- Validation commands cannot accidentally invoke Android build lifecycle hooks.
- Deferred features are documented instead of presented as complete.

## Phase 1 — Fix persistence, identity and backend configuration

Tasks:

- Implement asynchronous mobile storage and explicit hydration states.
- Hydrate preferences/history before using them; avoid initializing stores permanently with empty pre-hydration data.
- Store refresh/access credentials and sensitive service keys through secure storage.
- Add versioned schemas and safe migration/recovery for malformed saved data.
- Namespace library/history by account, with a deliberate guest-data merge policy.
- Clear account-specific in-memory state on logout; invalidate pending auth/sync results using an account generation.
- Serialize refresh attempts and prevent a late response from restoring a logged-out session.
- Use stable catalog/episode keys for history. Store original magnet, selected file index, source identity and measured playback position.
- Configure the real backend explicitly; fail visibly when missing rather than silently using device localhost.
- Replace production mock-content fallback with offline/error/retry states. Keep fixtures in explicit development/test paths.

Acceptance:

- Preferences, history and watchlist survive a simulated restart at the storage-service level.
- Account A's data never appears in account B's state, including delayed-response tests.
- Two episodes in one torrent retain independent progress.
- A missing or failed backend produces a truthful screen state.

Device restart, secure-storage and network checks remain pending until an appropriate binary is available.

## Phase 2 — Implement one reliable playback session

Tasks:

- Introduce states: idle, resolving, selecting-file, preparing, playing, paused, buffering, failed and disposing.
- Tag every async operation/event with session/request identity and ignore superseded results.
- Pass cancellation through metadata resolution, native requests and media readers.
- Stop late-completing setup when the user leaves the player; make repeated cleanup safe.
- Return structured errors and real file metadata from the bridge.
- Filter file candidates to playable media; use episode metadata to rank them and ask the user when ambiguous.
- Implement native file selection; do not merely append a query parameter that the server ignores.
- Reload the player on retry even when the stream URL stays the same.
- Apply resume after the source is ready, with duration validation.
- Save final progress before disposal and retain the full original magnet.
- Use actual native tracks/metadata where available. Remove fabricated H.264/AAC/1080p responses.

Acceptance:

- Rapid Play/Back/Play cannot leave an abandoned session running.
- Selecting an episode reliably opens its chosen file.
- Retry creates or reloads the intended attempt.
- Paused/buffering/error state reflects the native player.
- Deterministic controller tests cover stale callbacks, cancellation, retry and duplicate cleanup.

## Phase 3 — Bound disk, memory, network and battery use

Tasks:

- Start the engine on demand rather than during ordinary app startup.
- Define idle shutdown and background grace periods; expose state for diagnostics.
- Replace unconditional whole-file demand with reader-driven priorities and bounded read-ahead where supported.
- Distinguish a prefetch window from a disk quota: a reader window alone does not evict already downloaded pieces.
- Design eviction with the torrent storage layer so deleted bytes are not still marked complete. If safe piece eviction is not ready, enforce a capacity limit and show a clear storage error.
- Track selected-file bytes, cache bytes and free disk space separately.
- Add per-session ownership, reader leases and safe cleanup after readers close.
- Clean abandoned cache after process death; never delete active-reader data.
- Implement real cache size and clear-cache operations, including partial failures.
- Set peer/upload limits conservatively and tune them using physical-device measurements.
- Compute transfer rates from byte deltas; report buffer availability separately from total torrent progress.
- Pause unnecessary polling/render updates when inactive and prevent concurrent polls.

Provisional budgets to validate:

| Item | Initial target |
|---|---|
| Disk cache | 512 MiB configurable ceiling; pause/error safely if it cannot be honored |
| Free disk reserve | 1 GiB before starting; recheck during playback |
| Active playback | One session for v1 |
| Stats publication | At most once per second while visible |
| Idle torrent activity | No engine/polling/peer activity after idle shutdown |
| Storage cleanup | No unbounded accumulation across playback sessions |

These are initial product choices, not measurements. Cache limits must not be advertised until enforcement is demonstrated.

Acceptance:

- Repeated open/close and failed metadata attempts do not accumulate sessions or orphaned readers.
- Cache accounting matches owned files.
- Low storage fails safely and clearly.
- Clearing cache reports actual results.
- Backgrounding and returning follow the documented policy.

## Phase 4 — Harden streaming and Android lifecycle

Tasks:

- Bind the loopback listener before declaring startup successful and propagate bind errors.
- Use one verified loopback address consistently across Kotlin, URLs and network-security configuration.
- Restrict local endpoints to the necessary interface; remove unused HTTP administration endpoints or authorize them.
- Use session-scoped authorization for media access without logging secrets.
- Validate identifiers, file indexes, request bodies and supported methods.
- Test Range, HEAD, end-of-file, invalid ranges and simultaneous independent readers.
- Cancel blocked reads when the request/session is cancelled; ensure shutdown has a bounded forced-close path.
- Handle interruption, audio focus, headphone removal, rotation and process recreation.
- Reject unsupported deep links and recover visibly from unavailable playback state.
- Keep external API traffic HTTPS and local cleartext exceptions narrowly scoped.

Acceptance:

- Deterministic Go tests cover HTTP behavior and cancellation using controllable data sources.
- Unrelated local requests cannot manipulate active playback.
- Shutdown finishes within a defined deadline and releases the listener/readers.
- Physical-device lifecycle tests pass after authorized build availability.

## Phase 5 — Complete and simplify the UI

Tasks:

- Implement or hide every unfinished setting.
- Correct version/storage/decoder labels using real values; do not promise universal hardware decoding.
- Add clear loading, empty, offline, unsupported-format and retry states.
- Prevent stale search responses from replacing newer queries; cancel requests and timers on exit.
- Use pagination and bounded catalog caches.
- Keep long lists virtualized; size poster requests appropriately and avoid unnecessary full-screen renders.
- Subscribe to narrow store slices; separate frequently changing player time from static controls.
- Respect subtitle-off, language selection and no-result states.
- Verify responsive layout after player rotation, readable text scaling, contrast and touch targets.

Acceptance:

- Every visible control produces the advertised behavior.
- Slow/out-of-order requests cannot display the wrong results.
- No sample catalog data is presented as live production content.
- Accessibility and navigation checks pass on the chosen devices.

## Phase 6 — Prepare release configuration without generating an APK

Tasks:

- Prepare an ARM64 release configuration; add a separate ARMv7 artifact only if the supported-device scope requires it.
- Exclude emulator ABIs from phone delivery.
- Prepare R8 code optimization and resource shrinking, with narrow required rules for the bridge.
- Keep Hermes enabled; inspect bundled assets/dependencies before adding more.
- Review Go native binary size and stripping options; preserve symbols separately for diagnostics.
- Pin the native build toolchain and document reproducible inputs.
- Configure release signing references without committing keystores or credentials.
- Define versionName/versionCode, update installation behavior and signing-key backup ownership.
- Ensure release JS/assets are bundled and no Metro dependency remains.
- Add an explicitly invoked release command; do not execute it.
- Document every command that would cross the APK build permission boundary.

Acceptance:

- Release configuration is reviewable in tracked source.
- No debug signing or development backend is configured for delivery.
- Build steps and required secrets are documented.
- APK generation remains unperformed.

Android reference: https://developer.android.com/topic/performance/reduce-apk-size

## Gate A — Explicit permission to build

Before requesting permission, present:

- Completed scope and checks.
- Remaining defects and device-validation gaps.
- Proposed variant and architecture.
- Exact purpose of the build: device testing or release candidate.
- Expected output location and whether installation is proposed.

Wait for explicit permission before any APK-producing command. Permission for one test build does not automatically authorize subsequent builds or distribution. Never describe source-only validation as device validation.

## Phase 7 — Device validation and optimization, after approval

Use legal, controlled test media and known torrent availability.

Test matrix:

- Clean install, launch without Metro, upgrade preserving data and process restart.
- Direct URL and torrent playback; multi-file episode choice; seek forward/back; retry same URL.
- No peers, corrupt/invalid input, unsupported codec, unavailable backend and unavailable subtitles.
- Wi-Fi interruption, network switching, airplane mode and restoration.
- Background/foreground, screen lock, audio interruption and orientation.
- Low disk, cache clearing, repeated playback and a 30-minute continuous session.
- Logout/account switch while sync is pending.

Measure release behavior on named physical devices:

| Metric | Provisional acceptance target |
|---|---|
| ARM64 APK | Aim for 60 MiB or less; investigate above 80 MiB before changing the budget |
| Cold launch to interactive shell | p95 at or below 3 seconds on the reference mid-range phone, 10 launches |
| Navigation/list frame time | Aim for 60 fps; investigate sustained missed frames |
| Idle total process PSS | Initial budget of 180 MiB |
| 1080p playback total process PSS | Initial budget of 350 MiB, device/decoder dependent |
| Cleanup memory behavior | No monotonic retained growth across 20 open/close cycles; investigate residual growth above 20 MiB after settling |
| Controlled torrent start | Aim for first frame within 10 seconds with a known healthy fixture |
| Controlled seek recovery | Aim for recovery within 3 seconds when requested data is available |
| Reliability | No crash/ANR in the scripted regression matrix |
| Battery/thermal | Record 30-minute drain, temperature and sustained throttling; compare on the same phone/settings |

These budgets are proposals, not guarantees. Record device, Android version, media format, resolution, network conditions and measurement method. Torrent availability must be separated from app-induced latency. PSS must include native/Go/decoder memory, not just the JS heap.

If measurements miss targets, investigate the largest contributor first. Do not rewrite the application framework solely because the debug APK is large.

## Phase 8 — Release and delivery

- Resolve release-blocking defects and rerun affected checks.
- Request permission for any additional APK build not already authorized.
- Verify signing, install/update behavior, bundled JS, version, endpoint configuration and APK size.
- Record checksum, supported devices, release notes and known limitations.
- Preserve signing keys and mapping/native symbols securely.
- Deliver the APK only after the agreed acceptance checks pass; publishing or sending it elsewhere requires authorization.

## Work tracking

For every task record: status, source files, tests, observed result and remaining device checks.

Statuses: not started, implementing, source-verified, awaiting authorized build, device-verified, complete.

A task that depends on Android runtime behavior cannot be marked complete solely because TypeScript passes.

Suggested implementation batches:

1. Baseline, backend configuration and truthful states.
2. Storage hydration, secure credentials and account isolation.
3. Playback controller, identity, file selection and resume.
4. Reader cancellation, cache ownership and resource limits.
5. Android lifecycle and stream-server hardening.
6. UI completion, search/list efficiency and accessibility.
7. Release configuration preparation.
8. Authorized device validation, measured optimization and delivery.

Phases 1–5 can be split into small reviewable changes, but playback optimization must preserve session correctness. Maintain a passing validation baseline after each batch. Estimate calendar dates only after the reference devices, backend readiness and first playback-controller batch are understood.
