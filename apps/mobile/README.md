# StreamForge Android development

Current release scope: device-local, no accounts and no owned backend. Catalog
metadata is fetched directly from the existing public providers; torrent playback
and library/preferences are handled on the phone. Internet is still required for
online metadata/source discovery and peers. See
[current architecture and pending tests](../../docs/android-local-first.md).

## Wi-Fi live testing (current development workflow)

Install the separately identified **StreamForge Dev** APK once, then run
`npm run dev:phone --workspace=apps/mobile` from the repository root, or
double-click `apps/mobile/scripts/start-dev.cmd`. Keep the terminal open and put
the PC and phone on the same Wi-Fi. Open StreamForge Dev and scan the generated
QR, or enter the printed `http://<PC-LAN-IP>:8081` in its development launcher.
No USB, Expo account, app account, hosted backend or cloud build is required.
The development app uses `com.streamforge.app.dev`, has its own local data, and
does not replace the existing standalone `com.streamforge.app.test` app.

Saving UI/JavaScript changes uses Metro/Fast Refresh. Source tests and library
tests still run without an APK. Go/Kotlin, native dependency and Android config
changes require an explicitly authorized new development APK. The launcher checks
a native-input fingerprint and refuses stale native builds; ordinary UI edits
and unrelated desktop dependency changes do not invalidate it. An initial or
updated development APK, after explicit permission, is built with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File apps/mobile/scripts/run-android.ps1 -AssembleOnly -Development -AuthorizeApkBuild
```

The build records `.expo/dev-native-build.json`. The launcher refreshes
`.expo/dev-connection.json` and `.cache/artifacts/StreamForge-Dev-WiFi-QR.png` each
time, so it can handle a changed PC LAN address. `STREAMFORGE_DEV_HOST` may select
another IPv4 address already assigned to this PC. The normal workflow does not
use a public tunnel. Ctrl+C stops the live server.

For this PC, Windows currently treats the Wi-Fi as Public and has explicit Public
Node.js blocks. The user chose to keep that profile. Run
`apps/mobile/scripts/allow-dev-wifi.cmd` once and accept its administrator prompt
to configure the restricted Wi-Fi/LocalSubnet TCP 8081 exception. It saves the
original blocking-port filters, excludes only TCP 8081 from the explicit TCP
block, leaves UDP/other TCP ports blocked, and adds the narrow allow rule.
`undo-dev-wifi.cmd` restores the saved port filters and removes the exception.
These are manually run setup helpers; builds, source tests and Metro startup
never change Windows firewall settings or the network profile automatically.

The debug-only resource overlay permits LAN HTTP for Metro and registers the
unique `streamforge-dev` QR scheme. Release and standalone-test builds retain
their loopback-only cleartext policy, signing restrictions and storage/overlay
permission blocks. Development tools are for iteration; evaluate final startup,
size, heat and memory on a later optimized standalone APK. A development APK can
be larger and slower than that optimized build.

Expo SDK 57 recreates native folders by default. The runner uses `--no-clean`
when applying tracked, idempotent plugins, retaining native compiler outputs.
Do not prebuild or assemble for an ordinary JS edit.

## Current build restriction

An authorized standalone phone-test build uses:

```powershell
powershell -ExecutionPolicy Bypass -File apps/mobile/scripts/run-android.ps1 -AssembleOnly -StandaloneTest -AuthorizeApkBuild
```

Run from the repository root, only after explicit build permission. This variant
bundles production JavaScript, is non-debuggable, uses ARM64/shrinking/stripped
native symbols, and is signed with the local Android debug certificate under
`com.streamforge.app.test`. It is an internal test APK, not a delivery signing
identity, and runs without Metro. It does not install or publish the app.

APK generation requires explicit user permission. Commands in the Run and Release
sections require that permission. The Android runner also requires the
`-AuthorizeApkBuild` flag and rejects calls without it before doing native work.
The flag records deliberate invocation; it does not replace the user's approval.

Safe source validation from the repository root:

```powershell
npm run validate:mobile
```

This runs TypeScript checks, JavaScript tests, all four backend service tests,
shared Go packages, torrent daemon tests and script syntax checks. It
does not run Expo prebuild, Gradle assembly, gomobile binding or APK generation.

The updated source requires native protocol 2, AsyncStorage and SecureStore.
The internal Go library and Kotlin module compile together. The first explicitly
authorized standalone phone-test APK is recorded in
[the 26 October build record](../../docs/android-test-build-2026-10-26.md).
Physical-device testing is still pending; future APK builds require authorization.

Library-only native validation from the repository root:

```powershell
npm run validate:mobile:native
```

This compiles the ARM64 Go AAR, verifies its architecture and 16 KiB ELF LOAD/RELRO
alignment, compiles the Kotlin module and runs its lifecycle unit tests. Its
Gradle init script permits only the two named library tasks and rejects app/APK
tasks. It does not create an APK, install anything, run an emulator or contact
the phone. A generated Android project, SDK, NDK and JDK are required. Add
`-- -Offline` when all dependencies are cached. This check is separate from the
fast source validator.

Native project configuration can be regenerated with Expo prebuild without
creating an APK. Prebuild may replace the ignored `android/` directory, including
old generated outputs; keep durable changes in tracked configuration plugins.

No backend `.env` or `EXPO_PUBLIC_API_BASE_URL` is required. Mobile ignores an old
backend URL and does not restore account credentials or run cloud synchronization.
Account/backend source remains in the repository for a future explicitly scoped
feature; it is not required for this device-local release.

The separate `npm run validate:backend:integration` command now verifies the
auth/sync flow against disposable PostgreSQL and local HTTPS with a test-only
Redis emulator. Setup and evidence are in `../../docs/backend-integration-tests.md`.
It does not build or install the Android app.

This app uses a local Expo module to start the Go torrent daemon inside an
Android development build. Expo Go cannot load that native module.

## First-time setup

1. Install Android Studio, Android SDK platform 36, Android SDK Build-Tools 36,
   and an Android NDK. Create an emulator in Android Studio or connect a device
   with USB debugging enabled.
2. Install Go and `gomobile`, then initialize its Android bindings:

   ```powershell
   go install golang.org/x/mobile/cmd/gomobile@v0.0.0-20260908204917-8b95e45f8d3e
   gomobile init
   ```

3. From the repository root, install Java 17 and the JavaScript dependencies:

   ```powershell
   npm install
   npm run setup:android --workspace=apps/mobile
   ```

If the SDK is outside the default `%LOCALAPPDATA%\Android\Sdk` location, set
`ANDROID_HOME`. The AAR build script defaults to NDK **27.1.12297006** to match
the installed React Native toolchain. Install that revision or explicitly provide
`ANDROID_NDK_HOME` / the script's `-NdkVersion` parameter. It checks the pinned
gomobile version and applies NDK r27's 16 KiB linker flags before copying a
verified library to the module.

## Run and verify

After build approval, connect an ARM64 Android phone with USB debugging enabled,
then run this from the repository root. The current configuration targets ARM64;
an x86 emulator needs a separately configured native binding and ABI selection.

```powershell
npm run android --workspace=apps/mobile -- -AuthorizeApkBuild
```

This rebuilds the Go AAR, compiles and installs the Android app, and starts
Metro. For an APK without launching an emulator, run
`npm run build:android --workspace=apps/mobile -- -AuthorizeApkBuild`, after approval. The debug APK is written to
`apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`.

Keep Metro bound to the default LAN address when running it separately:
`npm run start --workspace=apps/mobile`. The Android emulator connects to Metro
over IPv4; `expo start --localhost` can bind only to IPv6 on Windows and leave
the app at “Unable to load script.”

The generated `android/` directory, native AAR, and local tool downloads are
ignored by Git. If a verified Gradle distribution archive already exists in
`apps/mobile/.expo/`, the Android run script uses it instead of downloading the
same archive again.

## Release configuration, after explicit build approval

The tracked configuration plugin selects ARM64, enables code/resource shrinking
and replaces the generated release debug key with a release signing configuration.
The Go binding script also defaults to ARM64. React Native's installed minimum
Android API is 24; Android 16 on the Nothing Phone 2a Plus is the primary test target.
Support for older devices has not yet been verified.

Before a release build, provide `EXPO_PUBLIC_API_BASE_URL` and these environment
variables: `STREAMFORGE_KEYSTORE_PATH`, `STREAMFORGE_KEYSTORE_PASSWORD`,
`STREAMFORGE_KEY_ALIAS`, `STREAMFORGE_KEY_PASSWORD`. Never commit their values or
the keystore. The release runner checks them before generating native artifacts.

The guarded release command is
`npm run build:release:android --workspace=apps/mobile -- -AuthorizeApkBuild`.
It has not been run. Internal native-library compilation is verified; complete
application linking, signing and APK size are unverified.
The optional Go `-StripSymbols` switch is for a later measured release decision;
keep diagnostic symbols available while validating the native integration.

See `docs/android-implementation-status.md` from the repository root for current
limitations and the physical-device test checklist.

Catalog and search now have local PostgreSQL/HTTPS integration coverage through
the shared API client. Catalog episodes prefer attached sources before external
search, with validation, cancellation guards and visible load errors. The current
source suite passes 47 JavaScript tests plus TypeScript/Go checks. See
[the implementation checkpoint](../../docs/android-implementation-status.md) for
remaining staging and phone tests; APK generation still needs explicit permission.

Library synchronization now persists an account-scoped baseline to distinguish
remote deletions from pending offline edits. The Library tab refreshes on focus
and supports pull-to-refresh; unchanged collections do not upload. See the
[sync protocol](../../docs/library-sync-protocol.md) for conflict and upgrade rules.

Backend deployment preparation and the remaining staging prerequisites are tracked
in [the deployment procedure](../../docs/backend-deployment.md). Use
`npm run validate:deployment` for Compose/source checks; it does not produce an APK.
Actual container, public HTTPS and Android validation remain separate gates.

The [pre-APK checkpoint](../../docs/android-pre-apk-readiness.md) records the final
patched ARM64 library, production JS export, permission/signing guards and external
backend/signing gates. Run `npm run check:apk-readiness` for source/artifact
inspection. A ready source report never authorizes an APK build. The
[phone checklist](../../docs/android-phone-test-checklist.md) starts only after an
explicitly approved build; USB is optional for initial functional testing.
