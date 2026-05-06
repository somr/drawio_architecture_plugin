'use strict';

var PLUGIN_VERSION = '1.6';

var ArchitectureReport = require('./ArchitectureReport');
var TagHighlight       = require('./TagHighlight');

// Inline style strings applied to the Tags input field in its two states.
// Using full cssText replacements avoids partial-override issues in Electron.
var _TAGS_INPUT_BASE = [
  'width:100%',
  'box-sizing:border-box',
  'padding:5px 7px',
  'border:1px solid #ccc',
  'border-radius:3px',
  'font-size:12px',
].join(';');
var _TAGS_INPUT_STYLE_ENABLED  = _TAGS_INPUT_BASE + ';background:#fff;';
var _TAGS_INPUT_STYLE_DISABLED = _TAGS_INPUT_BASE + ';background:#f0f0f0;';

/**
 * PropertiesPanel
 *
 * The "Architect toolset" persistent floating panel (mxWindow).
 * Organised as two tabs:
 *   Properties — Name, Level, Description, Parent, Adopt Children,
 *                Connected shapes, Also in..., Generate report button.
 *   Tags       — Tags field for the selected cell; Highlight controls.
 *
 * Panel states:
 *   empty     — no selection, or multiple shapes selected
 *   populated — single non-ignored shape; all fields editable
 *   ignored   — selected shape has properties_ignored=true
 *   edge      — single edge selected; Properties tab disabled, Tags tab active
 */
function PropertiesPanel(ui, shapeProps) {
  this.ui = ui;
  this.shapeProps = shapeProps;
  this.currentCell = null;

  // Properties tab elements
  this.fields = {};
  this.parentDisplay = null;
  this.unignoreBtn = null;
  this.adoptBtn = null;
  this.reportBtn = null;
  this.connectionsSection = null;
  this.connectionsList = null;
  this.alsoInSection = null;
  this.alsoInList = null;

  // Tags tab elements
  this.tagsInput = null;
  this.highlightDropdown = null;
  this.activateBtn = null;
  this.clearBtn = null;

  // Shared sub-objects
  this.report = new ArchitectureReport(ui, shapeProps);
  this.tagHighlight = new TagHighlight(ui, shapeProps);

  // Tab state
  this._propertiesPane = null;
  this._tagsPane = null;
  this._tabBtns = null;
  this._activeTab = 'properties';

  this.window = null;
}

PropertiesPanel.prototype.init = function() {
  var container = document.createElement('div');
  container.style.cssText = [
    'font-family:Arial,sans-serif',
    'font-size:12px',
    'background:#fafafa',
    'height:100%',
    'box-sizing:border-box',
    'display:flex',
    'flex-direction:column',
  ].join(';');

  // Scrollable content area — takes all available height above the footer.
  var contentArea = document.createElement('div');
  contentArea.style.cssText = [
    'flex:1',
    'min-height:0',
    'overflow-y:auto',
    'padding:12px',
  ].join(';');

  this._buildTabBar(contentArea);

  // Properties pane — existing content unchanged.
  var propsPane = document.createElement('div');
  this._buildFields(propsPane);
  this._buildUnignoreButton(propsPane);
  this._buildAdoptButton(propsPane);
  this._buildConnectionsList(propsPane);
  this._buildAlsoIn(propsPane);
  this._buildReportButton(propsPane);
  contentArea.appendChild(propsPane);
  this._propertiesPane = propsPane;

  // Tags pane — hidden until the Tags tab is clicked.
  var tagsPane = document.createElement('div');
  tagsPane.style.display = 'none';
  this._buildTagsPane(tagsPane);
  contentArea.appendChild(tagsPane);
  this._tagsPane = tagsPane;

  container.appendChild(contentArea);

  // Version footer — always visible at the bottom.
  var footer = document.createElement('div');
  footer.textContent = 'Architect toolset v' + PLUGIN_VERSION;
  footer.style.cssText = [
    'padding:4px 12px',
    'font-size:10px',
    'color:#bbb',
    'border-top:1px solid #e8e8e8',
    'background:#f5f5f5',
    'text-align:center',
    'flex-shrink:0',
  ].join(';');
  container.appendChild(footer);

  var win = new mxWindow(
    'Architect toolset',
    container,
    /* x */ Math.max(10, (window.innerWidth || document.body.clientWidth) - 290),
    /* y */ 8,
    /* w */ 270,
    /* h */ 580,
    /* minimizable */ true,
    /* movable     */ true
  );
  win.setMaximizable(false);
  win.setResizable(true);
  win.setClosable(false);
  win.setVisible(true);

  this.window = win;
  this._switchTab('properties');
  this.setEmpty();
};

