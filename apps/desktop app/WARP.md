# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Commands

### Environment
- Requires Python 3.10+.
- Package is configured as a `src`-layout project via `pyproject.toml` with `src/` as the root package directory.

### Install in editable mode
Run from the repo root:

```bash path=null start=null
python -m venv .venv
source .venv/bin/activate
pip install -e .
```

This makes the `editor` package importable and install hooks for future dependencies.

### Run the application stub
After editable install (or with `PYTHONPATH=src`), from the repo root:

```bash path=null start=null
python -m editor.app
```

You should see a console message confirming the stub is wired correctly.

### Run a single test (future convention)
There are no tests yet, but when a test suite is added it should live under `tests/` and be runnable with `pytest`. The expected pattern will be:

```bash path=null start=null
pytest tests/path/to/test_file.py::TestClass::test_case
```

If a different test runner is introduced later, prefer mirroring its usage in `README.md` or project scripts.

## Project structure and architecture

### High-level layout
- `pyproject.toml`: Defines the project metadata and build configuration using `setuptools` with a `src` layout.
- `src/editor/`: Core Python package for the distraction-free Markdown/HTML editor.
  - `__init__.py`: Declares `editor` as a package and exposes the public `main` entrypoint symbol.
  - `app.py`: Current application entrypoint stub.
- `README.md`: High-level description of the project intent and status (early scaffold).

### Editor package (`src/editor`)
- The `editor` package is intended to be the central place for all application logic (GUI, persistence, editor behavior).
- `editor.app.main()` is the canonical entrypoint; other modules added later should be orchestrated from here (e.g., GUI bootstrap, configuration, document management).
- `app.py` currently just prints a message. When expanding the project, prefer to:
  - Keep `main()` focused on high-level orchestration (argument parsing, config loading, launching the main window).
  - Factor complex behavior into submodules (e.g. `editor/ui.py`, `editor/storage.py`, `editor/document.py`) rather than growing `app.py` into a god module.

### Packaging and distribution
- `pyproject.toml` uses `setuptools.build_meta` as the build backend with `package-dir = {"" = "src"}`. Any new packages should therefore live under `src/`.
- When adding console entrypoints in the future, prefer configuring them via `project.scripts` in `pyproject.toml` pointing at `editor.app:main` to keep a single source of truth for the application entry.

## How future Warp agents should work in this repo
- Treat `editor.app.main()` as the integration point for new functionality and keep it thin by delegating to well-named helper modules.
- When adding new modules, keep them under `src/editor/` and ensure imports remain relative (e.g. `from editor import ...` or `from .module import ...`).
- If you introduce tests, colocate high-level integration tests under `tests/` and use `pytest` conventions so that `pytest` from the repo root “just works`.
