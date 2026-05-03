'use strict';

var PLUGIN_VERSION = '1.4.2';

/**
 * PropertiesPanel
 *
 * The "Architect toolset" persistent floating panel (mxWindow) that displays
 * and allows editing of the Name, Level, and Description properties of the
 * selected shape.
 *
 * States:
 *   empty        — no shape selected, or multiple shapes selected
 *   populated    — single non-ignored shape selected; fields are editable
 *   ignored      — selected shape has properties_ignored=true; shows Un-ignore button
 */
function PropertiesPanel(ui, shapeProps) {
  this.ui = ui;
  this.shapeProps = shapeProps;
  this.currentCell = null;
  this.fields = {};       // { prop_name: input, prop_level: input, prop_description: textarea }
  this.parentDisplay = null;
  this.unignoreBtn = null;
  this.adoptBtn = null;
  this.connectionsSection = null;
  this.connectionsList = null;
  this.alsoInSection = null;
  this.alsoInList = null;
  this.window = null;
}

PropertiesPanel.prototype.init = function() {
  var container = document.createElement('div');
  container.style.cssText = [
    'padding:12px',
    'font-family:Arial,sans-serif',
    'font-size:12px',
    'background:#fafafa',
    'height:100%',
    'box-sizing:border-box',
  ].join(';');

  this._buildFields(container);
  this._buildUnignoreButton(container);
  this._buildAdoptButton(container);
  this._buildConnectionsList(container);
  this._buildAlsoIn(container);

  // Create a persistent mxWindow that cannot be closed.
  // Initial position is top-right; the user can move it freely.
  var win = new mxWindow(
    'Architect toolset v' + PLUGIN_VERSION,
    container,
    /* x */ Math.max(10, (window.innerWidth || document.body.clientWidth) - 290),
    /* y */ 8,
    /* w */ 270,
    /* h */ 480,
    /* minimizable */ true,
    /* movable     */ true
  );
  win.setMaximizable(false);
  win.setResizable(true);
  win.setClosable(false);
  win.setVisible(true);

  this.window = win;
  this.setEmpty();
};

PropertiesPanel.prototype._buildFields = function(container) {
  var self = this;
  var sp = this.shapeProps;

  var fieldDefs = [
    { key: sp.PROP_NAME,        label: 'Name',        type: 'text'     },
    { key: sp.PROP_LEVEL,       label: 'Level',       type: 'select'   },
    { key: sp.PROP_DESCRIPTION, label: 'Description', type: 'textarea' },
  ];

  // Parent row — read-only, rendered before the editable fields.
  var parentRow = document.createElement('div');
  parentRow.style.marginBottom = '10px';

  var parentLabel = document.createElement('label');
  parentLabel.textContent = 'Parent';
  parentLabel.style.cssText = 'display:block;font-weight:bold;margin-bottom:2px;color:#444;';

  var parentDisplay = document.createElement('div');
  parentDisplay.style.cssText = [
    'width:100%',
    'box-sizing:border-box',
    'padding:5px 7px',
    'border:1px solid #ccc',
    'border-radius:3px',
    'font-size:12px',
    'background:#f0f0f0',
    'color:#777',
    'min-height:26px',
    'white-space:nowrap',
    'overflow:hidden',
    'text-overflow:ellipsis',
  ].join(';');
  parentDisplay.textContent = '—';

  parentRow.appendChild(parentLabel);
  parentRow.appendChild(parentDisplay);
  container.appendChild(parentRow);
  self.parentDisplay = parentDisplay;

  var inputStyle = [
    'width:100%',
    'box-sizing:border-box',
    'padding:5px 7px',
    'border:1px solid #ccc',
    'border-radius:3px',
    'font-size:12px',
    'background:#fff',
  ].join(';');

  fieldDefs.forEach(function(def) {
    var row = document.createElement('div');
    row.style.marginBottom = '8px';

    var label = document.createElement('label');
    label.textContent = def.label;
    label.style.cssText = 'display:block;font-weight:bold;margin-bottom:2px;color:#444;';

    var input;
    if (def.type === 'select') {
      input = document.createElement('select');
      input.style.cssText = inputStyle;
      // Blank placeholder option
      var placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = '— select —';
      input.appendChild(placeholder);
      sp.VALID_LEVELS.forEach(function(lvl) {
        var opt = document.createElement('option');
        opt.value = lvl;
        opt.textContent = lvl;
        input.appendChild(opt);
      });
      // Save on change, then try to re-parent based on the new level.
      input.addEventListener('change', function() {
        if (self.currentCell && !input.disabled) {
          var graph = self.ui.editor.graph;
          sp.setProperty(graph, self.currentCell, def.key, input.value);
          self._updateAdoptButton(sp.getChildLevel(input.value));
          try {
            sp.reparentCell(graph, self.currentCell);
            self._updateConnections(self.currentCell);
          } catch (e) {
            mxUtils.alert(String(e));
          }
        }
      });
    } else if (def.type === 'textarea') {
      input = document.createElement('textarea');
      input.rows = 3;
      input.style.cssText = inputStyle;
      input.style.resize = 'vertical';
      input.addEventListener('blur', function() {
        if (self.currentCell && !input.disabled) {
          sp.setProperty(
            self.ui.editor.graph,
            self.currentCell,
            def.key,
            input.value
          );
        }
      });
    } else {
      input = document.createElement('input');
      input.type = 'text';
      input.style.cssText = inputStyle;
      input.addEventListener('blur', function() {
        if (self.currentCell && !input.disabled) {
          sp.setProperty(
            self.ui.editor.graph,
            self.currentCell,
            def.key,
            input.value
          );
        }
      });
    }

    input.disabled = true;

    row.appendChild(label);
    row.appendChild(input);
    container.appendChild(row);

    self.fields[def.key] = input;
  });
};

