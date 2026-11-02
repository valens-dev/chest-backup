#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"

bump="${1:-patch}"
case "$bump" in patch|minor|major) ;; *) echo "usage: $0 [patch|minor|major]" >&2; exit 1;; esac

npm version "$bump" -m "chore(release): v%s"
git push --follow-tags
pnpm aur:gen
git add contrib/aur/PKGBUILD contrib/aur-bin/PKGBUILD
pkgver="$(node -p "require('./package.json').version")"
git commit -m "chore(aur): regenerate PKGBUILD for v$pkgver"
git push
pnpm aur:publish
