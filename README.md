# DrawIO Architecture Properties Plugin (v1.11.0)

A plugin for the [DrawIO](https://www.drawio.com/) desktop application that adds structured property management to diagram shapes and connectors, enforces a strict architectural hierarchy, and provides navigation aids across multi-page diagrams.

## Features

### Properties panel
A persistent floating panel titled **Architect toolset** always visible while the plugin is loaded.
The panel is organised into two tabs: **Properties** and **Tags**.

#### Properties tab
For a selected **shape**:

- **Parent** — the direct container shape (read-only), or *— no parent —* if the shape sits at the diagram root
- **Name** — editable text field
- **Level** — dropdown constrained to the architectural hierarchy (see below)
- **Description** — editable multi-line field

For a selected **connector**:

- **Name** — editable text field
- **Description** — editable multi-line field
- **Connects** — shows the source and target shape names as clickable links. Clicking a name selects that shape and centres the viewport on it. Shapes with no name or marked as ignored appear as *anonymous*.

(Level and Parent are not applicable to connectors and are hidden.)

### Architectural level hierarchy
Levels follow a strict parent → child order:

```
Organization  →  Software System  →  Pipeline / Workflow / Tier  →  Service  →  Node
```

A shape may only be contained by a shape exactly one level above it.

### Hierarchical container adoption
- **Adopt Children button** — appears when a shape's level can contain children. Scans the diagram for shapes with the correct child level whose bounding box is fully inside the container, and re-parents them in a single undoable operation.
- **Auto re-parenting** — when the Level dropdown changes, the plugin automatically finds the correct parent container and re-parents the shape, preserving its visual position.

### Connected shapes
Lists all shapes connected to the selected shape via a connector, with:
- Directional arrows (→ outgoing, ← incoming)
- Shape name and level
- Connector label in parentheses, if present

### Also in...
Lists other pages in the file that contain a shape with the same name and level. Each entry is a clickable link that switches to that page and centres the viewport on the matching shape.

When the selected shape has all three properties set, a **"Sync to all matching pages"** button also appears. Clicking it opens a preview dialog listing all other pages containing a shape with the same visual label and DrawIO shape type, with checkboxes per page. Confirming writes Name, Level, and Description to each selected page in one operation.

### Cross-page consolidation

Reduces the effort of entering the same properties on repeated instances of the same shape across pages. Two shapes are considered the same component if their visible label text and DrawIO shape type both match.

- **Auto-fill on missing properties** — when the Missing Properties Dialog opens and a matching shape with complete properties exists on another page, the missing fields are pre-filled automatically. A blue banner shows which page the values came from. If multiple pages provide different values, a dropdown lets the user choose the source.
- **Sync cross-page shapes** — in the empty panel state (no selection), a blue **"Sync cross-page shapes"** button scans the entire file and proposes all possible property copies from fully-annotated shapes to unannotated ones. A preview dialog lists every proposed change with per-row checkboxes before anything is written.

### Architecture export

When no shape is selected, a green **Export architecture JSON** button appears at the bottom of the panel. Clicking it saves two files next to the `.drawio` file using a `{diagramname}_{pagename}` naming convention:

- **`{name}.png`** — full-page PNG export of the current page (white background).
- **`{name}.json`** — JSON document describing the shape hierarchy and all named connectors.

**JSON top-level fields:**

| Field | Description |
|-------|-------------|
| `page` | Page name as shown in the DrawIO tab. |
| `generated` | Export date (`YYYY-MM-DD`). |
| `nodes` | All eligible root shapes and their full subtrees, nested recursively. A root node is an eligible shape whose draw.io parent is not itself eligible. Each shape has `name`, `level`, `description` (null if blank), and `children`. |
| `connectors` | Named, non-ignored connectors. Each entry has `name`, `description` (null if blank), `source`, and `target`. |

Connector endpoints (`source`/`target`) each carry `name` and `level`. If an endpoint shape is unnamed, ignored, or the connector is dangling, both fields show `"anonymous"` / `"undefined"` respectively.

Shapes must have both `prop_name` and `prop_level` to appear in the hierarchy. Connectors must have `prop_name` to appear in the connectors list.

If a tag highlight is active at export time, the active tag name is appended to the base filename: `{diagramname}_{pagename}_{tagname}.png/.json`.

#### Tags tab
- **Tags field** — a comma-separated list of tags for the selected shape or connector. Saves on blur.
- **Highlight section** — select any tag from the dropdown and click **Activate** to visually emphasise all shapes and connectors carrying that tag and de-emphasise everything else. Click **Clear** to restore original styles. The highlight is applied as an undoable operation.

### Confluence push

A **Confluence** section in the Properties tab lets users push the current page's PNG and JSON exports directly to one or more Confluence pages as attachments, without writing files to disk. Target pages are declared via a `confluence_page` diagram property (one URL per line, must contain `/pages/{id}/`). Credentials (base URL, email, API token) are stored in `localStorage` and managed via a collapsible settings form. Progress and per-page results are shown inline.

> **Prerequisite:** requires a patched DrawIO Desktop build with the `httpRequest` IPC action (see `drawio-desktop` branch `dev`, commit `8c435ed`).

### Pause / Resume
A **⏸ Pause** button in the panel footer suspends all selection-driven behaviour. While paused, shapes and connectors can be freely selected, moved, and rearranged without any property dialog appearing or the panel updating. Click **▶ Resume** to restore normal behaviour. The toggle state persists across DrawIO restarts.

### Missing properties prompt
When a shape or connector with incomplete properties is selected, a modal dialog prompts for the missing values. Shapes require Name, Level, and Description; connectors require Name and Description only. If a matching shape exists on another page, the missing fields are pre-filled from it (see Cross-page consolidation above). Both shapes and connectors can be marked as *Ignored* to suppress the prompt permanently.

---

## Requirements

- [DrawIO desktop](https://github.com/jgraph/drawio-desktop/releases) (Electron-based, Linux or Windows)
- Node.js and npm (for building from source)

---

## Installation

### 1. Build

```bash
npm install
npm run build:dev
```

The build outputs directly to the DrawIO plugins directory:
- **Linux:** `~/.config/draw.io/plugins/properties-plugin.js`
- **Windows:** `%APPDATA%\draw.io\plugins\properties-plugin.js`

### 2. Register the plugin (first time only)

1. Open DrawIO desktop.
2. Go to **Extras → Plugins → Add** and select `properties-plugin.js` from the plugins directory above.
3. Restart DrawIO.

After the first registration, rebuilding and restarting DrawIO is all that is needed to pick up changes.

---

## Build scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Production bundle (minified) |
| `npm run build:dev` | Development bundle (readable, inline source map) |
| `npm run watch` | Watch mode — rebuilds on every save |

---

## Project structure

```
src/
  index.js              Plugin entry point; selection change listener
  ShapeProperties.js    Property read/write, level hierarchy, container adoption,
                        tag helpers, cross-page label+shape matching
  PropertiesPanel.js    Persistent mxWindow panel UI (Properties + Tags tabs)
  PropertiesDialog.js   Missing-properties modal dialog (with cross-page pre-fill)
  SyncPreviewDialog.js  Cross-page sync preview modal (checkable target list)
  TagHighlight.js       Tag highlight engine — activate/clear/style merge
  ArchitectureReport.js Architecture JSON + PNG export
  ConfluenceUploader.js Confluence push — multipart upload via httpRequest IPC
docs/
  specs.md              Full feature specification
webpack.config.js       Build configuration
```

---

## Documentation

Full requirements and behaviour details are in [`docs/specs.md`](docs/specs.md).

---

## Changelog

See [`CHANGELOG.md`](CHANGELOG.md) for the full version history.