// ---------------------------------------------------------------------------
// Tab bar
// ---------------------------------------------------------------------------

PropertiesPanel.prototype._buildTabBar = function(container) {
  var self = this;

  var bar = document.createElement('div');
  bar.style.cssText = [
    'display:flex',
    'border-bottom:2px solid #ddd',
    'margin-bottom:10px',
  ].join(';');

  function makeTabBtn(label, name) {
    var btn = document.createElement('div');
    btn.textContent = label;
    btn.style.cssText = [
      'padding:5px 12px',
      'cursor:pointer',
      'font-size:12px',
      'font-weight:bold',
      'color:#888',
      'border-bottom:2px solid transparent',
      'margin-bottom:-2px',
      'user-select:none',
    ].join(';');
    btn.addEventListener('click', function() { self._switchTab(name); });
    bar.appendChild(btn);
    return btn;
  }

  this._tabBtns = {
    properties: makeTabBtn('Properties', 'properties'),
    tags:       makeTabBtn('Tags',       'tags'),
  };

  container.appendChild(bar);
};

PropertiesPanel.prototype._switchTab = function(name) {
  var self = this;
  this._activeTab = name;
  var isProps = (name === 'properties');

  if (this._propertiesPane) this._propertiesPane.style.display = isProps ? '' : 'none';
  if (this._tagsPane)       this._tagsPane.style.display       = isProps ? 'none' : '';

  if (this._tabBtns) {
    Object.keys(this._tabBtns).forEach(function(k) {
      var btn = self._tabBtns[k];
      var active = (k === name);
      btn.style.color       = active ? '#1976d2' : '#888';
      btn.style.borderBottom = active ? '2px solid #1976d2' : '2px solid transparent';
    });
  }

  if (name === 'tags') {
    this._refreshHighlightDropdown();
  }
};

// ---------------------------------------------------------------------------
// Tags pane
// ---------------------------------------------------------------------------

