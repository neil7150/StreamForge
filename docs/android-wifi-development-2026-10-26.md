# Wi-Fi live-development setup — 26 October 2026

The user authorized switching to a development APK so ordinary JavaScript/UI
changes can be tested without repeatedly building/installing standalone APKs.
The discovery fixes and workflow source were pushed to `origin/main` at
`6c468daacbad27f968705c9833a9a450dba0d628` before the initial development build.

## Verified development APK

- Local file: `.cache/artifacts/StreamForge-Dev-1.0.1-arm64.apk`
- SHA-256: `0b7d7b8d753221363a50e55505c02a285a653cff113367fafb4164ef76c539ec`
- Size: **102,557,734 bytes** (102.56 MB).
- Android label: **StreamForge Dev**.
- Application ID: `com.streamforge.app.dev`; version `1.0.1-dev`, version code 2.
- ARM64 only, 21 native libraries; minimum SDK 24, target SDK 36.
- Debuggable, signed with the Android test certificate, backup disabled.
- No standalone main JS bundle: Metro supplies the development JavaScript.
- Signature, app identity/name, development QR scheme, LAN cleartext overlay,
  blocked storage/overlay permissions, ZIP alignment and every native library's
  16 KiB ELF LOAD alignment passed verification. Packaged Go code/data matches
  the rebuilt AAR; the JNI Java classes remain present.
- Build succeeded in 18m 11s: 573 actionable tasks, 545 executed/28 up-to-date.
  Subsequent development builds target `:app:assembleDebug` to avoid unrelated
  library assembly tasks, and use `--no-clean` to retain native compiler outputs.

This debugging APK is intentionally larger than the optimized standalone test
APK. It is an iteration tool, not a production size/thermal/performance result.
The existing `com.streamforge.app.test` installation remains separate and keeps
its own data. StreamForge Dev starts with its own local library/settings.

## Live server and validation

The two-worker, LAN-only Metro launcher starts with:

```powershell
npm run dev:phone --workspace=apps/mobile
```

Or double-click `apps/mobile/scripts/start-dev.cmd`. The launcher prints the PC
address, creates `.expo/dev-connection.json`, and refreshes
`.cache/artifacts/StreamForge-Dev-WiFi-QR.png`. It reuses an already running Metro
server only when its project root matches this mobile app, and never silently
switches to an unapproved second port. The expected port is TCP 8081.

Verified on this PC: Metro `/status` returned `packager-status:running`, the
Android development manifest identified this project's root and `streamforge`
slug, and its launch asset compiled/served with HTTP 200. The first development
bundle was 8,905,072 bytes and took about 41 seconds to compile; this was prewarmed
before phone connection. It is served from the PC, not included in the APK.
Native-input fingerprint checks and server reuse were exercised successfully.
Source validation passed 65 JavaScript tests, mobile/core TypeScript, Go suites,
and plugin/script syntax checks. The native discovery implementation previously
passed its ARM64 library and five lifecycle checks and is included in this APK.

## One-time Public Wi-Fi exception

Windows currently classifies this Wi-Fi as Public and explicitly blocks Node.js
inbound on Public networks. The user chose to **keep it Public** and requested a
restricted development-server exception. No firewall/network-profile changes
were automatically applied by the assistant, the build, or Metro startup.

Double-click `apps/mobile/scripts/allow-dev-wifi.cmd` and accept the Windows
administrator prompt. The helper explains and applies only this scope:

- Node.js, inbound TCP **8081**, Public profile, current Wi-Fi interface,
  **LocalSubnet** remote addresses, edge traversal blocked.
- Because an explicit block overrides an allow, narrow the existing Node Public
  TCP block to `1-8080,8082-65535`; leave its UDP block and other TCP ports blocked.
- Save the original port filter in ignored `.expo/dev-firewall-backup.json`.
  `undo-dev-wifi.cmd` restores it and removes the allow rule. Unexpected blocking
  rules are rejected before mutation, and setup failures restore saved filters.

The helper's assumptions were checked against the actual TCP/UDP Public rules
and Wi-Fi adapter without applying the exception. User execution/UAC and the
actual phone connection remain pending. There is no public tunnel, router port
forwarding, account requirement or hosted backend.

## Connect and continue

1. Run the one-time Wi-Fi helper; keep the network Public as requested.
2. Install the development APK as a separate app, then open **StreamForge Dev**.
3. Put phone and PC on the same Wi-Fi. Scan the generated QR with the phone's
   camera/development launcher, or manually enter its printed HTTP address in
   the development launcher. No Expo/app login is needed.
4. Keep Metro running while testing. UI/JavaScript saves use Fast Refresh. A
   stopped/sleeping PC cannot serve the development app; restart the launcher
   for later sessions and regenerate the QR when the PC address changes.
5. Go/Kotlin, native dependencies and Android configuration still require an
   explicitly authorized new development APK. The launcher checks native input
   compatibility before starting; unrelated UI files do not invalidate it.

Phone launch, actual Fast Refresh rendering, Wi-Fi reachability after the manual
exception, Farzi availability and startup speed are not claimed passed yet.
Use a later optimized standalone APK for milestone performance testing.

Local evidence: `.cache/live-development-source-validation.log`,
`.cache/live-development-apk-build.log`, `.cache/live-development-apk-verification.json`,
`.cache/live-development-manifest-probe.json`, `.cache/live-development-bundle-probe.json`,
and `.cache/live-development-metro.log`. Build records, network addresses, PNGs,
APK binaries and signing material are not committed.
