# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for the macOS .app bundle.

Unlike crowdly-editor.spec (Linux, bare EXE), this adds a BUNDLE() stage
that produces Crowdly.app with an icon and Info.plist metadata so it can
be installed under /Applications and launched by any user account on
this Mac.
"""

import sys
from pathlib import Path

from PyInstaller.utils.hooks import collect_submodules


PROJECT_ROOT = Path(".").resolve()
SRC_ROOT = PROJECT_ROOT / "src"

if str(SRC_ROOT) not in sys.path:
    sys.path.insert(0, str(SRC_ROOT))


pyside6_hidden = collect_submodules("PySide6")

I18N_DIR = SRC_ROOT / "editor" / "i18n"
i18n_datas = []
if I18N_DIR.is_dir():
    for path in I18N_DIR.glob("*.qm"):
        i18n_datas.append((str(path), "editor/i18n"))


block_cipher = None

ENTRY_SCRIPT = str(SRC_ROOT / "run_editor.py")
ICON_PATH = str(PROJECT_ROOT / "build-assets" / "crowdly.icns")

a = Analysis(
    [ENTRY_SCRIPT],
    pathex=[str(SRC_ROOT)],
    binaries=[],
    datas=i18n_datas,
    hiddenimports=pyside6_hidden,
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
    name="Crowdly.app",
    icon=ICON_PATH,
    bundle_identifier="cloud.crowdly.editor",
    info_plist={
        "CFBundleName": "Crowdly",
        "CFBundleDisplayName": "Crowdly",
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