PropertiesPanel.prototype._buildTagsPane = function(pane) {
  var self = this;
  var sp   = this.shapeProps;

  // Tags label + hint
  var tagsLabel = document.createElement('label');
  tagsLabel.textContent = 'Tags';
  tagsLabel.style.cssText = 'display:block;font-weight:bold;margin-bottom:2px;color:#444;font-size:12px;';
  pane.appendChild(tagsLabel);

  var tagsHint = document.createElement('div');
  tagsHint.textContent = 'Comma-separated e.g. team-a, security';
  tagsHint.style.cssText = 'font-size:10px;color:#999;margin-bottom:4px;';
  pane.appendChild(tagsHint);

  var tagsInput = document.createElement('input');
  tagsInput.type = 'text';
  tagsInput.placeholder = 'e.g. team-a, security, core';
  tagsInput.style.cssText = _TAGS_INPUT_STYLE_DISABLED;
  tagsInput.setAttribute('disabled', '');

  tagsInput.addEventListener('blur', function() {
    if (self.currentCell && !tagsInput.hasAttribute('disabled')) {
      var tags = tagsInput.value
        .split(',')
        .map(function(t) { return t.trim(); })
        .filter(Boolean);
      sp.setTags(self.ui.editor.graph, self.currentCell, tags);
      self._refreshHighlightDropdown();
    }
  });

  pane.appendChild(tagsInput);
  this.tagsInput = tagsInput;

  // Highlight section
  var hlSection = document.createElement('div');
  hlSection.style.cssText = 'margin-top:14px;border-top:1px solid #ddd;padding-top:10px;';

  var hlHeading = document.createElement('div');
  hlHeading.textContent = 'Highlight';
  hlHeading.style.cssText = 'font-weight:bold;color:#444;margin-bottom:6px;font-size:12px;';
  hlSection.appendChild(hlHeading);

  var dropLabel = document.createElement('label');
  dropLabel.textContent = 'Tag';
  dropLabel.style.cssText = 'display:block;font-size:11px;color:#666;margin-bottom:2px;';
  hlSection.appendChild(dropLabel);

  var dropdown = document.createElement('select');
  dropdown.style.cssText = [
    'width:100%',
    'box-sizing:border-box',
    'padding:5px 7px',
    'border:1px solid #ccc',
    'border-radius:3px',
    'font-size:12px',
    'margin-bottom:8px',
    'background:#fff',
  ].join(';');
  hlSection.appendChild(dropdown);
  this.highlightDropdown = dropdown;

  var btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:6px;';

  var activateBtn = document.createElement('button');
  activateBtn.textContent = 'Activate';
  activateBtn.style.cssText = [
    'flex:1',
    'padding:6px 10px',
    'border:none',
    'border-radius:4px',
    'background:#2e7d32',
    'color:#fff',
    'font-size:12px',
    'font-weight:bold',
    'cursor:pointer',
  ].join(';');
  activateBtn.addEventListener('click', function() {
    var tag = dropdown.value;
    if (!tag) {
      mxUtils.alert('Select a tag to highlight.');
      return;
    }
    self.tagHighlight.activate(self.ui.editor.graph, tag);
  });

  var clearBtn = document.createElement('button');
  clearBtn.textContent = 'Clear';
  clearBtn.style.cssText = [
    'flex:1',
    'padding:6px 10px',
    'border:none',
    'border-radius:4px',
    'background:#757575',
    'color:#fff',
    'font-size:12px',
    'font-weight:bold',
    'cursor:pointer',
  ].join(';');
  clearBtn.addEventListener('click', function() {
    self.tagHighlight.clear(self.ui.editor.graph);
  });

  btnRow.appendChild(activateBtn);
  btnRow.appendChild(clearBtn);
  hlSection.appendChild(btnRow);
  pane.appendChild(hlSection);

  this.activateBtn = activateBtn;
  this.clearBtn    = clearBtn;
};

PropertiesPanel.prototype._refreshHighlightDropdown = function() {
  var dropdown = this.highlightDropdown;
  if (!dropdown) return;

  var graph = this.ui.editor.graph;
  var tags  = this.tagHighlight.collectAllTags(graph);

  while (dropdown.firstChild) dropdown.removeChild(dropdown.firstChild);

  var placeholder = document.createElement('option');
  placeholder.value = '';

  if (tags.length === 0) {
    placeholder.textContent = '(no tags defined)';
    placeholder.disabled = true;
  } else {
    placeholder.textContent = '— select tag —';
  }
  dropdown.appendChild(placeholder);

  tags.forEach(function(tag) {
    var opt = document.createElement('option');
    opt.value = tag;
    opt.textContent = tag;
    dropdown.appendChild(opt);
  });
};

PropertiesPanel.prototype._updateTagsField = function(cell) {
  if (!this.tagsInput) return;

  if (cell) {
    var tags = [];
    try { tags = this.shapeProps.getTags(cell); } catch (e) {}
    this.tagsInput.value = tags.join(', ');
    this.tagsInput.removeAttribute('disabled');
    this.tagsInput.style.cssText = _TAGS_INPUT_STYLE_ENABLED;
  } else {
    this.tagsInput.value = '';
    this.tagsInput.setAttribute('disabled', '');
    this.tagsInput.style.cssText = _TAGS_INPUT_STYLE_DISABLED;
  }
};

