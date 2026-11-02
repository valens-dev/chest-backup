#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
cp "$root/contrib/aur/PKGBUILD" "$tmp/PKGBUILD.before"
bash "$root/contrib/aur/gen.sh" >/dev/null
if diff -q "$tmp/PKGBUILD.before" "$root/contrib/aur/PKGBUILD" >/dev/null; then
  echo "OK: PKGBUILD checksum is up to date"
else
  cp "$tmp/PKGBUILD.before" "$root/contrib/aur/PKGBUILD"
  echo "FAIL: PKGBUILD is stale; run 'pnpm aur:gen'" >&2
  diff "$tmp/PKGBUILD.before" "$root/contrib/aur/PKGBUILD" >&2 || true
  exit 1
fi
