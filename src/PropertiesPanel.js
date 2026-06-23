'use strict';

var PLUGIN_VERSION = '1.10.1';

var ArchitectureReport  = require('./ArchitectureReport');
var TagHighlight        = require('./TagHighlight');
var ConfluenceUploader  = require('./ConfluenceUploader');
var SyncPreviewDialog   = require('./SyncPreviewDialog');

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
  this.parentRow = null;
  this.levelRow = null;
  this.unignoreBtn = null;
  this.adoptBtn = null;
  this.reportBtn = null;
  this.connectionsSection = null;
  this.connectionsList = null;
  this.alsoInSection = null;
  this.alsoInList = null;
  this.connectorEndpointsSection = null;
  this.connectorEndpointsList = null;

  // Tags tab elements
  this.tagsInput = null;
  this.highlightDropdown = null;
  this.activateBtn = null;
  this.clearBtn = null;

  // Shared sub-objects
  this.report          = new ArchitectureReport(ui, shapeProps);
  this.tagHighlight    = new TagHighlight(ui, shapeProps);
  this.cfUploader      = new ConfluenceUploader(ui);
  this.syncPreviewDlg  = new SyncPreviewDialog(ui, shapeProps);

  // Sync UI refs
  this.syncToAllBtn        = null;  // inside "Also in..." section
  this.syncCrossPageBtn    = null;  // in empty state
  this.syncCrossPageStatus = null;  // inline status next to syncCrossPageBtn

  // Confluence section UI refs
  this.cfPagesLabel  = null;
  this.cfPushBtn     = null;
  this.cfPushStatus  = null;
  this.cfCredsToggle = null;
  this.cfCredsForm   = null;
  this._cfInputBaseUrl = null;
  this._cfInputEmail   = null;
  this._cfInputToken   = null;

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
  this._buildConnectorEndpoints(propsPane);
  this._buildReportButton(propsPane);
  this._buildSyncCrossPageButton(propsPane);
  this._buildConfluenceSection(propsPane);
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
  this._subscribeConfluenceUpdates();
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
  // Stop propagation so the mxWindow's table mousedown handler (which calls
  // activate() and changes z-indices) does not fire during the select click.
  // That activation mid-mousedown can prevent the native dropdown from opening,
  // especially after a window.alert() has caused the mxWindow to lose activeWindow.
  dropdown.addEventListener('mousedown', function(e) { e.stopPropagation(); });

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
  self.parentRow = parentRow;

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
    if (def.key === sp.PROP_LEVEL) self.levelRow = row;
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
  var self = this;
  var section = document.createElement('div');
  section.style.cssText = 'margin-top:10px;border-top:1px solid #ddd;padding-top:8px;display:none;';

  var heading = document.createElement('div');
  heading.textContent = 'Also in...';
  heading.style.cssText = 'font-weight:bold;color:#444;margin-bottom:4px;font-size:12px;';
  section.appendChild(heading);

  var list = document.createElement('div');
  list.style.cssText = 'max-height:80px;overflow-y:auto;';
  section.appendChild(list);

  var syncBtn = document.createElement('button');
  syncBtn.textContent = 'Sync to all matching pages';
  syncBtn.style.cssText = [
    'display:none',
    'margin-top:8px',
    'padding:5px 10px',
    'border:none',
    'border-radius:4px',
    'background:#1565c0',
    'color:#fff',
    'font-size:11px',
    'font-weight:bold',
    'cursor:pointer',
    'width:100%',
  ].join(';');
  syncBtn.addEventListener('mouseenter', function() { syncBtn.style.background = '#0d47a1'; });
  syncBtn.addEventListener('mouseleave', function() { syncBtn.style.background = '#1565c0'; });
  section.appendChild(syncBtn);

  container.appendChild(section);
  this.alsoInSection = section;
  this.alsoInList = list;
  this.syncToAllBtn = syncBtn;
};

