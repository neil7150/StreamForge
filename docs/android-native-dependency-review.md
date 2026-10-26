# Native dependency review — 25 October 2026

This checkpoint reviews the Go mobile entry point and its build toolchain. It does
not certify an unbuilt APK or replace real Android networking/playback tests.

## Applied changes

| Component | Previous | Prepared version |
|---|---|---|
| Go toolchain | 1.27.0 | 1.27.3, pinned in workspace/modules and native build script |
| anacrolix/torrent | 1.56.1 | 1.61.0 |
| Gorilla WebSocket | 1.5.0 | 1.5.3 |
| golang.org/x/net | 0.59.0 | 0.60.0 |
| Pion DTLS | v2 2.2.4 | v3 3.1.4 through the supported torrent transport update |
| Pion STUN | old transport chain | v3 3.1.5 |
| OpenTelemetry | 1.38.0 in the first candidate | 1.42.0 |

The [Go release history](https://go.dev/doc/devel/release) records security fixes
in 1.27.2 and the x509 fix in 1.27.3. The original DTLS v2 branch has no fixed
release for [GO-2026-4479](https://pkg.go.dev/vuln/GO-2026-4479). A patched supported
v3 transport was adopted after testing the torrent-library update in an ignored
scratch module. WebTorrent remains disabled; no new streaming feature is exposed.

The update requires storage `OpenTorrent` to accept a context. The bounded cache
now rejects a cancelled open before creating files. The fake reader implements
the updated reader contract, and the real loopback torrent fixture owns its seed
file handle explicitly instead of relying on upstream's default part-file pool.
The fixture still streams through real peer connections into production bounded
storage and checks hashes, eviction, seeks, concurrent readers and cancellation.

## Android linker requirement

Pion's pinned `github.com/wlynxg/anet` 0.0.5 dependency uses private Go IPv6 zone
cache symbols for Android interface enumeration. Its
[documented Go 1.23+ build requirement](https://github.com/wlynxg/anet#how-to-build-with-go-1230-or-later)
is `-checklinkname=0`. The first updated Android link failed without it. The native
build script now supplies that flag, retains the 16 KiB LOAD/RELRO linker settings,
and pins Go 1.27.3. The private cache structures were compared with Go 1.27.3 and
x/net 0.60.0 and match at this checkpoint. Future toolchain updates must repeat
that review and native/phone checks. This is not a reason to disable TLS checks.

## Scanner scope

Pinned checker: `golang.org/x/vuln/cmd/govulncheck@v1.9.0`, official database
`https://vuln.go.dev`. Reports are ignored local diagnostics in `.cache/`.

- Host module scan: `GOWORK=off`, `CGO_ENABLED=0`, all daemon packages.
- Android scan: `GOWORK=off`, `GOOS=android`, `GOARCH=arm64`, `CGO_ENABLED=1`,
  NDK 27.1.12297006 `aarch64-linux-android24-clang.cmd`, mobile package entry point.
- A first Windows CGO attempt failed on the older libutp C typedef/compiler
  language mode; a C17 retry produced the initial report. A failed scan is not
  counted as a clean result.
- JSON output can exit successfully while containing findings. Assessment checks
  reported symbol traces, not just the exit code.

Unmaintained `x/crypto/openpgp` can still be reported at module level because that
module contains the package. It is not imported/called by the checked mobile
entry point. Keep module-only reports distinct from vulnerable called symbols.
The source scan is not proof about every native dependency or the final APK.

## Before delivery

Inspect the final rebuilt AAR's Go version/alignment, Kotlin compatibility and
symbol-stripping result. Review the exact final module locks and APK contents.
On the Nothing Phone test interfaces/Wi-Fi switching, metadata/peer acquisition,
episode selection, seeks, background stop and repeated cleanup. Record actual
process PSS and APK size; a compressed AAR or JS bundle is not either measurement.
