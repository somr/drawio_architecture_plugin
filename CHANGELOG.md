# Changelog

All notable changes to the DrawIO Architecture Properties Plugin are documented here.

---

## [1.11.0] — 2026-06-25

### Added
- **Pause / Resume toggle** — a **⏸ Pause** button in the panel footer suspends all selection-driven behaviour (property dialogs, panel population). While paused, shapes and connectors can be freely selected, moved, and rearranged without interruption. Clicking **▶ Resume** restores normal behaviour immediately. The paused/active state is persisted to `localStorage` (`drawio-pp-active`) and survives DrawIO restarts.

---

## [1.10.1] — 2026-06-23

### Fixed
- **Panel lockout after "Sync cross-page shapes"** — error paths in the sync button used `mxUtils.alert()`, which causes the same panel-lockout as the previously fixed export alert (commit `8eb06b8`): the native Electron dialog fires spurious events on dismissal that clear the graph selection and leave the panel stuck in disabled state. Replaced both alerts with an inline status line next to the button.
- **Panel stays disabled after "Sync to all matching pages"** — after switching to target pages and back, the panel relied on `setSelectionCell()` triggering the selection-change event chain to call `panel.populate()`. Multiple `selectPage()` calls made this chain unreliable. The panel is now re-populated directly in the restore timeout, regardless of whether the event fires.

---

## [1.10.0] — 2026-06-23

### Added
- **Cross-page property consolidation** — three layers of tooling to avoid entering the same properties on repeated instances of the same shape across pages. Two shapes are considered the same component if their visible label text and DrawIO shape type (`shape=X` style token) both match exactly.
  - **Layer 1 — auto-fill in Missing Properties Dialog** — when the dialog opens for a shape, the plugin scans all other pages for a vertex with the same label and shape type. If a matching shape with complete properties is found, the missing fields are pre-filled automatically and a blue *"Pre-filled from: [Page Name]"* banner is shown. If multiple pages match with different values, a dropdown lets the user pick the source before saving.
  - **Layer 2 — "Sync to all matching pages" button** — appears at the bottom of the *Also in…* section whenever the selected shape has all three properties set and at least one other page contains a matching shape. Opens a Sync Preview Dialog listing the target pages with per-row checkboxes before any write is made.
  - **Layer 3 — "Sync cross-page shapes" button** — shown in the empty panel state (no selection) for multi-page files. Scans the entire file, finds all shape groups with a fully-annotated source, and presents all proposed property copies in a single Sync Preview Dialog.
- **`src/SyncPreviewDialog.js`** — new shared modal for Layers 2 and 3. Shows a scrollable checklist of proposed writes (page, label, what will change). The modal stays open during writes so that page-switching is hidden from the user.
- **New helpers in `ShapeProperties.js`**: `getShapeTypeKey(cell)`, `getLabelText(cell)`, `findCrossPageMatches(ui, cell)`.

---

## [1.9.2] — 2026-05-30

### Changed
- **Tag-aware export filenames** — when a tag highlight is active at export time, the active tag name is appended to the base filename for both disk export and Confluence push: `{diagramname}_{pagename}_{tagname}.png/.json`. No change when no tag is active.
- **De-emphasised connector labels** — when a tag highlight is active, connector labels on non-matching connectors now fade to light grey (`fontColor` added to `DEEMPH_EDGE`) so they no longer compete visually with highlighted content.
- **De-emphasised connector lines made visible** — the de-emphasis opacity for connectors was raised from 40 to 60 and the stroke colour darkened slightly (`#BBBBBB`) so the connector line remains readable rather than nearly invisible.

---

## [1.9.1] — 2026-05-20

### Fixed
- **Confluence push now works** — three successive obstacles were diagnosed and resolved:
  1. DrawIO Desktop's `confluenceUpload` IPC action does not exist in this build; calls fell through the switch silently and returned HTTP 0.
  2. Switching to `fetch()` was blocked by DrawIO's `connect-src` Content Security Policy, which whitelists only `*.draw.io` and `*.diagrams.net`.
  3. Using Node.js `require('https')` in the renderer failed because the renderer runs with `nodeIntegration: false`.
- **Solution:** a `httpRequest` action was added to the `rendererReq` IPC handler in DrawIO Desktop's main process (`src/main/electron.js`). The main process is not subject to CSP and has full Node.js access. `https` and `http` are imported as top-level ESM imports (the main process uses `"type": "module"`; `require()` is not available). The renderer assembles the `multipart/form-data` body, base64-encodes it for IPC transport, and the main process sends the raw bytes to Confluence.

### Prerequisite
This release requires a patched DrawIO Desktop build with the `httpRequest` IPC action. See `drawio-desktop` branch `dev`, commit `8c435ed`.

---

## [1.9] — 2026-05-20

### Added
- **Confluence push** — a new *Confluence* section in the Properties tab lets users push the current page's PNG and JSON exports directly to one or more Confluence pages as attachments, without writing files to disk. Target pages are declared via a `confluence_page` diagram property (one Confluence page URL per line, must contain `/pages/{id}/`). Credentials (base URL, email, API token) are stored in `localStorage` and managed via a collapsible form in the panel. The push button is disabled until both credentials and at least one valid target page are configured. Progress and per-page results are shown inline.

### Changed
- **JSON export: `nodes` replaces `hierarchy` + `uncategorised`** *(breaking change for v1.8 consumers)* — the top-level JSON document now has a single `nodes` array instead of separate `hierarchy` and `uncategorised` arrays. A root node is any eligible shape whose draw.io parent is not itself eligible; root nodes are sorted by level depth and their subtrees are nested recursively. Every eligible shape appears exactly once.

