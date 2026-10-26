# Botkeep staging deployment — 25 October 2026

**Archived deployment path:** the user subsequently chose a device-local Android
release without accounts or an owned backend. Botkeep/PC hosting is no longer
required for that release. This guide and backend source are retained for a future
account feature; existing hosted resources were not deleted or changed by the
mobile scope update. See [the current app architecture](android-local-first.md).

## Status

### Staff confirmation received — 26 October 2026

The user supplied Alfredo's Botkeep support reply for `streamforge-auth-redis`.
Staff inspected deployed configuration (not live administrative CONFIG/INFO):
maxmemory 64 MiB, noeviction, appendonly yes, appendfsync everysec, save `60 1000`,
data directory `/home/container/data`, and AOF manifest/base/incremental files
present. Staff confirms normal restart and Redeploy reuse that directory.
Deletion/reinstallation, replacing restores, disk exhaustion and infrastructure
loss are excluded. Every-second AOF can lose recent writes in an abrupt failure.
The reply grants no additional application ACL permissions and offers no live
customer policy API. Preserve the ticket as the configuration evidence.

The API now supports explicit `botkeep-staff-confirmed` policy mode. Default
`live` mode still requires CONFIG GET and fails on denial or another policy;
there is no automatic fallback. Botkeep mode requires the exact attested TLS
host:port and a non-placeholder confirmation reference, and logs that policy is
staff-confirmed rather than verified live. TLS, login, connection checks and
runtime Redis error handling remain active. If the Redis endpoint or provider
configuration changes, obtain new confirmation and update the record.

For this confirmed authentication instance, set these alongside the private
connection credentials in the API's Environment panel or private `.env`:

```dotenv
AUTH_REDIS_POLICY_MODE=botkeep-staff-confirmed
AUTH_REDIS_ATTESTED_ENDPOINT=5.230.173.72:30863
AUTH_REDIS_ATTESTATION="Botkeep Alfredo; streamforge-auth-redis; received 2026-10-26"
```

The cache Redis user's screenshot also confirms verified TLS and authenticated
PING. Cache GET/SET, eviction/capacity and hosted API operations remain untested.
PostgreSQL authenticated permission checks passed; extensions are available but
not installed, and hosted migrations remain untested. No API deployment or APK
has occurred. The Redis policy blocker is resolved through explicit staff
attestation, with ongoing capacity/persistence monitoring dependent on Botkeep.

Increase auth Redis disk from 128 to **256 MB** before starting the API, retaining
128 MB RAM and 10% CPU. This adds rewrite headroom within the existing free plan;
it is not a guarantee that every workload/AOF rewrite fits. With the API allocation
below, total reserved storage becomes 1,856 MB, leaving 192 MB unallocated.
Check provider disk/persistence alerts and keep independent backups. Application
write errors are logged and returned as failures; this is not a provider disk
alerting system. Local regressions cover OOM login/blacklist writes and failed
refresh revocation. Logout now returns an error when refresh revocation fails
instead of continuing to a misleading success response.

Updated backend-only ZIP: **10,575,804 bytes**, with AMD64 **15,229,088-byte** and
ARM64 **14,352,544-byte** static executables. Packaging rechecked Linux ZIP paths,
binary SHA-256 hashes and the strict-default environment example. API race tests
and the full local PostgreSQL/HTTPS suites pass, including the new failure cases.

### Hosting progress after initial preparation

The user has now provisioned PostgreSQL 18 (`streamforge-postgres`) and
authentication Redis 8.2 (`streamforge-auth-redis`). The original "no server"
statement below describes the initial packaging checkpoint, not current hosting.
Cache Redis 8.2 (`streamforge-cache-redis`) has also been provisioned, using the
third server slot. Its separate public CA has been provided. The API is not yet
provisioned. `.cache/botkeep/Check Cache Redis.cmd` uses the connection-only probe:
verified TLS, authentication and PING, with no CONFIG/INFO calls or writes. This
does not establish cache eviction policy, capacity or application GET/SET access.

The user's authenticated Redis probe passes verified TLS and PING. All selected
CONFIG GET checks are rejected and INFO persistence is unavailable. Eviction,
memory limits and persistence remain unverified. The user opened a Botkeep
technical support ticket requesting policy/persistence details and a supported
startup policy check. This was the earlier blocker; the staff-confirmation
section above records its resolution without claiming live CONFIG verification.