// ---------------------------------------------------------------------------
// Properties pane — existing build methods (container arg now receives propsPane)
// ---------------------------------------------------------------------------

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
          sp.setProperty(self.ui.editor.graph, self.currentCell, def.key, input.value);
        }
      });
    } else {
      input = document.createElement('input');
      input.type = 'text';
      input.style.cssText = inputStyle;
      input.addEventListener('blur', function() {
        if (self.currentCell && !input.disabled) {
          sp.setProperty(self.ui.editor.graph, self.currentCell, def.key, input.value);
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
      ui.selectPage(match.page, true);
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

PropertiesPanel.prototype._buildReportButton = function(container) {
  var self = this;

  var btn = document.createElement('button');
  btn.textContent = 'Generate architecture report';
  btn.style.cssText = [
    'display:none',
    'margin-top:12px',
    'padding:8px 12px',
    'border:none',
    'border-radius:4px',
    'background:#2e7d32',
    'color:#fff',
    'font-size:12px',
    'font-weight:bold',
    'cursor:pointer',
    'width:100%',
  ].join(';');

  btn.addEventListener('click', function() {
    self.report.generate();
  });

  container.appendChild(btn);
  this.reportBtn = btn;
};

// ---------------------------------------------------------------------------
// Panel states
// ---------------------------------------------------------------------------

/**
 * Populated state — single non-ignored shape selected.
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
  this.reportBtn.style.display   = 'none';
  this._updateAdoptButton(sp.getChildLevel(level));
  this._updateConnections(cell);
  this._updateAlsoIn(cell);
  this._updateTagsField(cell);
  this._switchTab('properties');
};

PropertiesPanel.prototype._updateParentDisplay = function(cell, graph) {
  var sp = this.shapeProps;
  var parentCell = graph.model.getParent(cell);
  if (parentCell && parentCell !== graph.getDefaultParent()) {
    var name = sp.getProperty(parentCell, sp.PROP_NAME) || graph.getLabel(parentCell) || '(unnamed)';
    var lvl  = sp.getProperty(parentCell, sp.PROP_LEVEL);
    this.parentDisplay.textContent = lvl ? name + ' (' + lvl + ')' : name;
    this.parentDisplay.style.color = '#333';
  } else {
    this.parentDisplay.textContent = '— no parent —';
    this.parentDisplay.style.color = '#aaa';
  }
};

/**
 * Ignored state — selected shape has properties_ignored=true.
 * Properties tab shows only the Un-ignore button; Tags tab is still editable.
 */
PropertiesPanel.prototype.setIgnored = function(cell) {
  this.currentCell = cell;
  this._clearFields();
  this._setFieldsDisabled(true);
  this.parentDisplay.textContent = '—';
  this.parentDisplay.style.color = '#aaa';
  this.unignoreBtn.style.display = 'block';
  this.adoptBtn.style.display    = 'none';
  this.reportBtn.style.display   = 'none';
  this.connectionsSection.style.display = 'none';
  this.alsoInSection.style.display      = 'none';
  this._updateTagsField(cell);
};

/**
 * Empty state — no selection or multi-selection.
 */
PropertiesPanel.prototype.setEmpty = function() {
  this.currentCell = null;
  this._clearFields();
  this._setFieldsDisabled(true);
  this.parentDisplay.textContent = '—';
  this.parentDisplay.style.color = '#aaa';
  this.unignoreBtn.style.display = 'none';
  this.adoptBtn.style.display    = 'none';
  this.reportBtn.style.display   = 'block';
  this.connectionsSection.style.display = 'none';
  this.alsoInSection.style.display      = 'none';
  this._updateTagsField(null);
  this._switchTab('properties');
};

/**
 * Edge state — single connector selected.
 * Properties tab is all-disabled; Tags tab becomes active and editable.
 */
PropertiesPanel.prototype.setEdge = function(cell) {
  this.currentCell = cell;
  this._clearFields();
  this._setFieldsDisabled(true);
  this.parentDisplay.textContent = '—';
  this.parentDisplay.style.color = '#aaa';
  this.unignoreBtn.style.display = 'none';
  this.adoptBtn.style.display    = 'none';
  this.reportBtn.style.display   = 'none';
  this.connectionsSection.style.display = 'none';
  this.alsoInSection.style.display      = 'none';
  this._updateTagsField(cell);
  this._switchTab('tags');
};

// ---------------------------------------------------------------------------
// Field helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Module-level helpers
// ---------------------------------------------------------------------------

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

module.exports = PropertiesPanel;
