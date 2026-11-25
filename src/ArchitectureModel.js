'use strict';

// Builds the architecture model of the whole file (specs §10.3–10.7): merges
// elements and flows drawn on several pages, validates them, and serialises
// the result to YAML (specs §10.6). No DOM and no I/O — the caller
// (ArchitectureReport) shows the findings and writes / uploads the YAML.

var SEVERITY_ORDER = { error: 0, warning: 1, advisory: 2 };

/**
 * Returns {
 *   elements: [ {id, name, type, parent?, technology?, provisioning?, description?} ],
 *   flows:    [ {id?, from, to, declared?, description?, lifted_from?: [{id?, from, to, description?}]} ],
 *   findings: [ {severity, code, message, refs: [{page, pageName, cell}]} ],
 *   registry: {name, version} | null,
 * }
 * Elements and flows are in export order. Absent fields are left out.
 */
function buildModel(ui, sp, registry) {
  var findings = [];
  function report(severity, code, message, refs) {
    findings.push({ severity: severity, code: code, message: message, refs: refs || [] });
  }
  function ref(o) { return { page: o.page, pageName: o.pageName, cell: o.cell }; }
  function label(cell) {
    return '"' + (sp.getProperty(cell, sp.PROP_NAME) || sp.getLabelText(cell) || '(unnamed)') + '"';
  }
  // 'a Service or a Software System' — the legal parents of the level
  // (specs §4), named in the HIER-001 / HIER-002 messages.
  function legalParents(level) {
    return sp.getParentLevels(level).map(function(l) {
      var lbl = sp.getLevelLabel(l);
      return (/^[AEIOU]/.test(lbl) ? 'an ' : 'a ') + lbl;
    }).join(' or ');
  }

  // -------------------------------------------------------------------------
  // 10.3 Eligible shapes, per page
  // -------------------------------------------------------------------------
  var occurrences = [];       // in page order, then model order
  sp.forEachPage(ui, function(page, pageName, root) {
    var seenOnPage = {};
    sp.walkCells(root, function(c) {
      if (!c.vertex || sp.isIgnored(c)) return;
      if (!sp.getProperty(c, sp.PROP_NAME) || !sp.isValidLevel(sp.getProperty(c, sp.PROP_LEVEL))) return;
      var o = { page: page, pageName: pageName, cell: c };
      var id = sp.getProperty(c, sp.PROP_ID);
      if (!id) {
        report('warning', 'PP-001', 'Shape ' + label(c) + ' has Name and Level but no ID — not exported.', [ref(o)]);
        return;
      }
      if (!sp.isValidId(id)) {
        report('error', 'PP-002', 'Shape ' + label(c) + ' has an invalid ID "' + id + '" — not exported.', [ref(o)]);
        return;
      }
      if (seenOnPage[id]) {
        report('error', 'ID-001', 'ID "' + id + '" is used by ' + label(seenOnPage[id].cell) + ' and ' +
               label(c) + ' on the same page — only the first is exported.', [ref(seenOnPage[id]), ref(o)]);
        return;
      }
      seenOnPage[id] = o;
      o.id = id;
      occurrences.push(o);
    });
  });

  // -------------------------------------------------------------------------
  // 10.4 Merge occurrences by ID
  // -------------------------------------------------------------------------
  var byId = {}, order = [];
  occurrences.forEach(function(o) {
    if (!byId[o.id]) { byId[o.id] = []; order.push(o.id); }
    byId[o.id].push(o);
  });

  function conflict(id, field, values) {
    // values: [{value, o}] with at least two distinct values
    var parts = values.map(function(v) { return '"' + v.value + '" on ' + v.o.pageName; });
    report('error', 'PP-003', 'Element "' + id + '" has different ' + field + ' values: ' +
           parts.join(', ') + ' — the first is used.', values.map(function(v) { return ref(v.o); }));
  }

  // Distinct non-empty values in occurrence order: [{value, o}].
  function distinct(occs, getter) {
    var seen = {}, out = [];
    occs.forEach(function(o) {
      var v = getter(o);
      if (v === null || v === undefined || v === '') return;
      if (seen.hasOwnProperty(v)) return;
      seen[v] = true;
      out.push({ value: v, o: o });
    });
    return out;
  }

  var elements = {};
  order.forEach(function(id) {
    var occs = byId[id];
    var first = occs[0];
    var el = {
      id:   id,
      name: sp.getProperty(first.cell, sp.PROP_NAME),
      type: sp.getProperty(first.cell, sp.PROP_LEVEL),
      _occ: occs,
    };

    var names = distinct(occs, function(o) { return sp.getProperty(o.cell, sp.PROP_NAME); });
    if (names.length > 1) conflict(id, 'name', names);
    var types = distinct(occs, function(o) { return sp.getProperty(o.cell, sp.PROP_LEVEL); });
    if (types.length > 1) conflict(id, 'type', types);

    if (el.type === sp.NODE_LEVEL) {
      var techs = distinct(occs, function(o) { return _trimmed(sp.getProperty(o.cell, sp.PROP_TECHNOLOGY)); });
      if (techs.length > 1) conflict(id, 'technology', techs);
      if (techs.length) el.technology = techs[0].value;
      var provs = distinct(occs, function(o) { return _trimmed(sp.getProperty(o.cell, sp.PROP_PROVISIONING)); });
      if (provs.length > 1) conflict(id, 'provisioning', provs);
      if (provs.length) el.provisioning = provs[0].value;
    }

    var descs = distinct(occs, function(o) { return _trimmed(sp.getProperty(o.cell, sp.PROP_DESCRIPTION)); });
    if (descs.length > 1) {
      report('warning', 'PP-004', 'Element "' + id + '" has different descriptions on ' +
             _pageList(descs) + ' — the first is used.',
             descs.map(function(d) { return ref(d.o); }));
    }
    if (descs.length) el.description = sp.getProperty(descs[0].o.cell, sp.PROP_DESCRIPTION).trim();

    var parents = distinct(occs, function(o) { return sp.resolveParent(o.cell).id; });
    if (parents.length > 1) conflict(id, 'parent', parents);
    if (parents.length) { el.parent = parents[0].value; el._parentRef = parents[0].o; }

    elements[id] = el;
  });

  // -------------------------------------------------------------------------
  // References and hierarchy
  // -------------------------------------------------------------------------
  var anyTechnology = false;
  order.forEach(function(id) {
    var el = elements[id];
    var at = [ref(el._occ[0])];

    if (el.parent !== undefined && !elements[el.parent]) {
      report('error', 'REF-001', 'Parent "' + el.parent + '" of "' + id + '" is not an exported element — parent omitted.',
             [ref(el._parentRef)]);
      delete el.parent;
    }

    if (el.type === sp.ORGANIZATION_LEVEL) {
      if (el.parent !== undefined) {
        report('error', 'HIER-002', 'Organization "' + id + '" cannot have a parent (it has "' + el.parent + '").', at);
      }
    } else if (el.parent === undefined) {
      report('error', 'HIER-001', sp.getLevelLabel(el.type) + ' "' + id + '" has no parent. Place it inside ' +
             legalParents(el.type) + ', or pick one in its Parent field.', at);
    } else if (!sp.isLegalParent(el.type, elements[el.parent].type)) {
      report('error', 'HIER-002', sp.getLevelLabel(elements[el.parent].type) + ' "' + el.parent +
             '" cannot contain ' + sp.getLevelLabel(el.type) + ' "' + id + '". A ' + sp.getLevelLabel(el.type) +
             ' belongs inside ' + legalParents(el.type) + '.', at);
    }

    if (el.technology !== undefined) {
      anyTechnology = true;
      if (registry && !registry.technologies[el.technology]) {
        report('error', 'REF-003', 'Technology "' + el.technology + '" of "' + id + '" is not in the technology registry.', at);
      }
    }
    if (el.provisioning !== undefined && !sp.isValidProvisioning(el.provisioning)) {
      report('error', 'PP-006', 'Provisioning "' + el.provisioning + '" of "' + id + '" must be ' +
             sp.PROVISIONING_VALUES.join(', ') + '.', at);
    }
  });
  if (anyTechnology && !registry) {
    report('warning', 'PP-005', 'No technology registry loaded — Node technologies were not checked.', []);
  }

  // Cycles (HIER-004): follow parent links; an element that reaches itself
  // is in a cycle. Each cycle is reported once.
  var inCycle = {};
  order.forEach(function(start) {
    if (inCycle[start]) return;
    var path = [], onPath = {}, cur = start;
    while (cur !== undefined && elements[cur] && !onPath[cur]) {
      onPath[cur] = true;
      path.push(cur);
      cur = elements[cur].parent;
    }
    if (cur !== undefined && onPath[cur] && !inCycle[cur]) {
      var cycle = path.slice(path.indexOf(cur));
      cycle.forEach(function(id) { inCycle[id] = true; });
      report('error', 'HIER-004', 'Parent links form a cycle: ' + cycle.concat(cur).join(' → ') + '.',
             cycle.map(function(id) { return ref(elements[id]._occ[0]); }));
    }
  });

  // -------------------------------------------------------------------------
  // 10.5 Flows
  // -------------------------------------------------------------------------
  // Lifting (10.5.1): climbs the deeper end of a cross-level pair through the
  // merged parents until both ends are at the same rank. Returns {from, to},
  // or {stuck: id} when an element on the way has no usable parent.
  function lift(from, to) {
    for (var steps = 0; steps < 2 * sp.LEVELS.length; steps++) {
      var rf = sp.getLevelRank(elements[from].type), rt = sp.getLevelRank(elements[to].type);
      if (rf === rt) return { from: from, to: to };
      var deeper = rf > rt ? from : to;
      var p = elements[deeper].parent;
      if (p === undefined || !elements[p] || inCycle[deeper]) return { stuck: deeper };
      if (deeper === from) from = p; else to = p;
    }
    return { stuck: from };
  }

  var reportedFlowProblems = {};
  function reportOnce(code, from, to, message, o) {
    var pkey = code + '\0' + from + '\0' + to;
    if (reportedFlowProblems[pkey]) return;
    reportedFlowProblems[pkey] = true;
    report('error', code, message, [ref(o)]);
  }

  // pairs: (from, to) of the exported flow. occ = connectors drawn at that
  // level; lifted = cross-level connectors lifted onto it, by original pair.
  var pairs = {}, pairOrder = [];
  function pairFor(from, to) {
    var key = from + '\0' + to;
    if (!pairs[key]) {
      pairs[key] = { key: key, from: from, to: to, occ: [], lifted: {}, liftedOrder: [] };
      pairOrder.push(key);
    }
    return pairs[key];
  }

  sp.forEachPage(ui, function(page, pageName, root) {
    sp.walkCells(root, function(e) {
      if (!e.edge || sp.isIgnored(e)) return;
      var o = { page: page, pageName: pageName, cell: e };
      var problem = sp.getFlowProblem(e);
      if (problem && problem.skip) return;        // an end is outside the model
      if (problem && problem.code === 'PP-007') {
        report('warning', 'PP-007', 'Connector ' + _connectorLabel(sp, e) + ': ' + problem.message, [ref(o)]);
        return;
      }
      var from = sp.getProperty(e.source, sp.PROP_ID), to = sp.getProperty(e.target, sp.PROP_ID);
      var at = 'Flow "' + from + '" → "' + to + '": ';

      if (problem && problem.code === 'FLOW-001' && sp.isFlowLifted(e)) {
        if (!elements[from] || !elements[to]) {
          reportOnce('PP-011', from, to, at + 'cannot be lifted — "' + (elements[from] ? to : from) +
                     '" is not an exported element. Not exported.', o);
          return;
        }
        var l = lift(from, to);
        if (l.stuck) {
          reportOnce('PP-011', from, to, at + 'cannot be lifted — "' + l.stuck + '" has no parent to lift through. ' +
                     'Not exported.', o);
          return;
        }
        if (l.from === l.to) {
          reportOnce('FLOW-009', from, to, at + 'both ends lift to "' + l.from + '", a flow to itself. Not exported.', o);
          return;
        }
        var lp = pairFor(l.from, l.to);
        var lkey = from + '\0' + to;
        if (!lp.lifted[lkey]) { lp.lifted[lkey] = { from: from, to: to, occ: [] }; lp.liftedOrder.push(lkey); }
        lp.lifted[lkey].occ.push(o);
        return;
      }

      if (problem) {
        var hint = problem.code === 'FLOW-001'
          ? ' If one end is not known in detail, tick "Lift to common level" on the connector.' : '';
        reportOnce(problem.code, from, to, at + problem.message + hint + ' Not exported.', o);
        return;
      }
      pairFor(from, to).occ.push(o);
    });
  });

  // An element and everything below it, through the merged parents.
  function isSelfOrBelow(id, ancestor) {
    for (var n = 0; id !== undefined && elements[id] && n <= sp.LEVELS.length; n++) {
      if (id === ancestor) return true;
      id = elements[id].parent;
    }
    return false;
  }

  // A lifted connection is superseded when a connector drawn at a single level
  // already links its ends (or elements below them): that flow projects onto
  // the same pair, so the lift adds nothing (specs §10.5.1).
  var declaredPairs = pairOrder.map(function(k) { return pairs[k]; })
                               .filter(function(p) { return p.occ.length > 0; });
  pairOrder.forEach(function(key) {
    var pair = pairs[key];
    pair.liftedOrder = pair.liftedOrder.filter(function(lkey) {
      var entry = pair.lifted[lkey];
      var by = declaredPairs.filter(function(d) {
        return isSelfOrBelow(d.from, entry.from) && isSelfOrBelow(d.to, entry.to);
      })[0];
      if (!by) return true;
      report('advisory', 'PP-012', 'Lifted connection "' + entry.from + '" → "' + entry.to + '" is already modelled as "' +
             by.from + '" → "' + by.to + '" — the lifted connector is left out and can be removed.',
             entry.occ.map(ref).concat([ref(by.occ[0])]));
      return false;
    });
  });

  var flowIdOwner = {};          // flow id -> label of its owner
  // id + description from a group of connectors (a flow or a lifted entry).
  function idAndDescription(occs, what, target) {
    var ids = distinct(occs, function(o) {
      var id = sp.getProperty(o.cell, sp.PROP_ID);
      if (id && !sp.isValidId(id)) {
        report('error', 'PP-002', 'Connector ' + _connectorLabel(sp, o.cell) + ' has an invalid ID "' + id + '" — ID ignored.', [ref(o)]);
        return null;
      }
      return id;
    });
    if (ids.length > 1) {
      report('error', 'PP-008', what + ' has several IDs (' +
             ids.map(function(i) { return '"' + i.value + '"'; }).join(', ') + ') — the first is used.',
             ids.map(function(i) { return ref(i.o); }));
    }
    if (ids.length) {
      var fid = ids[0].value;
      if (flowIdOwner[fid] !== undefined) {
        report('error', 'PP-008', 'Flow ID "' + fid + '" is used for ' + flowIdOwner[fid] + ' and ' + what +
               ' — the second is exported without ID.', [ref(ids[0].o)]);
      } else {
        flowIdOwner[fid] = what;
        target.id = fid;
      }
    }

    var descs = distinct(occs, function(o) { return _trimmed(sp.getProperty(o.cell, sp.PROP_DESCRIPTION)); });
    if (descs.length > 1) {
      report('warning', 'PP-009', what + ' has different descriptions on ' +
             _pageList(descs) + ' — the first is used.',
             descs.map(function(d) { return ref(d.o); }));
    }
    if (descs.length) target.description = sp.getProperty(descs[0].o.cell, sp.PROP_DESCRIPTION).trim();
  }

  var flows = [];
  pairOrder.forEach(function(key) {
    var pair = pairs[key];
    if (pair.occ.length === 0 && pair.liftedOrder.length === 0) return;   // all lifts superseded
    var flow = { from: pair.from, to: pair.to };
    idAndDescription(pair.occ, 'Flow "' + pair.from + '" → "' + pair.to + '"', flow);
    if (pair.occ.length === 0) flow.declared = false;

    if (pair.liftedOrder.length) {
      flow.lifted_from = pair.liftedOrder.map(function(lkey) {
        var e = pair.lifted[lkey];
        var entry = { from: e.from, to: e.to };
        idAndDescription(e.occ, 'Lifted connection "' + e.from + '" → "' + e.to + '"', entry);
        report('advisory', 'PP-010', 'Connection "' + e.from + '" → "' + e.to + '" (' +
               sp.getLevelLabel(elements[e.from].type) + ' → ' + sp.getLevelLabel(elements[e.to].type) +
               ') is exported lifted to "' + pair.from + '" → "' + pair.to + '".', e.occ.map(ref));
        return entry;
      }).sort(function(a, b) {
        if (a.from !== b.from) return a.from < b.from ? -1 : 1;
        return a.to < b.to ? -1 : (a.to > b.to ? 1 : 0);
      });
    }
    flows.push(flow);
  });

  // -------------------------------------------------------------------------
  // Workflow rules (WF-001 / WF-003 / WF-004)
  // -------------------------------------------------------------------------
  // How an element's (merged) parent was found, for messages:
  // 'nested in it on page "P"' or 'set by its Parent property on page "P"'.
  function parentOrigin(el) {
    var o = el._parentRef;
    return (sp.resolveParent(o.cell).source === 'container' ? 'nested in it' : 'set by its Parent property') +
           ' on page "' + o.pageName + '"';
  }

  // Services drawn within a Workflow's area (centre inside its bounds) on the
  // Workflow's own pages but resolving to another parent — the usual cause of
  // WF-001 (specs §10.7). Returns [{id, o}], one per Service.
  function servicesDrawnInside(wfId) {
    var found = [], seen = {};
    elements[wfId]._occ.forEach(function(w) {
      var wb = _absBounds(w.cell);
      if (!wb) return;
      occurrences.forEach(function(o) {
        if (o.page !== w.page || seen[o.id] || !o.id || !elements[o.id]) return;
        var el = elements[o.id];
        if (el.type !== 'service' || el.parent === wfId) return;
        var b = _absBounds(o.cell);
        if (!b) return;
        var cx = b.x + b.width / 2, cy = b.y + b.height / 2;
        if (cx < wb.x || cy < wb.y || cx > wb.x + wb.width || cy > wb.y + wb.height) return;
        seen[o.id] = true;
        found.push({ id: o.id, o: o });
      });
    });
    return found;
  }

  order.forEach(function(wfId) {
    var wf = elements[wfId];
    if (wf.type !== 'workflow') return;
    var at = [ref(wf._occ[0])];
    var services = order.filter(function(id) {
      return elements[id].parent === wfId && elements[id].type === 'service';
    });
    if (services.length === 0) {
      var inside = servicesDrawnInside(wfId);
      var msg = 'Workflow "' + wfId + '" contains no Service.';
      if (inside.length) {
        msg += ' Drawn inside it but belonging elsewhere: ' + inside.map(function(s) {
          var el = elements[s.id];
          return '"' + s.id + '" (' + (el.parent === undefined ? 'no parent'
            : 'parent "' + el.parent + '", ' + parentOrigin(el)) + ')';
        }).join(', ') + '.';
      }
      msg += ' A Service belongs to a Workflow when it is nested in the Workflow shape (it moves with it)' +
             ' or names the Workflow as its Parent.';
      report('error', 'WF-001', msg, at.concat(inside.map(function(s) { return ref(s.o); })));
      return;
    }
    if (services.length === 1) return;

    var member = {};
    services.forEach(function(id) { member[id] = true; });
    var internal = flows.filter(function(f) { return member[f.from] && member[f.to]; });

    var participating = {};
    internal.forEach(function(f) { participating[f.from] = participating[f.to] = true; });
    var idle = services.filter(function(id) { return !participating[id]; });
    idle.forEach(function(id) {
      var others = services.filter(function(o) { return o !== id; });
      report('error', 'WF-003', 'Service "' + id + '" takes part in no flow inside Workflow "' + wfId + '" (' +
             parentOrigin(elements[id]) + '). It needs a Service → Service connector to another of the Workflow\'s ' +
             'Services: ' + others.map(function(o) { return '"' + o + '"'; }).join(', ') + '. Connectors between ' +
             'their Nodes, to Services of other Workflows, or not exported do not count.',
             [ref(elements[id]._occ[0])]);
    });
    if (idle.length > 0) return;   // WF-004 would only repeat it

    // Weak connectivity (direction ignored).
    var group = {};
    services.forEach(function(id) { group[id] = id; });
    function find(x) { while (group[x] !== x) x = group[x] = group[group[x]]; return x; }
    internal.forEach(function(f) { group[find(f.from)] = find(f.to); });
    var roots = {};
    services.forEach(function(id) { roots[find(id)] = true; });
    if (Object.keys(roots).length > 1) {
      report('error', 'WF-004', 'The Services of Workflow "' + wfId + '" form ' + Object.keys(roots).length +
             ' unconnected groups; its internal flows must connect them all.', at);
    }
  });

  // -------------------------------------------------------------------------
  // 10.6.2 / 10.6.3 Ordering
  // -------------------------------------------------------------------------
  function byRankThenName(a, b) {
    var ea = elements[a], eb = elements[b];
    var ra = sp.getLevelRank(ea.type), rb = sp.getLevelRank(eb.type);
    if (ra !== rb) return ra - rb;
    var na = ea.name.toLowerCase(), nb = eb.name.toLowerCase();
    if (na !== nb) return na < nb ? -1 : 1;
    return a < b ? -1 : (a > b ? 1 : 0);
  }

  var children = {}, roots = [];
  order.forEach(function(id) {
    if (inCycle[id]) return;
    var p = elements[id].parent;
    if (p !== undefined && !inCycle[p]) (children[p] = children[p] || []).push(id);
    else if (p === undefined) roots.push(id);
  });
  var ordered = [];
  function visit(id) {
    ordered.push(id);
    (children[id] || []).sort(byRankThenName).forEach(visit);
  }
  roots.sort(byRankThenName).forEach(visit);
  // Elements whose parent is in a cycle, and the cycle members, go last.
  var placed = {};
  ordered.forEach(function(id) { placed[id] = true; });
  order.filter(function(id) { return !placed[id]; }).sort().forEach(function(id) { ordered.push(id); });

  flows.sort(function(a, b) {
    var ra = sp.getLevelRank(elements[a.from].type), rb = sp.getLevelRank(elements[b.from].type);
    if (ra !== rb) return ra - rb;
    if (a.from !== b.from) return a.from < b.from ? -1 : 1;
    return a.to < b.to ? -1 : (a.to > b.to ? 1 : 0);
  });

  findings.sort(function(a, b) { return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]; });

  return {
    elements: ordered.map(function(id) { return _publicElement(elements[id]); }),
    flows:    flows.map(_publicFlow),
    findings: findings,
    registry: registry ? { name: registry.name, version: registry.version } : null,
  };
}

