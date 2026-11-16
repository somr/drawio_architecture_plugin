# Driving DrawIO desktop for manual plugin tests

Helpers used to test the plugin live in DrawIO desktop (Linux, X display
`:10.0`) through the Chrome DevTools Protocol. Not part of the build.

| File | Purpose |
|---|---|
| `launch-drawio.sh [file]` | Starts DrawIO with `--enable-plugins --remote-debugging-port=9333`; refuses if DrawIO is still running. |
| `cdp.mjs '<js>'` | Evaluates a JS expression in the DrawIO page and prints the JSON result (Node ≥ 22, no dependencies). Promises are awaited. |
| `panel-state.js` | Evaluate once per session (`node cdp.mjs "$(cat panel-state.js)"`); defines `window.__panelState()`, which returns the visible panel rows, buttons, *Also in…* and *Connects* text. |
| `quit-drawio.sh` | Stops DrawIO (SIGTERM to the main process), clicks *Discard Changes* if the unsaved-changes prompt appears, waits until every DrawIO process has exited. |
| `test.drawio` | Two-page test diagram: a system with a Node inside, a pre-1.12 shape without ID (legacy `Service` level, free-text technology/provisioning), a connector across levels, and a complete copy of the shape on the second page. |

## Testing an unreleased build without losing the installed plugin

`npm run build` / `build:dev` overwrite the installed plugin. Instead:

```bash
P=~/.config/draw.io/plugins
cp -p $P/properties-plugin.js /somewhere/safe/properties-plugin.js     # back up
npx webpack --mode development --output-path /tmp/pp-build
cp /tmp/pp-build/properties-plugin.js $P/properties-plugin.js
cp tools/drawio-cdp/test.drawio /tmp/pp-test.drawio                      # work on a copy
tools/drawio-cdp/launch-drawio.sh /tmp/pp-test.drawio
cd tools/drawio-cdp
node cdp.mjs 'new Promise(r => Draw.loadPlugin(u => { window.__ui = u; r(u.pages.map(p => p.getName())); }))'
node cdp.mjs "$(cat panel-state.js)"
node cdp.mjs 'var g = __ui.editor.graph; g.setSelectionCell(g.model.getCell("topic")); __panelState()'
./quit-drawio.sh
cp -p /somewhere/safe/properties-plugin.js $P/properties-plugin.js     # restore, then compare sha256
```

Tips:

- `Draw.loadPlugin(fn)` called after start-up runs `fn(ui)` immediately — the easiest way to get the `EditorUi`.
- The technology registry is read lazily, so assigning `window.ArchitectureConfig = {...}` through `cdp.mjs` before the first shape selection simulates an installed configuration file. To test the real file, copy it into the plugins folder, add it with `mxSettings.setPlugins([...]); mxSettings.save()`, restart, and restore the original list afterwards.
- Dialog buttons can be clicked from `cdp.mjs` (`button.click()`); the plugin's modals are the `div` with `z-index: 9999`.
- Native GTK dialogs (the export's save dialog) need real input: raise the window with `wmctrl -i -a <id>`, then send keys with Python Xlib `xtest` (Ctrl+A, type an absolute path, Return).

## Pitfalls

- **Never use `pkill -f` / `pgrep -f` on the DrawIO command line** — the calling shell's own command line contains the same text and gets killed. Use `pgrep -x -o drawio` (oldest process named exactly `drawio` = the main process).
- Wait until `pgrep -x drawio` is empty before relaunching (see `launch-drawio.sh`).
- The plugin rewrites pre-1.12 Level values when a file opens, which marks the diagram as modified — quitting then shows the unsaved-changes prompt (`quit-drawio.sh` discards it). Always test on a copy of `test.drawio`.
