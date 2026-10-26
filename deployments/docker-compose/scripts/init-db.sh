#!/bin/bash
# Runs only when PostgreSQL initializes a new data volume.
set -euo pipefail
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<'EOSQL'
    CREATE DATABASE auth_db;
    CREATE DATABASE content_db;
    CREATE DATABASE user_db;
EOSQL
