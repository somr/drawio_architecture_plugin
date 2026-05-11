'use strict';

// Order used when sorting uncategorised shapes.
var LEVEL_ORDER = {
  'Organization':              0,
  'Software System':           1,
  'Pipeline / Workflow / Tier': 2,
  'Service':                   3,
  'Node':                      4,
};

function ArchitectureReport(ui, shapeProps) {
  this.ui = ui;
  this.shapeProps = shapeProps;
}

ArchitectureReport.prototype.generate = function() {
  var ui = this.ui;
  var sp = this.shapeProps;

  var file = ui.getCurrentFile();
  if (!file || !file.fileObject || !file.fileObject.path) {
    mxUtils.alert('Save the diagram before exporting.');
    return;
  }

  var filePath     = file.fileObject.path;
  var sep          = filePath.indexOf('/') !== -1 ? '/' : '\\';
  var fileDir      = filePath.substring(0, filePath.lastIndexOf(sep));
  var diagName     = _sanitize((file.fileObject.name || 'diagram').replace(/\.[^.]+$/, ''));
  var page         = ui.currentPage;
  var pageName     = page
    ? (page.getName ? page.getName() : (page.name || 'page'))
    : 'page';
  var base         = diagName + '_' + _sanitize(pageName);
  var jsonFilename = base + '.json';
  var jsonPath     = fileDir + sep + jsonFilename;

  var graph         = ui.editor.graph;
  var eligibleCells = _collectEligible(graph, sp);

  if (eligibleCells.length === 0) {
    mxUtils.alert('No shapes with Name and Level found on this page.');
    return;
  }

  var pngFilename = base + '.png';
  var pngPath     = fileDir + sep + pngFilename;

  var json = _buildJson(sp, graph, eligibleCells, pageName);
  var data = JSON.stringify(json, null, 2);

  _exportPng(ui, pngPath, function(pngErr) {
    if (pngErr) {
      mxUtils.alert('PNG export failed: ' + pngErr);
      return;
    }
    window.electron.request(
      { action: 'writeFile', path: jsonPath, data: data, enc: 'utf8' },
      function()    { mxUtils.alert('Exported:\n• ' + jsonFilename + '\n• ' + pngFilename); },
      function(err) { mxUtils.alert('Could not write export: ' + (err || 'unknown error')); }
    );
  });
};

// ---------------------------------------------------------------------------
// JSON builder
// ---------------------------------------------------------------------------

function _buildJson(sp, graph, eligibleCells, pageName) {
  var eligibleIds = {};
  eligibleCells.forEach(function(c) { eligibleIds[c.id] = true; });
  var emitted = {};

  var hierarchy = [];
  eligibleCells.forEach(function(cell) {
    if (!emitted[cell.id] && sp.getProperty(cell, sp.PROP_LEVEL) === 'Organization') {
      hierarchy.push(_buildJsonSubtree(cell, graph, sp, eligibleIds, emitted));
    }
  });

  var uncategorised = eligibleCells
    .filter(function(c) { return !emitted[c.id]; })
    .sort(function(a, b) {
      var la = sp.getProperty(a, sp.PROP_LEVEL) || '';
      var lb = sp.getProperty(b, sp.PROP_LEVEL) || '';
      return (LEVEL_ORDER[la] !== undefined ? LEVEL_ORDER[la] : 99) -
             (LEVEL_ORDER[lb] !== undefined ? LEVEL_ORDER[lb] : 99);
    })
    .map(function(cell) {
      return _buildJsonSubtree(cell, graph, sp, eligibleIds, emitted);
    });

  var connectors = _collectConnectors(graph, sp);

  var today     = new Date();
  var generated = today.getFullYear() + '-' + _pad2(today.getMonth() + 1) + '-' + _pad2(today.getDate());

  return {
    page:          pageName,
    generated:     generated,
    hierarchy:     hierarchy,
    uncategorised: uncategorised,
    connectors:    connectors,
  };
}

function _buildJsonSubtree(cell, graph, sp, eligibleIds, emitted) {
  emitted[cell.id] = true;

  var desc     = sp.getProperty(cell, sp.PROP_DESCRIPTION);
  var children = graph.model.getChildCells(cell, true, false)
    .filter(function(c) { return eligibleIds[c.id] && !emitted[c.id]; })
    .map(function(c) { return _buildJsonSubtree(c, graph, sp, eligibleIds, emitted); });

  return {
    name:        sp.getProperty(cell, sp.PROP_NAME)  || null,
    level:       sp.getProperty(cell, sp.PROP_LEVEL) || null,
    description: (desc && desc.trim()) ? desc : null,
    children:    children,
  };
}

// ---------------------------------------------------------------------------
// Connector collector
// ---------------------------------------------------------------------------

function _collectConnectors(graph, sp) {
  var result = [];

  Object.keys(graph.model.cells).forEach(function(id) {
    var cell = graph.model.cells[id];
    if (!cell.edge)          return;
    if (sp.isIgnored(cell))  return;

    var name = sp.getProperty(cell, sp.PROP_NAME);
    if (!name || !name.trim()) return;

    var desc = sp.getProperty(cell, sp.PROP_DESCRIPTION);

    result.push({
      name:        name,
      description: (desc && desc.trim()) ? desc : null,
      source:      _endpointInfo(graph.model.getTerminal(cell, true),  sp),
      target:      _endpointInfo(graph.model.getTerminal(cell, false), sp),
    });
  });

  return result;
}

function _endpointInfo(cell, sp) {
  if (!cell || !cell.vertex) return { name: 'anonymous', level: 'undefined' };
  if (sp.isIgnored(cell))    return { name: 'anonymous', level: 'undefined' };

  var name = sp.getProperty(cell, sp.PROP_NAME);
  if (!name || !name.trim()) return { name: 'anonymous', level: 'undefined' };

  var level = sp.getProperty(cell, sp.PROP_LEVEL);
  return {
    name:  name,
    level: (level && level.trim()) ? level : 'undefined',
  };
}

// ---------------------------------------------------------------------------
// PNG export via Electron IPC
// ---------------------------------------------------------------------------

function _exportPng(ui, path, callback) {
  try {
    ui.editor.exportToCanvas(
      function(canvas) {
        try {
          var dataUrl = canvas.toDataURL('image/png');
          var base64  = dataUrl.substring(dataUrl.indexOf(',') + 1);
          window.electron.request(
            { action: 'writeFile', path: path, data: base64, enc: 'base64' },
            function()    { callback(null); },
            function(err) { callback(String(err || 'write failed')); }
          );
        } catch (e) {
          callback(String(e));
        }
      },
      null,        // format — PNG by default
      null,        // imageCache
      '#ffffff',   // background — white
      function(err) { callback(String(err)); }
    );
  } catch (e) {
    callback(String(e));
  }
}

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

function _collectEligible(graph, sp) {
  var result = [];
  Object.keys(graph.model.cells).forEach(function(id) {
    var cell = graph.model.cells[id];
    if (!cell.vertex)                         return;
    if (sp.isIgnored(cell))                   return;
    if (!sp.getProperty(cell, sp.PROP_NAME))  return;
    if (!sp.getProperty(cell, sp.PROP_LEVEL)) return;
    result.push(cell);
  });
  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _pad2(n) {
  return n < 10 ? '0' + n : String(n);
}

function _sanitize(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9\-]/g, '')
    .substring(0, 64) || 'unnamed';
}

module.exports = ArchitectureReport;