PropertiesPanel.prototype._buildUnignoreButton = function(container) {
  var self = this;
  var sp = this.shapeProps;

  var btn = document.createElement('button');
  btn.textContent = 'Un-ignore this shape';
  btn.style.cssText = [
    'display:none',
    'margin-top:8px',
    'padding:6px 12px',
    'border:none',
    'border-radius:4px',
    'background:#e0a800',
    'color:#fff',
    'font-size:12px',
    'font-weight:bold',
    'cursor:pointer',
    'width:100%',
  ].join(';');

  btn.addEventListener('click', function() {
    if (self.currentCell) {
      sp.removeProperty(self.ui.editor.graph, self.currentCell, sp.PROP_IGNORED);
      // Re-trigger the selection handler by firing a synthetic CHANGE event.
      var selectionModel = self.ui.editor.graph.getSelectionModel();
      selectionModel.fireEvent(new mxEventObject(mxEvent.CHANGE));
    }
  });

  container.appendChild(btn);
  this.unignoreBtn = btn;
};

PropertiesPanel.prototype._buildAdoptButton = function(container) {
  var self = this;
  var sp = this.shapeProps;

  var btn = document.createElement('button');
  btn.textContent = 'Adopt children';
  btn.style.cssText = [
    'display:none',
    'margin-top:4px',
    'padding:6px 12px',
    'border:none',
    'border-radius:4px',
    'background:#1976d2',
    'color:#fff',
    'font-size:12px',
    'font-weight:bold',
    'cursor:pointer',
    'width:100%',
  ].join(';');

  btn.addEventListener('click', function() {
    if (!self.currentCell) return;
    try {
      var count = sp.adoptChildren(self.ui.editor.graph, self.currentCell);
      self._updateConnections(self.currentCell);
      if (count === 0) mxUtils.alert('No eligible shapes found inside the container bounds.');
    } catch (e) {
      mxUtils.alert(String(e));
    }
  });

  container.appendChild(btn);
  this.adoptBtn = btn;
};

PropertiesPanel.prototype._updateAdoptButton = function(childLevel) {
  this.adoptBtn.style.display = childLevel ? 'block' : 'none';
};

PropertiesPanel.prototype._buildConnectionsList = function(container) {
  var section = document.createElement('div');
  section.style.cssText = 'margin-top:10px;border-top:1px solid #ddd;padding-top:8px;display:none;';

  var heading = document.createElement('div');
  heading.textContent = 'Connected shapes';
  heading.style.cssText = 'font-weight:bold;color:#444;margin-bottom:4px;font-size:12px;';
  section.appendChild(heading);

  var list = document.createElement('div');
  list.style.cssText = 'max-height:100px;overflow-y:auto;';
  section.appendChild(list);

  container.appendChild(section);
  this.connectionsSection = section;
  this.connectionsList = list;
};

