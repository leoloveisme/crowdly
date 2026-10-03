"""Detect DRM-protected books so they can be refused at import.

Removing DRM is illegal on its own (US DMCA section 1201, EU InfoSoc Art. 6),
so Crowdly never imports a protected file - it does not try to read past the
protection either.
"""

from __future__ import annotations

import re
import zipfile
from pathlib import Path

# Algorithms EPUBs use only to obfuscate embedded fonts. They appear in
# META-INF/encryption.xml of perfectly DRM-free books and must not count.
_FONT_OBFUSCATION_ALGORITHMS = (
    "http://www.idpf.org/2008/embedding",
    "http://ns.adobe.com/pdf/enc#RC",
)

# Audible's protected audiobook containers.
_PROTECTED_AUDIO_SUFFIXES = {".aax", ".aa", ".aaxc"}


def _epub_drm_reason(path: Path) -> str | None:
    try:
        with zipfile.ZipFile(path) as zf:
            names = set(zf.namelist())
            if "META-INF/rights.xml" in names:
                return "rights.xml"
            if "META-INF/encryption.xml" in names:
                xml = zf.read("META-INF/encryption.xml").decode("utf-8", errors="ignore")
                algorithms = re.findall(r'Algorithm\s*=\s*"([^"]+)"', xml)
                data_algorithms = [
                    a for a in algorithms if "xmldsig" not in a and "#rsa" not in a.lower()
                ]
                if any(a not in _FONT_OBFUSCATION_ALGORITHMS for a in data_algorithms):
                    return "encryption.xml"
    except zipfile.BadZipFile:
        return None
    return None


def _pdf_is_encrypted(path: Path) -> bool:
    try:
        from pdfminer.pdfparser import PDFParser  # type: ignore[import]
        from pdfminer.pdfdocument import PDFDocument, PDFPasswordIncorrect  # type: ignore[import]

        try:
            with path.open("rb") as fh:
                doc = PDFDocument(PDFParser(fh))
                return bool(getattr(doc, "encryption", None))
        except PDFPasswordIncorrect:
            return True
    except Exception:
        pass

    # Fallback: an /Encrypt entry in the trailer marks an encrypted PDF.
    try:
        with path.open("rb") as fh:
            fh.seek(0, 2)
            size = fh.tell()
            fh.seek(max(0, size - 65536))
            tail = fh.read()
        return b"/Encrypt" in tail
    except OSError:
        return False


def drm_reason(path: Path) -> str | None:
    """Return why *path* counts as DRM-protected, or ``None`` if it doesn't."""

    suffix = path.suffix.lower()
    if suffix in _PROTECTED_AUDIO_SUFFIXES:
        return "protected audiobook format"
    if suffix == ".epub":
        reason = _epub_drm_reason(path)
        return f"EPUB {reason}" if reason else None
    if suffix == ".pdf":
        return "encrypted PDF" if _pdf_is_encrypted(path) else None
    return None


def is_drm_protected(path: Path) -> bool:
    return drm_reason(path) is not None