// Absolute bounds of a vertex from the model alone (any page, not only the
// current graph): its geometry plus the offsets of its ancestors. null when a
// geometry is missing or relative.
function _absBounds(cell) {
  var g = cell && cell.geometry;
  if (!g || g.relative) return null;
  var x = g.x, y = g.y;
  for (var p = cell.parent; p; p = p.parent) {
    var pg = p.geometry;
    if (!pg) continue;
    if (pg.relative) return null;
    x += pg.x; y += pg.y;
  }
  return { x: x, y: y, width: g.width, height: g.height };
}

function _publicElement(el) {
  var out = { id: el.id, name: el.name, type: el.type };
  if (el.parent       !== undefined) out.parent       = el.parent;
  if (el.technology   !== undefined) out.technology   = el.technology;
  if (el.provisioning !== undefined) out.provisioning = el.provisioning;
  if (el.description  !== undefined) out.description  = el.description;
  return out;
}

// Field order of specs §10.6.3: id, from, to, declared, description, lifted_from.
function _publicFlow(f) {
  var out = {};
  if (f.id !== undefined) out.id = f.id;
  out.from = f.from;
  out.to = f.to;
  if (f.declared === false) out.declared = false;
  if (f.description !== undefined) out.description = f.description;
  if (f.lifted_from) out.lifted_from = f.lifted_from.map(_publicFlow);
  return out;
}

