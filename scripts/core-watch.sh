#!/usr/bin/env bash
# Lists civicrm-core master commits after the reviewed one that touch a path in core-watch.txt.
# Exit 0: nothing new. Exit 1: commits to review. Exit 2: a listed path no longer exists.
set -euo pipefail

list="$(dirname "$0")/core-watch.txt"
repo="${CORE_WATCH_CLONE:-${XDG_CACHE_HOME:-$HOME/.cache}/afreact/civicrm-core}"
reviewed=$(awk '$1 == "reviewed" { print $2 }' "$list")
mapfile -t paths < <(grep -Ev '^(#|reviewed |$)' "$list")

# Commits and trees only: enough for `git log -- <paths>`, about 90 MB.
if [ ! -d "$repo" ]; then
  git clone -q --bare --filter=blob:none --single-branch --branch master \
    https://github.com/civicrm/civicrm-core.git "$repo"
fi
git -C "$repo" fetch -q origin "+refs/heads/master:refs/heads/master" "$reviewed"

files=$(git -C "$repo" ls-tree -r --name-only master)
missing=0
for path in "${paths[@]}"; do
  # Pathspec semantics: a directory prefix, or a glob where `*` also matches `/`.
  if ! grep -qE "^$(sed -e 's/[.[\^$+?(){}|]/\\&/g' -e 's/\*/.*/g' <<<"$path")(/|$)" <<<"$files"; then
    echo "not in core master: $path" >&2
    missing=1
  fi
done
[ "$missing" = 0 ] || exit 2

log=$(git -C "$repo" log --no-merges --no-renames --reverse --format='%h %cs %s' --name-only "$reviewed..master" -- "${paths[@]}" |
  awk 'NF == 0 { next } /^[0-9a-f]+ [0-9]{4}-/ { print; next } { print "    " $0 }')
if [ -z "$log" ]; then
  echo "No core changes to the watched paths after ${reviewed:0:10}."
  exit 0
fi
echo "Core changes to the watched paths after ${reviewed:0:10} (https://github.com/civicrm/civicrm-core/commit/<hash>):"
echo "$log"
echo
echo "After review, set in scripts/core-watch.txt: reviewed $(git -C "$repo" rev-parse master)"
exit 1
