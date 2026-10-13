# Crowdly file formats: `.story`, `.screenplay`, `.comic` (v2) and `.master`

These are the plain-text files the desktop app and the web app (`apps/web`) both read and write. A file saved in one app opens in the other: through a Space, or downloaded and imported.

| Format | Desktop | Web |
|---|---|---|
| shared block parser | `apps/desktop/src/editor/format/dsl.py` | `apps/web/src/formats/dsl.ts` |
| `.story` | `format/story_markup.py` | `formats/story.ts` |
| `.screenplay` | `format/screenplay_markup.py` | `formats/screenplay.ts` |
| `.comic` | `format/comic_markup.py` | `formats/comic.ts` |
| `.master` | `ui/master_document_window.py` | `formats/master.ts` |

Both implementations are checked against the same fixtures in `apps/desktop/tests/fixtures/formats/`. Each fixture is a sample file plus a `.json` file with the structure it must parse to. To run the checks:

- desktop: `.venv/bin/python -m pytest tests/test_formats.py`
- web: `node apps/web/scripts/test-formats.ts`

**When the format changes, update both parsers and the fixtures in the same commit.**

## Block syntax (shared by `.story`, `.screenplay`, `.comic`)

```
[tag attr attr key=value key="value with spaces"]body[/tag]
```

- A block starts with `[tag …]` at the beginning of a line and ends at the matching `[/tag]`. The closing tag can be on the same line or a later one, so a body can span several lines.
- **Attributes:**
  - `key=value` or `key="quoted value"`.
  - The first bare `left|center|right|justify` is the alignment.
  - Other bare words are flags, for example `bold`, `italic`, `underlined`, `stroke-through`.
  - Styling keys: `font_color=`, `font_size=`, `text_wrap=`, `width=`, `height=`.
- **Images** (`image`, `page`) carry their source in the body as `(path-or-url)`. Paths are relative to the file, for example a sibling folder in the Space.
- **Untagged text** is kept as plain paragraphs (in `.screenplay`, as action). Blank lines separate them. Files written before v2 therefore still load without losing anything.
- **Bracketed prose** like `[sic]` with no closing tag stays text.
- **Known limit:** a literal `[/tag]` inside a body of the same tag ends the block.

## `.story`

