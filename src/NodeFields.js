'use strict';

var TechnologyRegistry = require('./TechnologyRegistry');

// Controls for the Node-only properties (specs §4.4, §5.1), shared by the
// panel and the missing-properties popup.
//
// A stored value that is not one of the options is kept and shown as an extra
// option marked "(unknown)", so it is never lost by just viewing the shape.

var EXTRA_ATTR = 'data-pp-extra';

function _option(value, text) {
  var opt = document.createElement('option');
  opt.value = value;
  opt.textContent = text;
  return opt;
}

/** Selects `value`, adding a "(unknown)" option for it when it is not listed. */
function _setSelectValue(select, value) {
  Array.prototype.slice.call(select.querySelectorAll('option[' + EXTRA_ATTR + ']'))
    .forEach(function(o) { select.removeChild(o); });
  value = value || '';
  var known = Array.prototype.some.call(select.options, function(o) { return o.value === value; });
  if (!known) {
    var extra = _option(value, value + ' (unknown)');
    extra.setAttribute(EXTRA_ATTR, '1');
    select.appendChild(extra);
  }
  select.value = value;
}

function _applyDisabled(el, disabled, enabledBg, disabledBg) {
  el.disabled = disabled;
  el.style.background = disabled ? disabledBg : enabledBg;
}

/**
 * Technology: a dropdown of registry keys ("KEY (KIND)") when a technology
 * registry is loaded, otherwise a free-text input with a hint.
 *
 * The registry is read lazily on the first setValue(), not at construction:
 * the panel is built while plugins are still loading, before the
 * configuration file may have run.
 *
 * opts: { inputStyle, enabledBg, disabledBg }
 */
function TechnologyField(opts) {
  this.opts = opts;
  this.mode = null;            // null until first setValue: 'select' | 'text'
  this.onCommit = null;        // fn(value) — change (select) / blur (text)

  this.element = document.createElement('div');

  this.select = document.createElement('select');
  this.select.style.cssText = opts.inputStyle;
  this.select.style.display = 'none';
  // Keep mxWindow's mousedown handler from swallowing the native dropdown.
  this.select.addEventListener('mousedown', function(e) { e.stopPropagation(); });

  this.input = document.createElement('input');
  this.input.type = 'text';
  this.input.style.cssText = opts.inputStyle;

  this.hint = document.createElement('div');
  this.hint.style.cssText = 'font-size:10px;color:#999;margin-top:2px;';

  this.element.appendChild(this.select);
  this.element.appendChild(this.input);
  this.element.appendChild(this.hint);

  var self = this;
  this.select.addEventListener('change', function() {
    self._updateHint();
    if (self.onCommit && !self.select.disabled) self.onCommit(self.getValue());
  });
  this.input.addEventListener('blur', function() {
    if (self.onCommit && !self.input.disabled) self.onCommit(self.getValue());
  });
}

TechnologyField.prototype._ensureMode = function() {
  if (this.mode) return;
  var keys = TechnologyRegistry.getTechnologyKeys();
  if (TechnologyRegistry.isLoaded()) {
    this.mode = 'select';
    var select = this.select;
    select.appendChild(_option('', '—'));
    keys.forEach(function(key) {
      select.appendChild(_option(key, key + ' (' + TechnologyRegistry.getKind(key) + ')'));
    });
    this.select.style.display = '';
    this.input.style.display = 'none';
  } else {
    this.mode = 'text';
  }
};

TechnologyField.prototype._updateHint = function() {
  if (this.mode === 'text') {
    this.hint.textContent = 'No technology registry loaded';
    return;
  }
  var kind = TechnologyRegistry.getKind(this.getValue());
  this.hint.textContent = kind ? 'Kind: ' + kind : '';
};

TechnologyField.prototype.getValue = function() {
  return (this.mode === 'select' ? this.select.value : this.input.value).trim();
};

TechnologyField.prototype.setValue = function(value) {
  this._ensureMode();
  if (this.mode === 'select') _setSelectValue(this.select, value);
  else this.input.value = value || '';
  this._updateHint();
};

/** Empties the field without reading the registry (safe during start-up). */
TechnologyField.prototype.clear = function() {
  this.input.value = '';
  if (this.mode === 'select') _setSelectValue(this.select, '');
  this.hint.textContent = '';
};

TechnologyField.prototype.setDisabled = function(disabled) {
  _applyDisabled(this.select, disabled, this.opts.enabledBg, this.opts.disabledBg);
  _applyDisabled(this.input,  disabled, this.opts.enabledBg, this.opts.disabledBg);
};

/**
 * Provisioning: a dropdown of '', IAC, EXTERNAL, RUNTIME.
 * opts: { inputStyle, enabledBg, disabledBg, values }
 */
function ProvisioningField(opts) {
  this.opts = opts;
  this.onCommit = null;

  var select = document.createElement('select');
  select.style.cssText = opts.inputStyle;
  select.addEventListener('mousedown', function(e) { e.stopPropagation(); });
  select.appendChild(_option('', '—'));
  opts.values.forEach(function(v) { select.appendChild(_option(v, v)); });

  var self = this;
  select.addEventListener('change', function() {
    if (self.onCommit && !select.disabled) self.onCommit(self.getValue());
  });

  this.select = select;
  this.element = select;
}

ProvisioningField.prototype.getValue = function() { return this.select.value; };
ProvisioningField.prototype.setValue = function(value) { _setSelectValue(this.select, value); };
ProvisioningField.prototype.clear = function() { _setSelectValue(this.select, ''); };
ProvisioningField.prototype.setDisabled = function(disabled) {
  _applyDisabled(this.select, disabled, this.opts.enabledBg, this.opts.disabledBg);
};

module.exports = {
  TechnologyField: TechnologyField,
  ProvisioningField: ProvisioningField,
  setSelectValue: _setSelectValue,
};
