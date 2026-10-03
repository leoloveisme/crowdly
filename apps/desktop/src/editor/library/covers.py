"""Covers for Discovery cards: imported books, Crowdly stories, placeholders.

- ``ensure_cover`` makes a thumbnail for an imported book once - the EPUB's
  cover image or a PDF's first page - and stores it next to the book file
  (``files/<id>.cover.png``). Audio files and books without a cover get a
  generated placeholder at display time instead.
- ``placeholder_cover`` draws a coloured cover with the title, so every card
  has a cover and same-titled books still look different (colour comes from
  the item's id).
- ``RemoteCoverCache`` downloads Crowdly story covers once and keeps them in
  ``remote-covers/``.
"""

from __future__ import annotations

import hashlib
import urllib.request
import zipfile
from pathlib import Path

from PySide6.QtCore import QByteArray, QBuffer, QIODevice, QRectF, QSize, Qt
from PySide6.QtGui import QColor, QFont, QImage, QPainter, QPixmap

from .store import LibraryItem, LocalLibrary

THUMB_HEIGHT = 420
COVER_RATIO = 2 / 3  # width / height

_PALETTE = [
    ("#3b4a8c", "#e9ecff"),
    ("#8c3b5e", "#ffe9f2"),
    ("#2f6b5a", "#e3f7f0"),
    ("#7a5a1f", "#fff4dd"),
    ("#4d3b8c", "#efe9ff"),
    ("#8c4a2f", "#ffece3"),
    ("#2f5a8c", "#e3f0ff"),
    ("#5e6b2f", "#f2f7df"),
]


# -- extraction ---------------------------------------------------------------


def _epub_cover_bytes(path: Path) -> bytes | None:
    try:
        import ebooklib  # type: ignore[import]
        from ebooklib import epub  # type: ignore[import]

        book = epub.read_epub(str(path))
        for item in book.get_items_of_type(ebooklib.ITEM_COVER):
            return item.get_content()
        meta = book.get_metadata("OPF", "cover")
        if meta:
            cover_id = (meta[0][1] or {}).get("content")
            if cover_id:
                item = book.get_item_with_id(cover_id)
                if item is not None:
                    return item.get_content()
        images = list(book.get_items_of_type(ebooklib.ITEM_IMAGE))
        named = [i for i in images if "cover" in (i.get_name() or "").lower()]
        if named:
            return named[0].get_content()
    except Exception:
        pass
    # Fallback without ebooklib's parser: any image called "cover".
    try:
        with zipfile.ZipFile(path) as zf:
            for name in zf.namelist():
                lower = name.lower()
                if "cover" in lower and lower.endswith((".jpg", ".jpeg", ".png", ".gif", ".webp")):
                    return zf.read(name)
    except Exception:
        pass
    return None


def _pdf_first_page(path: Path) -> QImage | None:
    try:
        from PySide6.QtPdf import QPdfDocument
    except Exception:
        return None
    doc = QPdfDocument()
    if doc.load(str(path)) != QPdfDocument.Error.None_ or doc.pageCount() < 1:
        return None
    size = doc.pagePointSize(0)
    if size.height() <= 0:
        return None
    scale = THUMB_HEIGHT / size.height()
    image = doc.render(0, QSize(int(size.width() * scale), THUMB_HEIGHT))
    doc.close()
    return None if image.isNull() else image


def thumbnail(image: QImage) -> QImage:
    if image.height() > THUMB_HEIGHT:
        image = image.scaledToHeight(THUMB_HEIGHT, Qt.TransformationMode.SmoothTransformation)
    return image


def image_to_png(image: QImage) -> bytes:
    data = QByteArray()
    buffer = QBuffer(data)
    buffer.open(QIODevice.OpenModeFlag.WriteOnly)
    image.save(buffer, "PNG")
    buffer.close()
    return bytes(data)


def extract_cover(path: Path, fmt: str) -> QImage | None:
    """The book's own cover as an image, or ``None``."""

    if fmt == "epub":
        data = _epub_cover_bytes(path)
        if data:
            image = QImage.fromData(data)
            if not image.isNull():
                return image
        return None
    if fmt == "pdf":
        return _pdf_first_page(path)
    return None


