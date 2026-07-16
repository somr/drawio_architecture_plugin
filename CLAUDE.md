# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build

```bash
npm install          # install webpack dev dependencies
npm run build        # production (minified) bundle → DrawIO plugins directory
npm run build:dev    # unminified bundle → DrawIO plugins directory (easier to debug)
npm run build:dist   # production (minified) bundle → local dist/properties-plugin.js, for committing
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

src/PropertiesPanel.js     Creates the persistent mxWindow panel (two tabs:
                           Properties and Tags). States: empty, populated,
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

src/ArchitectureReport.js  Architecture JSON + PNG export and Confluence push.

src/ConfluenceUploader.js  Confluence credential management, page URL
                           validation, multipart upload via httpRequest IPC.
```

### Property storage

Custom properties are stored as XML attributes on the cell's value node — the same mechanism DrawIO uses natively. Keys: `prop_name`, `prop_level`, `prop_description`, `properties_ignored`, `prop_tags`.

### Selection flow

```
selection change
  └─ plugin paused (!panel.isActive()) → panel.setEmpty(); return
  └─ 0 or multiple cells → panel.setEmpty()
  └─ 1 edge, ignored     → panel.setConnectorIgnored()
  └─ 1 edge, missing props → findCrossPageMatches() → dialog.show()
                               → onSave: panel.setEdge()
                               → onIgnore: panel.setConnectorIgnored()
  └─ 1 edge, all props   → panel.setEdge()
  └─ 1 shape, ignored    → panel.setIgnored()
  └─ 1 shape, missing props → findCrossPageMatches() → dialog.show()
                               (pre-fills fields if cross-page match exists)
                               → onSave: panel.populate()
                               → onIgnore: panel.setIgnored()
  └─ 1 shape, all props present → panel.populate()
```

## Specification

Full requirements and behaviour details are in `docs/specs.md`.
