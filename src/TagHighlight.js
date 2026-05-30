'use strict';

// Style overrides merged on top of each cell's existing style.
// Only these keys are changed; all other style attributes are preserved.
// Adjust these values to taste — they are the only place that needs editing.
var HIGHLIGHT_VERTEX = { strokeColor: '#FF6600', strokeWidth: '3', fillColor: '#FFF3E0' };
var DEEMPH_VERTEX    = { strokeColor: '#CCCCCC', strokeWidth: '1', fillColor: '#F5F5F5',
                         fontColor: '#BBBBBB', opacity: '40' };
var HIGHLIGHT_EDGE   = { strokeColor: '#FF6600', strokeWidth: '3' };
var DEEMPH_EDGE      = { strokeColor: '#BBBBBB', strokeWidth: '1', opacity: '60', fontColor: '#BBBBBB' };

function TagHighlight(ui, shapeProps) {
  this.ui = ui;
  this.shapeProps = shapeProps;
  this.originalStyles = {};
  this.activeTag = null;
}

TagHighlight.prototype.isActive = function() {
  return this.activeTag !== null;
};

TagHighlight.prototype.collectAllTags = function(graph) {
  var sp = this.shapeProps;
  var seen = {};
  var tags = [];

  Object.keys(graph.model.cells).forEach(function(id) {
    var cell = graph.model.cells[id];
    if (!cell.vertex && !cell.edge) return;
    sp.getTags(cell).forEach(function(tag) {
      if (!seen[tag]) {
        seen[tag] = true;
        tags.push(tag);
      }
    });
  });

  return tags.sort();
};

TagHighlight.prototype.activate = function(graph, tagName) {
  if (this.isActive()) this.clear(graph);

  var sp = this.shapeProps;
  var self = this;
  var model = graph.model;
  var cells = model.cells;

  // Snapshot original styles before any modification.
  Object.keys(cells).forEach(function(id) {
    var cell = cells[id];
    if (!cell.vertex && !cell.edge) return;
    self.originalStyles[id] = cell.style || '';
  });

  self.activeTag = tagName;

  model.beginUpdate();
  try {
    Object.keys(cells).forEach(function(id) {
      var cell = cells[id];
      if (!cell.vertex && !cell.edge) return;

      var hasTag  = sp.getTags(cell).indexOf(tagName) !== -1;
      var isEdge  = !!cell.edge;
      var overrides = hasTag
        ? (isEdge ? HIGHLIGHT_EDGE : HIGHLIGHT_VERTEX)
        : (isEdge ? DEEMPH_EDGE   : DEEMPH_VERTEX);

      model.setStyle(cell, _applyOverrides(self.originalStyles[id], overrides));
    });
  } finally {
    model.endUpdate();
  }
};

TagHighlight.prototype.clear = function(graph) {
  if (!this.isActive()) return;

  var self = this;
  var model = graph.model;
  var cells = model.cells;

  model.beginUpdate();
  try {
    Object.keys(self.originalStyles).forEach(function(id) {
      var cell = cells[id];
      if (cell) model.setStyle(cell, self.originalStyles[id]);
    });
  } finally {
    model.endUpdate();
  }

  self.originalStyles = {};
  self.activeTag = null;
};

// Clears internal state without touching the graph model.
// Call this when the model has been replaced (e.g. fileLoaded).
TagHighlight.prototype.reset = function() {
  this.originalStyles = {};
  this.activeTag = null;
};

// ---------------------------------------------------------------------------
// Style helpers
// ---------------------------------------------------------------------------

function _parseStyle(str) {
  var result = {};
  (str || '').split(';').forEach(function(part) {
    part = part.trim();
    if (!part) return;
    var eqIdx = part.indexOf('=');
    if (eqIdx !== -1) {
      result[part.substring(0, eqIdx)] = part.substring(eqIdx + 1);
    } else {
      result[part] = '';
    }
  });
  return result;
}

function _serializeStyle(obj) {
  var parts = Object.keys(obj).map(function(k) {
    return obj[k] !== '' ? k + '=' + obj[k] : k;
  });
  return parts.length > 0 ? parts.join(';') + ';' : '';
}

function _applyOverrides(baseStyleStr, overrides) {
  var parsed = _parseStyle(baseStyleStr);
  Object.keys(overrides).forEach(function(k) { parsed[k] = overrides[k]; });
  return _serializeStyle(parsed);
}

module.exports = TagHighlight;
