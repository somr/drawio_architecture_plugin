'use strict';

/**
 * PropertiesDialog
 *
 * Modal popup that appears when a selected shape is missing one or more of the
 * required properties (Name, Level, Description).
 *
 * Buttons:
 *   Save   — writes entered values to the shape and calls onSave().
 *   Ignore — marks the shape with properties_ignored=true and calls onIgnore().
 */
function PropertiesDialog(ui, shapeProps) {
  this.ui = ui;
  this.shapeProps = shapeProps;
}

PropertiesDialog.prototype.show = function(cell, onSave, onIgnore) {
  var self = this;
  var sp = this.shapeProps;
  var graph = this.ui.editor.graph;

  var isEdge = graph.model.isEdge(cell);

  var missing = isEdge
    ? sp.getMissingConnectorProperties(cell)
    : sp.getMissingProperties(cell);

  // Build field map: propKey -> { label, input }
  var fieldDefs = isEdge
    ? [
        { key: sp.PROP_NAME,        label: 'Name',        type: 'text'     },
        { key: sp.PROP_DESCRIPTION, label: 'Description', type: 'textarea' },
      ]
    : [
        { key: sp.PROP_NAME,        label: 'Name',        type: 'text'     },
        { key: sp.PROP_LEVEL,       label: 'Level',       type: 'select'   },
        { key: sp.PROP_DESCRIPTION, label: 'Description', type: 'textarea' },
      ];

  // ---------------------------------------------------------------------------
  // Overlay
  // ---------------------------------------------------------------------------
  var overlay = document.createElement('div');
  overlay.style.cssText = [
    'position:fixed',
    'top:0',
    'left:0',
    'width:100%',
    'height:100%',
    'background:rgba(0,0,0,0.4)',
    'z-index:9999',
    'display:flex',
    'align-items:center',
    'justify-content:center',
  ].join(';');

  // ---------------------------------------------------------------------------
  // Dialog box
  // ---------------------------------------------------------------------------
  var dialog = document.createElement('div');
  dialog.style.cssText = [
    'background:#fff',
    'border-radius:6px',
    'box-shadow:0 4px 20px rgba(0,0,0,0.3)',
    'padding:20px',
    'min-width:320px',
    'max-width:400px',
    'font-family:Arial,sans-serif',
    'font-size:13px',
  ].join(';');

  var title = document.createElement('h3');
  title.textContent = isEdge ? 'Connector Properties Required' : 'Shape Properties Required';
  title.style.cssText = 'margin:0 0 12px;font-size:15px;color:#333;';
  dialog.appendChild(title);

  var subtitle = document.createElement('p');
  subtitle.textContent = isEdge
    ? 'This connector is missing required properties. Please fill them in.'
    : 'This shape is missing required properties. Please fill them in.';
  subtitle.style.cssText = 'margin:0 0 14px;color:#666;font-size:12px;';
  dialog.appendChild(subtitle);

  // ---------------------------------------------------------------------------
  // Fields
  // ---------------------------------------------------------------------------
  var inputs = {};

  fieldDefs.forEach(function(def) {
    var row = document.createElement('div');
    row.style.marginBottom = '10px';

    var label = document.createElement('label');
    label.textContent = def.label;
    label.style.cssText = 'display:block;font-weight:bold;margin-bottom:3px;color:#444;';

    var inputStyle = [
      'width:100%',
      'box-sizing:border-box',
      'padding:6px 8px',
      'border:1px solid #ccc',
      'border-radius:4px',
      'font-size:13px',
    ].join(';');

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
    } else if (def.type === 'textarea') {
      input = document.createElement('textarea');
      input.rows = 3;
      input.style.cssText = inputStyle;
      input.style.resize = 'vertical';
    } else {
      input = document.createElement('input');
      input.type = 'text';
      input.style.cssText = inputStyle;
    }

    // Pre-fill if value already exists on the shape
    var existing = sp.getProperty(cell, def.key);
    if (existing) {
      input.value = existing;
    }

    // Disable fields that already have values and are not in missing list
    var isMissing = missing.indexOf(def.key) !== -1;
    if (!isMissing) {
      input.disabled = true;
      input.style.background = '#f5f5f5';
    }

    row.appendChild(label);
    row.appendChild(input);
    dialog.appendChild(row);
    inputs[def.key] = input;
  });

  // ---------------------------------------------------------------------------
  // Button row
  // ---------------------------------------------------------------------------
  var buttonRow = document.createElement('div');
  buttonRow.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-top:16px;';

  var ignoreBtn = document.createElement('button');
  ignoreBtn.textContent = 'Ignore';
  ignoreBtn.style.cssText = _buttonStyle('#f5f5f5', '#333');

  var saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save';
  saveBtn.style.cssText = _buttonStyle('#1976d2', '#fff');

  buttonRow.appendChild(ignoreBtn);
  buttonRow.appendChild(saveBtn);
  dialog.appendChild(buttonRow);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  // Focus first missing field
  var firstMissingInput = inputs[missing[0]];
  if (firstMissingInput) {
    setTimeout(function() { firstMissingInput.focus(); }, 50);
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  function close() {
    document.body.removeChild(overlay);
  }

  saveBtn.addEventListener('click', function() {
    var props = {};
    fieldDefs.forEach(function(def) {
      var val = inputs[def.key].value.trim();
      if (val) {
        props[def.key] = val;
      }
    });
    sp.setProperties(graph, cell, props);
    close();
    if (typeof onSave === 'function') onSave();
  });

  ignoreBtn.addEventListener('click', function() {
    sp.setProperty(graph, cell, sp.PROP_IGNORED, 'true');
    close();
    if (typeof onIgnore === 'function') onIgnore();
  });
};

function _buttonStyle(bg, color) {
  return [
    'padding:7px 18px',
    'border:none',
    'border-radius:4px',
    'cursor:pointer',
    'font-size:13px',
    'font-weight:bold',
    'background:' + bg,
    'color:' + color,
  ].join(';');
}

module.exports = PropertiesDialog;
