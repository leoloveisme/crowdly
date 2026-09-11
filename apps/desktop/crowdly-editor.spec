# -*- mode: python ; coding: utf-8 -*-

import sys
from pathlib import Path

from PyInstaller.utils.hooks import collect_submodules


# Project root (this spec file lives in the repo root). In the context of a
# PyInstaller spec file, __file__ is not defined, so we derive the root from
# the current working directory instead.
PROJECT_ROOT = Path(".").resolve()
SRC_ROOT = PROJECT_ROOT / "src"

# Ensure the src/ layout is on sys.path so PyInstaller can find the package
if str(SRC_ROOT) not in sys.path:
    sys.path.insert(0, str(SRC_ROOT))


# Collect PySide6 submodules that might be imported dynamically
pyside6_hidden = collect_submodules("PySide6")

# Include Qt translation files for the editor (if you build .qm files here)
# Example expected locations:
#   src/editor/i18n/editor_en.qm
#   src/editor/i18n/editor_ru.qm
#   ... etc.
I18N_DIR = SRC_ROOT / "editor" / "i18n"
i18n_datas = []
if I18N_DIR.is_dir():
    for path in I18N_DIR.glob("*.qm"):
        # (src, dest_rel_path_inside_package)
        i18n_datas.append((str(path), "editor/i18n"))


block_cipher = None


ENTRY_SCRIPT = str(SRC_ROOT / "run_editor.py")

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
    a.binaries,
    a.zipfiles,
    a.datas,
    name="crowdly-app",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
)
