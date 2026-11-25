'use strict';

var PLUGIN_VERSION = '1.14.0';

var ArchitectureReport  = require('./ArchitectureReport');
var fillLevelSelect     = require('./LevelSelect');
var NodeFields          = require('./NodeFields');
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
 *   Properties — Parent, ID, Name, Level, Description, Technology,
 *                Provisioning, Adopt Children, Connected shapes, Also in...;
 *                export / sync / Confluence buttons in the empty state.
 *   Tags       — Tags field for the selected cell; Highlight controls.
 *
 * Panel states:
 *   empty            — no selection, or multiple cells selected
 *   populated        — single non-ignored shape; all fields editable
 *   ignored          — selected shape has properties_ignored=true
 *   edge             — single connector; ID, Name, Description, Connects, Ignore
 *   connectorIgnored — selected connector has properties_ignored=true
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

  // Pause/resume toggle
  this._active    = localStorage.getItem('drawio-pp-active') !== 'false';
  this._toggleBtn = null;

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
  this._buildIgnoreConnectorButton(propsPane);
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
  footer.style.cssText = [
    'display:flex',
    'align-items:center',
    'justify-content:space-between',
    'padding:4px 8px 4px 12px',
    'font-size:10px',
    'border-top:1px solid #e8e8e8',
    'background:#f5f5f5',
    'flex-shrink:0',
  ].join(';');

  var versionSpan = document.createElement('span');
  versionSpan.textContent = 'Architect toolset v' + PLUGIN_VERSION;
  versionSpan.style.color = '#bbb';
  footer.appendChild(versionSpan);

  this._buildToggleButton(footer);

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

var _FIELD_INPUT_STYLE = [
  'width:100%',
  'box-sizing:border-box',
  'padding:5px 7px',
  'border:1px solid #ccc',
  'border-radius:3px',
  'font-size:12px',
  'background:#fff',
].join(';');

