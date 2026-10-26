# Android implementation checkpoint — 20 October 2026

## Authorized test build — 26 October 2026

The user explicitly authorized a local test APK, with GitHub updated first.
Prepared a separate `standaloneTest` variant: bundled production JavaScript,
non-debuggable, optimized ARM64, debug test certificate and `.test` app ID suffix.
Delivery release signing remains protected; its task guard now distinguishes app
release packaging from release resources in dependent libraries. No publishing or
phone installation is authorized by this local build request. Build results will
be recorded after GitHub push and APK verification.

## Device-local scope — 26 October 2026 (current)

User requested native phone use without accounts; accounts may be added later.
Mobile now disables session restoration/auth/cloud work, uses only the existing
guest/local library namespace, and removes the login route and cloud controls.
Catalog browsing/search/details now contact the existing metadata providers
directly, with stable provider identities and bounded caches. Torrent engine,
native player and local resume/settings persistence remain on-device. Backend
URL/staging is no longer a release prerequisite; signing and explicit APK
permission remain. Source validation passes including new local-only regressions.
No backend resource was deleted and no APK was generated. See
[the current architecture and user test steps](android-local-first.md); older
hosting/account checkpoints below are historical, not current release blockers.
Final evidence: 53 mobile/shared JS tests, TypeScript, shared/backend/daemon Go
checks, production JS export and the updated readiness checker pass. Direct public
provider browsing/details/seasons/episodes worked in a live read-only PC check.
Hermes bytecode: 3,359,024 bytes; this is not APK size or Android memory usage.
Native library code is unchanged; no new library or phone validation is claimed.

## Botkeep staff confirmation — 26 October 2026

Botkeep staff confirms auth Redis noeviction, 64 MiB maxmemory, AOF everysec and
persistent data on normal restarts/redeploys. The application ACL cannot query
CONFIG/INFO. Added an explicit, endpoint-bound staff-confirmation mode with a
required evidence reference; strict live checks remain the default. TLS and
connection checks remain active. Fixed logout falsely continuing after refresh
revocation failure. Local HTTPS regressions include OOM writes and partial logout
failure. This resolves the policy-verification deployment blocker; actual hosted
migrations, app operations, durability and backup restore are still pending.
See [Botkeep deployment](botkeep-deployment.md). No APK was built.

## Botkeep adaptation — 25 October 2026

Added a single-process backend entry point using the existing service factories,
three isolated schemas in one PostgreSQL database and two separate Redis servers.
This reduces the proposed deployment to four managed slots. A local ZIP packager
creates static Go 1.27.3 Linux AMD64/ARM64 binaries, avoiding the provider's sole
1.27.1 compiler profile. Resource bounds and verified remote TLS are configured.
The standalone API dependencies were patched after advisory scanning. Local
schema/restart and full HTTPS client regressions pass; Redis is still emulated.
See [Botkeep setup](botkeep-deployment.md) for capabilities that must be confirmed
before provisioning. No hosted deployment, real Redis verification or APK exists.

## Pre-APK preparation checkpoint — 25 October 2026

Completed the remaining local release preparation in one batch. Android backup
is disabled and unnecessary storage/overlay permissions are blocked in tracked
and regenerated configuration. Release guards reject missing/debug signing inputs;
release native builds strip symbols. Paused/unchanged progress avoids duplicate
history writes. A source-only readiness checker, ordered phone checklist, local
metric collector and manual Linux container-verification workflow are prepared.

Security review upgraded/pinned Go 1.27.3, anacrolix/torrent 1.61.0 and patched
WebSocket, x/net, DTLS v3, STUN v3 and telemetry dependencies. Candidate regressions
ran twice before adoption. The bounded storage interface now accepts cancellation
context. The Windows fixture owns its seeder file explicitly. Host race checks,
Android ARM64/CGO symbol scanning, Kotlin compile/five lifecycle tests and 16 KiB
AAR verification pass. A failed linker attempt was fixed with the pinned anet
package's documented Go private-symbol linker setting; phone networking remains
unverified. See the native review for the limitation and exact scanner scope.

The final stripped AAR is 8,671,388 bytes (updated unstripped: 17,026,817 bytes).
The production Hermes export is 3,360,324 bytes and excludes the inspected npm
advisory tooling. Full source checks still pass 47 JS tests plus TypeScript/Go;
local PostgreSQL/HTTPS tests and standalone backend checks pass. These sizes are
not an APK size or process-memory measurement.

