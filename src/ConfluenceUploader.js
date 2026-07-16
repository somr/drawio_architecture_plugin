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
// Routes through the main process via the httpRequest IPC action so that
// the request is made in Node.js context, bypassing Electron's CSP which
// blocks fetch/XHR to atlassian.net in the renderer.
// X-Atlassian-Token is required by Confluence to bypass CSRF on POST requests.
ConfluenceUploader.prototype.upload = function(pageId, filename, base64, contentType, callback) {
  var cfg = this._config;
  if (!cfg) {
    console.error(LOG, 'Upload aborted — no credentials configured.');
    callback(new Error('No Confluence credentials configured.'));
    return;
  }

  var resolvedType = contentType || 'image/png';
  var url          = cfg.baseUrl + '/wiki/rest/api/content/' + pageId + '/child/attachment';
  var authHeader   = 'Basic ' + btoa(cfg.email + ':' + cfg.apiToken);

  // Build multipart/form-data body in the renderer (btoa/atob available here),
  // encode the whole thing as base64 so it survives the IPC serialisation boundary.
  var boundary  = '----PluginBoundary' + Date.now().toString(36);
  var preamble  = '--' + boundary + '\r\n' +
                  'Content-Disposition: form-data; name="file"; filename="' + filename + '"\r\n' +
                  'Content-Type: ' + resolvedType + '\r\n\r\n';
  var epilogue  = '\r\n--' + boundary + '--\r\n';

  // Concatenate preamble (text) + file bytes (binary) + epilogue (text) as a
  // binary string, then base64-encode the whole block for IPC transport.
  var preambleBytes = Array.from(preamble).map(function(c) { return String.fromCharCode(c.charCodeAt(0) & 0xff); }).join('');
  var epilogueBytes = Array.from(epilogue).map(function(c) { return String.fromCharCode(c.charCodeAt(0) & 0xff); }).join('');
  var fileBytes     = atob(base64);
  var bodyBase64    = btoa(preambleBytes + fileBytes + epilogueBytes);

  console.log(LOG, 'Uploading "' + filename + '" (' + resolvedType + ') → page ' + pageId);

  window.electron.request(
    {
      action:     'httpRequest',
      url:        url,
      // PUT (not POST) so Confluence updates the existing attachment by
      // filename instead of rejecting it with "same file name as an
      // existing attachment" — POST on this endpoint only ever creates.
      method:     'PUT',
      headers:    {
        'Authorization':     authHeader,
        'X-Atlassian-Token': 'no-check',
        'Content-Type':      'multipart/form-data; boundary=' + boundary,
      },
      bodyBase64: bodyBase64,
    },
    function(ret) {
      if (ret && ret.statusCode >= 200 && ret.statusCode < 300) {
        console.log(LOG, 'Upload OK — "' + filename + '" HTTP ' + ret.statusCode);
        callback(null, ret.statusCode);
      } else {
        var status = ret ? ret.statusCode : 0;
        var msg    = 'HTTP ' + status;
        if (ret && ret.body) {
          try {
            var parsed = JSON.parse(ret.body);
            if (parsed.message) { msg += ': ' + parsed.message; }
          } catch (e) {
            if (ret.body.length < 200) { msg += ': ' + ret.body.trim(); }
          }
        }
        console.error(LOG, 'Upload FAILED — "' + filename + '":', msg);
        callback(new Error(msg));
      }
    },
    function(err) {
      console.error(LOG, 'Network error uploading "' + filename + '":', err);
      callback(new Error('Network error: ' + String(err)));
    }
  );
};

module.exports = ConfluenceUploader;
