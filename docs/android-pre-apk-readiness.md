# Pre-APK checkpoint — 25 October 2026

Later update: the user authorized a test APK on 26 October after GitHub push.
The [standalone test APK is now built and artifact-verified](android-test-build-2026-10-26.md).
Earlier no-build statements below are historical. Physical-phone results remain pending.

**Current scope, updated 26 October:** device-local Android use without accounts
or an owned backend. The hosting gates below are historical and do not apply to
this release. Login/navigation/cloud controls are removed, account background work
is disabled, and catalog screens use direct external providers. See
[current implementation and device tests](android-local-first.md). Private signing,
explicit APK permission and physical-device validation remain required.

26 October update: Botkeep staff confirmed auth Redis noeviction, 64 MiB memory
limit, AOF everysec and persistent storage across normal restarts/redeploys.
The API now supports explicit endpoint-bound staff confirmation because the
provider blocks live CONFIG/INFO reads. Strict live checks remain the default.
The hosting policy blocker is resolved; hosted migrations, Redis app operations,
durability/backup checks and API HTTPS deployment still remain. Backend logout
now fails when refresh revocation fails, with local OOM/partial-failure regression
coverage. See [the provider evidence and updated package](botkeep-deployment.md).
No APK has been built.

Local source and native-library preparation is complete. **No APK was generated**.
A complete app test build still needs the backend environment below and explicit
build permission. This is not a claim that the app has passed device testing.

## Implemented and checked

Botkeep is now the proposed managed host. The [compact backend guide](botkeep-deployment.md)
describes the prepared four-slot route and local upload package. Its database,
Redis, binary startup and HTTPS capabilities still need live verification.

| Area | Evidence |
|---|---|
| Source | 47 JavaScript regressions, mobile/core TypeScript, Go daemon/backend/shared suites and script checks pass. |
| Native runtime | Patched Go 1.27.3 and transport dependencies; ARM64 AAR builds; 16 KiB LOAD/RELRO checks pass. |
| Native bridge | Kotlin library compiles and five JVM lifecycle tests pass under the task whitelist that rejects app/APK tasks. JNI loading in an installed app remains pending. |
| Concurrency | Fresh Windows CGO host race tests pass for engine, server and mobile bridge. This is not an Android race-detector result. |
| Local backend | Real PostgreSQL/local HTTPS account, sync, catalog and two-persisted-client checks pass; Redis is still a test emulator in that suite. |
| Deployment source | Both Compose files, required inputs, isolation and the test overlay validate; standalone service tests and Linux builds pass. |
| Production JS | Export succeeds with 2,600 modules; Hermes bytecode is 3,360,324 bytes. Advisory-bearing npm tooling is absent from its source-map inventory. |
| Privacy | Tracked Android configuration disables backup and blocks external-storage/overlay permissions. Generated manifests carry the removal directives. Final merged APK permissions still need inspection. |
| Release settings | ARM64, Hermes, shrinking, HTTPS-only remote traffic and loopback media exception are configured. Missing signing/debug identities are rejected by release guards. |
| Phone test preparation | Ordered checklist, fixture requirements, targets and read-only metric collection are prepared; no phone was accessed. |

The updated unstripped AAR was 17,026,817 bytes. The final stripped AAR is
**8,671,388 bytes** and passed alignment and Kotlin checks. Release invocations
now request `-StripSymbols`; this changes the library build, not the APK permission
gate. Neither AAR size nor JS bytecode size measures APK size, installed disk use
or process PSS. Final APK size, JNI behavior, codecs, performance and battery must
be checked after an authorized build.

Repeated saves of an unchanged playback position are now skipped. This reduces
idle history writes; it is not a measured battery claim. Library/cache/network
bounds and the first-release foreground-only policy remain in place.

## Remaining environment inputs

1. **A real HTTPS backend URL.** No staging server/domain is set up. Until then
   browsing/account flows cannot be verified end to end on the phone.
2. **Real Redis/Nginx verification.** Local Docker/WSL reports
   `HCS_E_HYPERV_NOT_INSTALLED` and virtualization unavailable. No firmware,
   optional Windows feature or reboot was changed automatically. A manual Linux
   CI workflow and disposable real-container check are prepared as an alternative;
   they have not been uploaded/dispatched/run during this task.
3. **Private signing inputs for delivery.** No release keystore/passwords were
   generated or collected. They are required before a release build, not for a
   separately authorized development test APK.
4. **Explicit APK approval.** Permission for source/AAR preparation does not
   authorize app assembly, installation or distribution.

The first two items remain open. Do not relabel them passed because Compose
parses, tests use a Redis emulator, or a trusted local test certificate works.

## Repeatable checks

```powershell
npm run validate:mobile
npm run validate:mobile:native -- -Offline -StripSymbols
npm run validate:backend:integration
npm run validate:deployment
npm run check:apk-readiness
```

`check:apk-readiness` inspects generated configuration, source maps and the existing
AAR; it never builds anything. It writes `.cache/android-apk-readiness.json` with
hashes/sizes and boolean backend/signing status, not secrets. `--require-backend`
fails if the HTTPS URL is missing. `--release` also checks signing inputs and
rejects a debug identity. Those negative cases were checked with isolated dummy
inputs. A format check does not prove endpoint connectivity or signing-password
correctness. Supply real public configuration through the process environment
when running the check; it does not load Expo's dotenv files automatically.

The production export used:

```powershell
# From apps/mobile; exports JS/assets only.
npx --no-install expo export --platform android --source-maps --output-dir .expo/pre-apk-export
```

Security assessment: [native dependencies](android-native-dependency-review.md)
and [npm tooling](android-dependency-review.md). The final Android ARM64/CGO scan
reports no vulnerable called symbols; the unmaintained OpenPGP package is still
a module-level finding without an imported/called path in the checked entry point.
The native linker uses an upstream-documented private-symbol workaround, pinned
and reviewed against the current Go version; phone interface/network checks remain
mandatory. Do not interpret these results as a vulnerability-free APK claim.

## What happens after environment setup and approval

Before any APK build, record the proposed variant, backend, signing identity,
ARM64 target, output location and purpose. An initial test APK is for the
[phone acceptance checklist](android-phone-test-checklist.md). Delivery remains
gated on the actual device results, measured optimization, signing/update checks
and approval for the final release build.

No USB action is needed now. Functional testing can start by installing an
approved APK through the phone's Files app. Wireless ADB metrics can be paired
later; `apps/mobile/scripts/collect-phone-metrics.ps1` only reads app memory/frame
counters and battery state and saves them locally. It does not install an app,
change phone settings or gather device-wide logs.
