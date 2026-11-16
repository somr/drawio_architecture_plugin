'use strict';

var fillLevelSelect = require('./LevelSelect');
var NodeFields      = require('./NodeFields');

/**
 * PropertiesDialog
 *
 * Modal popup that appears when a selected shape is missing a required
 * property — Name, ID or Level (specs §6). Never shown for connectors.
 *
 * Fields: Name, ID, Level, Description, and Technology / Provisioning when
 * Level is Node. Required fields that already have a value are disabled;
 * Description is editable while empty. The ID is suggested from the Name
 * (or taken from a matching shape on another page) and validated live.
 *
 * Buttons:
 *   Save   — writes entered values to the shape and calls onSave().
 *   Ignore — marks the shape with properties_ignored=true and calls onIgnore().
 */
function PropertiesDialog(ui, shapeProps) {
  this.ui = ui;
  this.shapeProps = shapeProps;
}

var _INPUT_STYLE = [
  'width:100%',
  'box-sizing:border-box',
  'padding:6px 8px',
  'border:1px solid #ccc',
  'border-radius:4px',
  'font-size:13px',
].join(';');

PropertiesDialog.prototype.show = function(cell, onSave, onIgnore, crossPageMatches) {
  var ui = this.ui;
  var sp = this.shapeProps;
  var graph = ui.editor.graph;

  var missing = sp.getMissingProperties(cell);
  function isMissing(key) { return missing.indexOf(key) !== -1; }

  // ---------------------------------------------------------------------------
  // Overlay + dialog box
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

  var dialog = document.createElement('div');
  dialog.style.cssText = [
    'background:#fff',
    'border-radius:6px',
    'box-shadow:0 4px 20px rgba(0,0,0,0.3)',
    'padding:20px',
    'min-width:320px',
    'max-width:400px',
    'max-height:90vh',
    'overflow-y:auto',
    'font-family:Arial,sans-serif',
    'font-size:13px',
  ].join(';');

  var title = document.createElement('h3');
  title.textContent = 'Shape Properties Required';
  title.style.cssText = 'margin:0 0 12px;font-size:15px;color:#333;';
  dialog.appendChild(title);

  var subtitle = document.createElement('p');
  subtitle.textContent = 'This shape is missing required properties. Please fill them in.';
  subtitle.style.cssText = 'margin:0 0 14px;color:#666;font-size:12px;';
  dialog.appendChild(subtitle);

  // ---------------------------------------------------------------------------
  // Fields
  // ---------------------------------------------------------------------------
  var firstFieldRow = null;
  var nodeOnlyRows = [];

  function addRow(labelText, control) {
    var row = document.createElement('div');
    row.style.marginBottom = '10px';
    var label = document.createElement('label');
    label.textContent = labelText;
    label.style.cssText = 'display:block;font-weight:bold;margin-bottom:3px;color:#444;';
    row.appendChild(label);
    row.appendChild(control);
    dialog.appendChild(row);
    if (!firstFieldRow) firstFieldRow = row;
    return row;
  }

  function disable(input) {
    input.disabled = true;
    input.style.background = '#f5f5f5';
  }

  // Name
  var nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.style.cssText = _INPUT_STYLE;
  nameInput.value = sp.getProperty(cell, sp.PROP_NAME) || '';
  if (!isMissing(sp.PROP_NAME)) disable(nameInput);
  addRow('Name', nameInput);

  // ID — suggestion follows the Name until the user edits the ID directly.
  var idInput = document.createElement('input');
  idInput.type = 'text';
  idInput.style.cssText = _INPUT_STYLE;
  idInput.value = sp.getProperty(cell, sp.PROP_ID) || '';
  var idRow = addRow('ID', idInput);
  var idMessage = document.createElement('div');
  idMessage.style.cssText = 'font-size:11px;margin-top:3px;display:none;';
  idRow.appendChild(idMessage);

  var idEditable = isMissing(sp.PROP_ID);
  var idTouched  = false;
  if (!idEditable) disable(idInput);

  // Level
  var levelInput = document.createElement('select');
  levelInput.style.cssText = _INPUT_STYLE;
  fillLevelSelect(levelInput, sp);
  levelInput.value = sp.getProperty(cell, sp.PROP_LEVEL) || '';
  if (!isMissing(sp.PROP_LEVEL)) disable(levelInput);
  addRow('Level', levelInput);

  // Description — optional; editable while empty.
  var descInput = document.createElement('textarea');
  descInput.rows = 3;
  descInput.style.cssText = _INPUT_STYLE + ';resize:vertical;';
  descInput.value = sp.getProperty(cell, sp.PROP_DESCRIPTION) || '';
  if (descInput.value) disable(descInput);
  addRow('Description', descInput);

  // Node-only fields — always editable, saved only when Level is Node.
  var nodeOpts = { inputStyle: _INPUT_STYLE, enabledBg: '#fff', disabledBg: '#f5f5f5' };
  var techField = new NodeFields.TechnologyField(nodeOpts);
  var provField = new NodeFields.ProvisioningField(
    Object.assign({ values: sp.PROVISIONING_VALUES }, nodeOpts));
  techField.setValue(sp.getProperty(cell, sp.PROP_TECHNOLOGY));
  provField.setValue(sp.getProperty(cell, sp.PROP_PROVISIONING));
  nodeOnlyRows.push(addRow('Technology', techField.element));
  nodeOnlyRows.push(addRow('Provisioning', provField.element));

  function updateNodeOnlyRows() {
    var show = levelInput.value === sp.NODE_LEVEL;
    nodeOnlyRows.forEach(function(row) { row.style.display = show ? '' : 'none'; });
  }
  levelInput.addEventListener('change', updateNodeOnlyRows);
  updateNodeOnlyRows();

  // ---------------------------------------------------------------------------
  // Buttons (built early so ID validation can enable / disable Save)
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

  function setSaveEnabled(enabled) {
    saveBtn.disabled = !enabled;
    saveBtn.style.opacity = enabled ? '1' : '0.5';
    saveBtn.style.cursor  = enabled ? 'pointer' : 'default';
  }

  // ---------------------------------------------------------------------------
  // ID validation (specs §6.2)
  // ---------------------------------------------------------------------------
  function validateIdField() {
    if (!idEditable) { setSaveEnabled(true); return; }
    var id = idInput.value.trim();
    var error = sp.validateId(graph, cell, id);
    if (error) {
      idMessage.textContent = error;
      idMessage.style.color = '#cc0000';
      idMessage.style.display = 'block';
      setSaveEnabled(false);
      return;
    }
    var elsewhere = sp.findOtherPagesWithId(ui, cell, id);
    if (elsewhere.length > 0) {
      var names = [];
      elsewhere.forEach(function(m) { if (names.indexOf(m.pageName) === -1) names.push(m.pageName); });
      idMessage.textContent = 'Same element as on: ' + names.join(', ');
      idMessage.style.color = '#777';
      idMessage.style.display = 'block';
    } else {
      idMessage.style.display = 'none';
    }
    setSaveEnabled(true);
  }

  function suggestFromName() {
    if (!idEditable || idTouched) return;
    idInput.value = sp.suggestId(ui, cell, nameInput.value);
    validateIdField();
  }

  if (idEditable) {
    idInput.addEventListener('input', function() { idTouched = true; validateIdField(); });
    nameInput.addEventListener('input', suggestFromName);
    suggestFromName();
  }

  // ---------------------------------------------------------------------------
  // Pre-fill banner — copies properties from a matching shape on another page
  // (specs §17.2). A complete source has ID, Name and Level.
  // ---------------------------------------------------------------------------
  var completeSources = (crossPageMatches || []).filter(function(m) {
    return sp.isCompleteSource(m.cell);
  });

  if (completeSources.length > 0 && firstFieldRow) {
    var applyPreFill = function(sourceCell) {
      if (!nameInput.disabled)  nameInput.value  = sp.getProperty(sourceCell, sp.PROP_NAME);
      if (!levelInput.disabled) levelInput.value = sp.getProperty(sourceCell, sp.PROP_LEVEL);
      if (idEditable) {
        // The copy's ID makes this shape the same element.
        idInput.value = sp.getProperty(sourceCell, sp.PROP_ID);
        idTouched = true;
      }
      var srcDesc = sp.getProperty(sourceCell, sp.PROP_DESCRIPTION);
      if (!descInput.disabled && srcDesc) descInput.value = srcDesc;
      // Node-only fields are filled only where the shape has no value yet.
      if (sp.getProperty(sourceCell, sp.PROP_LEVEL) === sp.NODE_LEVEL) {
        var tech = sp.getProperty(sourceCell, sp.PROP_TECHNOLOGY);
        var prov = sp.getProperty(sourceCell, sp.PROP_PROVISIONING);
        if (tech && !sp.getProperty(cell, sp.PROP_TECHNOLOGY))   techField.setValue(tech);
        if (prov && !sp.getProperty(cell, sp.PROP_PROVISIONING)) provField.setValue(prov);
      }
      updateNodeOnlyRows();
      validateIdField();
    };

    applyPreFill(completeSources[0].cell);

    var banner = document.createElement('div');
    banner.style.cssText = [
      'background:#e3f2fd',
      'border:1px solid #90caf9',
      'border-radius:4px',
      'padding:7px 10px',
      'margin-bottom:12px',
      'font-size:11px',
      'color:#1565c0',
      'display:flex',
      'align-items:center',
      'flex-wrap:wrap',
      'gap:4px',
    ].join(';');

    var bannerLabel = document.createElement('span');
    bannerLabel.textContent = 'Pre-filled from:';
    banner.appendChild(bannerLabel);

    if (completeSources.length === 1) {
      var strong = document.createElement('strong');
      strong.textContent = ' ' + completeSources[0].pageName;
      banner.appendChild(strong);
    } else {
      var srcSel = document.createElement('select');
      srcSel.style.cssText = 'font-size:11px;border:1px solid #90caf9;border-radius:3px;padding:1px 4px;color:#1565c0;margin-left:4px;';
      completeSources.forEach(function(m) {
        var opt = document.createElement('option');
        opt.textContent = m.pageName;
        srcSel.appendChild(opt);
      });
      srcSel.addEventListener('change', function() {
        applyPreFill(completeSources[srcSel.selectedIndex].cell);
      });
      banner.appendChild(srcSel);
    }

    dialog.insertBefore(banner, firstFieldRow);
  }

  validateIdField();

  dialog.appendChild(buttonRow);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  // Focus the first missing field.
  var focusOrder = [
    { key: sp.PROP_NAME,  input: nameInput },
    { key: sp.PROP_ID,    input: idInput },
    { key: sp.PROP_LEVEL, input: levelInput },
  ];
  for (var i = 0; i < focusOrder.length; i++) {
    if (isMissing(focusOrder[i].key)) {
      var target = focusOrder[i].input;
      setTimeout(function() { target.focus(); }, 50);
      break;
    }
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  function close() {
    document.body.removeChild(overlay);
  }

  saveBtn.addEventListener('click', function() {
    if (saveBtn.disabled) return;
    var props = {};
    function put(key, input) {
      if (input.disabled) return;
      var val = input.value.trim();
      if (val) props[key] = val;
    }
    put(sp.PROP_NAME,        nameInput);
    put(sp.PROP_ID,          idInput);
    put(sp.PROP_LEVEL,       levelInput);
    put(sp.PROP_DESCRIPTION, descInput);
    if (levelInput.value === sp.NODE_LEVEL) {
      if (techField.getValue()) props[sp.PROP_TECHNOLOGY]   = techField.getValue();
      if (provField.getValue()) props[sp.PROP_PROVISIONING] = provField.getValue();
    }
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
