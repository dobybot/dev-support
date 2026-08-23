#!/usr/bin/env bash

set -euo pipefail

action="${1:-render}"
watch_target="${2:-full}"

case "$action" in
  render|watch|validate) ;;
  *)
    echo "Usage: d2-erd.sh [render|validate|watch [view]]" >&2
    exit 2
    ;;
esac

if ! project_root="$(git rev-parse --show-toplevel 2>/dev/null)"; then
  echo "No Git repository detected. Run this skill from inside the target project." >&2
  exit 1
fi

if ! command -v d2 >/dev/null 2>&1; then
  echo "D2 is required. Install it from https://d2lang.com/tour/install/" >&2
  exit 1
fi

dictionary_root="$project_root/docs/data-dictionary"
erd_root="$dictionary_root/erd"
tables_root="$erd_root/tables"
features_root="$erd_root/features"
views_root="$erd_root/views"
entrypoint="$erd_root/erd.d2"
output="$dictionary_root/generated/erd.svg"
views_output_root="$dictionary_root/generated/views"

mkdir -p "$tables_root" "$features_root" "$views_root" "$views_output_root"

tmp_entrypoint="$(mktemp "$erd_root/.erd.d2.XXXXXX")"
cleanup() {
  rm -f "$tmp_entrypoint"
}
trap cleanup EXIT

printf 'direction: right\n' > "$tmp_entrypoint"

while IFS= read -r table_file; do
  [[ -n "$table_file" ]] || continue
  table_name="$(basename "$table_file" .d2)"
  if [[ ! "$table_name" =~ ^[A-Za-z][A-Za-z0-9_]*$ ]]; then
    echo "Invalid table filename: $table_file (use letters, digits, and underscores)" >&2
    exit 1
  fi
  printf '%s: @tables/%s\n' "$table_name" "$table_name" >> "$tmp_entrypoint"
done < <(find "$tables_root" -maxdepth 1 -type f -name '*.d2' -print | LC_ALL=C sort)

while IFS= read -r feature_file; do
  [[ -n "$feature_file" ]] || continue
  feature_name="$(basename "$feature_file" .d2)"
  if [[ ! "$feature_name" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
    echo "Invalid Feature filename: $feature_file (use lower-case hyphen-case)" >&2
    exit 1
  fi
  printf '...@features/%s\n' "$feature_name" >> "$tmp_entrypoint"
done < <(find "$features_root" -maxdepth 1 -type f -name '*.d2' -print | LC_ALL=C sort)

mv "$tmp_entrypoint" "$entrypoint"
trap - EXIT

case "$action" in
  render)
    d2 --layout elk "$entrypoint" "$output"
    echo "Rendered $output"
    while IFS= read -r view_file; do
      [[ -n "$view_file" ]] || continue
      view_name="$(basename "$view_file" .d2)"
      view_output="$views_output_root/$view_name.svg"
      d2 "$view_file" "$view_output"
      echo "Rendered $view_output"
    done < <(find "$views_root" -maxdepth 1 -type f -name '*.d2' -print | LC_ALL=C sort)
    ;;
  watch)
    if [[ "$watch_target" == "full" ]]; then
      d2 --layout elk --watch "$entrypoint" "$output"
    else
      view_input="$views_root/$watch_target.d2"
      if [[ ! -f "$view_input" ]]; then
        echo "Unknown ERD view: $watch_target" >&2
        exit 1
      fi
      d2 --watch "$view_input" "$views_output_root/$watch_target.svg"
    fi
    ;;
  validate)
    d2 validate "$entrypoint"
    echo "Validated $entrypoint"
    while IFS= read -r view_file; do
      [[ -n "$view_file" ]] || continue
      d2 validate "$view_file"
      echo "Validated $view_file"
    done < <(find "$views_root" -maxdepth 1 -type f -name '*.d2' -print | LC_ALL=C sort)
    ;;
esac
