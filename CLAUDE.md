# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build

```bash
npm install          # install webpack dev dependencies
npm run build        # production (minified) bundle → DrawIO plugins directory
npm run build:dev    # unminified bundle → DrawIO plugins directory (easier to debug)
npm run build:dist   # production (minified) bundle → local dist/properties-plugin.js (+ dist/architecture-config.example.js), for committing
npm run watch        # watch mode, rebuilds on save
```

The output is a single file: `properties-plugin.js`. That file is what gets loaded by DrawIO.
`dist/properties-plugin.js` is a committed copy for direct download from GitHub (see README)
— rebuild it with `npm run build:dist` before committing whenever `src/` changes.

## Installing the plugin in DrawIO desktop

`npm run build` / `build:dev` output directly to DrawIO's plugin directory (`~/.config/draw.io/plugins/` on Linux, `%APPDATA%\draw.io\plugins\` on Windows), so the plugin is updated on every build.

**First-time install only:**
1. Open DrawIO desktop.
2. Go to **Extras → Plugins → Add** and select `properties-plugin.js` from the plugins directory above.
3. Restart DrawIO.

After that, `npm run build:dev` + restart DrawIO is all that's needed to pick up changes.

## Architecture

The plugin uses the standard DrawIO plugin entry point `Draw.loadPlugin(fn)`. All mxGraph globals (`mxEvent`, `mxWindow`, `mxUtils`, `mxEventObject`) are provided by the DrawIO runtime — they are never bundled.

```
src/index.js               Entry point. Registers the plugin, owns the selection
                           change listener, and wires together Panel + Dialog.
                           Finds cross-page matches before opening the dialog.

src/ShapeProperties.js     Pure utility module. All reads/writes of custom cell
                           properties go through here. Uses model.beginUpdate /
                           endUpdate so changes are undoable. Also contains
                           cross-page matching helpers (findCrossPageMatches,
                           getLabelText, getShapeTypeKey).

src/PropertiesPanel.js     Creates the persistent mxWindow panel (three tabs:
                           Properties, Tags and Find). States: empty, populated,
                           ignored, edge, connectorIgnored. Saves on field blur
                           via ShapeProperties. Owns the "Sync to all matching
                           pages" button and "Sync cross-page shapes" button.
                           Footer contains a Pause/Resume toggle (persisted to
                           localStorage key 'drawio-pp-active'); isActive()
                           is read by the selection handler in index.js.

src/PropertiesDialog.js    Modal overlay popup shown when a shape is missing
                           properties. Provides Save and Ignore actions.
                           Accepts cross-page matches and pre-fills missing
                           fields from a matching shape on another page.

src/SyncPreviewDialog.js   Modal that previews proposed cross-page property
                           writes before they are applied. Used by both the
                           "Sync to all" and "Sync cross-page shapes" actions.

src/TagHighlight.js        Tag highlight engine — activate/clear/style merge.

src/SearchPane.js          Find tab (specs §5.8): search box + ranked results;
                           ↑/↓ preview (scroll + flash), Enter/click selects,
                           reveals hidden/collapsed shapes on select.

src/ShapeSearch.js         Pure search for the Find tab: collectEntries (one
                           per searchable cell) + ranking. Testable in Node.

src/LevelSelect.js         Fills a Level <select> from ShapeProperties.LEVELS,
                           grouping same-rank levels (Workflow / Tier) in an
                           <optgroup>. Shared by the panel and the dialog.

src/NodeFields.js          Technology (registry dropdown or free text) and
                           Provisioning controls, shared by panel and dialog.
                           Reads the registry lazily on first setValue().

src/TechnologyRegistry.js  Reads window.ArchitectureConfig (set by the separate
                           architecture-config.js plugin file, see
                           config/architecture-config.example.js) lazily,
                           validates it once and caches it for the session.

src/ArchitectureModel.js   Pure model builder (no DOM, no I/O): merges all
                           pages by prop_id, validates (spec §10.7 rule codes),
                           serialises YAML. Testable in Node with a mock model.

src/ArchitectureReport.js  Export / Validate / Confluence push orchestration.
                           Saves the YAML via a Blob <a download> (Electron
                           native save dialog) — desktop writeFile IPC rejects
                           non-diagram content, so it cannot write YAML.

src/ModelDiagram.js       Generated "Architecture Model" page: pure tree
                           layout (layoutTree) + renderer. The page is wiped
                           and redrawn each run; its cells carry pp_model_view,
                           so forEachPage skips the page (specs §10.9).

src/ValidationReportDialog.js  Findings modal; clicking a row navigates to
                           the page + cell.

src/ConfluenceUploader.js  Confluence credential management, page URL
                           validation, multipart upload via httpRequest IPC.
```

### Property storage

Custom properties are stored as XML attributes on the cell's value node — the same mechanism DrawIO uses natively. Keys: `prop_id`, `prop_name`, `prop_level`, `prop_description`, `prop_parent`, `properties_ignored`, `prop_tags`, plus the Node-only `prop_technology` and `prop_provisioning`, and the connector-only `prop_flow_lift` (lifted cross-level flows, specs §10.5.1).

- **Identity:** `prop_id` is the element's stable ID (required for shapes, optional for connectors). The same ID on several pages = the same element; the export merges them.
- **Hierarchy:** level slugs and their legal parents are defined in `ShapeProperties.LEVELS` (`parents` arrays — the single source of truth; a Node may sit in a Service or directly in a Software System). `rank` is only for ordering and the same-level rule on flows. Parent resolution: nearest eligible container in the model tree, else `prop_parent` (`resolveParent`).
- **Legacy:** pre-1.12 level labels are mapped in `getProperty` and rewritten by `migrateLegacyLevels` (run from index.js on file load / page switch).

### Selection flow

```
selection change
  └─ plugin paused (!panel.isActive()) → panel.setEmpty(); return
  └─ 0 or multiple cells → panel.setEmpty()
  └─ 1 edge, ignored     → panel.setConnectorIgnored()
  └─ 1 edge              → panel.setEdge()   (connectors never open the dialog)
  └─ 1 shape, ignored    → panel.setIgnored()
  └─ 1 shape, missing Name / ID / Level → findCrossPageMatches() → dialog.show()
                               (pre-fills fields incl. ID from a complete match)
                               → onSave: panel.populate()
                               → onIgnore: panel.setIgnored()
  └─ 1 shape, complete   → panel.populate()
```

### Testing a build in DrawIO

`npm run build` / `build:dev` overwrite the installed plugin. To try an unreleased build without losing the installed one, build with `npx webpack --mode development --output-path <tmp dir>`, back up the installed `properties-plugin.js`, copy the build over it, test, then restore the backup.

## Specification

Full requirements and behaviour details are in `docs/specs.md`.
