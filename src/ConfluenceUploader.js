'use strict';

var CONFIG_KEY = 'confluence_plugin_config';

function ConfluenceUploader(ui) {
  this.ui = ui;
  this._config = null;
  this._reload();
}

ConfluenceUploader.prototype._reload = function() {
  try {
    var raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) { this._config = null; return; }
    var cfg = JSON.parse(raw);
    if (!cfg.baseUrl || !cfg.email || !cfg.apiToken) { this._config = null; return; }
    cfg.baseUrl = cfg.baseUrl.replace(/\/+$/, '');
    this._config = cfg;
  } catch (e) {
    this._config = null;
  }
};

ConfluenceUploader.prototype.getConfig = function() {
  return this._config;
};

ConfluenceUploader.prototype.saveConfig = function(cfg) {
  var cleaned = {
    baseUrl:  (cfg.baseUrl  || '').trim().replace(/\/+$/, ''),
    email:    (cfg.email    || '').trim(),
    apiToken: (cfg.apiToken || '').trim(),
  };
  if (!cleaned.baseUrl || !cleaned.email || !cleaned.apiToken) {
    throw new Error('All three credential fields are required.');
  }
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cleaned));
  this._reload();
};

ConfluenceUploader.prototype.clearConfig = function() {
  localStorage.removeItem(CONFIG_KEY);
  this._config = null;
};

// Returns { valid: [...urls], invalid: [...urls] } read from the diagram's
// confluence_page property (set via right-click background → Edit Data).
ConfluenceUploader.prototype.getPages = function() {
  var raw = null;
  try {
    var model  = this.ui.editor.graph.getModel();
    var checks = [model.getRoot(), this.ui.editor.graph.getDefaultParent()];
    for (var i = 0; i < checks.length; i++) {
      var cell = checks[i];
      if (cell && typeof cell.getAttribute === 'function') {
        var val = cell.getAttribute('confluence_page');
        if (val) { raw = val; break; }
      }
    }
  } catch (e) {}
  if (!raw) return { valid: [], invalid: [] };
  var valid = [], invalid = [];
  var lines = raw.split('\n');
  for (var j = 0; j < lines.length; j++) {
    var line = lines[j].replace(/\r/g, '').trim();
    if (!line) continue;
    if (/\/pages\/\d+/.test(line)) { valid.push(line); }
    else                           { invalid.push(line); }
  }
  return { valid: valid, invalid: invalid };
};

var LOG = '[ConfluenceUploader]';

// Uploads a single file to a Confluence page attachment slot via the DrawIO
// Electron IPC bridge. contentType should be 'image/png' or 'application/json'.
// The confluenceUpload IPC handler must support the contentType field — see
// the IPC patch note in docs/specs.md.
ConfluenceUploader.prototype.upload = function(pageId, filename, base64, contentType, callback) {
  var cfg = this._config;
  if (!cfg) {
    console.error(LOG, 'Upload aborted — no credentials configured.');
    callback(new Error('No Confluence credentials configured.'));
    return;
  }
  if (!window.electron || typeof window.electron.request !== 'function') {
    console.error(
      LOG,
      'PREREQUISITE NOT MET: window.electron IPC bridge is unavailable.',
      'This plugin requires draw.io Desktop with the confluenceUpload IPC patch applied.',
      'File not uploaded:', filename
    );
    callback(new Error(
      'window.electron IPC bridge not found. ' +
      'This plugin requires draw.io Desktop with the confluenceUpload IPC patch applied.'
    ));
    return;
  }

  var resolvedType = contentType || 'image/png';
  var url  = cfg.baseUrl + '/wiki/rest/api/content/' + pageId + '/child/attachment';
  var auth = btoa(cfg.email + ':' + cfg.apiToken);

  // Non-image uploads require the IPC handler to forward the contentType field.
  // If the handler hard-codes 'image/png', JSON will be stored with the wrong
  // MIME type. This warning makes the requirement visible in the DevTools console.
  if (resolvedType !== 'image/png') {
    console.warn(
      LOG,
      'PREREQUISITE CHECK: Uploading "' + filename + '" with contentType="' + resolvedType + '".',
      'The confluenceUpload IPC handler must pass the `contentType` field from the payload',
      'to the multipart request — otherwise this file will be stored as image/png in Confluence.',
      'If the attachment appears with the wrong type, apply the IPC patch described in docs/specs.md.'
    );
  }

  console.log(LOG, 'Uploading "' + filename + '" (contentType=' + resolvedType + ') → page ' + pageId);

  window.electron.request(
    {
      action      : 'confluenceUpload',
      url         : url,
      auth        : auth,
      filename    : filename,
      imageBase64 : base64,
      contentType : resolvedType,
    },
    function(ret) {
      var status = (ret && ret.statusCode) ? ret.statusCode : 0;
      if (status >= 200 && status < 300) {
        console.log(LOG, 'Upload OK — "' + filename + '" HTTP ' + status);
        callback(null, status);
      } else {
        var msg = 'HTTP ' + status;
        if (ret && ret.body) {
          try {
            var parsed = JSON.parse(ret.body);
            if (parsed.message) { msg += ': ' + parsed.message; }
          } catch (e) {
            if (typeof ret.body === 'string' && ret.body.length < 200) { msg += ': ' + ret.body; }
          }
        }
        console.error(LOG, 'Upload FAILED — "' + filename + '":', msg);
        callback(new Error(msg));
      }
    },
    function(err) {
      console.error(LOG, 'Upload FAILED — "' + filename + '":', err);
      callback(new Error(String(err || 'IPC upload failed')));
    }
  );
};

module.exports = ConfluenceUploader;