| Tag | Meaning |
|---|---|
| `story_title` | Story title. Centred by default. |
| `chapter_title` | Starts a chapter. |
| `paragraph` | A paragraph of the current chapter. Its text is Markdown and may contain inline HTML for colour and font. |
| `branch` | **v2.** An alternative version of the paragraph just before it. `name="…"` is optional. Several branches can follow one paragraph. See [Branching](#branching). |
| `image` | **v2.** `[image center width=40% alt="…"](images/x.png)[/image]`. Becomes a `![alt](src)` paragraph on Crowdly. |

Paragraphs before the first `chapter_title` belong to an unnamed first chapter.

**Structured form**, matching the backend's chapter model (`stories.paragraphs[]` and `paragraph_branches` keyed by `parent_paragraph_index`):

```json
{ "title": "…", "chapters": [ { "title": "…", "paragraphs": ["…"], "branches": { "1": [ { "name": "…", "text": "…" } ] } } ] }
```

## `.screenplay`

| Tag | Meaning |
|---|---|
| `screenplay_title` | Title. |
| `scene_slugline` | Starts a scene, e.g. `INT. KITCHEN - DAY`. `scene_heading` is accepted as an alias. |
| `action`, `character`, `dialogue`, `parenthetical`, `transition`, `shot`, `general` | Script elements. Character through general are **new in v2**. The names are the same as `screenplay_block.block_type` in the backend. |

When the desktop app turns plain Markdown into a screenplay, or the web app imports FDX or Fountain, each line's element type is guessed:

- An all-caps short line is a **character**.
- A line after a character or parenthetical is **dialogue**.
- `(…)` after a character or dialogue line is a **parenthetical**.
- An all-caps line ending in `TO:` is a **transition**.
- Anything else is **action**.

**Structured form:**

```json
{ "title": "…", "scenes": [ { "slugline": "…", "blocks": [ { "type": "dialogue", "text": "…" } ] } ] }
```

## `.comic` (new)

| Tag | Meaning |
|---|---|
| `comic_title` | Title. `direction=rtl` for manga (right to left); the default is `ltr`. |
| `issue` | Starts an issue. Pages before the first issue go into "Issue 1". |
| `page` | `[page alt="…"](pages/001.png)[/page]`: one page image, in reading order. |

**Structured form:**

```json
{ "title": "…", "direction": "rtl", "issues": [ { "title": "…", "pages": [ { "src": "…", "alt": "…" } ] } ] }
```

When the web app turns a `.comic` file in a Space into a Crowdly comic, page paths are resolved against the file's folder in that Space. URLs are fetched directly.

## Branching

Branches are alternative versions of a piece of a work. They use the same block syntax in every format and the same flat rule: **a branch block belongs to the block just before it**. The backend routes and sync rules are in [branching-api.md](branching-api.md).

| Format | Block | Belongs to | Structured form |
|---|---|---|---|
| `.story` | `[branch name="…"]text[/branch]` | the paragraph before it | `chapters[].branches["<paragraph index>"][]` |
| `.screenplay` | `[branch name="…"]text[/branch]` | the element before it | `scenes[].blocks[].branches[]` |
| `.comic` | `[layer x=20 y=15 style=bubble]text[/layer]` | the page or `[alt]` before it | `pages[].layers[]`, `pages[].alternatives[].layers[]` |
| `.comic` | `[alt name="…"](pages/001b.png)[/alt]` | the page before it | `pages[].alternatives[]` |

- **`[layer]`:** a speech bubble (`style=bubble`) or a caption box (`style=box`). `x` and `y` are percentages of the image (0–100). Layers are stored as positioned text, not drawn into the image, so they can be edited, suggested and translated.
- **Ids:** files synced with Crowdly carry the server's ids as `id=` attributes:
  - `chapter_title` and story `branch`
  - `scene_slugline`, screenplay elements and screenplay `branch`
  - `issue`, `page` and `alt`

  Sync clients send these ids back, so rows are updated in place. A file without ids is still valid; it simply hasn't been synced yet.
- **Rich-text pane:** the desktop pane keeps branch blocks (`branch` is in the screenplay's restored tags) and the ids on headings and elements (`dsl.restore_tags`) when it rebuilds the DSL.
- **Fixtures:** `branching.story`, `branching.screenplay` and `branching.comic` (+ `.json`) in `apps/desktop/tests/fixtures/formats/`, checked by both apps.

The structured forms above gain optional keys, present only when the file has them: `id`, plus `branches`, `layers` and `alternatives` as listed in the table.

## `.master`

This is the desktop's master document format. It has no block tags. Each part (include container) looks like this:

```
[chapters/one.md](chapters/one.md)
## Part title
<!-- title-edited: 1760000000.5 -->

part content…

---
```

- The link line and the title are both optional.
- Inside the content, a line that is exactly `---`, or a first line starting with `## `, is escaped with a leading `\`.
- The desktop writes a `file://` absolute link. The web app writes a link relative to the `.master` file's folder.
- Both apps resolve the link label relative to the `.master` file, so a master document works in a Space on either side.

## Rich-text (WYSIWYG) editing on the desktop

The desktop's rich-text pane only knows headings and paragraphs. When it rebuilds the DSL, `dsl.restore_tags` gives branches and screenplay elements back their tags, matching blocks by text. Editing a `.story` or `.screenplay` in that pane therefore no longer turns branches or dialogue into plain paragraphs. A `.comic` file is edited in the source pane; its rich-text pane is a read-only page list.
