#!/usr/bin/env bash
# Publish the release APK on the VPS, where the /software page links to it.
#
#   app/build/outputs/apk/release/app-release.apk  ->  crowdly-android-<version>.apk
#
# On the VPS (nginx: location /downloads/ -> /var/www/crowdly-downloads/):
#
#   /var/www/crowdly-downloads/android/<version>/crowdly-android-<version>.apk
#   /var/www/crowdly-downloads/android/<version>/SHA256SUMS
#   /var/www/crowdly-downloads/android/<version>/latest.json   {version, file, size, sha256}
#   /var/www/crowdly-downloads/android/crowdly-android.apk -> <version>/...  (latest)
#   /var/www/crowdly-downloads/android/SHA256SUMS, latest.json -> <version>/...
#
# The "latest" symlinks are switched only after the upload, so the website
# never links to a half-uploaded file. Same layout as
# apps/desktop/upload-downloads.sh.
#
# Usage: VERSION=0.2.0 ./upload-apk.sh [path/to/app-release.apk]
#
# Environment:
#   VERSION       version name (default: the one in app/build.gradle.kts)
#   VPS_HOST      (required) server name or address
#   VPS_USER      (default: current user) needs write access to the folder
#   VPS_SSH_PORT  (default: 22)
#   SSH_KEY       (optional) private key file
#   PUBLIC_URL    (default: https://crowdly.cloud) for the final check
#   DOWNLOADS_DIR (default: /var/www/crowdly-downloads/android)
#   UPLOAD=0      only package, don't upload
set -euo pipefail
cd "$(dirname "$0")"

APK="${1:-app/build/outputs/apk/release/app-release.apk}"
[[ -f "$APK" ]] || { echo "Missing $APK - run ./gradlew :app:assembleRelease (signed) first." >&2; exit 1; }

VERSION="${VERSION:-$(sed -n 's/.*crowdly.versionName.*?: *"\(.*\)".*/\1/p' app/build.gradle.kts | head -1)}"
[[ -n "$VERSION" ]] || { echo "Set VERSION" >&2; exit 1; }
PUBLIC_URL="${PUBLIC_URL:-https://crowdly.cloud}"
DOWNLOADS_DIR="${DOWNLOADS_DIR:-/var/www/crowdly-downloads/android}"

OUT="build/release/$VERSION"
apk_name="crowdly-android-$VERSION.apk"
mkdir -p "$OUT"
echo "==> Packaging $APK -> $OUT/$apk_name"
cp "$APK" "$OUT/$apk_name"
if command -v sha256sum > /dev/null; then sha() { sha256sum "$@"; }; else sha() { shasum -a 256 "$@"; }; fi
(cd "$OUT" && sha "$apk_name" > SHA256SUMS)
sha256="$(cut -d' ' -f1 "$OUT/SHA256SUMS")"
size="$(wc -c < "$OUT/$apk_name" | tr -d ' ')"
printf '{"version":"%s","file":"%s","size":%s,"sha256":"%s"}\n' \
  "$VERSION" "$apk_name" "$size" "$sha256" > "$OUT/latest.json"

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

echo "==> Pointing the latest download at $VERSION"
ssh "${ssh_opts[@]}" "$target" "set -e; cd '$DOWNLOADS_DIR';
  ln -sfn '$VERSION/$apk_name' crowdly-android.apk;
  ln -sfn '$VERSION/SHA256SUMS' SHA256SUMS;
  ln -sfn '$VERSION/latest.json' latest.json; ls -l"

echo "==> Checking the public link"
url="$PUBLIC_URL/downloads/android/crowdly-android.apk"
type="$(curl -fsSI "$url" | tr -d '\r' | awk -F': ' 'tolower($1)=="content-type"{print $2}')"
[[ "$type" == application/vnd.android.package-archive* ]] || { echo "$url returned '$type', not an APK" >&2; exit 1; }
echo "ok  $url"
