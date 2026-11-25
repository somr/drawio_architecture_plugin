'use strict';

var ShapeSearch = require('./ShapeSearch');

var MAX_RESULTS   = 50;
var DEBOUNCE_MS   = 120;
var FLASH_COLOR   = '#FF6600';
var FLASH_MS      = 1500;

var ROW_STYLE = [
  'padding:5px 7px',
  'border-bottom:1px solid #eee',
  'cursor:pointer',
  'line-height:1.35',
].join(';');

/**
 * SearchPane — the panel's Find tab (specs §5.8).
 *
 * Searches the page on screen by ID, Name and label as the user types.
 *   ↑ / ↓   preview: scroll to the shape and flash it (selection unchanged)
 *   Enter   select the highlighted result (first one by default)
 *   click   select that result
 *   Esc     clear the search
 * Selecting a result goes through the normal selection flow, so the
 * Properties tab (or the missing-properties popup) shows that shape.
 * Shapes in a hidden layer or a collapsed group are revealed on select.
 */
function SearchPane(ui, shapeProps) {
  this.ui = ui;
  this.shapeProps = shapeProps;

  this.input     = null;
  this.statusEl  = null;
  this.listEl    = null;
  this.noteEl    = null;

  this._results  = [];
  this._rows     = [];
  this._active   = -1;
  this._visible  = false;
  this._timer    = null;
}

SearchPane.prototype.build = function(pane) {
  var self = this;

  var wrap = document.createElement('div');
  wrap.style.cssText = 'position:relative;margin-bottom:6px;';

  var input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Name or ID…';
  input.setAttribute('aria-label', 'Find a shape on this page by name or ID');
  input.style.cssText = [
    'width:100%',
    'box-sizing:border-box',
    'padding:6px 24px 6px 7px',
    'border:1px solid #ccc',
    'border-radius:3px',
    'font-size:12px',
    'background:#fff',
  ].join(';');
  wrap.appendChild(input);

  var clearBtn = document.createElement('span');
  clearBtn.textContent = '×';
  clearBtn.title = 'Clear (Esc)';
  clearBtn.style.cssText = [
    'position:absolute',
    'right:7px',
    'top:50%',
    'transform:translateY(-50%)',
    'cursor:pointer',
    'color:#999',
    'font-size:15px',
    'display:none',
    'user-select:none',
  ].join(';');
  clearBtn.addEventListener('click', function() {
    self._clear();
    input.focus();
  });
  wrap.appendChild(clearBtn);
  this._clearBtn = clearBtn;

  pane.appendChild(wrap);

  var status = document.createElement('div');
  status.style.cssText = 'font-size:11px;color:#888;margin:0 0 6px 1px;';
  pane.appendChild(status);

  var list = document.createElement('div');
  list.setAttribute('role', 'listbox');
  list.style.cssText = 'border:1px solid #e3e3e3;border-radius:3px;background:#fff;display:none;';
  pane.appendChild(list);

  var note = document.createElement('div');
  note.style.cssText = 'font-size:11px;color:#b26a00;margin-top:6px;display:none;';
  pane.appendChild(note);

  var help = document.createElement('div');
  help.textContent = '↑ ↓ preview · Enter select · Esc clear';
  help.style.cssText = 'font-size:10px;color:#aaa;margin-top:8px;';
  pane.appendChild(help);

  input.addEventListener('input', function() {
    self._clearBtn.style.display = input.value ? '' : 'none';
    self._setNote(null);
    self._schedule();
  });
  input.addEventListener('keydown', function(evt) { self._onKeyDown(evt); });

  this.input    = input;
  this.statusEl = status;
  this.listEl   = list;
  this.noteEl   = note;

  // Keep results in step with edits, deletions and page switches.
  this.ui.editor.graph.model.addListener(mxEvent.CHANGE, function() {
    if (self._visible) self._schedule();
  });

  this._render();
};

/** Called when the Find tab is shown. */
SearchPane.prototype.onShow = function() {
  this._visible = true;
  this._setNote(null);
  this._run();
  var input = this.input;
  setTimeout(function() { input.focus(); input.select(); }, 0);
};

/** Called when another tab is shown. */
SearchPane.prototype.onHide = function() {
  this._visible = false;
  if (this._timer) { clearTimeout(this._timer); this._timer = null; }
};

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

SearchPane.prototype._schedule = function() {
  var self = this;
  if (this._timer) clearTimeout(this._timer);
  this._timer = setTimeout(function() { self._timer = null; self._run(); }, DEBOUNCE_MS);
};

