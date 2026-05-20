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
// Uses Node.js https directly to bypass Electron's CSP (fetch/XHR are
// blocked by connect-src). X-Atlassian-Token is required by Confluence
// to bypass its CSRF protection on POST requests.
ConfluenceUploader.prototype.upload = function(pageId, filename, base64, contentType, callback) {
  var cfg = this._config;
  if (!cfg) {
    console.error(LOG, 'Upload aborted — no credentials configured.');
    callback(new Error('No Confluence credentials configured.'));
    return;
  }

  var https;
  try { https = require('https'); } catch (e) {
    callback(new Error('Node.js https module not available: ' + e.message));
    return;
  }

  var resolvedType = contentType || 'image/png';
  var parsedUrl    = new URL(cfg.baseUrl + '/wiki/rest/api/content/' + pageId + '/child/attachment');
  var authHeader   = 'Basic ' + Buffer.from(cfg.email + ':' + cfg.apiToken).toString('base64');

  // Build multipart/form-data body manually — no FormData in Node.js context
  var boundary  = '----PluginBoundary' + Date.now().toString(36);
  var binBuffer = Buffer.from(base64, 'base64');
  var body      = Buffer.concat([
    Buffer.from(
      '--' + boundary + '\r\n' +
      'Content-Disposition: form-data; name="file"; filename="' + filename + '"\r\n' +
      'Content-Type: ' + resolvedType + '\r\n\r\n'
    ),
    binBuffer,
    Buffer.from('\r\n--' + boundary + '--\r\n'),
  ]);

  var options = {
    hostname: parsedUrl.hostname,
    port:     parseInt(parsedUrl.port || '443', 10),
    path:     parsedUrl.pathname + parsedUrl.search,
    method:   'POST',
    headers:  {
      'Authorization':     authHeader,
      'X-Atlassian-Token': 'no-check',
      'Content-Type':      'multipart/form-data; boundary=' + boundary,
      'Content-Length':    body.length,
    },
  };

  console.log(LOG, 'Uploading "' + filename + '" (' + resolvedType + ') → ' + parsedUrl.hostname + ' page ' + pageId);

  var req = https.request(options, function(res) {
    var chunks = [];
    res.on('data', function(c) { chunks.push(c); });
    res.on('end', function() {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        console.log(LOG, 'Upload OK — "' + filename + '" HTTP ' + res.statusCode);
        callback(null, res.statusCode);
      } else {
        var resBody = Buffer.concat(chunks).toString('utf8');
        var msg     = 'HTTP ' + res.statusCode;
        try {
          var parsed = JSON.parse(resBody);
          if (parsed.message) { msg += ': ' + parsed.message; }
        } catch (e) {
          if (resBody && resBody.length < 200) { msg += ': ' + resBody.trim(); }
        }
        console.error(LOG, 'Upload FAILED — "' + filename + '":', msg);
        callback(new Error(msg));
      }
    });
  });

  req.on('error', function(err) {
    console.error(LOG, 'Network error uploading "' + filename + '":', err.message);
    callback(new Error('Network error: ' + err.message));
  });

  req.write(body);
  req.end();
};

module.exports = ConfluenceUploader;
