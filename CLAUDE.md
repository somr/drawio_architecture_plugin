# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build

```bash
npm install          # install webpack dev dependencies
npm run build        # production bundle → dist/properties-plugin.js
npm run build:dev    # unminified bundle (easier to debug)
npm run watch        # watch mode, rebuilds on save
```

The output is a single file: `dist/properties-plugin.js`. That file is what gets loaded by DrawIO.

## Installing the plugin in DrawIO desktop

The build outputs directly to DrawIO's plugin directory (`~/.config/draw.io/plugins/` on Linux, `%APPDATA%\draw.io\plugins\` on Windows), so the plugin is updated on every build.

**First-time install only:**
1. Open DrawIO desktop.
2. Go to **Extras → Plugins → Add** and select `properties-plugin.js` from the plugins directory above.
3. Restart DrawIO.

After that, `npm run build:dev` + restart DrawIO is all that's needed to pick up changes.

## Architecture

The plugin uses the standard DrawIO plugin entry point `Draw.loadPlugin(fn)`. All mxGraph globals (`mxEvent`, `mxWindow`, `mxUtils`, `mxEventObject`) are provided by the DrawIO runtime — they are never bundled.

```
src/index.js             Entry point. Registers the plugin, owns the selection
                         change listener, and wires together Panel + Dialog.

src/ShapeProperties.js   Pure utility module. All reads/writes of custom cell
                         properties go through here. Uses model.beginUpdate /
                         endUpdate so changes are undoable.

src/PropertiesPanel.js   Creates the persistent mxWindow panel with Name, Level,
                         and Description fields. Three states: empty, populated,
                         ignored. Saves on field blur via ShapeProperties.

src/PropertiesDialog.js  Modal overlay popup shown when a shape is missing
                         properties. Provides Save and Ignore actions.
```

### Property storage

Custom properties are stored as XML attributes on the cell's value node — the same mechanism DrawIO uses natively. Keys: `prop_name`, `prop_level`, `prop_description`, `properties_ignored`.

### Selection flow

```
selection change
  └─ 0 or multiple cells → panel.setEmpty()
  └─ 1 edge              → panel.setEmpty()
  └─ 1 shape, ignored    → panel.setIgnored()
  └─ 1 shape, missing props → dialog.show() → onSave: panel.populate()
                                             → onIgnore: panel.setIgnored()
  └─ 1 shape, all props present → panel.populate()
```

## Specification

Full requirements and behaviour details are in `docs/specs.md`.
