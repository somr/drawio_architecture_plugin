'use strict';

/**
 * ValidationReportDialog (specs §10.7)
 *
 * Modal list of model findings grouped by severity (errors first). Clicking a
 * row closes the dialog, switches to the finding's page and selects the
 * shape or connector.
 *
 * show({
 *   title:    string,
 *   findings: [{severity, code, message, refs: [{page, pageName, cell}]}],
 *   buttons:  [{label, primary?, onClick?}]   // every button closes the dialog
 * })
 */
function ValidationReportDialog(ui) {
  this.ui = ui;
}

var GROUPS = [
  { severity: 'error',    title: 'Errors',     color: '#c62828' },
  { severity: 'warning',  title: 'Warnings',   color: '#ef6c00' },
  { severity: 'advisory', title: 'Advisories', color: '#1565c0' },
];

ValidationReportDialog.prototype.show = function(opts) {
  var self = this;

  var overlay = document.createElement('div');
  overlay.style.cssText = [
    'position:fixed', 'top:0', 'left:0', 'width:100%', 'height:100%',
    'background:rgba(0,0,0,0.4)', 'z-index:9999',
    'display:flex', 'align-items:center', 'justify-content:center',
  ].join(';');

  var dialog = document.createElement('div');
  dialog.style.cssText = [
    'background:#fff', 'border-radius:6px', 'box-shadow:0 4px 20px rgba(0,0,0,0.3)',
    'padding:20px', 'width:560px', 'max-width:92vw', 'max-height:85vh',
    'display:flex', 'flex-direction:column',
    'font-family:Arial,sans-serif', 'font-size:13px',
  ].join(';');

  var title = document.createElement('h3');
  title.textContent = opts.title;
  title.style.cssText = 'margin:0 0 10px;font-size:15px;color:#333;';
  dialog.appendChild(title);

  var findings = opts.findings || [];
  var counts = GROUPS.map(function(g) {
    return findings.filter(function(f) { return f.severity === g.severity; }).length;
  });

  var summary = document.createElement('div');
  summary.style.cssText = 'margin:0 0 10px;color:#555;font-size:12px;';
  summary.textContent = findings.length === 0
    ? 'No problems found.'
    : GROUPS.map(function(g, i) { return counts[i] + ' ' + g.title.toLowerCase(); }).join(' · ') +
      ' — click a line to go to the shape.';
  dialog.appendChild(summary);

  var list = document.createElement('div');
  list.style.cssText = 'overflow-y:auto;flex:1;min-height:0;border-top:1px solid #eee;';
  if (findings.length === 0) list.style.display = 'none';

  GROUPS.forEach(function(g, gi) {
    if (counts[gi] === 0) return;
    var heading = document.createElement('div');
    heading.textContent = g.title + ' (' + counts[gi] + ')';
    heading.style.cssText = 'font-weight:bold;color:' + g.color + ';margin:10px 0 4px;font-size:12px;';
    list.appendChild(heading);

    findings.filter(function(f) { return f.severity === g.severity; }).forEach(function(f) {
      var row = document.createElement('div');
      row.style.cssText = 'padding:4px 6px;border-bottom:1px solid #f0f0f0;font-size:12px;line-height:1.35;';

      var code = document.createElement('span');
      code.textContent = f.code + '  ';
      code.style.cssText = 'font-family:monospace;font-weight:bold;color:' + g.color + ';';
      row.appendChild(code);

      var msg = document.createElement('span');
      msg.textContent = f.message;
      msg.style.color = '#333';
      row.appendChild(msg);

      var pages = [];
      f.refs.forEach(function(r) { if (pages.indexOf(r.pageName) === -1) pages.push(r.pageName); });
      if (pages.length) {
        var where = document.createElement('span');
        where.textContent = '  · ' + pages.join(', ');
        where.style.cssText = 'color:#999;font-size:11px;';
        row.appendChild(where);
      }

      var target = f.refs[0];
      if (target && target.cell) {
        row.style.cursor = 'pointer';
        row.title = 'Go to ' + target.pageName;
        row.addEventListener('mouseenter', function() { row.style.background = '#f5f9ff'; });
        row.addEventListener('mouseleave', function() { row.style.background = ''; });
        row.addEventListener('click', function() {
          close();
          self._navigate(target);
        });
      }
      list.appendChild(row);
    });
  });
  dialog.appendChild(list);

  var buttonRow = document.createElement('div');
  buttonRow.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-top:14px;';
  (opts.buttons || [{ label: 'Close', primary: true }]).forEach(function(b) {
    var btn = document.createElement('button');
    btn.textContent = b.label;
    btn.style.cssText = [
      'padding:7px 18px', 'border:none', 'border-radius:4px', 'cursor:pointer',
      'font-size:13px', 'font-weight:bold',
      'background:' + (b.primary ? '#1976d2' : '#f5f5f5'),
      'color:' + (b.primary ? '#fff' : '#333'),
    ].join(';');
    btn.addEventListener('click', function() {
      close();
      if (typeof b.onClick === 'function') b.onClick();
    });
    buttonRow.appendChild(btn);
  });
  dialog.appendChild(buttonRow);

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  function close() {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }
};

/** Switches to the finding's page and selects its cell, like "Also in…". */
ValidationReportDialog.prototype._navigate = function(target) {
  var ui = this.ui;
  if (target.page && target.page !== ui.currentPage) ui.selectPage(target.page, true);
  setTimeout(function() {
    var graph = ui.editor.graph;
    if (!graph.model.contains(target.cell)) return;
    graph.setSelectionCell(target.cell);
    graph.scrollCellToVisible(target.cell, true);
  }, 50);
};

module.exports = ValidationReportDialog;
