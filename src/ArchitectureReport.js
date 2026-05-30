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

ArchitectureReport.prototype.generate = function(tagName) {
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
  var base         = diagName + '_' + _sanitize(pageName) + (tagName ? '_' + _sanitize(tagName) : '');
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

  // Root nodes: eligible cells whose draw.io parent is not itself eligible.
  // Building subtrees only from roots guarantees every shape appears exactly
  // once and is nested under its correct eligible ancestor.
  var rootNodes = eligibleCells.filter(function(cell) {
    var parent = graph.model.getParent(cell);
    return !parent || !eligibleIds[parent.id];
  });

  rootNodes.sort(function(a, b) {
    var la = sp.getProperty(a, sp.PROP_LEVEL) || '';
    var lb = sp.getProperty(b, sp.PROP_LEVEL) || '';
    return (LEVEL_ORDER[la] !== undefined ? LEVEL_ORDER[la] : 99) -
           (LEVEL_ORDER[lb] !== undefined ? LEVEL_ORDER[lb] : 99);
  });

  var emitted = {};
  var nodes = rootNodes.map(function(cell) {
    return _buildJsonSubtree(cell, graph, sp, eligibleIds, emitted);
  });

  var connectors = _collectConnectors(graph, sp);

  var today     = new Date();
  var generated = today.getFullYear() + '-' + _pad2(today.getMonth() + 1) + '-' + _pad2(today.getDate());

  return {
    page:       pageName,
    generated:  generated,
    nodes:      nodes,
    connectors: connectors,
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
          if (!path) {
            callback(null, base64);
            return;
          }
          window.electron.request(
            { action: 'writeFile', path: path, data: base64, enc: 'base64' },
            function()    { callback(null, base64); },
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

// Pushes the current page's PNG and JSON to every valid Confluence page listed
// in the diagram's confluence_page property, without writing anything to disk.
// onProgress(index, total, pageUrl, result) fires after each page is done.
// onDone(errString) or onDone(null, results) fires when all pages are finished.
ArchitectureReport.prototype.push = function(cfUploader, onProgress, onDone, tagName) {
  var ui = this.ui;
  var sp = this.shapeProps;

  var file = ui.getCurrentFile();
  if (!file || !file.fileObject || !file.fileObject.path) {
    onDone('Save the diagram before pushing to Confluence.');
    return;
  }

  var diagName    = _sanitize((file.fileObject.name || 'diagram').replace(/\.[^.]+$/, ''));
  var page        = ui.currentPage;
  var pageName    = page
    ? (page.getName ? page.getName() : (page.name || 'page'))
    : 'page';
  var base         = diagName + '_' + _sanitize(pageName) + (tagName ? '_' + _sanitize(tagName) : '');
  var pngFilename  = base + '.png';
  var jsonFilename = base + '.json';

  var graph         = ui.editor.graph;
  var eligibleCells = _collectEligible(graph, sp);

  if (eligibleCells.length === 0) {
    onDone('No shapes with Name and Level found on this page.');
    return;
  }

  var pages = cfUploader.getPages();
  if (pages.valid.length === 0) {
    onDone(pages.invalid.length > 0
      ? 'confluence_page is set but contains no valid /pages/{id}/ URLs.'
      : 'confluence_page property is not set on this diagram.');
    return;
  }

  var jsonStr    = JSON.stringify(_buildJson(sp, graph, eligibleCells, pageName), null, 2);
  var jsonBase64 = btoa(unescape(encodeURIComponent(jsonStr)));

  _exportPng(ui, null, function(pngErr, pngBase64) {
    if (pngErr) {
      onDone('PNG export failed: ' + pngErr);
      return;
    }

    var results = [];

    function uploadPage(index) {
      if (index >= pages.valid.length) {
        onDone(null, results);
        return;
      }
      var url   = pages.valid[index];
      var match = url.match(/\/pages\/(\d+)/);
      if (!match) {
        results.push({ url: url, ok: false, error: 'Cannot extract page ID' });
        onProgress(index, pages.valid.length, url, results[results.length - 1]);
        uploadPage(index + 1);
        return;
      }
      var pageId = match[1];

      cfUploader.upload(pageId, pngFilename, pngBase64, 'image/png', function(pngUploadErr) {
        if (pngUploadErr) {
          results.push({ url: url, ok: false, error: 'PNG: ' + pngUploadErr.message });
          onProgress(index, pages.valid.length, url, results[results.length - 1]);
          uploadPage(index + 1);
          return;
        }
        cfUploader.upload(pageId, jsonFilename, jsonBase64, 'application/json', function(jsonUploadErr) {
          if (jsonUploadErr) {
            results.push({ url: url, ok: false, error: 'JSON: ' + jsonUploadErr.message });
          } else {
            results.push({ url: url, ok: true });
          }
          onProgress(index, pages.valid.length, url, results[results.length - 1]);
          uploadPage(index + 1);
        });
      });
    }

    uploadPage(0);
  });
};

module.exports = ArchitectureReport;
