#!/usr/bin/env bash
# Lists civicrm-core commits after the reviewed one, per watched branch, that touch a path in
# core-watch.txt; a release branch's commits name the first tag on it that carries them.
# Exit 0: nothing new. Exit 1: commits to review. Exit 2: a listed path no longer exists.
set -euo pipefail

list="$(dirname "$0")/core-watch.txt"
repo="${CORE_WATCH_CLONE:-${XDG_CACHE_HOME:-$HOME/.cache}/afreact/civicrm-core}"
mapfile -t branches < <(awk '$1 == "reviewed" { print $2 }' "$list")
mapfile -t paths < <(grep -Ev '^(#|reviewed |$)' "$list")
reviewed() { awk -v b="$1" '$1 == "reviewed" && $2 == b { print $3 }' "$list"; }

# Commits and trees only: enough for `git log -- <paths>`, about 90 MB.
if [ ! -d "$repo" ]; then
  git clone -q --bare --filter=blob:none --single-branch --branch master \
    https://github.com/civicrm/civicrm-core.git "$repo"
fi
refspecs=()
for branch in "${branches[@]}"; do
  refspecs+=("+refs/heads/$branch:refs/heads/$branch" "$(reviewed "$branch")")
done
git -C "$repo" fetch -q --tags origin "${refspecs[@]}"

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

status=0
for branch in "${branches[@]}"; do
  from=$(reviewed "$branch")
  log=$(git -C "$repo" log --no-merges --no-renames --reverse --format='%h %cs %s' --name-only "$from..$branch" -- "${paths[@]}" |
    awk 'NF == 0 { next } /^[0-9a-f]+ [0-9]{4}-/ { print; next } { print "    " $0 }')
  if [ -z "$log" ]; then
    echo "$branch: no core changes to the watched paths after ${from:0:10}."
    continue
  fi
  status=1
  echo "$branch: core changes to the watched paths after ${from:0:10} (https://github.com/civicrm/civicrm-core/commit/<hash>):"
  if [ "$branch" = master ]; then
    echo "$log"
  else
    while IFS= read -r line; do
      if [[ "$line" =~ ^([0-9a-f]+)\  ]]; then
        tag=$(git -C "$repo" tag --contains "${BASH_REMATCH[1]}" --list "$branch.*" --sort=v:refname | head -1)
        line="$line [${tag:-unreleased}]"
      fi
      echo "$line"
    done <<<"$log"
  fi
  echo "After review, set in scripts/core-watch.txt: reviewed $branch $(git -C "$repo" rev-parse "$branch")"
  echo
done
exit "$status"
