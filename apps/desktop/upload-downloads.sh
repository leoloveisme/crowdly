#!/usr/bin/env bash
# Package the desktop downloads built by build-downloads.sh and publish them
# on the VPS, where the /software page links to them.
#
#   dist/<mode>/crowdly_<mode>.app  ->  crowdly-<mode>-<version>-macos-<arch>.zip
#
# On the VPS (nginx: location /downloads/ -> /var/www/crowdly-downloads/):
#
#   /var/www/crowdly-downloads/desktop/<version>/crowdly-<mode>-<version>-macos-<arch>.zip
#   /var/www/crowdly-downloads/desktop/<version>/SHA256SUMS
#   /var/www/crowdly-downloads/desktop/crowdly-<mode>-macos-<arch>.zip -> <version>/...  (latest)
#
# The "latest" symlinks are switched only after both zips are uploaded, so the
# website never links to a half-uploaded file. /var/www/crowdly is not used:
# the web deploy (deploy.yml) mirrors it with rsync --delete.
#
# Usage: ./upload-downloads.sh            (both)
#        ./upload-downloads.sh discovery  (one)
#
# Environment:
#   VPS_HOST      (required) server name or address
#   VPS_USER      (default: current user) needs write access to the folder
#   VPS_SSH_PORT  (default: 22)
#   SSH_KEY       (optional) private key file
#   PUBLIC_URL    (default: https://crowdly.cloud) for the final check
#   DOWNLOADS_DIR (default: /var/www/crowdly-downloads/desktop)
#   UPLOAD=0      only package, don't upload
set -euo pipefail
cd "$(dirname "$0")"

if [[ "$(uname)" != "Darwin" ]]; then
  echo "Only the macOS builds are packaged so far." >&2
  exit 1
fi

VERSION="$(sed -n 's/^version *= *"\(.*\)"/\1/p' pyproject.toml | head -1)"
[[ -n "$VERSION" ]] || { echo "No version in pyproject.toml" >&2; exit 1; }
case "$(uname -m)" in
  arm64) ARCH=arm64 ;;
  x86_64) ARCH=x64 ;;
  *) ARCH="$(uname -m)" ;;
esac
PUBLIC_URL="${PUBLIC_URL:-https://crowdly.cloud}"
DOWNLOADS_DIR="${DOWNLOADS_DIR:-/var/www/crowdly-downloads/desktop}"

if [[ $# -gt 0 ]]; then modes=("$@"); else modes=(discovery creation); fi

OUT="dist/release/$VERSION"
mkdir -p "$OUT"
files=()
for mode in "${modes[@]}"; do
  case "$mode" in
    discovery) display="Crowdly Discovery" ;;
    creation) display="Crowdly Creation" ;;
    *) echo "Unknown download: $mode (use discovery or creation)" >&2; exit 1 ;;
  esac
  app="dist/$mode/crowdly_$mode.app"
  # build-downloads.sh names the bundle after the app ("Crowdly Discovery.app").
  if [[ -d "dist/$mode/$display.app" ]]; then
    rm -rf "$app"
    mv "dist/$mode/$display.app" "$app"
  fi
  [[ -d "$app" ]] || { echo "Missing $app - run ./build-downloads.sh $mode first." >&2; exit 1; }
  codesign --verify --deep "$app"
  zip_name="crowdly-$mode-$VERSION-macos-$ARCH.zip"
  echo "==> Packaging $app -> $OUT/$zip_name"
  rm -f "$OUT/$zip_name"
  # ditto keeps the bundle's symlinks and signature intact (zip doesn't).
  ditto -c -k --keepParent "$app" "$OUT/$zip_name"
  files+=("$zip_name")
done
(cd "$OUT" && shasum -a 256 crowdly-*-"$VERSION"-macos-*.zip > SHA256SUMS)

if [[ "${UPLOAD:-1}" == "0" ]]; then
  echo "Packaged in $OUT (not uploaded)."
  exit 0
fi

[[ -n "${VPS_HOST:-}" ]] || { echo "Set VPS_HOST (and VPS_USER) to upload, or UPLOAD=0 to only package." >&2; exit 1; }
target="${VPS_USER:-$USER}@$VPS_HOST"
ssh_opts=(-p "${VPS_SSH_PORT:-22}")
[[ -n "${SSH_KEY:-}" ]] && ssh_opts+=(-i "$SSH_KEY")

echo "==> Uploading to $target:$DOWNLOADS_DIR/$VERSION/"
ssh "${ssh_opts[@]}" "$target" "mkdir -p '$DOWNLOADS_DIR/$VERSION'"
rsync -a --partial --progress -e "ssh ${ssh_opts[*]}" "$OUT/" "$target:$DOWNLOADS_DIR/$VERSION/"

echo "==> Pointing the latest downloads at $VERSION"
links=""
for zip_name in "${files[@]}"; do
  latest="${zip_name/-$VERSION-/-}"
  links+="ln -sfn '$VERSION/$zip_name' '$latest'; "
done
ssh "${ssh_opts[@]}" "$target" "set -e; cd '$DOWNLOADS_DIR'; $links ls -l"

echo "==> Checking the public links"
for zip_name in "${files[@]}"; do
  url="$PUBLIC_URL/downloads/desktop/${zip_name/-$VERSION-/-}"
  type="$(curl -fsSI "$url" | tr -d '\r' | awk -F': ' 'tolower($1)=="content-type"{print $2}')"
  [[ "$type" == application/zip* ]] || { echo "$url returned '$type', not a zip" >&2; exit 1; }
  echo "ok  $url"
done
