'use strict';

// Generated model page (specs §10.9): draws the merged architecture model as
// a hierarchy tree on a dedicated page. The page is wiped and re-created on
// every run; its cells carry PROP_MODEL_VIEW, so the page is skipped by
// forEachPage and never feeds back into the model.
//
// layoutTree() is pure (no DOM, no mxGraph) and testable in Node; render()
// does the DrawIO work.

var PAGE_NAME = 'Architecture Model';

var BOX_W       = 180;
var BOX_H       = 72;
var H_GAP       = 30;    // between sibling subtrees
var V_GAP       = 50;    // between a parent and its row of children
var ROOT_GAP    = 80;    // between separate trees
var STACK_INDENT = 24;   // stacked leaves are indented by this much
var STACK_GAP   = 14;    // between stacked leaves
var TOP         = 90;    // trees start below the title

/**
 * Lays out the elements (buildModel output) as a top-down forest.
 * Children follow the export order. A parent whose children are all leaves
 * gets them stacked vertically below it (org-chart style) to keep the tree
 * narrow. Elements whose parent is missing, and elements in a parent cycle,
 * start trees of their own.
 *
 * Returns { boxes: [{el, x, y, w, h}], edges: [{from, to, stacked}], width, height }
 * with `from` / `to` being element IDs. Coordinates start at (0, 0).
 */
function layoutTree(elements) {
  var byId = {};
  elements.forEach(function(el) { byId[el.id] = el; });

  var children = {};
  elements.forEach(function(el) {
    if (el.parent !== undefined && byId[el.parent] && el.parent !== el.id) {
      (children[el.parent] = children[el.parent] || []).push(el);
    }
  });

  // Roots: no parent, or a parent that is not an element.
  var roots = elements.filter(function(el) {
    return el.parent === undefined || !byId[el.parent] || el.parent === el.id;
  });

  // Each element has one parent, so it is reached once; the visited guard
  // stops the walk inside a parent cycle.
  var visited = {};
  function build(el) {
    visited[el.id] = true;
    var kids = (children[el.id] || []).filter(function(c) { return !visited[c.id]; });
    return { el: el, kids: kids.map(build) };
  }
  var trees = roots.map(build);
  // Elements not reachable from a root sit in a parent cycle: each unplaced
  // one starts a tree of its own, in export order.
  elements.forEach(function(el) {
    if (!visited[el.id]) trees.push(build(el));
  });

  function measure(n) {
    n.kids.forEach(measure);
    n.stacked = n.kids.length > 0 && n.kids.every(function(k) { return k.kids.length === 0; });
    if (n.kids.length === 0) {
      n.w = BOX_W;
      n.h = BOX_H;
    } else if (n.stacked) {
      n.w = STACK_INDENT + BOX_W;
      n.h = BOX_H + n.kids.length * (BOX_H + STACK_GAP) + (V_GAP / 2 - STACK_GAP);
    } else {
      var rowW = 0, rowH = 0;
      n.kids.forEach(function(k, i) { rowW += k.w + (i > 0 ? H_GAP : 0); rowH = Math.max(rowH, k.h); });
      n.w = Math.max(BOX_W, rowW);
      n.h = BOX_H + V_GAP + rowH;
    }
  }

  var boxes = [], edges = [];
  function place(n, x, y) {
    if (n.stacked) {
      boxes.push({ el: n.el, x: x, y: y, w: BOX_W, h: BOX_H });
      var cy = y + BOX_H + V_GAP / 2;
      n.kids.forEach(function(k) {
        place(k, x + STACK_INDENT, cy);
        edges.push({ from: n.el.id, to: k.el.id, stacked: true });
        cy += BOX_H + STACK_GAP;
      });
      return;
    }
    var rowW = 0;
    n.kids.forEach(function(k, i) { rowW += k.w + (i > 0 ? H_GAP : 0); });
    boxes.push({ el: n.el, x: x + (n.w - BOX_W) / 2, y: y, w: BOX_W, h: BOX_H });
    var cx = x + (n.w - rowW) / 2;
    n.kids.forEach(function(k) {
      place(k, cx, y + BOX_H + V_GAP);
      edges.push({ from: n.el.id, to: k.el.id, stacked: false });
      cx += k.w + H_GAP;
    });
  }

  var x = 0, height = 0;
  trees.forEach(function(t, i) {
    measure(t);
    if (i > 0) x += ROOT_GAP;
    place(t, x, 0);
    x += t.w;
    height = Math.max(height, t.h);
  });

  return { boxes: boxes, edges: edges, width: x, height: height };
}