The web query editor rejects the privilege functions used by the preflight.
Instead, run `deployments/botkeep/check-postgres.sql` through the direct TLS
client using `scripts/check-hosted-postgres.ps1` and the ignored
`.cache/botkeep/Check Postgres.cmd` launcher. A no-password connection with
`sslmode=verify-full` and the downloaded PostgreSQL CA reached the password
challenge (`fe_sendauth: no password supplied`). The user's subsequent screenshot
confirms authenticated preflight success against PostgreSQL 18.6: the `botkeep`
account has database CREATE and public schema USAGE/CREATE privileges. Both
`uuid-ossp` and `pgcrypto` are available but not yet installed.
The wrapper uses PowerShell's starred secure password prompt and read-only
session defaults. It passes the password only in the temporary psql child-process
environment, removes the launcher copy after starting, and does not save it to a
file or add it to process arguments. The password-free TLS preflight also passes
through this output-capturing wrapper. This reads
server version, account CREATE/USAGE privileges and extension availability.
It does not test successful migrations, trusted-extension installation,
restart persistence or backup restoration. Those remain gates.

The compact backend and upload package are prepared locally. No server has been
created, uploaded or started. Botkeep compatibility and public HTTPS are not yet
verified. No APK was generated, and APK permission remains required separately.

The screenshots show a managed application platform with an editable start
command, ZIP upload and Files/SFTP. This is not the root/Docker VPS assumed by
the separate Compose guide. Official [hosting documentation](https://botkeep.cloud/docs/hosting)
describes PostgreSQL/Redis profiles, assigned `SERVER_PORT` and HTTPS Domains.
Actual account capabilities, database permissions and resource minima must be
checked before committing the allocation below.

## Architecture within the free plan

`services/api` combines the existing auth, catalog, search and user application
constructors behind one HTTP process. Business rules and mobile API contracts
remain shared with the separate services. It does not run a torrent engine or
proxy media through the backend. The Android native engine handles media locally.

One PostgreSQL database holds independently migrated `streamforge_auth`,
`streamforge_content` and `streamforge_user` schemas. Search shares the content
pool. Each pool is capped at four connections, with one minimum idle connection.
Extensions are installed once in `public`, and each schema has its own migration
history. The database account needs CREATE on its database and public schema for
the trusted `uuid-ossp`/`pgcrypto` extensions. It does not need superuser access.
This is a fresh deployment path, not an automatic migration from three existing
production databases.

Authentication Redis and disposable cache Redis must be different server
instances, not logical databases of one Redis process. The auth instance must
use `noeviction` and durable persistence; losing revocations can admit previously
logged-out tokens. Cache Redis may use LRU eviction. Auth startup checks
`CONFIG GET maxmemory-policy` in default live mode. Explicit Botkeep mode instead
requires the recorded provider evidence described above.

Tentative allocation, subject to the profile minimums shown by Botkeep:

| Slot | RAM | CPU | Storage |
|---|---:|---:|---:|
| Combined API | 512 MB | 0.5 vCore | 256 MB |
| PostgreSQL | 768 MB | 0.5 vCore | 1,280 MB |
| Authentication Redis | 128 MB | 0.1 vCore | 256 MB |
| Cache Redis | 128 MB | 0.1 vCore | 64 MB |
| Total | 1,536 MB | 1.2 vCore | 1,856 MB |

These are starting budgets, not measured requirements or a capacity guarantee.
The account's 2 GB storage is tight: PostgreSQL WAL, Redis persistence and logs
must fit their allocations. Keep backups outside this account's storage pool.
Check profile minimums and persistence overhead before creating the services.
Do not host media files or dependency/build caches here. Verify usage under load
before increasing traffic. Free staging capacity is not a production SLA.

## Upload artifact

Run `npm run package:backend:botkeep` from the repository root. The ignored output
is `.cache/botkeep/streamforge-backend-botkeep.zip`. It contains stripped static
Linux AMD64 and ARM64 executables built with Go 1.27.3, embedded SQL migrations,
`start.sh`, an example environment file, public CA instructions and SHA-256 hashes.
The package includes no secrets or Android artifacts. Staging directories are
kept in the ignored cache for inspection.

Choose Application → Go, leave the sole 1.27.1 runtime profile selected, then use
this exact start command:

```sh
sh start.sh
```

The launcher chooses the CPU architecture and restores executable permission if
ZIP extraction discards it. The host compiler is unused: the executable embeds
Go 1.27.3. Botkeep still needs to permit executing uploaded binaries; this remains
unverified until startup. Never use `go run .` with this binary-only archive.
The process listens on `0.0.0.0:SERVER_PORT`, with an assigned provider port.
The launcher defaults to `GOMAXPROCS=1` and a soft Go memory limit of 384 MiB;
this is not an RSS cap. Password and OAuth work is capped at two concurrent jobs,
total HTTP work at sixteen, and bodies at 4 MiB. The shared staging auth budget
is 30 requests/minute with burst eight. Per-user fairness requires verified proxy
IP handling before scaling; forwarded-IP headers are not blindly trusted.

## Ordered setup and checks

1. Inspect Database → PostgreSQL and Database → Redis profile minimums and
   connection options. Confirm verified TLS, PostgreSQL CREATE permissions,
   two distinct Redis instances, auth `noeviction` and persistence. Policy evidence
   is live CONFIG access or the explicit Botkeep staff-confirmed mode above.
   Do not disable certificate checks or combine auth and cache to force deployment.
2. Provision the three data services within the confirmed budget. Record their
   connection details privately. Do not paste passwords, tokens or private keys
   into chat. Configure auth persistence and private backups; disposable cache
   does not need backups.
3. Select ZIP archive for the API and upload the generated ZIP with its files at
   the server root, or create a blank workspace and upload through Files/SFTP
   before starting. Server name can be `streamforge-api`; project is optional.
   Choose the confirmed API allocation and use `sh start.sh`.
4. Set `DATABASE_URL`, `AUTH_REDIS_URL`, `CACHE_REDIS_URL` and a private random
   `JWT_SECRET` of at least 32 characters using Environment or a private `.env`.
   Process environment values override `.env`. URL-encode URI passwords.
   Remote PostgreSQL requires `sslmode=verify-full`; remote Redis requires
   `rediss://` with certificate verification. Upload provider public CA files
   when required and reference them using the example paths. Never upload
   certificate private keys. Botkeep supplies `SERVER_PORT`.
5. Start the API and inspect startup errors without sharing credentials. It
   applies migrations and checks both Redis connections and the auth policy.
   Enable the provider HTTPS Domain for the assigned port. `/health` is a
   liveness response, not an ongoing database/Redis health probe.
6. Run the existing staging probe against the HTTPS origin as documented in
   `backend-deployment.md`. Test registration/login, catalog/search, library
   writes, expiry/refresh, logout revocation, restart persistence and auth Redis
   outage/recovery. Check database schemas, resource use and database/Redis
   backup restore. No media catalog is populated by this binary; use an explicit
   lawful staging fixture/import through the protected admin API.
7. Only after hosted checks pass, configure the mobile HTTPS origin. Signing,
   explicit APK permission and the ordered Android phone checks remain separate
   gates. No USB work is required during this hosting preparation.

SMTP and OAuth are optional configuration inputs in `.env.example`. Without a
working SMTP provider, email verification delivery is not ready. OAuth must
remain unconfigured until provider credentials and redirect flows are verified.

## Local verification

The user subsequently provisioned PostgreSQL 18 and authentication Redis 8.2.
Using the provided Redis CA, a direct TLS-only check of the authentication Redis
endpoint passed CA trust and server-identity verification. This did not authenticate
or prove eviction/persistence settings. `scripts/redis-probe/main.go` and
`scripts/check-hosted-redis.ps1` provide a read-only authenticated check, with the
password supplied through a hidden local prompt and stdin rather than arguments,
files or logs. Only AUTH, PING, selected CONFIG GETs and INFO persistence are sent.
The ignored `.cache/botkeep/Check Redis.cmd` launcher uses the locally copied CA.
Do not count authentication, CONFIG permissions, persistence or restart durability
as verified until those checks actually run.

Initial 25 October ZIP: **10,572,268 bytes**, containing AMD64 **15,224,992-byte** and
ARM64 **14,287,008-byte** backend executables. ELF architecture, Go 1.27.3/CGO-off
build metadata, Linux-compatible ZIP paths, launcher LF endings and packaged
binary SHA-256 hashes were checked. Source validation passes 47 JS regressions,
TypeScript and Go suites; combined API race checks pass, including bounded OAuth
password work. These are backend artifact sizes, not Android APK measurements.

The live integration runner exercises both separate services and the compact
handler using disposable PostgreSQL 16 and local HTTPS. Compact tests create a
non-superuser database account, apply isolated migrations twice, inspect each
schema's migration state and repeat the existing auth/catalog/sync/two-device
regressions. Redis is a test TCP emulator in this suite; no real Botkeep Redis or
Linux executable startup has been tested on this Windows host.

The standalone API graph pins advisory-fixed Fiber, pgx, JWT, Redis and Go x/*
dependencies. Initial scanning reported nine called-symbol advisories, including
[pgx](https://pkg.go.dev/vuln/GO-2026-5004),
[Fiber](https://pkg.go.dev/vuln/GO-2026-4543),
[JWT](https://pkg.go.dev/vuln/GO-2025-3553) and
[Redis](https://pkg.go.dev/vuln/GO-2025-3540). After updating, `govulncheck ./...`
with `GOWORK=off` reports no vulnerable called symbols; two uncalled dependency
advisories remain. This evidence applies to the compact API graph, not a blanket
claim about every standalone module in the repository. Fiber v2 is deprecated;
a v3 migration is a separate change requiring API/middleware regression checks.
