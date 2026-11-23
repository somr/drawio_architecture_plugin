'use strict';

var ArchitectureModel      = require('./ArchitectureModel');
var TechnologyRegistry     = require('./TechnologyRegistry');
var ValidationReportDialog = require('./ValidationReportDialog');
var SyncPreviewDialog      = require('./SyncPreviewDialog');

/**
 * ArchitectureReport — export, validation and Confluence push of the whole
 * file's architecture model (specs §10, §11).
 *
 * The YAML is saved through a browser download: Electron shows its native
 * save dialog. DrawIO desktop's writeFile IPC cannot be used, because it
 * rejects any content that is not a diagram/image/PDF format (YAML included).
 */
function ArchitectureReport(ui, shapeProps) {
  this.ui = ui;
  this.shapeProps = shapeProps;
  this.reportDialog = new ValidationReportDialog(ui);
  this.previewDialog = new SyncPreviewDialog(ui, shapeProps);
}

var NO_ELEMENTS = 'No shapes with ID, Name and Level found in this file.';

ArchitectureReport.prototype._build = function() {
  return ArchitectureModel.buildModel(this.ui, this.shapeProps, TechnologyRegistry.getRegistry());
};

ArchitectureReport.prototype._yaml = function(model) {
  return ArchitectureModel.toYaml(model, {
    source:    _fileTitle(this.ui),
    generated: _today(),
  });
};

/**
 * "Validate model" (specs §10.1): builds the model and shows the report.
 */
ArchitectureReport.prototype.validate = function(onStatus) {
  var self  = this;
  var model = this._build();
  if (model.elements.length === 0 && model.findings.length === 0) {
    onStatus(NO_ELEMENTS, true);
    return;
  }
  this.reportDialog.show({
    title:    'Architecture model validation',
    findings: model.findings,
    buttons:  this._withFix(model, [{ label: 'Close', primary: true }],
                            function() { self.validate(onStatus); }),
  });
};

/**
 * Prepends a "Fix N missing IDs" button to a report's buttons when the model
 * has PP-001 findings (specs §10.7.1). The fix previews the IDs, writes them,
 * then calls rerun() so the report is rebuilt from the fixed diagram.
 */
ArchitectureReport.prototype._withFix = function(model, buttons, rerun, onCancel) {
  var count = model.findings.filter(function(f) { return f.code === 'PP-001'; }).length;
  if (count === 0) return buttons;
  var self = this;
  return [{
    label:   'Fix ' + count + ' missing ID' + (count > 1 ? 's' : '') + '…',
    onClick: function() { self.fixMissingIds(rerun, onCancel); },
  }].concat(buttons);
};

/**
 * Gives every shape with Name and Level but no ID an ID (specs §10.7.1):
 * shows the planned IDs for confirmation, writes the selected ones (one undo
 * step per page) and calls onDone() afterwards; onCancel() (optional) when
 * nothing was written.
 */
