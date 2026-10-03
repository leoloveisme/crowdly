"""Best-effort metadata (title, author, language) for imported books."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

EPUB_SUFFIXES = {".epub"}
PDF_SUFFIXES = {".pdf"}
TEXT_SUFFIXES = {".txt", ".md", ".markdown"}
AUDIO_SUFFIXES = {".mp3", ".m4a", ".m4b", ".ogg", ".oga", ".opus", ".wav", ".flac", ".aac"}

SUPPORTED_SUFFIXES = EPUB_SUFFIXES | PDF_SUFFIXES | TEXT_SUFFIXES | AUDIO_SUFFIXES


@dataclass
class BookMetadata:
    title: str
    author: str = ""
    language: str = ""
    format: str = "text"  # "epub" | "pdf" | "audio" | "text"


def format_for(path: Path) -> str | None:
    suffix = path.suffix.lower()
    if suffix in EPUB_SUFFIXES:
        return "epub"
    if suffix in PDF_SUFFIXES:
        return "pdf"
    if suffix in AUDIO_SUFFIXES:
        return "audio"
    if suffix in TEXT_SUFFIXES:
        return "text"
    return None


def _epub_metadata(path: Path) -> tuple[str, str, str]:
    try:
        from ebooklib import epub  # type: ignore[import]

        book = epub.read_epub(str(path))

        def first(name: str) -> str:
            values = book.get_metadata("DC", name)
            return str(values[0][0]).strip() if values else ""

        return first("title"), first("creator"), first("language")
    except Exception:
        return "", "", ""


def _pdf_metadata(path: Path) -> tuple[str, str]:
    try:
        from pdfminer.pdfparser import PDFParser  # type: ignore[import]
        from pdfminer.pdfdocument import PDFDocument  # type: ignore[import]

        with path.open("rb") as fh:
            doc = PDFDocument(PDFParser(fh))
            info = doc.info[0] if doc.info else {}

        def text(key: str) -> str:
            value = info.get(key)
            if isinstance(value, bytes):
                for enc in ("utf-16", "utf-8", "latin-1"):
                    try:
                        return value.decode(enc).strip("\x00 ").strip()
                    except Exception:
                        continue
            return str(value).strip() if value else ""

        return text("Title"), text("Author")
    except Exception:
        return "", ""


def _text_title(path: Path) -> str:
    try:
        with path.open("r", encoding="utf-8", errors="ignore") as fh:
            for _ in range(40):
                line = fh.readline()
                if not line:
                    break
                stripped = line.strip()
                if stripped.startswith("#"):
                    return stripped.lstrip("#").strip()
    except OSError:
        pass
    return ""


def read_metadata(path: Path) -> BookMetadata:
    fmt = format_for(path) or "text"
    title = author = language = ""
    if fmt == "epub":
        title, author, language = _epub_metadata(path)
    elif fmt == "pdf":
        title, author = _pdf_metadata(path)
    elif fmt == "text":
        title = _text_title(path)
    return BookMetadata(
        title=title or path.stem.replace("_", " ").strip() or path.name,
        author=author,
        language=language,
        format=fmt,
    )