// "A, B" — each page once, in order.
function _pageList(values) {
  var names = [];
  values.forEach(function(v) { if (names.indexOf(v.o.pageName) === -1) names.push(v.o.pageName); });
  return names.join(', ');
}

function _trimmed(s) {
  return (s && s.trim()) ? s.trim() : null;
}

function _connectorLabel(sp, edge) {
  var name = sp.getProperty(edge, sp.PROP_ID) || sp.getProperty(edge, sp.PROP_NAME) || sp.getLabelText(edge);
  return name ? '"' + name + '"' : '(unnamed)';
}

// ---------------------------------------------------------------------------
// YAML (specs §10.6) — maps, lists, strings, numbers. Absent keys are simply
// not present in the objects, so nothing is written as null.
// ---------------------------------------------------------------------------

/**
 * model: result of buildModel. header: { source, generated } for the comment.
 */
function toYaml(model, header) {
  var doc = { modelVersion: 1 };
  if (model.registry) doc.technologyRegistry = { name: model.registry.name, version: model.registry.version };
  doc.elements = model.elements;
  doc.flows = model.flows;

  var lines = [];
  if (header) {
    lines.push('# Architecture model exported from: ' + _oneLine(header.source));
    lines.push('# Generated: ' + header.generated);
  }
  return lines.join('\n') + (lines.length ? '\n' : '') + _yamlMap(doc, '') + '\n';
}

