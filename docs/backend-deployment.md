# Backend deployment preparation — 25 October 2026

## Current result

The user subsequently supplied a Botkeep managed hosting account. Its compact
four-slot deployment path, upload package and remaining capability checks are in
[Botkeep staging deployment](botkeep-deployment.md). The Docker instructions below
remain an alternative for a host with a working Docker engine.

Deployment preparation is implemented. Public staging is **not deployed or verified**.
The user confirmed that no staging server or HTTPS backend address is set up.
Docker Desktop is installed on the development computer, but its Linux engine
returned an internal API error after startup and timed out on a bounded retry.
Its logs identify `HCS_E_HYPERV_NOT_INSTALLED` and unavailable virtualization;
firmware/Windows features and reboot were not changed.
No containers, real Redis run, Nginx syntax/TLS run or public gateway check passed.
No paid resources, global installation or Android artifact were created.

Available checks:

```powershell
npm run validate:deployment
npm run validate:deployment -- --config-only
npm run validate:mobile
```

The deployment validator uses the installed Docker **Compose CLI**, which does
not need a running engine for configuration parsing. It checks both Compose files,
rejects missing required staging variables, verifies internal port isolation and
separate auth Redis routing, runs each service's tests with `GOWORK=off`, and
cross-compiles all four services to Linux/AMD64. Generated backend executables
stay in ignored `.cache/deployment-check/`; they are not container images or APKs.
`STREAMFORGE_DOCKER` can select another Docker executable. Resolved configurations
and secrets are not printed; configuration checks use disposable placeholders.

## Changes

- Each service has its own complete dependency declarations and `go.sum`.
  Workspace mode had hidden missing standalone checksums. Dockerfiles now use
  standalone module mode, static Go compilation, a non-root runtime user, CA
  certificates, health checks and consistent migration paths.
- The backend image build context excludes mobile dependencies, native artifacts,
  local caches and environment files. Builder/runtime branches use
  [Go 1.27.3](https://go.dev/doc/devel/release) and
  [Alpine 3.23](https://alpinelinux.org/releases/). Actual image builds and image
  digest recording remain gates before deployment.
- Authentication refresh tokens and JWT revocations use `auth-redis`, with AOF
  persistence and `noeviction`. Disposable content/search cache uses a separate
  Redis process with LRU eviction. Each has a 128 MiB Redis memory setting; process
  overhead and capacity still require server monitoring. Auth memory exhaustion
  must be treated as an availability problem, not solved by evicting revocations.
- Development ports bind only to `127.0.0.1`. Auth Redis is on local port 6380;
  disposable cache remains on 6379. Host-run auth must use
  `REDIS_URL=redis://127.0.0.1:6380/0`; host-run content/user use that same URL as
  `AUTH_REDIS_URL`. Compose containers have those addresses configured internally.
- Optional MinIO and monitoring services are now `storage` and `monitoring`
  profiles. Moving development auth to its own new volume invalidates old sessions;
  old Redis volumes are not deleted automatically.
- Staging exposes only HTTPS port 443. Postgres, Redis and service ports remain
  inside the Docker network. Search waits for content startup/migrations. Logs
  rotate, gateway rate-limit rejections use 429, and gateway access logs omit query
  strings/referrers. The 4 MiB request limit matches the service body limit.

## Staging inputs still needed

1. A Linux host with a working Docker engine and Compose, plus administrative
   access arranged without putting credentials into chat or Git.
2. A backend DNS name pointing to that host, reachable on port 443.
3. A trusted TLS certificate covering that name: `fullchain.pem` and `privkey.pem`
   in a protected server directory, with certificate renewal arranged.
4. Fresh random database/JWT secrets and a database backup/restore procedure.
   Use 32 random bytes encoded as 64 hexadecimal characters for each secret;
   hexadecimal avoids URL-encoding mistakes in the database connection string.

No server/domain purchase or certificate issuance has been performed. Do not use
the development example credentials or bypass TLS verification on Android.

## Procedure once the host is available

The staging file is standalone. **Do not merge it with the development file**:

```sh
cp deployments/docker-compose/.env.staging.example deployments/docker-compose/.env.staging
# Replace both placeholders and TLS_CERT_DIR with real server values first.
docker compose --env-file deployments/docker-compose/.env.staging -f deployments/docker-compose/compose.staging.yml config --quiet
docker compose --env-file deployments/docker-compose/.env.staging -f deployments/docker-compose/compose.staging.yml build --pull
docker compose --env-file deployments/docker-compose/.env.staging -f deployments/docker-compose/compose.staging.yml up -d --wait
docker compose --env-file deployments/docker-compose/.env.staging -f deployments/docker-compose/compose.staging.yml exec nginx nginx -t
```

Inspect image digests and health results. Initial database creation runs only for
a fresh Postgres volume. Do not delete volumes to repair an existing migration:
inspect the migration state and back up data before any recovery. Auth and user
data are persistent; deployment changes must preserve both volume ownership and
database credentials. A public certificate renewal needs a gateway reload after
the renewed files are available.

Read-only public gateway probe from the repository:

```powershell
$env:STREAMFORGE_STAGING_URL = 'https://YOUR_BACKEND_HOST'
npm run check:staging
```

The probe verifies TLS, gateway/catalog/search routing, response shapes and
anonymous rejection on protected routes. It creates no accounts and changes no
library data. It refuses disabled certificate verification. It does **not** prove
login/sync correctness, Redis outage recovery, throughput or Android compatibility.

Before closing the deployment milestone, also run controlled staging-account
tests for registration/login, refresh rotation, logout revocation, two-device
sync, cache/auth Redis separation, Redis restart/failure recovery and database
restart persistence. Existing local PostgreSQL tests use a Redis emulator and
do not substitute for those real-service checks.

## Remaining delivery milestones

1. Finish this backend milestone: real containers and a public HTTPS staging run.
2. Finish release readiness and the controlled phone-test package.
3. Build a test APK only after explicit user approval.
4. Run phone tests, measure memory/startup/battery and fix regressions.
5. With separate approval, build/verify/deliver the signed release APK.

These are five major milestones, with deployment preparation completed within
the first. Testing may reveal additional fixes; an unavailable backend is not a
passed milestone. No phone or USB action is needed at this checkpoint.

## Prepared Linux verification alternative

`.github/workflows/backend-containers.yml` is manually triggered only. After the
workflow is uploaded to the default branch, a manual run can execute the
Linux-only `scripts/validate-backend-containers.sh`. It creates an isolated random
Compose project from staging configuration plus `compose.verify.yml`, binds TLS
only to loopback, generates a one-day local test certificate, builds/starts real
Postgres/Redis/Nginx/services and runs a shared-client smoke check. The test checks
Nginx syntax, Redis eviction policies, sync/CAS, catalog routing, atomic refresh
rotation and logout revocation. It removes only that invocation's project volumes
on exit. It publishes no service or APK.

The overlay parses, the Bash/JavaScript syntax and workflow YAML were checked.
The workflow was **not run** in this task. Its local trusted certificate is not
public staging verification. The host/domain and production persistence/recovery
checks above remain separate requirements.