PropertiesPanel.prototype._buildFields = function(container) {
  var self = this;
  var sp = this.shapeProps;

  // Text fields and the Level dropdown live in this.fields (key -> element).
  // Parent and the Node-only fields are separate controls.
  var fieldDefs = [
    { key: sp.PROP_ID,          label: 'ID',          type: 'id'       },
    { key: sp.PROP_NAME,        label: 'Name',        type: 'text'     },
    { key: sp.PROP_LEVEL,       label: 'Level',       type: 'select'   },
    { key: sp.PROP_DESCRIPTION, label: 'Description', type: 'textarea' },
  ];
  self.nodeOnlyRows = [];

  // Parent row: read-only display (container / organization / no level) or
  // the Parent picker (no container on this page) — specs §5.1.
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

  var parentSelect = document.createElement('select');
  parentSelect.style.cssText = _FIELD_INPUT_STYLE + ';display:none;';
  parentSelect.addEventListener('mousedown', function(e) { e.stopPropagation(); });
  parentSelect.addEventListener('change', function() {
    if (!self.currentCell || parentSelect.disabled) return;
    var graph = self.ui.editor.graph;
    if (parentSelect.value) sp.setProperty(graph, self.currentCell, sp.PROP_PARENT, parentSelect.value);
    else                    sp.removeProperty(graph, self.currentCell, sp.PROP_PARENT);
    self._updateParentDisplay(self.currentCell);
  });

  parentRow.appendChild(parentLabel);
  parentRow.appendChild(parentDisplay);
  parentRow.appendChild(parentSelect);
  container.appendChild(parentRow);
  self.parentDisplay = parentDisplay;
  self.parentSelect  = parentSelect;
  self.parentRow     = parentRow;

  fieldDefs.forEach(function(def) {
    var row = document.createElement('div');
    row.style.marginBottom = '8px';

    var label = document.createElement('label');
    label.textContent = def.label;
    label.style.cssText = 'display:block;font-weight:bold;margin-bottom:2px;color:#444;';

    var input;
    if (def.type === 'select') {
      input = document.createElement('select');
      input.style.cssText = _FIELD_INPUT_STYLE;
      fillLevelSelect(input, sp);
      input.addEventListener('change', function() {
        if (self.currentCell && !input.disabled) {
          var graph = self.ui.editor.graph;
          sp.setProperty(graph, self.currentCell, def.key, input.value);
          self._updateAdoptButton(sp.getChildLevels(input.value).length > 0);
          self._updateNodeOnlyRows(input.value);
          try {
            sp.reparentCell(graph, self.currentCell);
            self._updateConnections(self.currentCell);
          } catch (e) {
            mxUtils.alert(String(e));
          }
          self._updateParentDisplay(self.currentCell);
        }
      });
    } else if (def.type === 'textarea') {
      input = document.createElement('textarea');
      input.rows = 3;
      input.style.cssText = _FIELD_INPUT_STYLE;
      input.style.resize = 'vertical';
      input.addEventListener('blur', function() {
        if (self.currentCell && !input.disabled) {
          sp.setProperty(self.ui.editor.graph, self.currentCell, def.key, input.value);
        }
      });
    } else {
      input = document.createElement('input');
      input.type = 'text';
      input.style.cssText = _FIELD_INPUT_STYLE;
      input.addEventListener('blur', function() {
        if (!self.currentCell || input.disabled) return;
        if (def.type === 'id') self._commitId(input);
        else sp.setProperty(self.ui.editor.graph, self.currentCell, def.key, input.value);
      });
    }

    input.disabled = true;

    row.appendChild(label);
    row.appendChild(input);

    if (def.type === 'id') {
      var idError = document.createElement('div');
      idError.style.cssText = 'display:none;font-size:10px;color:#cc0000;margin-top:2px;';
      row.appendChild(idError);
      self.idError = idError;
      self.idRow = row;
    }

    container.appendChild(row);

    self.fields[def.key] = input;
    if (def.key === sp.PROP_LEVEL) self.levelRow = row;
  });

  // Node-only fields (specs §4.4): Technology and Provisioning.
  var nodeOpts = { inputStyle: _FIELD_INPUT_STYLE, enabledBg: '#fff', disabledBg: '#f0f0f0' };
  self.technologyField   = new NodeFields.TechnologyField(nodeOpts);
  self.provisioningField = new NodeFields.ProvisioningField(
    Object.assign({ values: sp.PROVISIONING_VALUES }, nodeOpts));

  [
    { label: 'Technology',   key: sp.PROP_TECHNOLOGY,   field: self.technologyField },
    { label: 'Provisioning', key: sp.PROP_PROVISIONING, field: self.provisioningField },
  ].forEach(function(def) {
    var row = document.createElement('div');
    row.style.cssText = 'margin-bottom:8px;display:none;';
    var label = document.createElement('label');
    label.textContent = def.label;
    label.style.cssText = 'display:block;font-weight:bold;margin-bottom:2px;color:#444;';
    row.appendChild(label);
    row.appendChild(def.field.element);
    container.appendChild(row);
    self.nodeOnlyRows.push(row);

    def.field.setDisabled(true);
    def.field.onCommit = function(value) {
      if (!self.currentCell) return;
      var graph = self.ui.editor.graph;
      if (value) sp.setProperty(graph, self.currentCell, def.key, value);
      else       sp.removeProperty(graph, self.currentCell, def.key);
    };
  });
};

/**
 * Saves the ID field (specs §5.1): invalid syntax or a clash on this page
 * shows an inline error and restores the previous value. An empty value is
 * refused for shapes (required) and removes the ID of a connector (optional).
 */
PropertiesPanel.prototype._commitId = function(input) {
  var sp    = this.shapeProps;
  var graph = this.ui.editor.graph;
  var cell  = this.currentCell;
  var previous = sp.getProperty(cell, sp.PROP_ID) || '';
  var value = input.value.trim();
  input.value = value;

  this._showIdError(null);
  if (value === previous) return;

  if (!value) {
    if (cell.edge) {
      sp.removeProperty(graph, cell, sp.PROP_ID);
    } else {
      input.value = previous;
      this._showIdError('ID is required.');
    }
    return;
  }

  var error = sp.validateId(graph, cell, value);
  if (error) {
    input.value = previous;
    this._showIdError(error + ' Kept "' + (previous || '(none)') + '".');
    return;
  }

  sp.setProperty(graph, cell, sp.PROP_ID, value);
  if (cell.vertex) this._updateAlsoIn(cell);
  else this._updateConnectorEndpoints(cell);
};