PropertiesPanel.prototype._updateAlsoIn = function(cell) {
  var self = this;
  var sp   = this.shapeProps;
  var ui   = this.ui;
  var list = this.alsoInList;

  while (list.firstChild) list.removeChild(list.firstChild);
  this.syncToAllBtn.style.display = 'none';
  this.alsoInSection.style.display = 'none';

  if (!ui.pages || ui.pages.length <= 1) return;

  var targetName  = sp.getProperty(cell, sp.PROP_NAME);
  var targetLevel = sp.getProperty(cell, sp.PROP_LEVEL);
  var hasNavMatches = false;

  // Navigation links (existing behaviour): match by prop_name + prop_level.
  if (targetName && targetLevel) {
    var currentPage = ui.currentPage;
    var navMatches = [];
    ui.pages.forEach(function(page) {
      if (page === currentPage) return;
      var found = page.root && _findCellInPage(page.root, targetName, targetLevel, sp);
      if (found) navMatches.push({ page: page, cell: found });
    });

    navMatches.forEach(function(match) {
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

    if (navMatches.length > 0) hasNavMatches = true;
  }

  // Sync button: visible when shape has all 3 properties AND cross-page matches exist.
  var hasAllProps = targetName && targetLevel && sp.getProperty(cell, sp.PROP_DESCRIPTION);
  if (hasAllProps) {
    var crossMatches = sp.findCrossPageMatches(ui, cell);
    if (crossMatches.length > 0) {
      this.syncToAllBtn.onclick = function() { self._onSyncToAll(cell, crossMatches); };
      this.syncToAllBtn.style.display = 'block';
    }
  }

  if (hasNavMatches || this.syncToAllBtn.style.display === 'block') {
    this.alsoInSection.style.display = 'block';
  }
};

PropertiesPanel.prototype._buildConnectorEndpoints = function(container) {
  var section = document.createElement('div');
  section.style.cssText = 'margin-top:10px;border-top:1px solid #ddd;padding-top:8px;display:none;';

  var heading = document.createElement('div');
  heading.textContent = 'Connects';
  heading.style.cssText = 'font-weight:bold;color:#444;margin-bottom:6px;font-size:12px;';
  section.appendChild(heading);

  var endpointsDiv = document.createElement('div');
  section.appendChild(endpointsDiv);
  container.appendChild(section);

  this.connectorEndpointsSection = section;
  this.connectorEndpointsList    = endpointsDiv;
};

PropertiesPanel.prototype._updateConnectorEndpoints = function(cell) {
  var self = this;
  var sp    = this.shapeProps;
  var graph = this.ui.editor.graph;
  var div   = this.connectorEndpointsList;

  while (div.firstChild) div.removeChild(div.firstChild);

  var sourceCell = graph.model.getTerminal(cell, true);
  var targetCell = graph.model.getTerminal(cell, false);

  function getDisplayName(c) {
    if (!c || !c.vertex) return 'anonymous';
    if (sp.isIgnored(c))  return 'anonymous';
    var name = sp.getProperty(c, sp.PROP_NAME);
    return (name && name.trim()) ? name : 'anonymous';
  }

  function makeLink(displayName, shapeCell) {
    var span = document.createElement('span');
    span.textContent = displayName;
    if (displayName === 'anonymous') {
      span.style.cssText = 'font-size:12px;color:#999;font-style:italic;';
    } else {
      span.style.cssText = 'font-size:12px;color:#1976d2;cursor:pointer;text-decoration:underline;';
      span.addEventListener('click', function() {
        graph.setSelectionCell(shapeCell);
        graph.scrollCellToVisible(shapeCell, true);
      });
    }
    return span;
  }

  var row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:4px 0;';

  var arrow = document.createElement('span');
  arrow.textContent = '→';
  arrow.style.cssText = 'font-size:16px;font-weight:bold;color:#1976d2;flex-shrink:0;';

  row.appendChild(makeLink(getDisplayName(sourceCell), sourceCell));
  row.appendChild(arrow);
  row.appendChild(makeLink(getDisplayName(targetCell), targetCell));
  div.appendChild(row);
};

PropertiesPanel.prototype._buildReportButton = function(container) {
  var self = this;

  var btn = document.createElement('button');
  btn.textContent = 'Export architecture JSON';
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

  var status = document.createElement('div');
  status.style.cssText = [
    'display:none',
    'margin-top:6px',
    'font-size:11px',
    'word-break:break-all',
  ].join(';');

  var _statusTimer = null;
  function showStatus(msg, isError) {
    if (_statusTimer) clearTimeout(_statusTimer);
    status.textContent = msg;
    status.style.color = isError ? '#cc0000' : '#2e7d32';
    status.style.display = 'block';
    if (!isError) {
      _statusTimer = setTimeout(function() { status.style.display = 'none'; }, 6000);
    }
  }

  btn.addEventListener('click', function() {
    status.style.display = 'none';
    self.report.generate(self.tagHighlight.activeTag || null, showStatus);
  });

  container.appendChild(btn);
  container.appendChild(status);
  this.reportBtn    = btn;
  this.reportStatus = status;
};

PropertiesPanel.prototype._buildSyncCrossPageButton = function(container) {
  var self = this;

  var btn = document.createElement('button');
  btn.textContent = 'Sync cross-page shapes';
  btn.style.cssText = [
    'display:none',
    'margin-top:8px',
    'padding:8px 12px',
    'border:none',
    'border-radius:4px',
    'background:#1565c0',
    'color:#fff',
    'font-size:12px',
    'font-weight:bold',
    'cursor:pointer',
    'width:100%',
  ].join(';');
  btn.addEventListener('mouseenter', function() { btn.style.background = '#0d47a1'; });
  btn.addEventListener('mouseleave', function() { btn.style.background = '#1565c0'; });
  btn.addEventListener('click', function() { self._onSyncCrossPage(); });

  var status = document.createElement('div');
  status.style.cssText = 'display:none;margin-top:6px;font-size:11px;word-break:break-word;';

  container.appendChild(btn);
  container.appendChild(status);
  this.syncCrossPageBtn    = btn;
  this.syncCrossPageStatus = status;
};

// ---------------------------------------------------------------------------
// Sync actions
// ---------------------------------------------------------------------------

PropertiesPanel.prototype._onSyncToAll = function(cell, crossMatches) {
  var sp = this.shapeProps;
  var self = this;

  var sourceProps = {
    prop_name:        sp.getProperty(cell, sp.PROP_NAME),
    prop_level:       sp.getProperty(cell, sp.PROP_LEVEL),
    prop_description: sp.getProperty(cell, sp.PROP_DESCRIPTION),
  };

  var items = crossMatches.map(function(m) {
    return {
      cell:        m.cell,
      page:        m.page,
      pageName:    m.pageName,
      label:       sp.getLabelText(m.cell),
      sourceProps: sourceProps,
      currentProps: {
        prop_name:        sp.getProperty(m.cell, sp.PROP_NAME),
        prop_level:       sp.getProperty(m.cell, sp.PROP_LEVEL),
        prop_description: sp.getProperty(m.cell, sp.PROP_DESCRIPTION),
      },
    };
  });

  this.syncPreviewDlg.show(items, function(selected) {
    self._applyCrossPageSync(selected, cell);
  });
};

PropertiesPanel.prototype._onSyncCrossPage = function() {
  var sp   = this.shapeProps;
  var ui   = this.ui;
  var self = this;
  var statusEl = this.syncCrossPageStatus;

  function showStatus(msg, isError) {
    statusEl.textContent = msg;
    statusEl.style.color   = isError ? '#cc0000' : '#2e7d32';
    statusEl.style.display = 'block';
  }

  statusEl.style.display = 'none';

  if (!ui.pages || ui.pages.length <= 1) {
    showStatus('Only one page — nothing to sync.', true);
    return;
  }

  // Group all vertices across all pages by label + shape type.
  var groups = {};
  ui.pages.forEach(function(page) {
    if (!page.root) return;
    var pageName = page.getName ? page.getName() : (page.name || '(unnamed page)');
    _collectAllVertices(page.root, page, pageName, sp, groups);
  });

  // Build sync items: for each group, find source (most complete) and targets.
  var items = [];
  Object.keys(groups).forEach(function(key) {
    var members = groups[key];
    if (members.length < 2) return;

    var source = null;
    members.forEach(function(m) {
      if (!source &&
          sp.getProperty(m.cell, sp.PROP_NAME) &&
          sp.getProperty(m.cell, sp.PROP_LEVEL) &&
          sp.getProperty(m.cell, sp.PROP_DESCRIPTION)) {
        source = m;
      }
    });
    if (!source) return;

    var sourceProps = {
      prop_name:        sp.getProperty(source.cell, sp.PROP_NAME),
      prop_level:       sp.getProperty(source.cell, sp.PROP_LEVEL),
      prop_description: sp.getProperty(source.cell, sp.PROP_DESCRIPTION),
    };

    members.forEach(function(m) {
      if (m === source) return;
      items.push({
        cell:        m.cell,
        page:        m.page,
        pageName:    m.pageName,
        label:       sp.getLabelText(m.cell),
        sourceProps: sourceProps,
        currentProps: {
          prop_name:        sp.getProperty(m.cell, sp.PROP_NAME),
          prop_level:       sp.getProperty(m.cell, sp.PROP_LEVEL),
          prop_description: sp.getProperty(m.cell, sp.PROP_DESCRIPTION),
        },
      });
    });
  });

  if (items.length === 0) {
    showStatus('No cross-page shapes with complete properties found to sync.', true);
    return;
  }

  this.syncPreviewDlg.show(items, function(selected) {
    self._applyCrossPageSync(selected, null);
    if (selected.length > 0) {
      showStatus('Synced ' + selected.length + ' shape' + (selected.length > 1 ? 's' : '') + '.', false);
    }
  });
};

/**
 * Applies cross-page property writes for the given sync items.
 * Uses selectPage to reach each target page; restores the original page and
 * selection afterwards. The modal overlay hides any visual page-switching.
 *
 * After restoring the page the panel is re-populated directly rather than
 * relying on the selection-change event chain, which can misfire after
 * multiple selectPage calls.
 */
PropertiesPanel.prototype._applyCrossPageSync = function(items, savedCell) {
  var sp   = this.shapeProps;
  var ui   = this.ui;
  var self = this;
  var savedPage = ui.currentPage;

  items.forEach(function(item) {
    ui.selectPage(item.page, true);
    sp.setProperties(ui.editor.graph, item.cell, item.sourceProps);
  });

  ui.selectPage(savedPage, true);

  if (savedCell) {
    setTimeout(function() {
      var graph = ui.editor.graph;
      graph.setSelectionCell(savedCell);
      graph.scrollCellToVisible(savedCell, true);
      // Re-populate directly: selectPage fires setEmpty() via the selection
      // change listener and the event chain after multiple page-switches is
      // unreliable, so we drive the panel state explicitly.
      self.populate(savedCell);
    }, 50);
  }
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

  this.levelRow.style.display  = '';
  this.parentRow.style.display = '';
  this.connectorEndpointsSection.style.display = 'none';

  var level = sp.getProperty(cell, sp.PROP_LEVEL) || '';
  this.fields[sp.PROP_NAME].value        = sp.getProperty(cell, sp.PROP_NAME)        || '';
  this.fields[sp.PROP_LEVEL].value       = level;
  this.fields[sp.PROP_DESCRIPTION].value = sp.getProperty(cell, sp.PROP_DESCRIPTION) || '';

  this._updateParentDisplay(cell, graph);
  this._setFieldsDisabled(false);
  this.unignoreBtn.style.display      = 'none';
  this.reportBtn.style.display        = 'none';
  this.syncCrossPageBtn.style.display = 'none';
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
  this.levelRow.style.display  = '';
  this.parentRow.style.display = '';
  this.parentDisplay.textContent = '—';
  this.parentDisplay.style.color = '#aaa';
  this.unignoreBtn.style.display      = 'block';
  this.adoptBtn.style.display         = 'none';
  this.syncToAllBtn.style.display     = 'none';
  this.syncCrossPageBtn.style.display = 'none';
  this.reportBtn.style.display        = 'none';
  this.connectionsSection.style.display        = 'none';
  this.alsoInSection.style.display             = 'none';
  this.connectorEndpointsSection.style.display = 'none';
  this._updateTagsField(cell);
};

/**
 * Empty state — no selection or multi-selection.
 */
PropertiesPanel.prototype.setEmpty = function() {
  this.currentCell = null;
  this._clearFields();
  this._setFieldsDisabled(true);
  this.levelRow.style.display  = '';
  this.parentRow.style.display = '';
  this.parentDisplay.textContent = '—';
  this.parentDisplay.style.color = '#aaa';
  this.unignoreBtn.style.display    = 'none';
  this.adoptBtn.style.display       = 'none';
  this.syncToAllBtn.style.display   = 'none';
  this.reportBtn.style.display      = 'block';
  this.syncCrossPageBtn.style.display    = (this.ui.pages && this.ui.pages.length > 1) ? 'block' : 'none';
  this.syncCrossPageStatus.style.display = 'none';
  this.connectionsSection.style.display        = 'none';
  this.alsoInSection.style.display             = 'none';
  this.connectorEndpointsSection.style.display = 'none';
  this._updateTagsField(null);
  this._switchTab('properties');
};

/**
 * Connector (edge) state — Name and Description editable, Level/Parent hidden.
 * Shows the two connected shapes as clickable links.
 */
PropertiesPanel.prototype.setEdge = function(cell) {
  var sp = this.shapeProps;
  this.currentCell = cell;

  this.levelRow.style.display  = 'none';
  this.parentRow.style.display = 'none';

  this.fields[sp.PROP_NAME].value        = sp.getProperty(cell, sp.PROP_NAME)        || '';
  this.fields[sp.PROP_DESCRIPTION].value = sp.getProperty(cell, sp.PROP_DESCRIPTION) || '';
  this.fields[sp.PROP_LEVEL].value       = '';

  this._setFieldsDisabled(false);
  this.fields[sp.PROP_LEVEL].disabled        = true;
  this.fields[sp.PROP_LEVEL].style.background = '#f0f0f0';

  this.unignoreBtn.style.display      = 'none';
  this.adoptBtn.style.display         = 'none';
  this.syncToAllBtn.style.display     = 'none';
  this.syncCrossPageBtn.style.display = 'none';
  this.reportBtn.style.display        = 'none';
  this.connectionsSection.style.display = 'none';
  this.alsoInSection.style.display      = 'none';

  this._updateConnectorEndpoints(cell);
  this.connectorEndpointsSection.style.display = 'block';

  this._updateTagsField(cell);
  this._switchTab('properties');
};

/**
 * Ignored connector state — all fields disabled, un-ignore button visible.
 */
PropertiesPanel.prototype.setConnectorIgnored = function(cell) {
  this.currentCell = cell;
  this._clearFields();
  this._setFieldsDisabled(true);

  this.levelRow.style.display  = 'none';
  this.parentRow.style.display = 'none';

  this.unignoreBtn.style.display      = 'block';
  this.adoptBtn.style.display         = 'none';
  this.syncToAllBtn.style.display     = 'none';
  this.syncCrossPageBtn.style.display = 'none';
  this.reportBtn.style.display        = 'none';
  this.connectionsSection.style.display        = 'none';
  this.alsoInSection.style.display             = 'none';
  this.connectorEndpointsSection.style.display = 'none';

  this._updateTagsField(cell);
  this._switchTab('properties');
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
// Confluence section
// ---------------------------------------------------------------------------

PropertiesPanel.prototype._buildConfluenceSection = function(container) {
  var self = this;

  var sep = document.createElement('div');
  sep.style.cssText = 'margin-top:12px;border-top:1px solid #ddd;padding-top:10px;';

  var pageHeading = document.createElement('div');
  pageHeading.textContent = 'Target page(s):';
  pageHeading.style.cssText = 'font-weight:bold;margin-bottom:4px;font-size:11px;color:#444;';
  sep.appendChild(pageHeading);

  var pagesLabel = document.createElement('div');
  pagesLabel.style.cssText = [
    'font-size:10px',
    'word-break:break-all',
    'min-height:16px',
    'background:#f4f5f7',
    'border:1px solid #ddd',
    'border-radius:3px',
    'padding:4px 6px',
    'margin-bottom:10px',
    'color:#555',
    'line-height:1.4',
  ].join(';');
  sep.appendChild(pagesLabel);
  this.cfPagesLabel = pagesLabel;

  var pushBtn = document.createElement('button');
  pushBtn.textContent = 'Push to Confluence';
  pushBtn.style.cssText = [
    'padding:8px 12px',
    'border:none',
    'border-radius:4px',
    'background:#0052cc',
    'color:#fff',
    'font-size:12px',
    'font-weight:bold',
    'cursor:pointer',
    'width:100%',
  ].join(';');
  sep.appendChild(pushBtn);

  var pushStatus = document.createElement('div');
  pushStatus.style.cssText = 'font-size:11px;color:#555;margin-top:4px;min-height:14px;word-break:break-word;line-height:1.4;';
  sep.appendChild(pushStatus);

  var credsToggle = document.createElement('div');
  credsToggle.style.cssText = 'font-size:10px;cursor:pointer;margin-top:6px;';
  credsToggle.title = 'Click to show/hide credentials';
  sep.appendChild(credsToggle);

  var credsForm = document.createElement('div');
  credsForm.style.cssText = 'display:none;margin-top:6px;';

  var fieldStyle = [
    'width:100%',
    'box-sizing:border-box',
    'font-size:10px',
    'padding:3px 5px',
    'margin-bottom:3px',
    'border:1px solid #ccc',
    'border-radius:3px',
  ].join(';');

  var inputBaseUrl = document.createElement('input');
  inputBaseUrl.placeholder = 'https://company.atlassian.net';
  inputBaseUrl.style.cssText = fieldStyle;
  credsForm.appendChild(inputBaseUrl);

  var inputEmail = document.createElement('input');
  inputEmail.placeholder = 'you@company.com';
  inputEmail.style.cssText = fieldStyle;
  credsForm.appendChild(inputEmail);

  var inputToken = document.createElement('input');
  inputToken.type = 'password';
  inputToken.placeholder = 'API token';
  inputToken.style.cssText = fieldStyle;
  credsForm.appendChild(inputToken);

  var saveRow = document.createElement('div');
  saveRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-top:4px;';

  var saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save';
  saveBtn.style.cssText = 'font-size:10px;padding:3px 10px;background:#0052cc;color:#fff;border:none;border-radius:3px;cursor:pointer;';

  var clearBtn = document.createElement('button');
  clearBtn.textContent = 'Clear';
  clearBtn.style.cssText = 'font-size:10px;padding:3px 10px;background:#888;color:#fff;border:none;border-radius:3px;cursor:pointer;';

  var credsSaveStat = document.createElement('span');
  credsSaveStat.style.cssText = 'font-size:10px;';

  saveRow.appendChild(saveBtn);
  saveRow.appendChild(clearBtn);
  saveRow.appendChild(credsSaveStat);
  credsForm.appendChild(saveRow);
  sep.appendChild(credsForm);
  container.appendChild(sep);

  this.cfPushBtn      = pushBtn;
  this.cfPushStatus   = pushStatus;
  this.cfCredsToggle  = credsToggle;
  this.cfCredsForm    = credsForm;
  this._cfInputBaseUrl = inputBaseUrl;
  this._cfInputEmail   = inputEmail;
  this._cfInputToken   = inputToken;

  credsToggle.addEventListener('click', function() {
    var show = credsForm.style.display === 'none';
    credsForm.style.display = show ? '' : 'none';
    if (show) {
      var cfg = self.cfUploader.getConfig();
      if (cfg) {
        inputBaseUrl.value = cfg.baseUrl  || '';
        inputEmail.value   = cfg.email    || '';
        inputToken.value   = cfg.apiToken || '';
      }
    }
  });

  saveBtn.addEventListener('click', function() {
    try {
      self.cfUploader.saveConfig({
        baseUrl:  inputBaseUrl.value,
        email:    inputEmail.value,
        apiToken: inputToken.value,
      });
      credsSaveStat.textContent = 'Saved.';
      credsSaveStat.style.color = '#238200';
      self._updateConfluenceButton();
    } catch (e) {
      credsSaveStat.textContent = e.message || 'Error.';
      credsSaveStat.style.color = '#cc0000';
    }
  });

  clearBtn.addEventListener('click', function() {
    self.cfUploader.clearConfig();
    inputBaseUrl.value = inputEmail.value = inputToken.value = '';
    credsSaveStat.textContent = 'Cleared.';
    credsSaveStat.style.color = '#555';
    self._updateConfluenceButton();
  });

  pushBtn.addEventListener('click', function() {
    self._handleConfluencePush();
  });

  this._updateConfluenceButton();
};

PropertiesPanel.prototype._updateConfluenceButton = function() {
  if (!this.cfPushBtn) return;
  var cfg    = this.cfUploader.getConfig();
  var pages  = this.cfUploader.getPages();
  var active = !!(cfg && pages.valid.length > 0);

  this.cfPushBtn.disabled         = !active;
  this.cfPushBtn.style.background = active ? '#0052cc' : '#b0b0b0';
  this.cfPushBtn.style.cursor     = active ? 'pointer' : 'default';

  if (cfg) {
    this.cfCredsToggle.textContent = '⚙ ' + cfg.email;
    this.cfCredsToggle.style.color = '#238200';
  } else {
    this.cfCredsToggle.textContent = '⚙ Confluence credentials (not set)';
    this.cfCredsToggle.style.color = '#cc0000';
  }

  // Refresh target pages label
  var label = this.cfPagesLabel;
  while (label.firstChild) { label.removeChild(label.firstChild); }

  if (!pages.valid.length && !pages.invalid.length) {
    var notSet = document.createElement('span');
    notSet.textContent = 'Not set — right-click background → Edit Data → add confluence_page';
    notSet.style.color = '#888';
    label.appendChild(notSet);
  } else {
    for (var vi = 0; vi < pages.valid.length; vi++) {
      (function(url, isLast) {
        var linkEl = document.createElement('span');
        linkEl.textContent = url;
        linkEl.title = 'Click to open in browser';
        linkEl.style.cssText = [
          'display:block',
          'color:#0052cc',
          'cursor:pointer',
          'text-decoration:underline',
          'word-break:break-all',
        ].join(';');
        linkEl.addEventListener('click', function() {
          if (window.electron && typeof window.electron.openExternal === 'function') {
            window.electron.openExternal(url);
          } else {
            window.open(url, '_blank');
          }
        });
        label.appendChild(linkEl);
        if (!isLast) {
          var hr = document.createElement('hr');
          hr.style.cssText = 'border:none;border-top:1px solid #e0e0e0;margin:2px 0;';
          label.appendChild(hr);
        }
      }(pages.valid[vi], vi === pages.valid.length - 1 && !pages.invalid.length));
    }
    for (var ii = 0; ii < pages.invalid.length; ii++) {
      var warnEl = document.createElement('span');
      warnEl.textContent = '⚠ Invalid (no /pages/{id}/): ' + pages.invalid[ii];
      warnEl.style.cssText = 'display:block;color:#cc0000;word-break:break-all;font-size:9px;';
      label.appendChild(warnEl);
    }
  }
};

PropertiesPanel.prototype._handleConfluencePush = function() {
  var self = this;

  while (this.cfPushStatus.firstChild) {
    this.cfPushStatus.removeChild(this.cfPushStatus.firstChild);
  }
  this.cfPushStatus.style.color = '#555';

  var cfg = this.cfUploader.getConfig();
  if (!cfg) {
    this.cfCredsForm.style.display = '';
    this.cfPushStatus.textContent  = 'Enter credentials above.';
    return;
  }

  this.cfPushBtn.disabled         = true;
  this.cfPushBtn.style.background = '#b0b0b0';
  this.cfPushBtn.style.cursor     = 'default';
  this.cfPushStatus.textContent   = 'Exporting diagram…';

  this.report.push(
    this.cfUploader,
    function onProgress(index, total) {
      self.cfPushStatus.textContent = 'Uploading page ' + (index + 1) + ' of ' + total + '…';
    },
    function onDone(err, results) {
      self._updateConfluenceButton();

      while (self.cfPushStatus.firstChild) {
        self.cfPushStatus.removeChild(self.cfPushStatus.firstChild);
      }
      self.cfPushStatus.style.color = '#555';

      if (err) {
        self.cfPushStatus.textContent = err;
        self.cfPushStatus.style.color = '#cc0000';
        return;
      }

      results.forEach(function(r) {
        var line = document.createElement('div');
        line.style.cssText = 'margin-bottom:2px;font-size:11px;';
        var label = r.url;
        var m = r.url.match(/\/pages\/\d+\/([^/?#]+)/);
        if (m) { label = decodeURIComponent(m[1].replace(/\+/g, ' ')); }
        if (r.ok) {
          line.textContent = '✓ ' + label;
          line.style.color = '#238200';
        } else {
          line.textContent = '✗ ' + label + ': ' + r.error;
          line.style.color = '#cc0000';
        }
        self.cfPushStatus.appendChild(line);
      });
    },
    this.tagHighlight.activeTag || null
  );
};

PropertiesPanel.prototype._subscribeConfluenceUpdates = function() {
  var self = this;
  this.ui.editor.graph.getModel().addListener(mxEvent.CHANGE, function() {
    self._updateConfluenceButton();
  });
  this.ui.editor.addListener('resetGraphView', function() {
    self._updateConfluenceButton();
  });
  if (typeof this.ui.addListener === 'function') {
    this.ui.addListener('pageSelected', function() {
      self._updateConfluenceButton();
    });
  }
};

// ---------------------------------------------------------------------------
// Module-level helpers
// ---------------------------------------------------------------------------

function _collectAllVertices(node, page, pageName, sp, groups) {
  if (!node) return;
  if (node.vertex) {
    var label = sp.getLabelText(node);
    var shape = sp.getShapeTypeKey(node);
    if (label) {
      var key = label + '\x00' + shape;
      if (!groups[key]) groups[key] = [];
      groups[key].push({ cell: node, page: page, pageName: pageName });
    }
  }
  var children = node.children;
  if (children) {
    for (var i = 0; i < children.length; i++) {
      _collectAllVertices(children[i], page, pageName, sp, groups);
    }
  }
}

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
