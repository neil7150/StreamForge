# First device-local phone-test APK — 26 October 2026

The user explicitly authorized a local test APK after updating GitHub. Source
commit `909491342061a4384841e8aa3d1a79ddba9f9b3b` was pushed to `origin/main`
and the remote SHA verified before the APK build began. No installation,
publishing, GitHub release or APK upload was performed.

## Artifact

- Local handoff: `.cache/artifacts/StreamForge-1.0.0-test-arm64.apk`
- SHA-256: `e9ab22d435837cf1a2568b0a5fd4f3a388028be1277f5a6265b35a1fdaec39d5`
- Exact size: **52,489,385 bytes** (52.49 MB / 50.06 MiB).
- App ID: `com.streamforge.app.test`, version `1.0.0-test`, version code 1.
- Minimum SDK 24, target/compile SDK 36; ARM64 only.
- Internal Android debug certificate, valid APK Signature Scheme v2 signature.
  This is a non-debuggable standalone test variant, not a production signing
  identity. It installs separately from `com.streamforge.app`.
- Bundled Hermes JavaScript: **3,359,024 bytes**. Metro/PC server is not required.

Build command, run only after the explicit permission:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File apps/mobile/scripts/run-android.ps1 -AssembleOnly -StandaloneTest -AuthorizeApkBuild
```

Go binding rebuilt with stripped symbols and verified ARM64/16 KiB LOAD/RELRO.
Expo regenerated Android configuration, then `assembleStandaloneTest` succeeded
with 423 actionable tasks. R8 shrinking and release lint tasks completed. Build
warnings included dependency deprecations, SDK metadata parser version mismatch,
and Gradle daemon metaspace pressure; the build succeeded. Build-tool memory is
not an Android app-memory measurement.

## Post-build verification

- `apksigner verify --verbose --print-certs` succeeds.
- APK contains its standalone JavaScript bundle and Go JNI library.
- All 19 native libraries are ARM64; ELF LOAD alignment is at least 16 KiB.
- `zipalign -c -P 16 4` passes.
- R8 mapping retains `go.Seq` and `mobile.Mobile` names required by JNI.
- Final manifest is non-debuggable and disables Android backup.
- Final permissions exclude broad external storage and SYSTEM_ALERT_WINDOW.
  Normal permissions include internet/network state, wake lock, vibration and
  SecureStore's biometric/fingerprint declarations; this does not enable an app
  account requirement or prove that any biometric prompt is used.
- No Android phone was accessed or tested. Artifact checks cannot establish
  startup/JNI loading, source availability, codec support, thermal behavior or
  memory/battery performance on the reference device.

Local diagnostic evidence is ignored under `.cache/`: `standalone-apk-build.log`,
`standalone-apk-verification.json`, `standalone-apk-signature.txt`,
`standalone-apk-manifest.txt` and `standalone-apk-permissions.txt`.
Generated binaries and private/local environment files are not committed.

## User's first test

Transfer the APK to the Nothing Phone 2a Plus using a normal file-transfer method
and open it in the phone's Files app. USB is not required. Install and launch it.
First confirm the app opens without Metro or an account and that all tabs work.
Next check airplane-mode library access, movie/series search/details, and a
controlled, permitted magnet. Then verify saved watchlist/history/preferences
after force-closing and reopening. Follow `android-phone-test-checklist.md` for
the remaining playback, lifecycle, cache and resource tests. Physical test results
are still pending; do not mark those checks passed from a successful build.
