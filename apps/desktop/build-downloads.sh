#!/usr/bin/env bash
# Build the two downloads of the Crowdly desktop app:
#
#   Crowdly Discovery  - starts in Discovery mode on its first launch
#   Crowdly Creation   - starts in Creation mode on its first launch
#
# Both are the same app (see src/editor/app_modes.py); they differ only in
# name, bundle id, icon and the bundled first-start mode. After the first
# launch the user's Settings -> Startup -> Start in choice decides.
#
# Usage: ./build-downloads.sh            (both)
#        ./build-downloads.sh discovery  (one)
#
# Output: dist/discovery/..., dist/creation/...
set -euo pipefail
cd "$(dirname "$0")"

PYTHON="${PYTHON:-.venv/bin/python}"
if [[ "$(uname)" == "Darwin" ]]; then
  SPEC=crowdly-editor-mac.spec
else
  SPEC=crowdly-editor.spec
fi

# Compile the translations that ship (.ts -> .qm).
LRELEASE="$(dirname "$PYTHON")/pyside6-lrelease"
if [[ -x "$LRELEASE" ]]; then
  for qm in src/editor/i18n/*.qm; do
    ts="${qm%.qm}.ts"
    [[ -f "$ts" ]] && "$LRELEASE" -silent "$ts" -qm "$qm"
  done
fi

if [[ $# -gt 0 ]]; then modes=("$@"); else modes=(discovery creation); fi
for mode in "${modes[@]}"; do
  echo "==> Building the $mode download"
  CROWDLY_FIRST_START_MODE="$mode" "$PYTHON" -m PyInstaller --noconfirm \
    --distpath "dist/$mode" --workpath "build/$mode" "$SPEC"
done

echo "Done. Upload the builds in dist/discovery and dist/creation to the VPS."