/**
 * Findings per element ID: a finding counts for an element when one of its
 * refs is a shape carrying that element's ID. Flow findings (connectors) are
 * left out. Returns { id: [finding] }.
 */
function findingsByElement(model, sp) {
  var ids = {};
  model.elements.forEach(function(el) { ids[el.id] = true; });
  var out = {};
  model.findings.forEach(function(f) {
    var seen = {};
    (f.refs || []).forEach(function(r) {
      if (!r.cell || !r.cell.vertex) return;
      var id = sp.getProperty(r.cell, sp.PROP_ID);
      if (!id || !ids[id] || seen[id]) return;
      seen[id] = true;
      (out[id] = out[id] || []).push(f);
    });
  });
  return out;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

var LEVEL_FILL = {
  'organization':    '#e1d5e7',
  'software-system': '#dae8fc',
  'workflow':        '#d5e8d4',
  'tier':            '#fff2cc',
  'service':         '#ffe6cc',
  'node':            '#f5f5f5',
};

var SEVERITY_STROKE = { error: '#d32f2f', warning: '#f57c00', advisory: '#1976d2' };
var SEVERITY_RANK   = { error: 0, warning: 1, advisory: 2 };

/**
 * Wipes (or creates) the model page and draws the model on it, as one undo
 * step (plus one for creating the page). Switches to the page.
 * meta: { source, generated } for the title.
 */
function render(ui, sp, model, meta) {
  var esc = mxUtils.htmlEntities;

  // Pages (and shape cell ids) the elements are drawn on, for links and
  // tooltips (before the model page exists, so it is not among them).
  var pagesOf = {};
  sp.forEachPage(ui, function(page, pageName, root) {
    sp.walkCells(root, function(c) {
      if (!c.vertex || sp.isIgnored(c)) return;
      var id = sp.getProperty(c, sp.PROP_ID);
      if (!id) return;
      var list = pagesOf[id] = pagesOf[id] || [];
      var entry = list.filter(function(p) { return p.page === page; })[0];
      if (!entry) list.push(entry = { page: page, name: pageName, cells: [] });
      entry.cells.push(c.getId());
    });
  });

  var issues = findingsByElement(model, sp);
  var layout = layoutTree(model.elements);

  var page = _findModelPage(ui, sp);
  if (!page) page = ui.insertPage(ui.createPage(PAGE_NAME, ui.createPageId()));
  if (ui.currentPage !== page) ui.selectPage(page);

  var graph = ui.editor.graph;
  var gm = graph.model;
  var doc = mxUtils.createXmlDocument();
  function value(attrs) {
    var node = doc.createElement('object');
    node.setAttribute('label', '');
    Object.keys(attrs).forEach(function(k) { if (attrs[k] != null) node.setAttribute(k, attrs[k]); });
    node.setAttribute(sp.PROP_MODEL_VIEW, '1');
    return node;
  }

  var counts = { error: 0, warning: 0, advisory: 0 };
  model.findings.forEach(function(f) { counts[f.severity]++; });

  var title;
  gm.beginUpdate();
  try {
    // Wipe every layer.
    (gm.root.children || []).forEach(function(layer) {
      var cells = (layer.children || []).slice();
      if (cells.length) graph.removeCells(cells, true);
    });
    var parent = graph.getDefaultParent();

    var summary = model.elements.length + ' elements · ' +
      counts.error + ' error' + (counts.error === 1 ? '' : 's') + ' · ' +
      counts.warning + ' warning' + (counts.warning === 1 ? '' : 's');
    title = graph.insertVertex(parent, null, value({
      label: '<b style="font-size:16px">Architecture model</b><br>' +
             esc(meta.source || '') + ' · generated ' + esc(meta.generated || '') + ' · ' + summary +
             '<br><i>Generated page — re-created by “Generate model page”; edits here are lost.</i>',
    }), 0, 0, Math.max(520, layout.width), 60,
      'text;html=1;align=left;verticalAlign=top;whiteSpace=wrap;fontColor=#555555;fontSize=11;');

    var cellOf = {};
    layout.boxes.forEach(function(b) {
      var el = b.el;
      var found = (issues[el.id] || []).slice().sort(function(a, c) {
        return SEVERITY_RANK[a.severity] - SEVERITY_RANK[c.severity];
      });
      var worst = found.length ? found[0].severity : null;
      var where = pagesOf[el.id] || [];

      var lines = ['<b>' + esc(el.name) + '</b>',
                   '<font style="font-size:10px">' + esc(sp.getLevelLabel(el.type)) + ' · ' + esc(el.id) + '</font>'];
      var tech = [el.technology, el.provisioning].filter(Boolean).join(' · ');
      if (tech) lines.push('<font style="font-size:10px"><i>' + esc(tech) + '</i></font>');
      if (worst) {
        var n = found.filter(function(f) { return f.severity === worst; }).length;
        lines.push('<font style="font-size:10px" color="' + SEVERITY_STROKE[worst] + '">● ' + n + ' ' +
                   worst + (n === 1 ? '' : 's') + '</font>');
      }

      // Tooltip is HTML (DrawIO sanitises it; newlines are kept). Page names
      // are links that open the page with the element's shapes selected.
      var tip = [];
      if (el.description) tip.push(esc(el.description));
      if (where.length) tip.push('Drawn on: ' + where.map(function(p) {
        return '<a href="' + esc(pageLink(p)) + '">' + esc(p.name) + '</a>';
      }).join(', '));
      found.forEach(function(f) { tip.push(esc(f.severity.toUpperCase() + ' ' + f.code + ': ' + f.message)); });

      var style = 'rounded=1;whiteSpace=wrap;html=1;arcSize=12;fontSize=12;' +
        'fillColor=' + (LEVEL_FILL[el.type] || '#ffffff') + ';' +
        (worst ? 'strokeColor=' + SEVERITY_STROKE[worst] + ';strokeWidth=3;'
               : 'strokeColor=#666666;');

      cellOf[el.id] = graph.insertVertex(parent, null, value({
        label:   lines.join('<br>'),
        tooltip: tip.join('\n') || null,
        link:    where.length ? pageLink(where[0]) : null,
      }), b.x, TOP + b.y, b.w, b.h, style);
    });

    layout.edges.forEach(function(e) {
      var style = 'edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=none;strokeColor=#888888;';
      style += e.stacked
        ? 'exitX=' + (STACK_INDENT / 2 / BOX_W) + ';exitY=1;exitDx=0;exitDy=0;entryX=0;entryY=0.5;entryDx=0;entryDy=0;'
        : 'exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;';
      graph.insertEdge(parent, null, value({}), cellOf[e.from], cellOf[e.to], style);
    });
  } finally {
    gm.endUpdate();
  }

  graph.clearSelection();
  graph.scrollCellToVisible(title);

  return { page: page, elements: model.elements.length, counts: counts };
}

/**
 * DrawIO custom link that opens the page and selects (and scrolls to) the
 * given shapes: { page, cells: [cell id] }.
 */
function pageLink(where) {
  return 'data:action/json,' + JSON.stringify({ actions: [
    { open: 'data:page/id,' + where.page.getId() },
    { select: { cells: where.cells } },
    { scroll: { cells: where.cells } },
  ] });
}

/** The existing model page, or null. */
function _findModelPage(ui, sp) {
  var pages = ui.pages || [];
  for (var i = 0; i < pages.length; i++) {
    if (pages[i].root == null && ui.updatePageRoot) {
      try { ui.updatePageRoot(pages[i]); } catch (e) { continue; }
    }
    if (sp.isModelViewPage(ui, pages[i])) return pages[i];
  }
  return null;
}

module.exports = {
  PAGE_NAME: PAGE_NAME,
  layoutTree: layoutTree,
  findingsByElement: findingsByElement,
  render: render,
};
