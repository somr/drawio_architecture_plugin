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

// Uploads a single file to a Confluence page as an attachment.
// Uses fetch() with Basic auth so credentials are always ours, independent
// of any DrawIO-managed Confluence session. X-Atlassian-Token is required
// by the Confluence REST API to bypass its CSRF protection on POST requests.
ConfluenceUploader.prototype.upload = function(pageId, filename, base64, contentType, callback) {
  var cfg = this._config;
  if (!cfg) {
    console.error(LOG, 'Upload aborted — no credentials configured.');
    callback(new Error('No Confluence credentials configured.'));
    return;
  }

  var resolvedType = contentType || 'image/png';
  var url  = cfg.baseUrl + '/wiki/rest/api/content/' + pageId + '/child/attachment';
  var auth = 'Basic ' + btoa(cfg.email + ':' + cfg.apiToken);

  var binary = atob(base64);
  var bytes  = new Uint8Array(binary.length);
  for (var i = 0; i < binary.length; i++) { bytes[i] = binary.charCodeAt(i); }
  var blob     = new Blob([bytes], { type: resolvedType });
  var formData = new FormData();
  formData.append('file', blob, filename);

  console.log(LOG, 'Uploading "' + filename + '" (' + resolvedType + ') → page ' + pageId);

  fetch(url, {
    method:  'POST',
    headers: {
      'Authorization':     auth,
      'X-Atlassian-Token': 'no-check',
    },
    body: formData,
  })
  .then(function(response) {
    if (response.ok) {
      console.log(LOG, 'Upload OK — "' + filename + '" HTTP ' + response.status);
      callback(null, response.status);
    } else {
      return response.text().then(function(body) {
        var msg = 'HTTP ' + response.status;
        try {
          var parsed = JSON.parse(body);
          if (parsed.message) { msg += ': ' + parsed.message; }
        } catch (e) {
          if (body && body.length < 200) { msg += ': ' + body.trim(); }
        }
        console.error(LOG, 'Upload FAILED — "' + filename + '":', msg);
        callback(new Error(msg));
      });
    }
  })
  .catch(function(err) {
    var msg = err && err.message ? err.message : String(err);
    console.error(LOG, 'Network error uploading "' + filename + '":', msg);
    callback(new Error('Network error: ' + msg));
  });
};

module.exports = ConfluenceUploader;
