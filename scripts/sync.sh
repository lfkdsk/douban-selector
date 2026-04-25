#!/usr/bin/env bash
# One-shot refresh: pull both 想看 and 看过 lists, then cache new posters.
#
# Usage:
#     scripts/sync.sh [user]          # default user: lfkdsk
#     scripts/sync.sh lfkdsk wish     # only one list
set -euo pipefail

USER="${1:-lfkdsk}"
shift || true
TYPES=("$@")
if [ "${#TYPES[@]}" -eq 0 ]; then
    TYPES=(wish collect)
fi

cd "$(dirname "$0")/.."

for t in "${TYPES[@]}"; do
    echo "==> fetching $USER / $t"
    python3 scripts/fetch_list.py --user "$USER" --type "$t"
done

echo "==> caching posters"
python3 scripts/cache_posters.py

echo "==> done"