---

## [1.8] — 2026-05-11

### Changed
- **Architecture export replaces Markdown report** — the export button (now labelled **Export architecture JSON**) produces a `.json` file instead of a `.md` file. The PNG export is retained. Both files continue to use the `{diagramname}_{pagename}` naming convention.

### JSON output format

The exported JSON document has five top-level fields:

| Field | Description |
|-------|-------------|
| `page` | Page name as shown in the DrawIO tab. |
| `generated` | Export date in `YYYY-MM-DD` format. |
| `hierarchy` | Array of Organisation-rooted shape trees (see shape node below). *(replaced by `nodes` in v1.9)* |
| `uncategorised` | Eligible shapes not inside any Organisation, sorted by level depth. *(replaced by `nodes` in v1.9)* |
| `connectors` | Named, non-ignored connectors (see connector entry below). |

**Shape node** (used in both `hierarchy` and `uncategorised`, recursively):

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | `prop_name` of the shape. |
| `level` | string | `prop_level` of the shape. |
| `description` | string \| null | `prop_description`, or `null` if absent or blank. |
| `children` | array | Nested eligible model-children. Empty array if none. |

**Connector entry**:

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | `prop_name` of the connector. |
| `description` | string \| null | `prop_description`, or `null` if absent or blank. |
| `source` | endpoint | Shape at the originating end. |
| `target` | endpoint | Shape at the receiving end. |

**Endpoint** (`source` / `target`): `{ "name": string, "level": string }`. If the endpoint shape is missing, not a vertex, marked as ignored, or has no `prop_name`, both fields fall back to `"anonymous"` and `"undefined"` respectively. If the shape has a name but no level, `"level"` is `"undefined"`.

### Eligibility rules
- **Shapes**: must have `prop_name` and `prop_level` set, and not be ignored.
- **Connectors**: must have `prop_name` set and not be ignored.

---

## [1.7] — 2026-05-11

### Added
- **Connector properties** — connectors (edges) now support **Name** and **Description** fields, editable directly in the Properties tab.
- **Missing properties dialog for connectors** — selecting a connector with an incomplete Name or Description triggers the same modal dialog as shapes. The Level field is omitted (connectors have no level). Dialog title reads *Connector Properties Required*.
- **Ignore / Un-ignore for connectors** — connectors can be marked as ignored from the dialog, suppressing future prompts. The Un-ignore button appears in the panel when an ignored connector is selected.
- **Connects section** — when a connector is selected, the Properties tab shows a *Connects* section with the source and target shape names rendered as clickable links. Clicking a link selects that shape and centres the viewport on it. Shapes with no name or marked as ignored appear as *anonymous* (grey italic, not clickable).

### Changed
- Selecting a connector now activates the **Properties tab** (previously auto-switched to the Tags tab). The Tags tab remains accessible.
- Level and Parent fields are hidden when a connector is selected; they are restored when a shape or no cell is selected.

---

## [1.6] — 2026-05-04

### Added
- **Tags system** — shapes and connectors can carry an optional `prop_tags` property (comma-separated tag names), editable in a new **Tags** tab.
- **Tag highlight engine** — select any tag from a dropdown and click **Activate** to visually emphasise all cells with that tag and de-emphasise everything else. **Clear** restores original styles. Both operations are undoable.
- **Two-tab panel** — the Properties panel is reorganised into a **Properties** tab (all existing fields unchanged) and a **Tags** tab (tags field + highlight controls).

### Fixed
- Tags input on connectors was not becoming editable due to a partial `style.background` override being unreliable in Electron; replaced with full `cssText` swap.

### Changed
- Panel height increased from 480 px to 580 px so the Connected shapes and Also in… sections are visible without manual resizing.
- Plugin version moved from the `mxWindow` title bar to a pinned footer at the bottom of the panel; the content area now scrolls independently.
- Architecture report PNG export uses a white background instead of transparent.

---

## [1.5] — 2026-04-27

### Added
- **Architecture report** — when no shape is selected, a *Generate architecture report* button appears at the bottom of the panel. Clicking it exports the current page as a PNG and produces a Markdown document embedding the image and listing all eligible shapes in hierarchy order (Organisation → Node), with descriptions and connections. Both files are saved next to the `.drawio` file using a `{diagramname}_{pagename}` naming convention.
- An *Uncategorised* section in the report covers shapes with properties that are not contained within any Organisation.

---

## [1.4.2] — 2026-04-20

### Changed
- Panel title renamed from *Properties* to **Architect toolset**.

---

## [1.4.1] — 2026-04-20

Initial release. Core features:

- **Properties panel** — persistent floating panel always visible while the plugin is loaded; shows Parent (read-only), Name, Level, and Description for the selected shape.
- **Level hierarchy** — Level is constrained to Organisation → Software System → Pipeline / Workflow / Tier → Service → Node. A shape may only be contained by a shape exactly one level above it.
- **Adopt Children** — bulk re-parenting of shapes at the correct child level whose bounding boxes lie fully inside the container.
- **Auto re-parenting** — changing the Level dropdown automatically finds and assigns the correct parent container.
- **Missing properties dialog** — modal prompt when a shape is selected with incomplete Name, Level, or Description. Shapes can be marked as *Ignored* to suppress the prompt.
- **Connected shapes** — lists all shapes connected to the selected shape via a connector, with directional arrows, shape name/level, and connector label.
- **Also in…** — lists other pages in the file containing a shape with the same name and level; each entry is a clickable link that navigates to that page and centres the viewport on the shape.
