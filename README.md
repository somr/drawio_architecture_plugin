# DrawIO Architecture Properties Plugin (v1.14.0)

A plugin for the [DrawIO](https://www.drawio.com/) desktop application that adds structured architecture properties to diagram shapes and connectors, enforces the architecture hierarchy, and exports the whole diagram as a model conforming to the **Architecture Metamodel V1** ([`docs/architecture-metamodel.md`](docs/architecture-metamodel.md)).

## Features

### Properties panel
A persistent floating panel titled **Architect toolset** always visible while the plugin is loaded.
The panel is organised into two tabs: **Properties** and **Tags**.

#### Properties tab
For a selected **shape**:

- **Parent** — the container the shape sits in (read-only). When the shape is not drawn inside its container on this page, a **Parent picker** lists the elements of the whole file that may contain it.
- **ID** — the element's stable, machine-facing identity (e.g. `ingestion-lambda`). Lowercase letters, digits, `-`, `_` and `.`; unique on the page. Renaming the shape never changes it.
- **Name** — editable text field
- **Level** — dropdown constrained to the architectural hierarchy (see below)
- **Description** — optional multi-line field
- **Technology** / **Provisioning** — shown only when Level is *Node*. Technology is a dropdown of the technology registry (see [Technology registry](#technology-registry)); Provisioning is `IAC`, `EXTERNAL` or `RUNTIME`.

For a selected **connector**:

- **ID** — optional
- **Name** — optional display label (not exported)
- **Description** — optional
- **Connects** — the source and target shape names as clickable links, plus a warning when the connector would not be exported as a flow (loose end, end without ID, ends at different levels, …)
- **Lift to common level** — shown when the ends are at different levels. Tick it when one end is not known in detail (e.g. a Service talks to another Software System, but you don't know which part of it): the export writes the flow between the ancestors of both ends that are at the same level and keeps the original connection under `lifted_from`
- **Ignore this connector** — excludes it from property management and from the export

### Architectural level hierarchy

```
Organization  →  Software System  →  Workflow | Tier  →  Service  →  Node
                        └──────────────────────────────────────────→  Node
```

Workflow and Tier are alternatives at the same depth: a Software System may contain either or both, and a Service may sit inside either. A **Node directly inside a Software System** is shared system infrastructure (e.g. a shared topic, queue or key). Levels are stored as slugs (`organization`, `software-system`, `workflow`, `tier`, `service`, `node`) and shown with friendly labels.

Diagrams made with earlier versions are migrated automatically when opened; former *Pipeline / Workflow / Tier* shapes become **Workflow** and real tiers need switching to **Tier** by hand.

### Same element on several pages
The same element can be drawn on several pages (a context page and a detail page, for example). All its shapes carry the **same ID**, and the export merges them into one element. **Also in…** lists the other pages where the selected element is drawn; each entry switches to that page and selects it.

### Hierarchical container adoption
- **Adopt Children button** — appears when a shape's level can contain children. Re-parents every shape of a valid child level that lies fully inside the container and has no closer valid container, in a single undoable operation.
- **Auto re-parenting** — when the Level changes, the shape is moved into its innermost valid container, preserving its visual position.

### Connected shapes
Lists all shapes connected to the selected shape via a connector, with directional arrows, shape name and level, and the connector label.

### Missing properties prompt
When a shape without a Name, ID or Level is selected, a dialog asks for them. The ID is suggested from the Name and checked as you type. Description, Technology and Provisioning are optional. Shapes can be marked as *Ignored* to suppress the prompt permanently. Connectors never trigger the prompt.

### Cross-page consolidation
Finds copies of the same component that do not share an ID yet. Two shapes are candidate copies when their visible label text and DrawIO shape type both match.

- **Pre-fill** — when the prompt opens and a candidate copy on another page has ID, Name and Level, the fields — including the ID — are pre-filled from it. A blue banner shows the source page.
- **Sync to all matching pages** — on a complete shape, copies its properties to its candidate copies on other pages, after a preview.
- **Sync cross-page shapes** — in the empty panel state, scans the whole file and proposes every copy in one preview. Groups whose complete members disagree on the ID are listed and skipped.

The preview lists each change with a checkbox; a change of ID is spelled out (*changes ID old → new*).

### Architecture export
When nothing is selected, the panel shows:

- **Export architecture YAML** — builds the model of the **whole file**, validates it, and offers `{diagramname}.yaml` for saving (DrawIO's save dialog opens; it starts in your Downloads folder).
- **Validate model** — the same checks, without exporting.
- **Generate model page** — draws the whole model as a hierarchy tree on a page named *Architecture Model*: one box per element, coloured by level, with a red (errors) or orange (warnings) border when validation found problems with it; hover for the messages, click the link to go to the page it is drawn on. The page is wiped and redrawn on every run (edits there are lost) and is never read back into the model. Flows are not drawn yet.

Problems are listed in a report dialog grouped into errors, warnings and advisories, with the metamodel's rule codes (`HIER-001`, `FLOW-001`, `WF-004`, …). Click a line to jump to the shape. Validation never blocks the export: **Export anyway** writes the model as drawn, leaving out only what would make it invalid YAML (unresolvable references, duplicate IDs, invalid flows).

When shapes have a Name and Level but no ID, the report offers **Fix N missing IDs…**: it previews an ID for each of them (reusing the ID of the same element on other pages, otherwise one made from the name) and sets the ones you keep.

Excerpt of an export:

```yaml
# Architecture model exported from: Trade.drawio
# Generated: 2026-11-16
modelVersion: 1
technologyRegistry:
  name: acme-aws
  version: "3"
elements:
  - id: trade-processing
    name: Trade Processing
    type: software-system
    parent: global-trade
  - id: ingestion-lambda
    name: Ingestion Lambda
    type: node
    parent: ingestion
    technology: AWS_LAMBDA
    provisioning: IAC
flows:
  - id: ingestion-to-normalization
    from: ingestion
    to: normalization
    description: Ingested records are provided for normalization.
  - from: trade-processing          # lifted: only the Service side is known
    to: market-data
    declared: false
    lifted_from:
      - from: ingestion
        to: market-data
```

Fields with no value are left out. The full format and every validation rule are in [`docs/specs.md`](docs/specs.md) §10.

### Technology registry
Node technologies come from a registry in a small configuration file installed next to the plugin — see [Install the technology registry](#install-the-technology-registry-optional). Without it, Technology is free text and the export warns that technologies were not checked.

#### Tags tab
- **Tags field** — a comma-separated list of tags for the selected shape or connector. Saves on blur.
- **Highlight section** — select any tag from the dropdown and click **Activate** to visually emphasise all shapes and connectors carrying that tag and de-emphasise everything else. Click **Clear** to restore original styles. The highlight is applied as an undoable operation.

### Confluence push
A **Confluence** section in the Properties tab pushes the architecture model (`{diagramname}.yaml`, whole file) and a PNG of the current page to one or more Confluence pages as attachments, without writing files to disk. The same validation report is shown first. Target pages are declared via a `confluence_page` diagram property (one URL per line, must contain `/pages/{id}/`). Credentials (base URL, email, API token) are stored in `localStorage` and managed via a collapsible settings form.

> **Prerequisite:** requires a patched DrawIO Desktop build with the `httpRequest` IPC action (see `drawio-desktop` branch `dev`, commit `8c435ed`).

### Pause / Resume
A **⏸ Pause** button in the panel footer suspends all selection-driven behaviour. While paused, shapes and connectors can be freely selected, moved, and rearranged without any property dialog appearing or the panel updating. Click **▶ Resume** to restore normal behaviour. The toggle state persists across DrawIO restarts.

---

## Requirements

- [DrawIO desktop](https://github.com/jgraph/drawio-desktop/releases) (Electron-based, Linux or Windows)
- Node.js and npm (for building from source)

---

## Installation

### Option A: Quick install (no build required)

Download the built plugin directly:

[**properties-plugin.js**](https://raw.githubusercontent.com/somr/drawio_architecture_plugin/main/dist/properties-plugin.js)

Save it into the DrawIO plugins directory:
- **Linux:** `~/.config/draw.io/plugins/properties-plugin.js`
- **Windows:** `%APPDATA%\draw.io\plugins\properties-plugin.js`

Then continue with [Register the plugin](#register-the-plugin-first-time-only) below.

### Option B: Build from source

```bash
npm install
npm run build:dev
```

This outputs directly to the DrawIO plugins directory:
- **Linux:** `~/.config/draw.io/plugins/properties-plugin.js`
- **Windows:** `%APPDATA%\draw.io\plugins\properties-plugin.js`

### Register the plugin (first time only)

1. Open DrawIO desktop.
2. Go to **Extras → Plugins → Add** and select `properties-plugin.js` from the plugins directory above.
3. Restart DrawIO.

After the first registration, rebuilding (or re-downloading) and restarting DrawIO is all that is needed to pick up changes.

### Install the technology registry (optional)

1. Download [**architecture-config.example.js**](https://raw.githubusercontent.com/somr/drawio_architecture_plugin/main/dist/architecture-config.example.js) (source: [`config/architecture-config.example.js`](config/architecture-config.example.js)) and edit the technologies to match your organisation. Each entry has a `kind` (`COMPUTE`, `STORAGE`, `MESSAGING`, `ORCHESTRATION`, `NETWORK`, `SECURITY`, `OBSERVABILITY`) and `executable` (`true`/`false`).
2. In DrawIO, **Extras → Plugins → Add**, select the file, and restart DrawIO.
3. To change it later, edit the copy in the plugins directory and restart DrawIO.

---

## Build scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Production bundle (minified) → DrawIO plugins directory |
| `npm run build:dev` | Development bundle (readable, inline source map) → DrawIO plugins directory |
| `npm run build:dist` | Production bundle (minified) → local `dist/properties-plugin.js`, plus a copy of the example registry → `dist/architecture-config.example.js`, for committing/distribution |
| `npm run watch` | Watch mode — rebuilds on every save |

---

## Project structure

```
src/
  index.js                  Plugin entry point; selection change listener
  ShapeProperties.js        Property read/write, level hierarchy, IDs, parent
                            resolution, container adoption, flow checks,
                            cross-page helpers
  TechnologyRegistry.js     Loads and validates window.ArchitectureConfig
  NodeFields.js             Technology / Provisioning controls (panel + dialog)
  LevelSelect.js            Level dropdown with the Workflow / Tier group
  PropertiesPanel.js        Persistent mxWindow panel UI (Properties + Tags tabs)
  PropertiesDialog.js       Missing-properties modal dialog (with cross-page pre-fill)
  SyncPreviewDialog.js      Cross-page sync preview modal (checkable target list)
  ArchitectureModel.js      Whole-file model: merge, validation, YAML
  ArchitectureReport.js     Export / validate / Confluence push orchestration
  ValidationReportDialog.js Validation findings modal
  TagHighlight.js           Tag highlight engine — activate/clear/style merge
  ConfluenceUploader.js     Confluence push — multipart upload via httpRequest IPC
config/
  architecture-config.example.js   Example technology registry
docs/
  specs.md                  Full feature specification
  architecture-metamodel.md Architecture Metamodel V1
webpack.config.js           Build configuration
```

---

## Documentation

Full requirements and behaviour details are in [`docs/specs.md`](docs/specs.md).

---

## Changelog

See [`CHANGELOG.md`](CHANGELOG.md) for the full version history.