ArchitectureReport.prototype.fixMissingIds = function(onDone, onCancel) {
  var ui   = this.ui;
  var sp   = this.shapeProps;
  var plan = sp.planMissingIds(ui);

  if (plan.items.length === 0) {
    this.reportDialog.show({
      title:    'Fix missing IDs',
      findings: plan.notices.map(function(n) { return { severity: 'warning', code: 'PP-001', message: n, refs: [] }; }),
      buttons:  [{ label: 'Close', primary: true, onClick: onCancel }],
    });
    return;
  }

  var items = plan.items.map(function(it) {
    var others = [];
    plan.items.forEach(function(o) {
      if (o !== it && o.id === it.id && others.indexOf(o.pageName) === -1) others.push(o.pageName);
    });
    var note = it.reused ? ' — existing element' : '';
    if (others.length) note += (note ? ', also' : ' — also') + ' set on ' + others.join(', ');
    return {
      cell: it.cell, page: it.page, pageName: it.pageName, id: it.id,
      label:  '"' + it.name + '" (' + sp.getLevelLabel(it.level) + ')',
      detail: 'ID ' + it.id + note,
    };
  });

  this.previewDialog.show(items, function(selected) {
    if (selected.length === 0) {
      if (typeof onCancel === 'function') onCancel();
      return;
    }
    var savedPage = ui.currentPage;
    var byPage = [];
    selected.forEach(function(it) {
      var group = byPage.filter(function(g) { return g.page === it.page; })[0];
      if (!group) byPage.push(group = { page: it.page, items: [] });
      group.items.push(it);
    });
    byPage.forEach(function(g) {
      if (g.page !== ui.currentPage) ui.selectPage(g.page, true);
      var graph = ui.editor.graph;
      graph.model.beginUpdate();
      try {
        g.items.forEach(function(it) { sp.setProperty(graph, it.cell, sp.PROP_ID, it.id); });
      } finally {
        graph.model.endUpdate();
      }
    });
    if (ui.currentPage !== savedPage) ui.selectPage(savedPage, true);
    if (typeof onDone === 'function') setTimeout(onDone, 0);
  }, plan.notices, {
    title:        'Fix missing IDs',
    subtitle:     'These shapes have a Name and Level but no ID, so they are not exported. ' +
                  'Each gets an ID made from its name; copies of one element on several pages share it.',
    confirmLabel: 'Set IDs',
    onCancel:     onCancel,
  });
};

/**
 * "Export architecture YAML" (specs §10): builds and validates the model,
 * shows the report when there are findings, then offers the YAML for saving.
 * onStatus(message, isError).
 */
ArchitectureReport.prototype.generate = function(tagName, onStatus) {
  var self  = this;
  var model = this._build();

  if (model.elements.length === 0) {
    onStatus(NO_ELEMENTS, true);
    return;
  }

  var filename = _baseName(this.ui) + (tagName ? '_' + _sanitize(tagName) : '') + '.yaml';

  function save() {
    _download(filename, self._yaml(model), 'application/yaml');
    onStatus('Choose where to save ' + filename + '.', false);
  }

  if (model.findings.length === 0) {
    save();
    return;
  }

  var hasErrors = model.findings.some(function(f) { return f.severity === 'error'; });
  this.reportDialog.show({
    title:    'Export architecture YAML',
    findings: model.findings,
    buttons:  this._withFix(model, [
      { label: 'Cancel' },
      { label: hasErrors ? 'Export anyway' : 'Export', primary: true, onClick: save },
    ], function() { self.generate(tagName, onStatus); }),
  });
};

/**
 * Pushes the whole-model YAML and a PNG of the current page to every valid
 * Confluence page listed in the diagram's confluence_page property, without
 * writing anything to disk (specs §11.4).
 * onProgress(index, total, pageUrl, result) fires after each page is done.
 * onDone(errString) or onDone(null, results) fires when finished.
 */