SearchPane.prototype._run = function() {
  var graph = this.ui.editor.graph;
  var query = this.input ? this.input.value : '';
  var prevCell = (this._active >= 0 && this._results[this._active]) ? this._results[this._active].entry.cell : null;

  if (!ShapeSearch.normalizeQuery(query)) {
    this._results = [];
    this._total = 0;
  } else {
    var entries = ShapeSearch.collectEntries(graph.model.root, this.shapeProps);
    var all = ShapeSearch.search(entries, query);
    this._total = all.length;
    this._results = all.slice(0, MAX_RESULTS);
  }

  // Keep the keyboard position on the same shape when results refresh.
  this._active = -1;
  if (prevCell) {
    for (var i = 0; i < this._results.length; i++) {
      if (this._results[i].entry.cell === prevCell) { this._active = i; break; }
    }
  }
  this._render();
};

SearchPane.prototype._clear = function() {
  this.input.value = '';
  this._clearBtn.style.display = 'none';
  this._setNote(null);
  this._active = -1;
  this._run();
};

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

SearchPane.prototype._pageName = function() {
  var page = this.ui.currentPage;
  if (!page) return '';
  return page.getName ? page.getName() : (page.name || '');
};

SearchPane.prototype._render = function() {
  var self = this;
  var query = this.input ? ShapeSearch.normalizeQuery(this.input.value) : '';
  var pageName = this._pageName();
  var onPage = pageName ? ' on “' + pageName + '”' : ' on this page';

  this.listEl.innerHTML = '';
  this._rows = [];

  if (!query) {
    this.statusEl.textContent = 'Find a shape or connector' + onPage + ' by its name or ID.';
    this.listEl.style.display = 'none';
    return;
  }
  if (this._results.length === 0) {
    this.statusEl.textContent = 'No match' + onPage + '.';
    this.listEl.style.display = 'none';
    return;
  }

  var n = this._total;
  this.statusEl.textContent = n > this._results.length
    ? 'Showing ' + this._results.length + ' of ' + n + ' matches — type more to narrow down.'
    : n + (n === 1 ? ' match' : ' matches') + onPage + '.';

  this._results.forEach(function(result, index) {
    var row = self._buildRow(result, index);
    self.listEl.appendChild(row);
    self._rows.push(row);
  });
  this.listEl.style.display = '';
  this._paintActive();
};

/** Appends text to el, with [start, end) in bold. */
function _appendMarked(el, text, start, end) {
  if (start < 0 || end <= start || end > text.length) {
    el.appendChild(document.createTextNode(text));
    return;
  }
  if (start > 0) el.appendChild(document.createTextNode(text.substring(0, start)));
  var b = document.createElement('b');
  b.style.cssText = 'background:#fff3c4;font-weight:bold;';
  b.textContent = text.substring(start, end);
  el.appendChild(b);
  if (end < text.length) el.appendChild(document.createTextNode(text.substring(end)));
}

SearchPane.prototype._buildRow = function(result, index) {
  var self  = this;
  var entry = result.entry;
  var graph = this.ui.editor.graph;

  var row = document.createElement('div');
  row.setAttribute('role', 'option');
  row.style.cssText = ROW_STYLE + (entry.ignored ? ';opacity:0.55' : '');

  // Line 1: name (or label when there is no name).
  var title = document.createElement('div');
  title.style.cssText = 'font-size:12px;color:#222;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
  var shown = entry.name || entry.label;
  var titleIsMatch = result.field === 'name' || (result.field === 'label' && !entry.name);
  if (shown) {
    _appendMarked(title, shown, titleIsMatch ? result.start : -1, result.end);
  } else {
    title.style.fontStyle = 'italic';
    title.style.color = '#999';
    title.textContent = '(no name)';
  }
  title.title = shown || '';
  row.appendChild(title);

  // Line 2: ID · level / connector · badges.
  var meta = document.createElement('div');
  meta.style.cssText = 'font-size:10px;color:#888;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
  if (entry.id) {
    var idSpan = document.createElement('span');
    idSpan.style.fontFamily = 'monospace';
    _appendMarked(idSpan, entry.id, result.field === 'id' ? result.start : -1, result.end);
    meta.appendChild(idSpan);
  } else {
    meta.appendChild(document.createTextNode('no ID'));
  }
  var parts = [];
  if (entry.isEdge) parts.push('Connector');
  else if (entry.level) parts.push(entry.level);
  if (entry.ignored) parts.push('ignored');
  var hidden = _hiddenReason(graph.model, entry.cell);
  if (hidden) parts.push(hidden);
  else if (graph.isCellLocked && graph.isCellLocked(entry.cell)) parts.push('locked');
  if (parts.length) meta.appendChild(document.createTextNode(' · ' + parts.join(' · ')));
  row.appendChild(meta);

  // Line 3 (only when the match is in a label that differs from the name).
  if (result.field === 'label' && entry.name) {
    var lbl = document.createElement('div');
    lbl.style.cssText = 'font-size:10px;color:#999;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    lbl.appendChild(document.createTextNode('label: '));
    _appendMarked(lbl, entry.label, result.start, result.end);
    row.appendChild(lbl);
  }

  row.addEventListener('mouseenter', function() {
    if (self._active !== index) row.style.background = '#f3f7fc';
  });
  row.addEventListener('mouseleave', function() { self._paintActive(); });
  row.addEventListener('click', function() {
    self._active = index;
    self._paintActive();
    self._go(result, true);
  });
  return row;
};

