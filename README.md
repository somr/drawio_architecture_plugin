# DrawIO Architecture Properties Plugin

A plugin for the [DrawIO](https://www.drawio.com/) desktop application that adds structured property management to diagram shapes, enforces a strict architectural hierarchy, and provides navigation aids across multi-page diagrams.

## Features

### Properties panel
A persistent floating panel titled **Architect toolset** always visible while the plugin is loaded. For each selected shape it shows:

- **Parent** — the direct container shape (read-only), or *— no parent —* if the shape sits at the diagram root
- **Name** — editable text field
- **Level** — dropdown constrained to the architectural hierarchy (see below)
- **Description** — editable multi-line field

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

### Missing properties prompt
When a shape with incomplete properties is selected, a modal dialog prompts for the missing values. Shapes can also be marked as *Ignored* to suppress the prompt permanently.

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
  ShapeProperties.js    Property read/write, level hierarchy, container adoption
  PropertiesPanel.js    Persistent mxWindow panel UI
  PropertiesDialog.js   Missing-properties modal dialog
docs/
  specs.md              Full feature specification
webpack.config.js       Build configuration
```

---

## Documentation

Full requirements and behaviour details are in [`docs/specs.md`](docs/specs.md).