ArchitectureReport.prototype.push = function(cfUploader, onProgress, onDone, tagName) {
  var ui = this.ui;
  var self = this;

  var file = ui.getCurrentFile();
  if (!file || !file.fileObject || !file.fileObject.path) {
    onDone('Save the diagram before pushing to Confluence.');
    return;
  }

  var model = this._build();
  if (model.elements.length === 0) {
    onDone(NO_ELEMENTS);
    return;
  }

  var pages = cfUploader.getPages();
  if (pages.valid.length === 0) {
    onDone(pages.invalid.length > 0
      ? 'confluence_page is set but contains no valid /pages/{id}/ URLs.'
      : 'confluence_page property is not set on this diagram.');
    return;
  }

  var tagSuffix    = tagName ? '_' + _sanitize(tagName) : '';
  var diagName     = _baseName(ui);
  var pngFilename  = diagName + '_' + _sanitize(_pageName(ui.currentPage)) + tagSuffix + '.png';
  var yamlFilename = diagName + tagSuffix + '.yaml';

  function upload() {
    var yamlBase64 = btoa(unescape(encodeURIComponent(self._yaml(model))));

    _exportPng(ui, function(pngErr, pngBase64) {
      if (pngErr) {
        onDone('PNG export failed: ' + pngErr);
        return;
      }

      var results = [];

      function uploadPage(index) {
        if (index >= pages.valid.length) {
          onDone(null, results);
          return;
        }
        var url   = pages.valid[index];
        var match = url.match(/\/pages\/(\d+)/);
        if (!match) {
          results.push({ url: url, ok: false, error: 'Cannot extract page ID' });
          onProgress(index, pages.valid.length, url, results[results.length - 1]);
          uploadPage(index + 1);
          return;
        }
        var pageId = match[1];

        cfUploader.upload(pageId, pngFilename, pngBase64, 'image/png', function(pngUploadErr) {
          if (pngUploadErr) {
            results.push({ url: url, ok: false, error: 'PNG: ' + pngUploadErr.message });
            onProgress(index, pages.valid.length, url, results[results.length - 1]);
            uploadPage(index + 1);
            return;
          }
          cfUploader.upload(pageId, yamlFilename, yamlBase64, 'application/yaml', function(yamlUploadErr) {
            if (yamlUploadErr) {
              results.push({ url: url, ok: false, error: 'YAML: ' + yamlUploadErr.message });
            } else {
              results.push({ url: url, ok: true });
            }
            onProgress(index, pages.valid.length, url, results[results.length - 1]);
            uploadPage(index + 1);
          });
        });
      }

      uploadPage(0);
    });
  }

  if (model.findings.length === 0) {
    upload();
    return;
  }

  var hasErrors = model.findings.some(function(f) { return f.severity === 'error'; });
  this.reportDialog.show({
    title:    'Push to Confluence',
    findings: model.findings,
    buttons:  this._withFix(model, [
      { label: 'Cancel', onClick: function() { onDone('Push cancelled — nothing was uploaded.'); } },
      { label: hasErrors ? 'Push anyway' : 'Push', primary: true, onClick: upload },
    ], function() { self.push(cfUploader, onProgress, onDone, tagName); },
    function() { onDone('Push cancelled — nothing was uploaded.'); }),
  });
};

// ---------------------------------------------------------------------------
// PNG of the current page, in memory (Confluence push only)
// ---------------------------------------------------------------------------

function _exportPng(ui, callback) {
  try {
    ui.editor.exportToCanvas(
      function(canvas) {
        try {
          var dataUrl = canvas.toDataURL('image/png');
          callback(null, dataUrl.substring(dataUrl.indexOf(',') + 1));
        } catch (e) {
          callback(String(e));
        }
      },
      null,        // format — PNG by default
      null,        // imageCache
      '#ffffff',   // background — white
      function(err) { callback(String(err)); }
    );
  } catch (e) {
    callback(String(e));
  }
}

// ---------------------------------------------------------------------------
// Saving: browser download → Electron's native save dialog
// ---------------------------------------------------------------------------

function _download(filename, text, mimeType) {
  var blob = new Blob([text], { type: mimeType });
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // The download has started once click() returns; release the blob later.
  setTimeout(function() { URL.revokeObjectURL(url); }, 60000);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _fileTitle(ui) {
  var file = ui.getCurrentFile && ui.getCurrentFile();
  if (file && file.fileObject && file.fileObject.name) return file.fileObject.name;
  if (file && typeof file.getTitle === 'function' && file.getTitle()) return file.getTitle();
  return 'diagram';
}

function _baseName(ui) {
  return _sanitize(_fileTitle(ui).replace(/\.[^.]+$/, ''));
}

function _pageName(page) {
  return page ? (page.getName ? page.getName() : (page.name || 'page')) : 'page';
}

function _today() {
  var d = new Date();
  return d.getFullYear() + '-' + _pad2(d.getMonth() + 1) + '-' + _pad2(d.getDate());
}

function _pad2(n) {
  return n < 10 ? '0' + n : String(n);
}

function _sanitize(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9\-]/g, '')
    .substring(0, 64) || 'unnamed';
}

module.exports = ArchitectureReport;
