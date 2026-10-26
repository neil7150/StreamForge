# Local backend integration verification — 25 October 2026

## What this verifies

`npm run validate:backend:integration` creates a new loopback-only PostgreSQL 16
cluster with a random port and generated password. It creates three uniquely named
test databases, applies the actual auth, user and content migrations, starts the production
auth/user/content/search application constructors behind a temporary HTTPS gateway, and runs the
shared TypeScript API client against it. TLS verification stays enabled; only
the test process trusts the temporary server certificate.

The check covers:

- Registration and login through the real auth handlers, password hashing and SQL.
- Two-item watchlist uploads, distinct account-scoped IDs and preserved timestamps.
- Numeric history/progress/file metadata round trips through PostgreSQL.
- Independent accounts and collection revisions.
- Two simultaneous writes at the same revision: one succeeds, one receives 409.
- A forced database insert failure rolls back both the items and revision.
- Unversioned writes are rejected; deliberate versioned clears work.
- A new client/session downloads saved data instead of reusing an in-memory list.
- Expired access tokens cause shared renewal and one retry.
- Three rounds of eight simultaneous refreshes each yield exactly one successful
  rotation. Used/revoked tokens cannot refresh again.
- Token-store faults return server/service errors, not invalid credentials, and
  recover after the fault is removed. Logout blacklists the access token.
- Two independently persisted mobile-store sessions: remote deletion, offline
  addition, history clear, reload, later re-add and suppression of unchanged uploads.
  This uses the actual shared store/client, with in-memory durable-storage adapters
  standing in for separate devices; it does not exercise Android AsyncStorage.
- The incremental user revision migration rolls down and up on a fresh database.
- Public movies/series, genres, filters, bounded movie sections, stable pagination,
  nested seasons/episodes and catalog magnets through the shared API client.
- Movie/series full-text search, suggestions, normalized pagination and empty arrays.
- Unpublished movie/show detail, seasons and magnets return 404.
- Protected admin creation of a show, season, episode and magnet; invalid dates
  are rejected, concurrent episode inserts preserve counters, duplicate inserts
  leave counters unchanged, and warmed show details are refreshed after creation.

Catalog fixtures contain metadata and dummy hashes only; these tests do not
contact torrent peers, external catalogs or search providers.

PostgreSQL and HTTPS are real local services. Redis uses **miniredis**, a test-only
TCP-compatible emulator. These results do not replace testing a deployed Redis 7
server, public gateway, proxy configuration or Android networking.

## Setup and run on Windows

From the repository root:

```powershell
npm run setup:backend:test-runtime
npm run validate:backend:integration
```

The first command downloads the portable PostgreSQL 16.15-5 archive from
[EDB](https://www.enterprisedb.com/download-postgresql-binaries), the Windows
binary distributor linked by the [PostgreSQL Windows download page](https://www.postgresql.org/download/windows/).
It pins the archive's recorded SHA-256 and extracts only `bin`, `lib`, and `share`
into `.cache/backend-tools/`. The approximately 373 MB download is developer
tooling; it is ignored by Git and is not part of the Android app. It installs no
Windows service and changes no global PATH, trust store or database settings.
The archive hash was recorded from the HTTPS download used here, not from a
separately authenticated publisher checksum.

The integration runner also accepts an existing PostgreSQL 16 binary directory:

```powershell
npm run validate:backend:integration -- -PostgresBin 'C:\path\to\pgsql\bin'
```

It always initializes its own cluster; it does not reuse an existing database.
Test databases are removed, PostgreSQL stops, and successful run directories are
deleted after shutdown. Failure diagnostics remain under `.cache/backend-tests/`.
`-KeepData` preserves a stopped run directory. Database durability optimizations
in the runner apply only to these disposable clusters.

The Go harness is an isolated module under `tests/backend/`, run with `GOWORK=off`.
Its Redis emulator and other test dependencies do not enter mobile dependencies.
No Expo, Gradle, native binding or APK build command is involved.

## Bugs caught by live verification

1. `current_time` was unquoted in the user migration and SQL statements. It is a
   reserved PostgreSQL keyword: the migration failed, and selecting it unquoted
   would not identify the saved playback column. The schema/queries now quote it.
2. Refresh rotation performed GET and deletion separately. Concurrent requests
   produced two successful renewals from one token. Rotation now consumes tokens
   with atomic Redis `GETDEL` (requires Redis 6.2+, compatible with deployed Redis
   7 configuration), followed by account-index cleanup. Missing tokens return
   invalid-credential status; token-store failures remain server errors.

3. Series list/search queries used `active`, which is not a valid show status.
   Public queries now include `ongoing`, `ended` and `cancelled` consistently.
4. Episode insertion omitted required `show_id`. The repository now derives the
   parent from its season and updates season/show counters in the same transaction.
5. Public detail/source endpoints exposed unpublished titles. Public lookups now
   enforce publication status, including episode sources through their parent show.
6. Empty episode/search collections were omitted or null; list payloads now expose
   arrays. Search input normalization, deterministic tie ordering and database error
   propagation prevent misleading empty or inconsistent results.
7. Creating seasons/episodes left show details and counters stale. Transactional
   counters and content-cache invalidation now cover those mutations.

Auth, user and content startup stop on migration failure. All four services now
share their application construction with the integration tests.

The initial user migration has been repaired because it could not initialize a
database as written. This check used fresh databases only. An existing failed,
dirty migration needs separate diagnosis; this runner does not automatically
force versions or modify a deployed database.

## Results and remaining gates

The full local suite passed on PostgreSQL 16.15, including real transaction
contention/rollback and the single-use refresh stress checks. The test PostgreSQL
process was stopped afterward. Source validation remains a separate check:

```powershell
npm run validate:mobile
```

Still pending: deployment through a real HTTPS staging gateway with production
Redis, external catalog/provider reliability, desktop sync protocol adoption,
and all Android/runtime/performance checks. Mobile conflict rules and first-upgrade
limitations are documented in [the sync protocol](library-sync-protocol.md). Content and search
use separate cache databases in deployment: search results/suggestions may remain
stale until their existing five-minute/two-minute TTLs expire after catalog edits.
This batch verifies content detail cache refresh, not cross-service invalidation. APK generation
continues to require the user's explicit permission.
