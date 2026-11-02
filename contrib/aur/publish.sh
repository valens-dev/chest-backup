#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
aur_root="${AUR_DIR:-$HOME/aur}"

for pkg in chest-backup chest-backup-bin; do
  if [ "$pkg" = "chest-backup" ]; then src_dir="$root/contrib/aur"; else src_dir="$root/contrib/aur-bin"; fi
  aur_dir="$aur_root/$pkg"
  if [ ! -d "$aur_dir/.git" ]; then
    echo "error: AUR clone not found at $aur_dir" >&2
    exit 1
  fi
  cp "$src_dir/PKGBUILD" "$aur_dir/PKGBUILD"
  cp "$src_dir/chest-backup.install" "$aur_dir/chest-backup.install" 2>/dev/null || true
  cd "$aur_dir"
  makepkg --printsrcinfo > .SRCINFO
  if git diff --quiet; then
    echo "$pkg: no changes"
    continue
  fi
  pkgver="$(sed -n 's/^pkgver=//p' PKGBUILD)"
  git add PKGBUILD .SRCINFO chest-backup.install
  git commit -m "$pkg v$pkgver"
  git push
  echo "$pkg: published v$pkgver"
done