PropertiesPanel.prototype._showIdError = function(message) {
  if (!this.idError) return;
  this.idError.textContent = message || '';
  this.idError.style.display = message ? 'block' : 'none';
};

// Technology / Provisioning are shown only for shapes at Node level.
PropertiesPanel.prototype._updateNodeOnlyRows = function(level) {
  var show = level === this.shapeProps.NODE_LEVEL;
  this.nodeOnlyRows.forEach(function(row) { row.style.display = show ? '' : 'none'; });
};

PropertiesPanel.prototype._setNodeFieldsDisabled = function(disabled) {
  this.technologyField.setDisabled(disabled);
  this.provisioningField.setDisabled(disabled);
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

/**
 * Connectors are ignored from the panel (specs §8): the popup that offers
 * Ignore for shapes is never shown for connectors.
 */
PropertiesPanel.prototype._buildIgnoreConnectorButton = function(container) {
  var self = this;
  var sp = this.shapeProps;

  var btn = document.createElement('button');
  btn.textContent = 'Ignore this connector';
  btn.title = 'Exclude this connector from property management and from the export';
  btn.style.cssText = [
    'display:none',
    'margin-top:8px',
    'padding:6px 12px',
    'border:1px solid #ccc',
    'border-radius:4px',
    'background:#f5f5f5',
    'color:#333',
    'font-size:12px',
    'font-weight:bold',
    'cursor:pointer',
    'width:100%',
  ].join(';');

  btn.addEventListener('click', function() {
    if (!self.currentCell || !self.currentCell.edge) return;
    sp.setProperty(self.ui.editor.graph, self.currentCell, sp.PROP_IGNORED, 'true');
    self.setConnectorIgnored(self.currentCell);
  });

  container.appendChild(btn);
  this.ignoreConnectorBtn = btn;
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

PropertiesPanel.prototype._updateAdoptButton = function(canContain) {
  this.adoptBtn.style.display = canContain ? 'block' : 'none';
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
      var level = sp.getLevelLabel(sp.getProperty(item.cell, sp.PROP_LEVEL)) || '';
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

  var targetId = sp.getProperty(cell, sp.PROP_ID);
  var hasNavMatches = false;

  // Navigation links: the other pages where this same element (same ID) is
  // drawn — specs §5.6. One link per page (the first shape found there).
  if (targetId) {
    var seenPages = [];
    var navMatches = sp.findOtherPagesWithId(ui, cell, targetId).filter(function(m) {
      if (seenPages.indexOf(m.page) !== -1) return false;
      seenPages.push(m.page);
      return true;
    });

    navMatches.forEach(function(match) {
      var pageName = match.pageName;

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

  // Sync button: visible when the shape is a complete source (ID, Name, Level)
  // and candidate copies (same label + shape type) on other pages would
  // change — specs §17.3.
  if (sp.isCompleteSource(cell)) {
    var plan = this._planSync(cell, sp.findCrossPageMatches(ui, cell));
    if (plan.items.length > 0) {
      this.syncToAllBtn.onclick = function() { self._onSyncToAll(cell); };
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

  // Why this connector would not be exported as a flow (specs §5.7).
  var problem = sp.getFlowProblem(cell);
  var lifted  = sp.isFlowLifted(cell);
  var crossLevel = problem && problem.code === 'FLOW-001';
  if (problem && !(crossLevel && lifted)) {
    var warn = document.createElement('div');
    warn.textContent = (problem.skip ? '' : '⚠ ') + problem.message;
    warn.title = problem.code;
    warn.style.cssText = 'font-size:10px;color:#999;margin-top:4px;line-height:1.3;';
    div.appendChild(warn);
  }

  // Lift option (specs §5.7, §10.5.1): offered on cross-level connectors, and
  // kept visible while set so a stale flag can be cleared.
  if (crossLevel || lifted) {
    var liftLabel = document.createElement('label');
    liftLabel.style.cssText = 'display:flex;align-items:flex-start;gap:4px;font-size:11px;color:#444;' +
                              'margin-top:6px;cursor:pointer;line-height:1.3;';
    var liftBox = document.createElement('input');
    liftBox.type = 'checkbox';
    liftBox.checked = lifted;
    liftBox.style.margin = '1px 0 0';
    var liftText = document.createElement('span');
    liftText.textContent = 'Lift to common level — one end is not known in detail';
    liftLabel.title = 'Export this connector as a flow between the ancestors of its ends that are at the same level, ' +
                      'recording this connector under lifted_from.';
    liftLabel.appendChild(liftBox);
    liftLabel.appendChild(liftText);
    div.appendChild(liftLabel);

    var note = document.createElement('div');
    note.style.cssText = 'font-size:10px;color:#999;margin-top:2px;line-height:1.3;';
    if (lifted && crossLevel) {
      note.textContent = 'Exported as a flow between the ends’ common-level parents; shown as an advisory in the validation report.';
    } else if (lifted) {
      note.textContent = 'Has no effect: the ends are not at different levels.';
    }
    if (note.textContent) div.appendChild(note);

    liftBox.addEventListener('change', function() {
      var graph = self.ui.editor.graph;
      if (liftBox.checked) sp.setProperty(graph, cell, sp.PROP_FLOW_LIFT, 'true');
      else                 sp.removeProperty(graph, cell, sp.PROP_FLOW_LIFT);
      self._updateConnectorEndpoints(cell);
    });
  }
};

/**
 * Export / Validate / Generate model page buttons (specs §10.1, §10.9), shown
 * only in the empty state. this.reportBtn is the wrapper holding them, so the panel states can show or
 * hide them together.
 */
PropertiesPanel.prototype._buildReportButton = function(container) {
  var self = this;

  var wrapper = document.createElement('div');
  wrapper.style.cssText = 'display:none;margin-top:12px;';

  var btn = document.createElement('button');
  btn.textContent = 'Export architecture YAML';
  btn.style.cssText = [
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

  var validateBtn = document.createElement('button');
  validateBtn.textContent = 'Validate model';
  validateBtn.title = 'Check the architecture model of the whole file without exporting it';
  validateBtn.style.cssText = [
    'margin-top:6px',
    'padding:6px 12px',
    'border:1px solid #2e7d32',
    'border-radius:4px',
    'background:#fff',
    'color:#2e7d32',
    'font-size:12px',
    'font-weight:bold',
    'cursor:pointer',
    'width:100%',
  ].join(';');

  var modelPageBtn = document.createElement('button');
  modelPageBtn.textContent = 'Generate model page';
  modelPageBtn.title = 'Draw the whole architecture model as a hierarchy tree on the "Architecture Model" page ' +
                       '(re-created on every run)';
  modelPageBtn.style.cssText = validateBtn.style.cssText;

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

  validateBtn.addEventListener('click', function() {
    status.style.display = 'none';
    self.report.validate(showStatus);
  });

  wrapper.appendChild(btn);
  modelPageBtn.addEventListener('click', function() {
    status.style.display = 'none';
    self.report.generateModelPage(showStatus);
  });

  wrapper.appendChild(validateBtn);
  wrapper.appendChild(modelPageBtn);
  wrapper.appendChild(status);
  container.appendChild(wrapper);
  this.reportBtn    = wrapper;
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

/**
 * Sync rows for copying `source`'s properties to `targets` ([{cell, page,
 * pageName}]) — specs §17.5. Targets that would not change are left out;
 * targets whose page already has another shape with the source's ID are left
 * out and reported in `notices`.
 * Returns { items, notices }.
 */
PropertiesPanel.prototype._planSync = function(source, targets) {
  var sp = this.shapeProps;
  var ui = this.ui;
  var items = [], notices = [];
  var sourceId = sp.getProperty(source, sp.PROP_ID);

  targets.forEach(function(m) {
    if (m.cell === source) return;
    var sourceProps  = sp.getSyncProps(source, m.cell);
    var currentProps = _readSyncKeys(sp, m.cell);
    if (!SyncPreviewDialog.describeDiff(currentProps, sourceProps)) return;

    var root = (m.page === ui.currentPage) ? ui.editor.graph.model.root : m.page.root;
    var clash = sourceId && sp.getProperty(m.cell, sp.PROP_ID) !== sourceId &&
                sp.findSameIdOnPage(root, m.cell, sourceId);
    if (clash) {
      notices.push('Not synced — "' + sp.getLabelText(m.cell) + '" on ' + m.pageName +
                   ': ID "' + sourceId + '" is already used on that page.');
      return;
    }

    items.push({
      cell:         m.cell,
      page:         m.page,
      pageName:     m.pageName,
      label:        sp.getLabelText(m.cell),
      sourceProps:  sourceProps,
      currentProps: currentProps,
    });
  });
  return { items: items, notices: notices };
};

PropertiesPanel.prototype._onSyncToAll = function(cell) {
  var sp = this.shapeProps;
  var self = this;
  var plan = this._planSync(cell, sp.findCrossPageMatches(this.ui, cell));

  if (plan.items.length === 0) return;   // the button is only shown when there is something to sync
  this.syncPreviewDlg.show(plan.items, function(selected) {
    self._applyCrossPageSync(selected, cell);
  }, plan.notices);
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
    var root = (page === ui.currentPage) ? ui.editor.graph.model.root : page.root;
    if (!root) return;
    var pageName = page.getName ? page.getName() : (page.name || '(unnamed page)');
    _collectAllVertices(root, page, pageName, sp, groups);
  });

  // For each group: the source is the first complete member (ID, Name,
  // Level). Groups whose complete members disagree on the ID are skipped.
  var items = [], notices = [];
  Object.keys(groups).forEach(function(key) {
    var members = groups[key];
    if (members.length < 2) return;

    var sources = members.filter(function(m) { return sp.isCompleteSource(m.cell); });
    if (sources.length === 0) return;

    var ids = [];
    sources.forEach(function(m) {
      var id = sp.getProperty(m.cell, sp.PROP_ID);
      if (ids.indexOf(id) === -1) ids.push(id);
    });
    if (ids.length > 1) {
      notices.push('Not synced — conflicting IDs for "' + sp.getLabelText(sources[0].cell) + '": ' +
                   ids.join(', ') + '.');
      return;
    }

    var plan = self._planSync(sources[0].cell, members);
    items = items.concat(plan.items);
    notices = notices.concat(plan.notices);
  });

  if (items.length === 0) {
    showStatus(notices.length ? notices.join(' ')
                              : 'No cross-page shapes with complete properties found to sync.', true);
    return;
  }

  this.syncPreviewDlg.show(items, function(selected) {
    self._applyCrossPageSync(selected, null);
    if (selected.length > 0) {
      showStatus('Synced ' + selected.length + ' shape' + (selected.length > 1 ? 's' : '') + '.', false);
    }
  }, notices);
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
  this.currentCell = cell;

  this.levelRow.style.display  = '';
  this.parentRow.style.display = '';
  this.connectorEndpointsSection.style.display = 'none';

  var level = sp.getProperty(cell, sp.PROP_LEVEL) || '';
  this.fields[sp.PROP_ID].value          = sp.getProperty(cell, sp.PROP_ID)          || '';
  this.fields[sp.PROP_NAME].value        = sp.getProperty(cell, sp.PROP_NAME)        || '';
  this.fields[sp.PROP_LEVEL].value       = level;
  this.fields[sp.PROP_DESCRIPTION].value = sp.getProperty(cell, sp.PROP_DESCRIPTION) || '';
  this.technologyField.setValue(sp.getProperty(cell, sp.PROP_TECHNOLOGY));
  this.provisioningField.setValue(sp.getProperty(cell, sp.PROP_PROVISIONING));
  this._updateNodeOnlyRows(level);
  this._showIdError(null);

  this._setFieldsDisabled(false);
  this._updateParentDisplay(cell);
  this.unignoreBtn.style.display        = 'none';
  this.ignoreConnectorBtn.style.display = 'none';
  this.reportBtn.style.display          = 'none';
  this.syncCrossPageBtn.style.display   = 'none';
  this._updateAdoptButton(sp.getChildLevels(level).length > 0);
  this._updateConnections(cell);
  this._updateAlsoIn(cell);
  this._updateTagsField(cell);
  this._switchTab('properties');
};

/**
 * Parent row (specs §5.1, §4.3):
 *   inside an eligible container → read-only container name
 *   Organization                 → read-only "— no parent —"
 *   no Level                     → read-only "—"
 *   otherwise                    → Parent picker (prop_parent)
 */
PropertiesPanel.prototype._updateParentDisplay = function(cell) {
  var sp    = this.shapeProps;
  var graph = this.ui.editor.graph;
  var level = sp.getProperty(cell, sp.PROP_LEVEL);
  var container = sp.getContainerAncestor(cell);

  if (container || !level || level === sp.ORGANIZATION_LEVEL) {
    this.parentSelect.style.display  = 'none';
    this.parentDisplay.style.display = '';
    if (container) {
      var name = sp.getProperty(container, sp.PROP_NAME) || graph.getLabel(container) || '(unnamed)';
      var lvl  = sp.getLevelLabel(sp.getProperty(container, sp.PROP_LEVEL));
      this.parentDisplay.textContent = lvl ? name + ' (' + lvl + ')' : name;
      this.parentDisplay.style.color = '#333';
    } else {
      this.parentDisplay.textContent = level ? '— no parent —' : '—';
      this.parentDisplay.style.color = '#aaa';
    }
    return;
  }

  // No container on this page: explicit parent picker.
  var select   = this.parentSelect;
  var stored   = sp.getProperty(cell, sp.PROP_PARENT) || '';
  var ownId    = sp.getProperty(cell, sp.PROP_ID);
  var options  = sp.getParentCandidates(this.ui, level, ownId);

  while (select.firstChild) select.removeChild(select.firstChild);
  var none = document.createElement('option');
  none.value = '';
  none.textContent = '— no parent —';
  select.appendChild(none);

  var storedListed = false;
  options.forEach(function(el) {
    var opt = document.createElement('option');
    opt.value = el.id;
    opt.textContent = el.name + ' (' + sp.getLevelLabel(el.level) + ') · ' + el.id;
    select.appendChild(opt);
    if (el.id === stored) storedListed = true;
  });
  if (stored && !storedListed) {
    var invalid = document.createElement('option');
    invalid.value = stored;
    invalid.textContent = stored + ' (invalid)';
    select.appendChild(invalid);
  }
  select.value = stored;
  select.title = stored && !storedListed
    ? 'The stored parent does not exist or cannot contain a ' + sp.getLevelLabel(level)
    : 'Parent of this shape when it is not drawn inside its container';

  this.parentDisplay.style.display = 'none';
  select.style.display = '';
};

PropertiesPanel.prototype._showParentPlaceholder = function() {
  this.parentSelect.style.display  = 'none';
  this.parentDisplay.style.display = '';
  this.parentDisplay.textContent = '—';
  this.parentDisplay.style.color = '#aaa';
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
  this._updateNodeOnlyRows(null);
  this.parentRow.style.display = '';
  this._showParentPlaceholder();
  this.unignoreBtn.textContent        = 'Un-ignore this shape';
  this.unignoreBtn.style.display      = 'block';
  this.ignoreConnectorBtn.style.display = 'none';
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
  this._updateNodeOnlyRows(null);
  this.parentRow.style.display = '';
  this._showParentPlaceholder();
  this.unignoreBtn.style.display        = 'none';
  this.ignoreConnectorBtn.style.display = 'none';
  this.adoptBtn.style.display           = 'none';
  this.syncToAllBtn.style.display       = 'none';
  this.reportBtn.style.display          = 'block';
  this.syncCrossPageBtn.style.display    = (this.ui.pages && this.ui.pages.length > 1) ? 'block' : 'none';
  this.syncCrossPageStatus.style.display = 'none';
  this.connectionsSection.style.display        = 'none';
  this.alsoInSection.style.display             = 'none';
  this.connectorEndpointsSection.style.display = 'none';
  this._updateTagsField(null);
  this._switchTab('properties');
};

/**
 * Connector (edge) state — ID, Name and Description editable (all optional),
 * Level/Parent/Node fields hidden. Shows the two connected shapes as
 * clickable links, a warning when the connector would not be exported, and
 * the Ignore button.
 */
PropertiesPanel.prototype.setEdge = function(cell) {
  var sp = this.shapeProps;
  this.currentCell = cell;

  this.levelRow.style.display  = 'none';
  this._updateNodeOnlyRows(null);
  this.parentRow.style.display = 'none';

  this.fields[sp.PROP_ID].value          = sp.getProperty(cell, sp.PROP_ID)          || '';
  this.fields[sp.PROP_NAME].value        = sp.getProperty(cell, sp.PROP_NAME)        || '';
  this.fields[sp.PROP_DESCRIPTION].value = sp.getProperty(cell, sp.PROP_DESCRIPTION) || '';
  this.fields[sp.PROP_LEVEL].value       = '';
  this._showIdError(null);

  this._setFieldsDisabled(false);
  this.fields[sp.PROP_LEVEL].disabled        = true;
  this.fields[sp.PROP_LEVEL].style.background = '#f0f0f0';
  this._setNodeFieldsDisabled(true);

  this.unignoreBtn.style.display        = 'none';
  this.ignoreConnectorBtn.style.display = 'block';
  this.adoptBtn.style.display           = 'none';
  this.syncToAllBtn.style.display       = 'none';
  this.syncCrossPageBtn.style.display   = 'none';
  this.reportBtn.style.display          = 'none';
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
  this._updateNodeOnlyRows(null);
  this.parentRow.style.display = 'none';

  this.unignoreBtn.textContent        = 'Un-ignore this connector';
  this.unignoreBtn.style.display      = 'block';
  this.ignoreConnectorBtn.style.display = 'none';
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
  this.parentSelect.disabled = disabled;
  this.parentSelect.style.background = disabled ? '#f0f0f0' : '#fff';
  this._setNodeFieldsDisabled(disabled);
};

PropertiesPanel.prototype._clearFields = function() {
  var fields = this.fields;
  Object.keys(fields).forEach(function(key) {
    fields[key].value = '';
  });
  // clear() does not read the technology registry (safe during start-up).
  this.technologyField.clear();
  this.provisioningField.clear();
  this._showIdError(null);
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

/** Current values of every property a sync may write (for the diff). */
function _readSyncKeys(sp, cell) {
  var out = {};
  [sp.PROP_ID, sp.PROP_NAME, sp.PROP_LEVEL, sp.PROP_DESCRIPTION,
   sp.PROP_TECHNOLOGY, sp.PROP_PROVISIONING, sp.PROP_PARENT].forEach(function(key) {
    var v = sp.getProperty(cell, key);
    if (v) out[key] = v;
  });
  return out;
}

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

// ---------------------------------------------------------------------------
// Pause / resume toggle
// ---------------------------------------------------------------------------

PropertiesPanel.prototype.isActive = function() {
  return this._active;
};

PropertiesPanel.prototype._buildToggleButton = function(container) {
  var self = this;
  var btn = document.createElement('button');
  btn.style.cssText = [
    'padding:2px 7px',
    'border:none',
    'border-radius:3px',
    'font-size:10px',
    'font-weight:bold',
    'cursor:pointer',
    'flex-shrink:0',
  ].join(';');
  btn.addEventListener('click', function() { self._setActive(!self._active); });
  container.appendChild(btn);
  this._toggleBtn = btn;
  this._updateToggleBtn();
};

PropertiesPanel.prototype._setActive = function(bool) {
  this._active = bool;
  localStorage.setItem('drawio-pp-active', bool ? 'true' : 'false');
  this._updateToggleBtn();
  this.setEmpty();
};

PropertiesPanel.prototype._updateToggleBtn = function() {
  if (!this._toggleBtn) return;
  if (this._active) {
    this._toggleBtn.textContent = '⏸ Pause';
    this._toggleBtn.style.background = '#bbb';
    this._toggleBtn.style.color = '#fff';
    this._toggleBtn.title = 'Pause the plugin — shapes can be moved without being prompted for properties';
  } else {
    this._toggleBtn.textContent = '▶ Resume';
    this._toggleBtn.style.background = '#e65100';
    this._toggleBtn.style.color = '#fff';
    this._toggleBtn.title = 'Resume the plugin — shape selection will trigger property checks again';
  }
};

module.exports = PropertiesPanel;