PropertiesPanel.prototype._updateConnections = function(cell) {
  var sp = this.shapeProps;
  var graph = this.ui.editor.graph;
  var list = this.connectionsList;

  while (list.firstChild) list.removeChild(list.firstChild);

  var edges = graph.getEdges(cell);
  var items = [];

  for (var i = 0; i < edges.length; i++) {
    var edge = edges[i];
    var isOutgoing = edge.source === cell;
    var other = isOutgoing ? edge.target : edge.source;
    if (!other || !other.vertex) continue;
    items.push({ cell: other, outgoing: isOutgoing, edge: edge });
  }

  if (items.length === 0) {
    var empty = document.createElement('div');
    empty.textContent = 'No connections';
    empty.style.cssText = 'color:#999;font-style:italic;font-size:11px;padding:2px 0;';
    list.appendChild(empty);
  } else {
    items.forEach(function(item) {
      var rawName = sp.getProperty(item.cell, sp.PROP_NAME) || graph.getLabel(item.cell) || '(unnamed)';
      var name  = rawName.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '').trim();
      var level = sp.getProperty(item.cell, sp.PROP_LEVEL) || '';
      var arrow = item.outgoing ? '→' : '←';

      var row = document.createElement('div');
      row.style.cssText = 'padding:3px 0;border-bottom:1px solid #eee;font-size:11px;color:#333;display:flex;align-items:baseline;gap:4px;';

      var arrowSpan = document.createElement('span');
      arrowSpan.textContent = arrow;
      arrowSpan.style.cssText = 'font-size:16px;font-weight:bold;flex-shrink:0;color:' + (item.outgoing ? '#1976d2' : '#888') + ';';

      var nameSpan = document.createElement('span');
      nameSpan.textContent = name;

      row.appendChild(arrowSpan);
      row.appendChild(nameSpan);

      if (level) {
        var levelSpan = document.createElement('span');
        levelSpan.textContent = ' (' + level + ')';
        levelSpan.style.color = '#999';
        row.appendChild(levelSpan);
      }

      list.appendChild(row);

      var rawEdgeLabel = graph.getLabel(item.edge) || '';
      var edgeLabel = rawEdgeLabel.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '').trim();
      if (edgeLabel) {
        var edgeLabelDiv = document.createElement('div');
        edgeLabelDiv.textContent = '(' + edgeLabel + ')';
        edgeLabelDiv.style.cssText = 'font-size:10px;color:#999;font-style:italic;padding-left:22px;margin-bottom:2px;';
        list.appendChild(edgeLabelDiv);
      }
    });
  }

  this.connectionsSection.style.display = 'block';
};

/**
 * Populate panel with the cell's current property values (editable state).
 */
PropertiesPanel.prototype.populate = function(cell) {
  var sp = this.shapeProps;
  var graph = this.ui.editor.graph;
  this.currentCell = cell;

  var level = sp.getProperty(cell, sp.PROP_LEVEL) || '';
  this.fields[sp.PROP_NAME].value        = sp.getProperty(cell, sp.PROP_NAME)        || '';
  this.fields[sp.PROP_LEVEL].value       = level;
  this.fields[sp.PROP_DESCRIPTION].value = sp.getProperty(cell, sp.PROP_DESCRIPTION) || '';

  this._updateParentDisplay(cell, graph);
  this._setFieldsDisabled(false);
  this.unignoreBtn.style.display = 'none';
  this._updateAdoptButton(sp.getChildLevel(level));
  this._updateConnections(cell);
  this._updateAlsoIn(cell);
};

PropertiesPanel.prototype._updateParentDisplay = function(cell, graph) {
  var sp = this.shapeProps;
  var parentCell = graph.model.getParent(cell);
  if (parentCell && parentCell !== graph.getDefaultParent()) {
    var name  = sp.getProperty(parentCell, sp.PROP_NAME) || graph.getLabel(parentCell) || '(unnamed)';
    var lvl   = sp.getProperty(parentCell, sp.PROP_LEVEL);
    this.parentDisplay.textContent = lvl ? name + ' (' + lvl + ')' : name;
    this.parentDisplay.style.color = '#333';
  } else {
    this.parentDisplay.textContent = '— no parent —';
    this.parentDisplay.style.color = '#aaa';
  }
};

/**
 * Show the ignored state — fields empty and disabled, Un-ignore button visible.
 */
PropertiesPanel.prototype.setIgnored = function(cell) {
  this.currentCell = cell;
  this._clearFields();
  this._setFieldsDisabled(true);
  this.parentDisplay.textContent = '—';
  this.parentDisplay.style.color = '#aaa';
  this.unignoreBtn.style.display = 'block';
  this.adoptBtn.style.display = 'none';
  this.connectionsSection.style.display = 'none';
  this.alsoInSection.style.display = 'none';
};

/**
 * Show the empty state — no selection or multi-selection.
 */
PropertiesPanel.prototype.setEmpty = function() {
  this.currentCell = null;
  this._clearFields();
  this._setFieldsDisabled(true);
  this.parentDisplay.textContent = '—';
  this.parentDisplay.style.color = '#aaa';
  this.unignoreBtn.style.display = 'none';
  this.adoptBtn.style.display = 'none';
  this.connectionsSection.style.display = 'none';
  this.alsoInSection.style.display = 'none';
};

