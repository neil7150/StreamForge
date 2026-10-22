# Android dependency review — 20 October 2026

Scope: `npm audit --workspace=apps/mobile --omit=dev --json`, the installed dependency paths and a production Metro/Hermes JS export. This does not audit Go modules, native libraries, the server or a finished APK.

## Applied compatible updates

| Package | Before | After |
|---|---|---|
| shell-quote | 1.10.0 | 1.12.0 |
| @react-navigation/core | 7.21.13 | 7.24.0 |
| @react-navigation/routers | 7.6.4 | 7.6.5 |
| @xmldom/xmldom | 0.9.10 | 0.9.12 |
| brace-expansion | 5.0.7 | 5.0.12 |
| http-cache-semantics | 4.2.0 | 4.3.0 |
| js-yaml | 4.3.0 | 4.3.2 |
| nanoid | 3.3.15 | 3.3.20 |
| postcss | 8.5.16 | 8.5.31 |
| source-map-js | 1.2.1 | 1.2.2 |

Updates use existing dependency ranges. Expo remains 57.0.22 and React Native remains 0.86.3. SecureStore and AsyncStorage added in the earlier persistence checkpoint retain their SDK-compatible versions. Nested brace-expansion copies also received compatible patches. The shared lockfile reconciliation includes desktop workspace metadata and optional development peer records; those records are not evidence of additional Android runtime modules. Package lifecycle scripts were disabled during installation.

Navigation core no longer depends on query-string; its unused query-string/decode-uri-component/filter-obj/split-on-first/strict-uri-encode chain was removed. TypeScript, 24 JS tests, Go tests, plugin/script parsing and a production Android JS export passed after the updates. Native linking and physical navigation/deep-link tests remain pending.

The reported graph changed from **34 entries (one critical, 23 high, 10 moderate)** to **23 entries (zero critical, 16 high, seven moderate)**. npm counts affected parent packages as well as the vulnerable leaf; these totals do not count distinct flaws in the installed Android app.

## Remaining advisory paths

| Underlying package | Installed path and use | Assessment and next action |
|---|---|---|
| braces 3.0.3 | Expo CLI → Metro file map → micromatch → braces. Installed Metro watcher code matches filesystem paths against configured glob patterns. | The [deep-pattern stack-exhaustion advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) lists no patched version. Keep build/watch configuration trusted; evaluate a supported Metro/Expo fix when available. No application feature accepts glob configuration. |
| node-forge 1.4.0 | Expo CLI and @expo/code-signing-certificates. Used for development certificates and related tooling, with an additional iOS signing helper in CLI code. | The [signature verification advisory](https://github.com/advisories/GHSA-86w9-cpqp-85rv) affects the installed version. Certificate tooling remains a build-environment concern requiring upstream remediation/review; it is not Android APK signing through Gradle. Do not claim the tooling is vulnerability-free. |
| uuid 7.0.3 | Expo config plugins → xcode → uuid. The installed xcode generator calls `uuid.v4()` without a supplied buffer. A separate dev-only ngrok path also has uuid 3.4.0. | The [bounds-check advisory](https://github.com/advisories/GHSA-w5hq-g745-h8pq) concerns v3/v5/v6 with a caller-provided buffer. The inspected xcode call does not use that operation. Do not force uuid 11 into an older xcode package; track a compatible upstream update. |

The latest Android JS source-map inventory contains no modules from braces, node-forge, uuid or shell-quote. This supports the conclusion that the inspected export does not ship those JS implementations; it is not proof about an unbuilt APK, native code, development binaries or every possible configuration. Inspection maps are local diagnostics, not delivery artifacts.

`npm audit` proposes old Expo 44 and React Native 0.72 versions to avoid some parent paths. Those are framework downgrades and were not applied. No `npm audit fix --force` or incompatible transitive override was used.

## Before delivery

- Recheck advisories against the exact release dependency lockfile and toolchain.
- Review Go/native dependency advisories separately.
- Verify navigation, deep links, process restart and native module linking in an authorized test binary.
- Inspect the actual release package and record size and dependencies before calling the app lightweight or ready for delivery.

The dependency patch step generated no APK. The subsequent native-integration checkpoint compiled an internal AAR and Kotlin library; see `android-implementation-status.md`. APK generation still requires explicit user permission.
