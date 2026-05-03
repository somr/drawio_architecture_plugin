'use strict';

var ShapeProperties  = require('./ShapeProperties');
var PropertiesPanel  = require('./PropertiesPanel');
var PropertiesDialog = require('./PropertiesDialog');

// Capture the script src as early as possible — document.currentScript is only
// available synchronously during script execution, not inside callbacks.
var _pluginSrc = (document.currentScript && document.currentScript.src) || '(src unavailable)';

console.log('[PropertiesPlugin] Script file loaded from:', _pluginSrc);

// Draw.loadPlugin fires after the App constructor has fully initialised
// EditorUi, the editor, and the graph. It is safe to create mxWindow and
// attach graph listeners directly here — no deferral is needed or correct.
Draw.loadPlugin(function(ui) {

  console.log('[PropertiesPlugin] Draw.loadPlugin callback fired');

  // -------------------------------------------------------------------------
  // Fix a DrawIO Electron bug (present through at least v29):
  //
  // ElectronApp.js loads plugins via:
  //   var plugins = mxSettings.getPlugins();   // returns the LIVE array reference
  //   plugins[i] = 'file://' + resolvedPath;   // also mutates mxSettings.settings.plugins[i]
  //   mxscript(plugins[i]);
  //
  // When mxSettings.save() is later called (e.g. fileLoaded -> setOpenCounter),
  // it persists the full file:// URL. On the next restart, getPluginFile()
  // receives that URL, does path.join(pluginsDir, 'file:///...') which produces
  // a nonsense path, existsSync returns false, and the plugin is silently skipped.
  //
  // Fix: normalize file:// entries back to bare filenames before the save fires.
  // -------------------------------------------------------------------------
  var savedPlugins = mxSettings.getPlugins();
  console.log('[PropertiesPlugin] mxSettings plugins at load time:', JSON.stringify(savedPlugins));

  if (savedPlugins) {
    var normalized = false;
    for (var i = 0; i < savedPlugins.length; i++) {
      if (typeof savedPlugins[i] === 'string' && savedPlugins[i].startsWith('file://')) {
        var before = savedPlugins[i];
        savedPlugins[i] = savedPlugins[i].split('/').pop();
        console.log('[PropertiesPlugin] Normalized plugin path:', before, '->', savedPlugins[i]);
        normalized = true;
      }
    }
    if (normalized) {
      mxSettings.save();
      console.log('[PropertiesPlugin] Saved normalized plugin paths to mxSettings');
    }
  }

  var graph  = ui.editor.graph;
  var panel  = new PropertiesPanel(ui, ShapeProperties);
  var dialog = new PropertiesDialog(ui, ShapeProperties);

  panel.init();
  console.log('[PropertiesPlugin] Panel initialized');

  // -------------------------------------------------------------------------
  // Selection change handler
  // -------------------------------------------------------------------------
  graph.getSelectionModel().addListener(mxEvent.CHANGE, function() {
    var cells = graph.getSelectionCells();

    if (cells.length === 0 || cells.length > 1) {
      panel.setEmpty();
      return;
    }

    var cell = cells[0];

    if (graph.model.isEdge(cell)) {
      panel.setEmpty();
      return;
    }

    if (ShapeProperties.isIgnored(cell)) {
      panel.setIgnored(cell);
      return;
    }

    ShapeProperties.sanitizeLevel(graph, cell);

    var missing = ShapeProperties.getMissingProperties(cell);
    if (missing.length > 0) {
      dialog.show(
        cell,
        function onSave()   { panel.populate(cell); },
        function onIgnore() { panel.setIgnored(cell); }
      );
    } else {
      panel.populate(cell);
    }
  });

  // Reset the panel when a new file is opened (e.g. user opens another diagram).
  ui.editor.addListener('fileLoaded', function() {
    console.log('[PropertiesPlugin] fileLoaded event — resetting panel');
    panel.setEmpty();
  });

  console.log('[PropertiesPlugin] Fully initialized');

}); // end Draw.loadPlugin
