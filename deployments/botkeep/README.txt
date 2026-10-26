StreamForge compact backend — staging package

Start command: sh start.sh
Runtime profile: Go (the profile compiler is unused).
The binaries embed Go 1.27.3; neither go run nor compiler downloads are needed.
Linux x86-64 and ARM64 are included. start.sh chooses the server architecture.

This ZIP contains only backend executables and public configuration examples.
It contains no Android app, APK, database contents, credentials or private keys.

Before starting:
1. Provision one PostgreSQL database and TWO separate Redis instances.
2. Authentication Redis must have noeviction and persistence. Live CONFIG GET
   is the default policy check. Botkeep's restricted ACL instead requires an
   explicit botkeep-staff-confirmed mode, exact attested host:port and a recorded
   staff confirmation reference; see .env.example and docs/botkeep-deployment.md.
3. PostgreSQL credentials need CREATE privileges for three schemas and the
   trusted uuid-ossp/pgcrypto extensions. No superuser is required.
4. Add real values from .env.example privately through Environment or .env.
   Keep certificate verification enabled. Upload provider public CA files
   to certs/ when required. URL-encode passwords within connection URIs.
5. Confirm Botkeep permits this executable startup command, assigns SERVER_PORT
   and provides an HTTPS domain forwarding to that port.

The process listens on 0.0.0.0:SERVER_PORT. GET /health is liveness only;
successful startup checks DB migrations and Redis connections. Auth eviction
policy is checked live or explicitly relies on recorded Botkeep staff evidence.
Verify login, persistence, revocation and restore before trusting staging.
Conservative shared auth limit: 30 requests/minute, burst 8. Password/OAuth
work: at most 2 concurrent. Total HTTP work: at most 16 concurrent.
The 384 MiB Go memory setting is a soft target, not an RSS guarantee.

Hosting compatibility, memory, disk, TLS, real Redis, backup/restore and Android
device behavior still need testing. No deployment has been performed by packaging.
See docs/botkeep-deployment.md in the source repository for the ordered procedure.
