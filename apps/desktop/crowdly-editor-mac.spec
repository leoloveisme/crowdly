# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for the macOS .app bundle.

Unlike crowdly-editor.spec (Linux, bare EXE), this adds a BUNDLE() stage
that produces Crowdly.app with an icon and Info.plist metadata so it can
be installed under /Applications and launched by any user account on
this Mac.
"""

import os
import sys
from pathlib import Path

from PyInstaller.utils.hooks import collect_submodules, copy_metadata


PROJECT_ROOT = Path(".").resolve()
SRC_ROOT = PROJECT_ROOT / "src"

if str(SRC_ROOT) not in sys.path:
    sys.path.insert(0, str(SRC_ROOT))


pyside6_hidden = collect_submodules("PySide6")
# keyring picks its OS backend (macOS Keychain, Secret Service, ...) via
# entry points at runtime, so its submodules and metadata must be bundled
# explicitly — used by editor.gdrive.tokens.
keyring_hidden = collect_submodules("keyring")

I18N_DIR = SRC_ROOT / "editor" / "i18n"
i18n_datas = []
if I18N_DIR.is_dir():
    for path in I18N_DIR.glob("*.qm"):
        i18n_datas.append((str(path), "editor/i18n"))

# Google OAuth "Desktop app" client for direct Google Drive sync (gitignored;
# see Documentation/Google_Drive_OAuth_setup.md). Optional: without it the
# app still runs, and Connect → Google Drive explains what's missing.
GOOGLE_CLIENT = SRC_ROOT / "editor" / "google_oauth_client.json"
extra_datas = copy_metadata("keyring")
if GOOGLE_CLIENT.is_file():
    extra_datas.append((str(GOOGLE_CLIENT), "editor"))



# Which download this build is: "discovery" -> "Crowdly Discovery",
# "creation" -> "Crowdly Creation" (same app, see src/editor/app_modes.py).
# The value is bundled as editor/first_start_mode.txt and only decides the
# mode of the very first start. Unset = the plain "Crowdly" build as before.
FIRST_START_MODE = os.environ.get("CROWDLY_FIRST_START_MODE", "").strip().lower()
if FIRST_START_MODE not in ("", "discovery", "creation"):
    raise SystemExit(f"CROWDLY_FIRST_START_MODE must be discovery or creation, not {FIRST_START_MODE!r}")
VARIANT_NAMES = {"discovery": "Crowdly Discovery", "creation": "Crowdly Creation"}
VARIANT_DISPLAY_NAME = VARIANT_NAMES.get(FIRST_START_MODE, "Crowdly")
VARIANT_SLUG = f"crowdly-{FIRST_START_MODE}" if FIRST_START_MODE else "crowdly-app"
variant_datas = []
if FIRST_START_MODE:
    marker_dir = PROJECT_ROOT / "build" / f"first-start-{FIRST_START_MODE}"
    marker_dir.mkdir(parents=True, exist_ok=True)
    marker = marker_dir / "first_start_mode.txt"
    marker.write_text(FIRST_START_MODE + "\n", encoding="utf-8")
    variant_datas.append((str(marker), "editor"))

block_cipher = None

ENTRY_SCRIPT = str(SRC_ROOT / "run_editor.py")
# A variant icon (build-assets/crowdly-discovery.icns, ...) is used when
# present; otherwise both downloads share the Crowdly icon.
_variant_icon = PROJECT_ROOT / "build-assets" / f"{VARIANT_SLUG}.icns"
ICON_PATH = str(_variant_icon if _variant_icon.is_file() else PROJECT_ROOT / "build-assets" / "crowdly.icns")
BUNDLE_IDS = {
    "discovery": "cloud.crowdly.discovery",
    "creation": "cloud.crowdly.creation",
}

a = Analysis(
    [ENTRY_SCRIPT],
    pathex=[str(SRC_ROOT)],
    binaries=[],
    datas=i18n_datas + extra_datas + variant_datas,
    hiddenimports=pyside6_hidden + keyring_hidden,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    exclude_binaries=True,
    name="crowdly-app",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    name="crowdly-app",
)

app = BUNDLE(
    coll,
    name=f"{VARIANT_DISPLAY_NAME}.app",
    icon=ICON_PATH,
    # Separate ids let both downloads be installed side by side.
    bundle_identifier=BUNDLE_IDS.get(FIRST_START_MODE, "cloud.crowdly.editor"),
    info_plist={
        "CFBundleName": VARIANT_DISPLAY_NAME,
        "CFBundleDisplayName": VARIANT_DISPLAY_NAME,
        "CFBundleShortVersionString": "0.1.0",
        "CFBundleVersion": "0.1.0",
        "NSHighResolutionCapable": True,
        "LSMinimumSystemVersion": "11.0",
        "CFBundleDocumentTypes": [
            {
                "CFBundleTypeName": "Markdown Document",
                "CFBundleTypeExtensions": ["md", "markdown"],
                "CFBundleTypeRole": "Editor",
            },
            {
                "CFBundleTypeName": "Crowdly Master Document",
                "CFBundleTypeExtensions": ["master"],
                "CFBundleTypeRole": "Editor",
                "LSHandlerRank": "Owner",
            },
        ],
    },
)
