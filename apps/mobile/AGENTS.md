# Android implementation instructions

- Follow `../../docs/android-development-plan.md` and track evidence in `../../docs/android-implementation-status.md`.
- Do not generate a debug, development or release APK until the user explicitly authorizes that build. This applies to Gradle assembly, Expo run commands and npm wrappers. A build guard flag does not substitute for user authorization.
- Use `npm run validate:mobile` from the repository root for source validation; it does not generate APKs.
- `npm run validate:mobile:native` is a separate library-only compile/test check. It builds the internal Go AAR and Kotlin library under a task whitelist; it must never run app/APK tasks or install anything.
- After each major implementation step, explain what changed, which checks passed and what the user should test. Distinguish source checks from native compilation and physical-device verification.
- Main reference device: Nothing Phone 2a Plus, Android 16, 8 GB RAM. Keep disk, native memory, networking and idle activity bounded; do not infer performance from TypeScript or debug artifact size.
