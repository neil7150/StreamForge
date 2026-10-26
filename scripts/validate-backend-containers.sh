#!/usr/bin/env bash
# Disposable test stack only. No APK commands, publishing or existing databases.
set -euo pipefail
if [[ "$(uname -s)" != Linux ]]; then echo 'Run this check on Linux or through the manual CI workflow.'; exit 1; fi
cd "$(dirname "$0")/.."
project="streamforge-verify-$(openssl rand -hex 6)"
test_root="$PWD/.cache/$project"
mkdir -p "$test_root/tls"
export POSTGRES_PASSWORD="$(openssl rand -hex 32)"
export JWT_SECRET="$(openssl rand -hex 32)"
export JWT_ACCESS_TTL=30m JWT_REFRESH_TTL=1h
export TLS_CERT_DIR="$test_root/tls"
export STREAMFORGE_TEST_HTTPS_PORT="${STREAMFORGE_TEST_HTTPS_PORT:-18443}"
[[ "$STREAMFORGE_TEST_HTTPS_PORT" =~ ^[0-9]{1,5}$ ]] || exit 1
compose=(docker compose --env-file /dev/null -p "$project" -f deployments/docker-compose/compose.staging.yml -f deployments/docker-compose/compose.verify.yml)
cleanup() {
  result=$?
  if (( result != 0 )); then "${compose[@]}" logs --no-color --tail=40 || true; fi
  # The random project owns only the volumes created by this invocation.
  "${compose[@]}" down --volumes --remove-orphans || true
  exit "$result"
}
trap cleanup EXIT
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -keyout "$test_root/tls/privkey.pem" -out "$test_root/tls/fullchain.pem" -subj /CN=localhost -addext subjectAltName=DNS:localhost,IP:127.0.0.1 2>/dev/null
chmod 600 "$test_root/tls/privkey.pem"
"${compose[@]}" config --quiet
"${compose[@]}" build --pull
"${compose[@]}" up -d --wait --wait-timeout 180
"${compose[@]}" exec -T nginx nginx -t
test "$("${compose[@]}" exec -T auth-redis redis-cli --raw CONFIG GET maxmemory-policy | tail -n 1 | tr -d '\r')" = noeviction
test "$("${compose[@]}" exec -T redis redis-cli --raw CONFIG GET maxmemory-policy | tail -n 1 | tr -d '\r')" = allkeys-lru
"${compose[@]}" exec -T postgres psql -v ON_ERROR_STOP=1 -U streamforge -d content_db < tests/backend/catalog-fixture.sql
export NODE_EXTRA_CA_CERTS="$test_root/tls/fullchain.pem"
export NODE_TLS_REJECT_UNAUTHORIZED=1
export STREAMFORGE_TEST_API_URL="https://127.0.0.1:$STREAMFORGE_TEST_HTTPS_PORT"
node --import ./scripts/register-typescript.mjs scripts/container-client-check.mjs
echo 'Real-container verification passed. This is a local trusted test certificate, not public staging or Android validation.'