The manual Linux CI workflow is source/syntax/config-checked only; it was not
uploaded, dispatched or counted as passing real-container verification. Staging
HTTPS, real Redis/Nginx, private release signing and explicit APK permission remain
external gates. No APK, installation, publishing, firmware change or reboot occurred.
See [the pre-APK checkpoint](android-pre-apk-readiness.md) for the final evidence,
inputs and [phone tests](android-phone-test-checklist.md). Nothing is required on
USB or the phone yet.

## Deployment preparation checkpoint — 25 October 2026

Prepared standalone backend Docker builds, complete per-service module locks,
separate persistent/no-eviction authentication Redis, bounded disposable cache,
loopback-only development ports and a standalone HTTPS staging Compose file.
Optional storage/monitoring services now require profiles. Added deployment source
validation and a read-only HTTPS staging probe. No mobile dependency was added.

Both Compose configurations pass parsing/isolation/required-input checks and all
four backend services cross-compile to Linux. Full source validation passes 47
JavaScript tests, TypeScript and Go suites. The development Docker Linux engine
returned an internal API error and later timed out, so real container/Nginx/Redis
verification remains pending. The user confirmed no staging server/domain is set
up. Public deployment is not marked complete.

There are five remaining major delivery milestones, with deployment preparation
finished inside the first: backend verification; release readiness; authorized
test APK; physical-device validation/fixes; authorized release APK and delivery.
See [the deployment procedure](backend-deployment.md) for exact inputs, commands
and evidence boundaries. No APK, public deployment or phone test occurred.

## Library conflict checkpoint — 25 October 2026

Implemented baseline-based library reconciliation. Remote deletions now remove
unchanged local copies after restart, while pending offline additions and playback
updates survive. An acknowledged deletion no longer hides a later re-add. A single
account-scoped record persists items and compact identity/time baselines together;
acknowledgments preserve edits made during requests and partial-collection failures.
Corrupt records are retained and block replacement uploads. Baseline markers have
a hard limit with an explicit error instead of silent eviction.

Clean collections skip uploads. The Library screen refreshes on tab focus and
supports pull-to-refresh, with no background polling or added mobile dependency.
History still caps at 50 items; the watchlist caps at 5,000. This reduces unnecessary
network writes, but device memory, storage cost, battery and startup still require
measurement on the reference phone.

Validation: **47 JavaScript tests passed** (40 mobile, seven core), mobile/core
TypeScript passed, all backend/shared and daemon Go suites passed, and script
syntax checks passed. Real PostgreSQL/HTTPS checks passed two independently saved
mobile-store sessions covering remote deletion, offline addition, history clear,
reload, re-add and unchanged-upload suppression. Redis remains a test-only emulator;
no Android runtime result is implied. The test database was stopped afterward.

Conflict rules and first-upgrade limitations are in [the sync protocol](library-sync-protocol.md).
Pending local removes win; concurrent history edits choose the newer watched time.
Clear History removes observed entries, preserving unseen additions from another
device. The legacy format cannot recover historical deletion intent on first
migration. Desktop protocol adoption, staging HTTPS/Redis, and physical device
validation remain outstanding.

Phone checks after APK approval: save on one session, remove in another, reopen or
pull to refresh Library; confirm the removal persists, an offline addition survives,
and explicit re-add works. Also test restart during sync and interrupted networking.
No phone/USB action is required yet. No APK was generated.

## Follow-up checkpoint — 24 October 2026

The architecture review found backend compilation and cloud integration defects
that were outside the original mobile validator. This follow-up repairs content,
search and user service compilation, including outdated shared APIs in user
startup and the missing show end-date request field. User startup now treats a
failed migration as fatal rather than serving against an unknown schema.

Library sync now shares a validated `{ items, revision }` wire contract, includes
real timestamps, generates server-owned item IDs and requires a revision under a
database transaction before replacing a collection. The client gates uploads on
successful initial reads, serializes account work, retains local edits on failure
and exposes a Library retry message. Logout cancels pending uploads instead of
racing revocation; local changes remain scoped to that account. Protected API
requests share token renewal and retry once with account/abort guards; startup
cloud reads wait for renewal.

