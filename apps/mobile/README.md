# StreamForge Android development

## Current build restriction

APK generation requires explicit user permission. Commands in the Run and Release
sections require that permission. The Android runner also requires the
`-AuthorizeApkBuild` flag and rejects calls without it before doing native work.
The flag records deliberate invocation; it does not replace the user's approval.

Safe source validation from the repository root:

```powershell
npm run validate:mobile
```

This runs TypeScript checks, JavaScript/Go tests and script syntax checks. It
does not run Expo prebuild, Gradle assembly, gomobile binding or APK generation.

The updated source requires native protocol 2, AsyncStorage and SecureStore.
The internal Go library and Kotlin module now compile together; no updated APK
exists. A separately authorized app build is still needed for device validation.

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

Copy `.env.example` inside this directory to `.env` and set
`EXPO_PUBLIC_API_BASE_URL` to a reachable HTTPS API gateway. This value is public
configuration; do not put credentials in it. Missing configuration produces an
unavailable catalog instead of silently using sample data or device localhost.

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