SearchPane.prototype._paintActive = function() {
  var self = this;
  this._rows.forEach(function(row, i) {
    var on = (i === self._active);
    row.style.background = on ? '#e3effb' : '';
    row.style.boxShadow  = on ? 'inset 3px 0 0 #1976d2' : '';
    row.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  var activeRow = this._rows[this._active];
  if (activeRow && activeRow.scrollIntoView) activeRow.scrollIntoView({ block: 'nearest' });
};

SearchPane.prototype._setNote = function(text) {
  this.noteEl.textContent = text || '';
  this.noteEl.style.display = text ? '' : 'none';
};

// ---------------------------------------------------------------------------
// Keyboard
// ---------------------------------------------------------------------------

SearchPane.prototype._onKeyDown = function(evt) {
  var key = evt.key;
  var handled = true;
  var count = this._results.length;

  if (key === 'ArrowDown' || key === 'ArrowUp') {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; this._run(); }
    count = this._results.length;
    if (count > 0) {
      var step = (key === 'ArrowDown') ? 1 : -1;
      this._active = this._active < 0
        ? (step > 0 ? 0 : count - 1)
        : (this._active + step + count) % count;
      this._paintActive();
      this._go(this._results[this._active], false);
    }
  } else if (key === 'Enter') {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; this._run(); }
    if (this._results.length > 0) {
      if (this._active < 0) this._active = 0;
      this._paintActive();
      this._go(this._results[this._active], true);
    }
  } else if (key === 'Escape') {
    if (this.input.value) this._clear();
    else this.input.blur();
  } else {
    handled = false;
  }

  if (handled) {
    evt.preventDefault();
    evt.stopPropagation();
  }
};

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

/**
 * Why the cell cannot be seen: 'hidden' (it or a layer/ancestor is hidden),
 * 'in collapsed group', or null when it is on screen.
 */
function _hiddenReason(model, cell) {
  for (var a = cell; a; a = model.getParent(a)) {
    if (!model.isVisible(a)) return 'hidden';
    if (a !== cell && model.isCollapsed(a)) return 'in collapsed group';
  }
  return null;
}

/** Shows hidden layers/ancestors and expands collapsed groups (undoable). */
function _reveal(graph, cell) {
  var model = graph.model;
  model.beginUpdate();
  try {
    for (var a = cell; a; a = model.getParent(a)) {
      if (!model.isVisible(a)) model.setVisible(a, true);
      if (a !== cell && model.isCollapsed(a)) model.setCollapsed(a, false);
    }
  } finally {
    model.endUpdate();
  }
}

/**
 * Scrolls to the result's cell and flashes it; with select, also reveals it
 * if hidden and selects it.
 */
SearchPane.prototype._go = function(result, select) {
  var graph = this.ui.editor.graph;
  var cell  = result.entry.cell;

  if (!graph.model.contains(cell)) {
    this._setNote('That shape is no longer on this page.');
    this._run();
    return;
  }

  var hidden = _hiddenReason(graph.model, cell);
  if (hidden && !select) {
    this._setNote('This shape is ' + hidden + '. Press Enter or click to reveal and select it.');
    return;
  }
  if (hidden) _reveal(graph, cell);

  var locked = graph.isCellSelectable && !graph.isCellSelectable(cell);
  this._setNote(select && locked
    ? 'This shape is on a locked layer or is locked: highlighted, but it cannot be selected.'
    : (hidden ? 'Revealed: the shape was ' + hidden + '.' : null));

  graph.scrollCellToVisible(cell, true);
  if (typeof graph.highlightCell === 'function') {
    graph.highlightCell(cell, FLASH_COLOR, FLASH_MS, null, 4);
  }

  if (select && !locked) graph.setSelectionCell(cell);
};

module.exports = SearchPane;