The source validator now checks all four backend services and the shared Go
packages, alongside the original mobile/core and torrent checks. Tests cover the
shared Go/TypeScript JSON fixture, rejected initial reads, conflict/retry,
serialized uploads, server IDs, invalid snapshots, transaction ordering/rollback,
token renewal and stale-account replay. See [the sync protocol](library-sync-protocol.md)
for migration requirements and the evidence boundary. The original transaction
tests use a test double; the local integration follow-up below now supplies
PostgreSQL/HTTPS evidence. A deployed gateway/Redis run remains pending.
At this checkpoint, multi-device deletion handling and desktop protocol adoption
were follow-up work; the 25 October checkpoint above adds mobile reconciliation. Android runtime/performance gates below
remain pending; no APK was generated.

Follow-up validation: **36 JavaScript tests passed** (29 mobile regressions and
seven shared-core tests), mobile/core TypeScript passed, and all backend/shared
Go and torrent daemon packages passed. Six new Go tests check the HTTP contract,
input/identity normalization, stale-write ordering and rollback. Script syntax
and Git whitespace checks passed. These are source checks, not a live database
or phone result.

### Local backend integration follow-up

A new opt-in `npm run validate:backend:integration` check now runs real PostgreSQL
16.15 migrations, transaction contention/rollback and the shared API client over
a local HTTPS gateway. It uses the same auth/user app constructors as production;
Redis is a test-only TCP emulator. Registration/login, account isolation,
timestamps/numeric history, restart/download, deliberate clearing, revision
conflicts, access-token renewal and logout revocation passed. It also exposed and
fixed a reserved `current_time` SQL identifier and non-atomic refresh rotation.
Three rounds of eight refresh requests now each yield one success; token-store
fault/recovery checks pass. Auth startup now fails on migration errors.

See [backend integration evidence](backend-integration-tests.md) for commands,
test isolation and remaining gates. The test database process was stopped after
the run. No external deployment, global database installation, APK build or
physical-phone test occurred. Deployed Redis/gateway and Android checks remain
pending. Later catalog and mobile deletion follow-ups are recorded in this file.

### Catalog/search and episode-source follow-up

Real local PostgreSQL/HTTPS checks now cover all four production application
constructors. Fixed invalid series visibility queries, missing episode parent IDs,
transactional season/episode counters, stale content details, unpublished-content
access, empty-array contracts, search normalization and stable pagination. The
integration fixtures contain metadata and dummy magnets only; no peers are contacted.

Android catalog episodes now request their attached magnets before external
search. Backend UUIDs and episode metadata survive the screen adapter. Catalog
sources are validated and deduplicated, movie and episode screens share that
adapter, and failed catalog requests show an error instead of reporting no sources.
Abort guards prevent late results and unnecessary fallback searches after closing.
No mobile dependency was added. External provider requests already in flight still
finish in the provider layer; stale results are ignored rather than shown.

Validation: **41 JavaScript tests passed** (34 mobile, seven core), both TypeScript
projects passed, all backend/shared Go and daemon tests passed, and script syntax
checks passed. The real PostgreSQL/HTTPS suite passed catalog browsing/search,
publication rules, protected creation, concurrent counters, duplicate-insert
rollback and warmed-detail cache refresh alongside the existing account/sync suite.
PostgreSQL stops after each run; Redis remains a test-only emulator.

Phone tests after an authorized build: browse and search movies/series, switch
seasons, select a catalog episode, confirm attached sources load, close during
loading, retry an offline failure, and verify the selected episode reaches playback.
Nothing is required on the phone yet. No APK, deployment or physical-device test
was performed. Search cache staleness across services, deployed gateway/Redis and
measured Android memory, startup, playback, battery and APK size remain unverified.

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

Original checkpoint result: mobile/core TypeScript passed; **24 JavaScript tests passed** (17 mobile regressions plus seven shared-core tests); engine/server Go tests passed; both config plugins and Android PowerShell scripts passed syntax checks. Git whitespace validation passed.

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
- The 25 October baseline policy replaces permanent local deletion markers. Remote deletion, offline edits and re-add are tested with independent saved mobile sessions over local HTTPS; first-upgrade ambiguity and clock-based history conflict rules remain documented limitations.
- History uploads are throttled. Logout invalidates pending uploads; account-scoped local edits remain available for a later sign-in/retry. Local saving remains available when the backend is unavailable.
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