PropertiesPanel.prototype._setFieldsDisabled = function(disabled) {
  var fields = this.fields;
  Object.keys(fields).forEach(function(key) {
    fields[key].disabled = disabled;
    fields[key].style.background = disabled ? '#f0f0f0' : '#fff';
  });
};

PropertiesPanel.prototype._clearFields = function() {
  var fields = this.fields;
  Object.keys(fields).forEach(function(key) {
    fields[key].value = '';
  });
};

PropertiesPanel.prototype._buildAlsoIn = function(container) {
  var section = document.createElement('div');
  section.style.cssText = 'margin-top:10px;border-top:1px solid #ddd;padding-top:8px;display:none;';

  var heading = document.createElement('div');
  heading.textContent = 'Also in...';
  heading.style.cssText = 'font-weight:bold;color:#444;margin-bottom:4px;font-size:12px;';
  section.appendChild(heading);

  var list = document.createElement('div');
  list.style.cssText = 'max-height:80px;overflow-y:auto;';
  section.appendChild(list);

  container.appendChild(section);
  this.alsoInSection = section;
  this.alsoInList = list;
};

PropertiesPanel.prototype._updateAlsoIn = function(cell) {
  var sp = this.shapeProps;
  var ui = this.ui;
  var list = this.alsoInList;

  while (list.firstChild) list.removeChild(list.firstChild);

  var targetName  = sp.getProperty(cell, sp.PROP_NAME);
  var targetLevel = sp.getProperty(cell, sp.PROP_LEVEL);

  if (!targetName || !targetLevel || !ui.pages || ui.pages.length <= 1) {
    this.alsoInSection.style.display = 'none';
    return;
  }

  var currentPage = ui.currentPage;
  var matches = [];

  ui.pages.forEach(function(page) {
    if (page === currentPage) return;
    var found = page.root && _findCellInPage(page.root, targetName, targetLevel, sp);
    if (found) matches.push({ page: page, cell: found });
  });

  if (matches.length === 0) {
    this.alsoInSection.style.display = 'none';
    return;
  }

  matches.forEach(function(match) {
    var pageName = match.page.getName ? match.page.getName() : (match.page.name || '(unnamed page)');

    var item = document.createElement('div');
    item.textContent = pageName;
    item.style.cssText = [
      'padding:2px 0',
      'font-size:11px',
      'color:#1976d2',
      'cursor:pointer',
      'text-decoration:underline',
      'white-space:nowrap',
      'overflow:hidden',
      'text-overflow:ellipsis',
    ].join(';');

    item.addEventListener('mouseenter', function() { item.style.color = '#0d47a1'; });
    item.addEventListener('mouseleave', function() { item.style.color = '#1976d2'; });

    item.addEventListener('click', function() {
      var targetCell = match.cell;
      ui.selectPage(match.page, true);      // true = skip undo history
      setTimeout(function() {
        var graph = ui.editor.graph;
        graph.setSelectionCell(targetCell);
        graph.scrollCellToVisible(targetCell, true);
      }, 50);
    });

    list.appendChild(item);
  });

  this.alsoInSection.style.display = 'block';
};

// ---------------------------------------------------------------------------
// Module-level helpers
// ---------------------------------------------------------------------------

// Returns the first matching cell in a page root tree, or null.
function _findCellInPage(root, name, level, sp) {
  if (!root) return null;
  var children = root.children;
  if (!children) return null;
  for (var i = 0; i < children.length; i++) {
    var found = _findCellInTree(children[i], name, level, sp);
    if (found) return found;
  }
  return null;
}

function _findCellInTree(cell, name, level, sp) {
  if (!cell) return null;
  if (cell.vertex &&
      sp.getProperty(cell, sp.PROP_NAME)  === name &&
      sp.getProperty(cell, sp.PROP_LEVEL) === level) {
    return cell;
  }
  var children = cell.children;
  if (children) {
    for (var i = 0; i < children.length; i++) {
      var found = _findCellInTree(children[i], name, level, sp);
      if (found) return found;
    }
  }
  return null;
}

// _pageContainsMatch kept as a thin wrapper for any future use.
function _pageContainsMatch(root, name, level, sp) {
  return _findCellInPage(root, name, level, sp) !== null;
}

function _cellContainsMatch(cell, name, level, sp) {
  return _findCellInTree(cell, name, level, sp) !== null;
}

module.exports = PropertiesPanel;
