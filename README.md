# DrawIO Architecture Properties Plugin (v1.7)

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

### Architecture report

When no shape is selected, a green **Generate architecture report** button appears at the bottom of the panel. Clicking it exports the current page as a PNG and produces a Markdown document that includes the image and describes all eligible shapes in hierarchy order. Both files are saved next to the `.drawio` file using a `{diagramname}_{pagename}` naming convention.

The Markdown document structure:
- H1 page title with embedded PNG
- H2–H6 headings per shape level (Organisation → Node), with description and connections
- An **Uncategorised** section for shapes not contained within any Organisation

#### Tags tab
- **Tags field** — a comma-separated list of tags for the selected shape or connector. Saves on blur.
- **Highlight section** — select any tag from the dropdown and click **Activate** to visually emphasise all shapes and connectors carrying that tag and de-emphasise everything else. Click **Clear** to restore original styles. The highlight is applied as an undoable operation.

### Missing properties prompt
When a shape or connector with incomplete properties is selected, a modal dialog prompts for the missing values. Shapes require Name, Level, and Description; connectors require Name and Description only. Both shapes and connectors can be marked as *Ignored* to suppress the prompt permanently.

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
  ShapeProperties.js    Property read/write, level hierarchy, container adoption, tag helpers
  PropertiesPanel.js    Persistent mxWindow panel UI (Properties + Tags tabs)
  PropertiesDialog.js   Missing-properties modal dialog
  TagHighlight.js       Tag highlight engine — activate/clear/style merge
  ArchitectureReport.js Architecture report generator (PNG + Markdown)
docs/
  specs.md              Full feature specification
webpack.config.js       Build configuration
```

---

## Documentation

Full requirements and behaviour details are in [`docs/specs.md`](docs/specs.md).