function _oneLine(s) {
  return String(s || '').replace(/[\r\n]+/g, ' ');
}

function _yamlMap(obj, indent) {
  return Object.keys(obj).map(function(key) {
    return indent + key + ':' + _yamlValue(obj[key], indent);
  }).join('\n');
}

// Returns the text that follows "key:" — either " scalar" or a nested block.
function _yamlValue(val, indent) {
  if (Array.isArray(val)) {
    if (val.length === 0) return ' []';
    return '\n' + val.map(function(item) {
      if (item && typeof item === 'object') {
        // First key shares the "- " line; the rest align under it.
        return indent + '  - ' + _yamlMap(item, indent + '    ').substring(indent.length + 4);
      }
      return indent + '  -' + _yamlValue(item, indent + '  ');
    }).join('\n');
  }
  if (val && typeof val === 'object') {
    if (Object.keys(val).length === 0) return ' {}';
    return '\n' + _yamlMap(val, indent + '  ');
  }
  return ' ' + _yamlScalar(val, indent);
}

function _yamlScalar(val, indent) {
  if (val === null || val === undefined) return 'null';
  if (typeof val === 'boolean') return String(val);
  if (typeof val === 'number' && isFinite(val)) return String(val);
  var s = String(val);

  // Multi-line text: literal block, when it round-trips exactly.
  if (s.indexOf('\n') !== -1 && !/[\r\t]/.test(s) && !/^\s/.test(s) && !/\s$/.test(s) &&
      !/[ ]\n/.test(s)) {
    var pad = indent + '  ';
    return '|-\n' + s.split('\n').map(function(l) { return l ? pad + l : ''; }).join('\n');
  }

  // Plain scalar only for text that cannot be misread as another YAML type.
  var plain = /^[A-Za-z_][A-Za-z0-9 _.,()\/-]*$/.test(s) && !/\s$/.test(s) &&
              !/^(y|n|yes|no|on|off|true|false|null)$/i.test(s);
  // JSON string syntax is a valid YAML double-quoted scalar.
  return plain ? s : JSON.stringify(s);
}

module.exports = {
  buildModel: buildModel,
  toYaml: toYaml,
};
