'use strict';

/**
 * SyncPreviewDialog
 *
 * Modal that previews cross-page property sync operations before they are applied.
 * Accepts a flat list of sync items; the user checks/unchecks individual rows.
 *
 * Each item: { cell, page, pageName, label, sourceProps, currentProps }
 *   sourceProps / currentProps: { prop_name, prop_level, prop_description }
 *
 * Clicking Confirm calls onConfirm(selectedItems) BEFORE the overlay is removed
 * so that any page-switching inside onConfirm stays hidden behind the overlay.
 */
function SyncPreviewDialog(ui, shapeProps) {
  this.ui = ui;
  this.shapeProps = shapeProps;
}

SyncPreviewDialog.prototype.show = function(items, onConfirm) {
  if (!items || items.length === 0) return;

  var overlay = document.createElement('div');
  overlay.style.cssText = [
    'position:fixed',
    'top:0',
    'left:0',
    'width:100%',
    'height:100%',
    'background:rgba(0,0,0,0.45)',
    'z-index:9999',
    'display:flex',
    'align-items:center',
    'justify-content:center',
  ].join(';');

  var dialog = document.createElement('div');
  dialog.style.cssText = [
    'background:#fff',
    'border-radius:6px',
    'box-shadow:0 4px 24px rgba(0,0,0,0.3)',
    'padding:20px',
    'min-width:360px',
    'max-width:500px',
    'max-height:80vh',
    'display:flex',
    'flex-direction:column',
    'font-family:Arial,sans-serif',
    'font-size:13px',
  ].join(';');

  var title = document.createElement('h3');
  title.textContent = 'Sync Properties to Other Pages';
  title.style.cssText = 'margin:0 0 8px;font-size:15px;color:#333;';
  dialog.appendChild(title);

  var subtitle = document.createElement('p');
  subtitle.textContent = 'Select the pages that should receive the properties from the current shape.';
  subtitle.style.cssText = 'margin:0 0 14px;color:#666;font-size:12px;';
  dialog.appendChild(subtitle);

  // Scrollable list
  var listWrap = document.createElement('div');
  listWrap.style.cssText = [
    'overflow-y:auto',
    'max-height:300px',
    'border:1px solid #ddd',
    'border-radius:4px',
    'margin-bottom:14px',
  ].join(';');

  var checkboxes = [];

  items.forEach(function(item, idx) {
    var row = document.createElement('div');
    row.style.cssText = [
      'display:flex',
      'align-items:flex-start',
      'gap:8px',
      'padding:8px 10px',
      idx % 2 === 0 ? 'background:#fafafa' : 'background:#fff',
    ].join(';');

    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = true;
    cb.style.cssText = 'margin-top:2px;flex-shrink:0;cursor:pointer;';
    checkboxes.push(cb);

    var info = document.createElement('div');
    info.style.cssText = 'flex:1;min-width:0;';

    var pageSpan = document.createElement('div');
    pageSpan.textContent = item.pageName;
    pageSpan.style.cssText = 'font-weight:bold;color:#333;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    info.appendChild(pageSpan);

    var labelSpan = document.createElement('div');
    labelSpan.textContent = item.label;
    labelSpan.style.cssText = 'font-size:11px;color:#666;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px;';
    info.appendChild(labelSpan);

    var diff = _describeDiff(item.currentProps, item.sourceProps);
    if (diff) {
      var diffSpan = document.createElement('div');
      diffSpan.textContent = diff;
      diffSpan.style.cssText = 'font-size:11px;color:#999;margin-top:2px;font-style:italic;';
      info.appendChild(diffSpan);
    }

    row.appendChild(cb);
    row.appendChild(info);
    listWrap.appendChild(row);
  });

  dialog.appendChild(listWrap);

  // Select-all row
  var selectAllRow = document.createElement('div');
  selectAllRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:14px;font-size:12px;color:#555;';

  var selectAllCb = document.createElement('input');
  selectAllCb.type = 'checkbox';
  selectAllCb.checked = true;
  selectAllRow.appendChild(selectAllCb);

  var selectAllLabel = document.createElement('span');
  selectAllLabel.textContent = 'Select all';
  selectAllRow.appendChild(selectAllLabel);

  selectAllCb.addEventListener('change', function() {
    checkboxes.forEach(function(cb) { cb.checked = selectAllCb.checked; });
  });

  dialog.insertBefore(selectAllRow, listWrap);

  // Button row
  var btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;';

  var cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.cssText = _btnStyle('#f5f5f5', '#333');

  var confirmBtn = document.createElement('button');
  confirmBtn.textContent = 'Confirm';
  confirmBtn.style.cssText = _btnStyle('#1976d2', '#fff');

  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(confirmBtn);
  dialog.appendChild(btnRow);

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  function close() {
    document.body.removeChild(overlay);
  }

  cancelBtn.addEventListener('click', close);

  confirmBtn.addEventListener('click', function() {
    var selected = items.filter(function(_, i) { return checkboxes[i].checked; });
    if (typeof onConfirm === 'function') onConfirm(selected);
    close();
  });
};

function _describeDiff(current, source) {
  if (!current) return null;
  var parts = [];
  if (!current.prop_name && source.prop_name)        parts.push('adds Name');
  if (!current.prop_level && source.prop_level)      parts.push('adds Level');
  if (!current.prop_description && source.prop_description) parts.push('adds Description');
  if (current.prop_name && source.prop_name && current.prop_name !== source.prop_name)
    parts.push('updates Name');
  if (current.prop_level && source.prop_level && current.prop_level !== source.prop_level)
    parts.push('updates Level');
  if (current.prop_description && source.prop_description && current.prop_description !== source.prop_description)
    parts.push('updates Description');
  return parts.length ? parts.join(', ') : null;
}

function _btnStyle(bg, color) {
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

module.exports = SyncPreviewDialog;
