#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
compose=(docker compose -f "$root/e2e-ui/docker-compose.yml")

node -e "require('fs').writeFileSync('$root/e2e-ui/config.json', JSON.stringify({retention:7,retentionMode:'months',paths:[],sqlite:[],exclude:[],sources:[],destinations:[]},null,2)+'\n')"
docker run --rm -v "$root":/repo -w /repo debian:trixie-slim sh -c 'rm -rf e2e-ui/sftp-data e2e-ui/ftp-data e2e-ui/garage-data'

"${compose[@]}" up -d --build app postgres sftp garage ftp sqldb appvol
sleep 15

set +e
"${compose[@]}" run --rm browser
exit_code=$?
set -e

"${compose[@]}" down --remove-orphans -v
exit "$exit_code"
