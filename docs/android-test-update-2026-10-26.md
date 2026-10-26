# Search/player test APK — 26 October 2026

The user authorized updating GitHub first and building the next test APK.
Source commit `13dcbb9faaf32f88628ca003c4b414d92737af3b` was pushed to
`origin/main` and its remote SHA confirmed before building. No APK was uploaded,
published or installed by the build task.

## Verified artifact

- File: `.cache/artifacts/StreamForge-1.0.1-test-arm64.apk`
- SHA-256: `e6108c3c83be0329fd2f726810be38264dd14ae1e4c853647881df10bee712ec`
- Size: **52,510,469 bytes** (52.51 MB), +21,084 bytes versus the first test APK.
- Application ID: `com.streamforge.app.test`.
- Version: **1.0.1-test**, version code **2**, minimum SDK 24, target SDK 36.
- Same Android test signing certificate as the first APK; signature verified.
  Certificate SHA-256:
  `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`.
- Non-debuggable, ARM64 only, 19 native libraries, Android backup disabled.
- Bundled Hermes JavaScript: **3,380,108 bytes**; no Metro/PC server required.

The optimized `standaloneTest` build succeeded in 11m 41s, with 423 actionable
tasks (395 executed, 28 up-to-date). Native Go binding generation and 16 KiB
LOAD/RELRO checks succeeded first. Dependency deprecations and the existing SDK
metadata parser warning did not prevent the successful build.

Post-build checks passed for signature/version identity, ZIP and ELF 16 KiB
alignment, bundled JavaScript, new search/player markers, retained JNI class
names, and blocked external-storage/overlay permissions. Android packaging
changed ELF section-name metadata, so native identity was verified by comparing
every loaded Go code/data section and zero-initialized section layout with the
fresh AAR, rather than requiring byte-identical non-runtime metadata. These
comparisons passed. The final handoff file checksum was independently rechecked.

Final source validation passed, including all 59 JavaScript tests, mobile/core
TypeScript and Go suites. The earlier native library check also passed all five
Kotlin lifecycle tests. This APK has not yet been tested on the phone. Startup
improvements, subtitle format compatibility, control layout and resource use need
the physical checks below.

## Installation and phone tests

Transfer the new APK using the same method as the first test. Open it in the
phone's Files app and install it **as an update over the existing test app**.
The higher version code and matching signing identity support an in-place
update; uninstalling first would remove the local history and settings. No USB
or account/backend setup is needed.

1. Search **Your Name** and a mixed movie/show title. Check poster images, Movies
   and TV Show headings, source selection, and Continue Watching artwork.
2. Use a movie with included captions. Open **CC / Audio**, choose a subtitle
   language and Off, then try any included audio languages. Releases without
   supported included captions should explain that none are available.
3. If the torrent includes matching SRT/VTT files, select one and adjust its
   timing. Check captions after seeking and with controls visible/hidden.
4. Open **Screen** and compare Fit, Fill/crop and Stretch. Restart the app and
   check the saved mode. Borders encoded in the video may remain in Fit mode.
5. Drag and tap the larger timeline, including a large jump and a seek while
   paused. Playback should preserve its previous play/pause state.
6. Let the video play, open **Info**, and record first-picture time and buffering
   events on the same source/network. Retry/resume and a longer playback session
   should also be checked. A reported seeder count is not a connected-peer target.

Full implementation details and limits:
[search/player changes](android-playback-improvements-2026-10-26.md).

Ignored local evidence: `.cache/phone-update-source-validation.log`,
`.cache/phone-update-apk-build.log`, `.cache/phone-update-apk-verification.json`,
`.cache/phone-update-apk-signature.txt`, `.cache/phone-update-apk-manifest.txt`,
`.cache/phone-update-apk-permissions.txt` and
`.cache/phone-update-native-code-verification.json`. Binaries and local signing
material are not committed.