def ensure_cover(library: LocalLibrary, item: LibraryItem) -> Path | None:
    """Make the cover thumbnail of an imported book once; return its path."""

    existing = library.cover_path(item)
    if existing is not None:
        return existing
    if item.cover_checked:
        return None
    item.cover_checked = True
    path = library.file_path(item)
    image = extract_cover(path, item.format) if path is not None else None
    if image is not None:
        name = f"{item.id}.cover.png"
        library.files_dir.mkdir(parents=True, exist_ok=True)
        (library.files_dir / name).write_bytes(image_to_png(thumbnail(image)))
        item.cover_file = name
        item.cover_uploaded = False
    library.save()
    return library.cover_path(item)


def store_cover_bytes(library: LocalLibrary, item: LibraryItem, data: bytes) -> bool:
    """Save a cover downloaded from the account for *item*."""

    image = QImage.fromData(data)
    if image.isNull():
        return False
    name = f"{item.id}.cover.png"
    library.files_dir.mkdir(parents=True, exist_ok=True)
    (library.files_dir / name).write_bytes(image_to_png(thumbnail(image)))
    item.cover_file = name
    item.cover_checked = True
    item.cover_uploaded = True
    library.save()
    return True


# -- placeholders -------------------------------------------------------------


def _colors(seed: str) -> tuple[QColor, QColor]:
    digest = int(hashlib.sha1((seed or "").encode("utf-8")).hexdigest(), 16)
    dark, light = _PALETTE[digest % len(_PALETTE)]
    return QColor(dark), QColor(light)


def placeholder_cover(title: str, seed: str, size: QSize, *, label: str = "") -> QPixmap:
    """A generated cover: coloured background, the title, an optional label."""

    pixmap = QPixmap(size)
    dark, light = _colors(seed or title)
    pixmap.fill(dark)
    painter = QPainter(pixmap)
    painter.setRenderHint(QPainter.RenderHint.Antialiasing)
    painter.setRenderHint(QPainter.RenderHint.TextAntialiasing)
    w, h = size.width(), size.height()
    painter.fillRect(QRectF(0, h * 0.72, w, h * 0.28), light.darker(105))
    painter.setPen(light)
    font = QFont()
    font.setBold(True)
    font.setPixelSize(max(10, int(h * 0.085)))
    painter.setFont(font)
    margin = w * 0.09
    painter.drawText(
        QRectF(margin, margin, w - 2 * margin, h * 0.66 - margin),
        int(Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignTop | Qt.TextFlag.TextWordWrap),
        title or "?",
    )
    if label:
        small = QFont()
        small.setPixelSize(max(8, int(h * 0.06)))
        painter.setFont(small)
        painter.setPen(dark)
        painter.drawText(
            QRectF(margin, h * 0.72, w - 2 * margin, h * 0.28),
            int(Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignVCenter),
            label,
        )
    painter.end()
    return pixmap


# -- remote covers ------------------------------------------------------------


class RemoteCoverCache:
    """Downloads cover URLs once into ``root``; safe to call from worker threads."""

    def __init__(self, root: Path) -> None:
        self.root = root

    def path_for(self, url: str) -> Path:
        return self.root / (hashlib.sha1(url.encode("utf-8")).hexdigest() + ".img")

    def cached(self, url: str) -> Path | None:
        path = self.path_for(url)
        return path if path.is_file() else None

    def fetch(self, url: str, timeout: float = 15.0) -> Path | None:
        path = self.path_for(url)
        if path.is_file():
            return path
        req = urllib.request.Request(url, headers={"User-Agent": "crowdly-desktop/0.1"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = resp.read(5 * 1024 * 1024)
        image = QImage.fromData(data)
        if image.isNull():
            return None
        self.root.mkdir(parents=True, exist_ok=True)
        path.write_bytes(image_to_png(thumbnail(image)))
        return path
