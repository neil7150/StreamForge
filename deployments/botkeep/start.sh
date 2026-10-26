#!/bin/sh
set -eu
cd "$(dirname "$0")"
case "$(uname -m)" in
  x86_64|amd64) binary=bin/streamforge-api-linux-amd64 ;;
  aarch64|arm64) binary=bin/streamforge-api-linux-arm64 ;;
  *) echo "Unsupported server CPU architecture" >&2; exit 1 ;;
esac
# ZIP extraction may discard Unix executable permissions.
chmod u+x "$binary"
export GOMEMLIMIT="${GOMEMLIMIT:-384MiB}"
export GOMAXPROCS="${GOMAXPROCS:-1}"
exec "./$binary"
