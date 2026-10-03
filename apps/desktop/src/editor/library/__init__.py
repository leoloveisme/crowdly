"""Discovery mode's local library: imported books, reading data and sync.

- ``store``    - the on-disk library (files + JSON index) and reading data
- ``drm``      - refuses DRM-protected files at import
- ``metadata`` - title / author / language from EPUB, PDF, audio, text
- ``sync``     - talks to the backend's ``/library`` and ``/reading`` routes
"""
