'use strict';
// Ad-hoc checks for the step-2 model layer, with a minimal mxGraph mock.
var assert = require('assert');
var path = require('path');
var SRC = process.argv[2] || path.join(__dirname, '..', 'src');

function El(attrs) { this.a = Object.assign({}, attrs); }
El.prototype.getAttribute = function(k) { return this.a[k] === undefined ? null : this.a[k]; };
El.prototype.setAttribute = function(k, v) { this.a[k] = String(v); };
El.prototype.removeAttribute = function(k) { delete this.a[k]; };
El.prototype.cloneNode = function() { return new El(this.a); };
global.mxUtils = { createXmlDocument: function() { return { createElement: function() { return new El({}); } }; } };

var sp = require(SRC + '/ShapeProperties');
var reg = require(SRC + '/TechnologyRegistry');

var nextId = 0;
function cell(attrs, geo, extra) {
  var c = Object.assign({ id: 'c' + (nextId++), vertex: true, value: new El(Object.assign({ label: attrs && attrs.prop_name || '' }, attrs)),
    geometry: geo ? { x: geo[0], y: geo[1], width: geo[2], height: geo[3], clone: function() { return Object.assign({}, this); } } : null,
    children: [], parent: null, style: '' }, extra || {});
  return c;
}
function makePage(name) {
  var root = { id: name + '-0', children: [], parent: null };
  var layer = { id: name + '-1', children: [], parent: root };
  root.children.push(layer);
  var cells = {};
  function reg(c) { cells[c.id] = c; (c.children || []).forEach(reg); }
  var model = {
    root: root, cells: cells, n: 0,
    beginUpdate: function() { this.n++; }, endUpdate: function() { this.n--; },
    setValue: function(c, v) { c.value = v; },
    getParent: function(c) { return c.parent; },
    getGeometry: function(c) { return c.geometry; },
    setGeometry: function(c, g) { c.geometry = g; },
    getStyle: function(c) { return c.style; }, setStyle: function(c, s) { c.style = s; },
    getTerminal: function(e, src) { return src ? e.source : e.target; },
    add: function(p, c) {
      if (c.parent) c.parent.children.splice(c.parent.children.indexOf(c), 1);
      p.children = p.children || []; p.children.push(c); c.parent = p; cells[c.id] = c;
    },
  };
  var graph = { model: model, getDefaultParent: function() { return layer; } };
  return { name: name, getName: function() { return name; }, root: root, layer: layer, graph: graph,
    add: function(c, parent) { model.add(parent || layer, c); reg(c); return c; } };
}
function ui(pages, current) {
  return { pages: pages, currentPage: current, editor: { graph: current.graph } };
}

// --- hierarchy table ---
assert.deepStrictEqual(sp.getChildLevels('software-system'), ['workflow', 'tier', 'node']);
assert.deepStrictEqual(sp.getParentLevels('node'), ['service', 'software-system']);
assert.deepStrictEqual(sp.getParentLevels('organization'), []);
assert.deepStrictEqual(sp.getChildLevels('node'), []);
assert(sp.isLegalParent('service', 'tier') && !sp.isLegalParent('service', 'software-system'));

// --- ids ---
assert.strictEqual(sp.slugifyId('Ingestion Lambda'), 'ingestion-lambda');
assert.strictEqual(sp.slugifyId('  Café / Señor (EU) '), 'cafe-senor-eu');
assert.strictEqual(sp.slugifyId('---'), '');
assert(sp.isValidId('trade.ingestion.lambda') && sp.isValidId('a') && !sp.isValidId('-a') && !sp.isValidId('A') && !sp.isValidId('a-'));
assert.strictEqual(sp.slugifyId('x'.repeat(150)).length, 100);

// --- pages ---
var p1 = makePage('Context'), p2 = makePage('Detail');
var sys = p1.add(cell({ prop_name: 'Trade', prop_level: 'software-system', prop_id: 'trade' }, [0, 0, 1000, 1000]));
var svc = p1.add(cell({ prop_name: 'Ingestion', prop_level: 'service', prop_id: 'ingestion' }, [100, 100, 300, 300]));
var node = p1.add(cell({ prop_name: 'Lambda', prop_level: 'node', prop_id: 'lambda' }, [150, 150, 50, 50]));
var topic = p1.add(cell({ prop_name: 'Topic', prop_level: 'node', prop_id: 'topic', prop_parent: 'stale' }, [600, 600, 50, 50]));
var wf = p1.add(cell({ prop_name: 'Flow', prop_level: 'workflow', prop_id: 'flow' }, [50, 50, 500, 500]));
var U = ui([p1, p2], p1);

// innermost container: node inside service inside system → service
assert.strictEqual(sp.findValidParent(p1.graph, node), svc);
// node only in the system → system (shared infra)
assert.strictEqual(sp.findValidParent(p1.graph, topic), sys);
// service inside workflow inside system → workflow
assert.strictEqual(sp.findValidParent(p1.graph, svc), wf);

// overlapping (not nested) candidates → throws
var p3 = makePage('Overlap');
p3.add(cell({ prop_name: 'S1', prop_level: 'service', prop_id: 's1' }, [0, 0, 100, 100]));
p3.add(cell({ prop_name: 'S2', prop_level: 'service', prop_id: 's2' }, [10, 10, 100, 100]));
var n3 = p3.add(cell({ prop_name: 'N', prop_level: 'node', prop_id: 'n' }, [20, 20, 10, 10]));
assert.throws(function() { sp.findValidParent(p3.graph, n3); }, /multiple/);

// reparent: topic into system, prop_parent cleared
sp.reparentCell(p1.graph, topic);
assert.strictEqual(topic.parent, sys);
assert.strictEqual(sp.getProperty(topic, 'prop_parent'), null);
assert(/container=1/.test(sys.style));
assert.strictEqual(topic.geometry.x, 600); // relative to sys at 0,0

// adoption from the system: adopts the workflow, not the service or the lambda
var adopted = sp.adoptChildren(p1.graph, sys);
assert.strictEqual(wf.parent, sys);
assert.strictEqual(svc.parent, p1.layer);
assert.strictEqual(node.parent, p1.layer);
assert.strictEqual(adopted, 1);
sp.adoptChildren(p1.graph, wf);
assert.strictEqual(svc.parent, wf);
assert.strictEqual(svc.geometry.x, 50); // 100 abs - 50 wf
sp.adoptChildren(p1.graph, svc);
assert.strictEqual(node.parent, svc);
assert.strictEqual(node.geometry.x, 50); // 150 abs - 100 svc

// resolveParent
assert.deepStrictEqual(sp.resolveParent(node).id, 'ingestion');
var lone = p2.add(cell({ prop_name: 'Ingestion', prop_level: 'service', prop_id: 'ingestion', prop_parent: 'flow' }, [0, 0, 10, 10]));
assert.deepStrictEqual(sp.resolveParent(lone), { source: 'explicit', id: 'flow' });
var orphan = p2.add(cell({ prop_name: 'X', prop_level: 'service', prop_id: 'x' }, [500, 500, 10, 10]));
assert.deepStrictEqual(sp.resolveParent(orphan), { source: null, id: null });

// plain group between node and service is skipped
var group = cell({}, [0, 0, 10, 10]); group.value = '';
svc.children.push(group); group.parent = svc;
var deep = cell({ prop_name: 'Deep', prop_level: 'node', prop_id: 'deep' }, [0, 0, 1, 1]);
group.children.push(deep); deep.parent = group;
assert.strictEqual(sp.getContainerAncestor(deep), svc);

// missing props / complete source
assert.deepStrictEqual(sp.getMissingProperties(cell({ prop_name: 'A' })), ['prop_id', 'prop_level']);
assert.deepStrictEqual(sp.getMissingProperties(svc), []);

assert(sp.isCompleteSource(svc));

// sync props
var tgtInContainer = node, tgtLoose = orphan;
assert.deepStrictEqual(Object.keys(sp.getSyncProps(lone, tgtLoose)).sort(), ['prop_id', 'prop_level', 'prop_name', 'prop_parent']);
assert.deepStrictEqual(Object.keys(sp.getSyncProps(lone, tgtInContainer)).sort(), ['prop_id', 'prop_level', 'prop_name']);
assert.deepStrictEqual(Object.keys(sp.getSyncProps(lone)).sort(), ['prop_id', 'prop_level', 'prop_name']);

// validateId
assert.strictEqual(sp.validateId(p1.graph, node, 'lambda'), null);           // its own id
assert(/already used/.test(sp.validateId(p1.graph, node, 'topic')));          // other shape same page
assert(/lowercase/.test(sp.validateId(p1.graph, node, 'Bad Id')));
assert.strictEqual(sp.validateId(p1.graph, node, 'ingestion-x'), null);
// connectors are a separate namespace
var e1 = { id: 'e1', edge: true, value: new El({ prop_id: 'topic' }), source: node, target: topic, parent: p1.layer };
p1.layer.children.push(e1);
assert.strictEqual(sp.validateId(p1.graph, e1, 'topic'), null);

// other pages with id
assert.deepStrictEqual(sp.findOtherPagesWithId(U, svc, 'ingestion').map(function(r) { return r.pageName; }), ['Detail']);

// suggestId: copy on other page with same label+shape → reuse; different label → suffix
var fresh = p1.add(cell({ prop_name: 'Ingestion' }, [900, 900, 10, 10]));
var U2 = ui([p1, p2], p2);
var freshP2 = p2.add(cell({ prop_name: 'Ingestion' }, [900, 900, 10, 10]));
freshP2.value.setAttribute('label', 'Ingestion');
// on p2 'ingestion' is used on the same page (lone) → suffix
assert.strictEqual(sp.suggestId(U2, freshP2, 'Ingestion'), 'ingestion-2');
// on a third page, copies (same label, same shape) don't block it
var p4 = makePage('Third');
var copy = p4.add(cell({ prop_name: 'Ingestion' }, [0, 0, 1, 1]));
assert.strictEqual(sp.suggestId(ui([p1, p2, p4], p4), copy, 'Ingestion'), 'ingestion');
// different label text → blocked
var other = p4.add(cell({ prop_name: 'Lambda' }, [0, 0, 1, 1])); other.value.setAttribute('label', 'Something else');
assert.strictEqual(sp.suggestId(ui([p1, p2, p4], p4), other, 'Lambda'), 'lambda-2');
assert.strictEqual(sp.suggestId(U, fresh, '***'), '');

// collectElements / parent candidates
var els = sp.collectElements(U);
var ing = els.filter(function(e) { return e.id === 'ingestion'; })[0];
assert.deepStrictEqual(ing.pageNames, ['Context', 'Detail']);
assert.strictEqual(ing.occurrences.length, 2);
assert.deepStrictEqual(sp.getParentCandidates(U, 'node', 'lambda').map(function(e) { return e.id; }), ['ingestion', 'trade', 'x']);
assert.deepStrictEqual(sp.getParentCandidates(U, 'organization'), []);

// flow problems
function edge(s, t, attrs) { return { edge: true, value: new El(attrs || {}), source: s, target: t }; }
assert.strictEqual(sp.getFlowProblem(edge(node, topic)), null);
// an end outside the model: loose, ignored, or no architecture properties → skipped, not a finding
assert.strictEqual(sp.getFlowProblem(edge(node, null)).code, 'SKIP');
assert.strictEqual(sp.getFlowProblem(edge(null, node)).skip, true);
assert.strictEqual(sp.getFlowProblem(edge(node, cell({ prop_name: 'X', prop_level: 'node', prop_id: 'x', properties_ignored: 'true' }))).code, 'SKIP');
assert.strictEqual(sp.getFlowProblem(edge(node, cell({ label: 'Note', prop_tags: 'aws' }))).code, 'SKIP'); // tags only
assert.strictEqual(sp.getFlowProblem(edge(cell({ label: 'Box' }), fresh)).code, 'SKIP'); // skip wins over the other end's error
// an end with some architecture property but incomplete → PP-007
assert.strictEqual(sp.getFlowProblem(edge(node, fresh)).code, 'PP-007'); // fresh has no id
assert.strictEqual(sp.getFlowProblem(edge(node, cell({ prop_description: 'half done' }))).code, 'PP-007');
assert.strictEqual(sp.getFlowProblem(edge(node, cell({ prop_name: 'N', prop_level: 'node', prop_id: 'Bad Id' }))).code, 'PP-007');
assert.strictEqual(sp.getFlowProblem(edge(svc, node)).code, 'FLOW-001');
assert.strictEqual(sp.getFlowProblem(edge(svc, lone)).code, 'FLOW-009');
var org = p1.add(cell({ prop_name: 'Org', prop_level: 'organization', prop_id: 'org' }, [5000, 0, 1, 1]));
var org2 = p1.add(cell({ prop_name: 'Org2', prop_level: 'organization', prop_id: 'org2' }, [6000, 0, 1, 1]));
assert.strictEqual(sp.getFlowProblem(edge(org, org2)).code, 'FLOW-010');
assert.strictEqual(sp.getFlowProblem(edge(wf, cell({ prop_name: 'T', prop_level: 'tier', prop_id: 't' }))), null); // Workflow↔Tier OK
assert.strictEqual(sp.getFlowProblem(edge(node, topic, { properties_ignored: 'true' })), null);

// --- planMissingIds (fix PP-001) ---
(function() {
  var a = makePage('A'), b = makePage('B'), c = makePage('C');
  a.add(cell({ prop_name: 'Billing', prop_level: 'service', prop_id: 'billing' }));
  var bBill = b.add(cell({ prop_name: 'Billing', prop_level: 'service' }));        // reuse 'billing'
  var aBill2 = a.add(cell({ prop_name: 'Billing', prop_level: 'service' }));       // 'billing' taken on A → new
  var aQ = a.add(cell({ prop_name: 'Queue', prop_level: 'node' }));                // new 'queue'
  var bQ = b.add(cell({ prop_name: 'Queue', prop_level: 'node' }));                // same group → 'queue'
  var bQ2 = b.add(cell({ prop_name: 'Queue', prop_level: 'node' }));               // twice on B → new
  var cQ = c.add(cell({ prop_name: 'Queue', prop_level: 'node' }));                // → 'queue'
  a.add(cell({ prop_name: 'Queue Svc', prop_level: 'service', prop_id: 'queue-2' })); // forces skipping -2
  var cQs = c.add(cell({ prop_name: 'Queue', prop_level: 'service' }));            // other level → own new ID
  c.add(cell({ prop_name: 'Amb', prop_level: 'tier', prop_id: 'amb-1' }));
  b.add(cell({ prop_name: 'Amb', prop_level: 'tier', prop_id: 'amb-2' }));
  var cAmb = c.add(cell({ prop_name: 'Amb', prop_level: 'tier' }));                // ambiguous → skipped
  var ign = a.add(cell({ prop_name: 'Ign', prop_level: 'tier', properties_ignored: 'true' }));
  a.add(cell({ prop_name: 'NoLevel' }));
  var plan = sp.planMissingIds(ui([a, b, c], a));
  var got = {};
  plan.items.forEach(function(it) { got[it.cell.id] = it.id + (it.reused ? '*' : ''); });
  assert.strictEqual(got[bBill.id], 'billing*');
  assert.strictEqual(got[aBill2.id], 'billing-2');
  assert.strictEqual(got[aQ.id], 'queue');
  assert.strictEqual(got[bQ.id], 'queue');
  assert.strictEqual(got[bQ2.id], 'queue-3');
  assert.strictEqual(got[cQ.id], 'queue');
  assert.strictEqual(got[cQs.id], 'queue-4');
  assert(!(cAmb.id in got) && !(ign.id in got));
  assert.strictEqual(plan.items.length, 7);
  assert.strictEqual(plan.notices.length, 1);
  assert(/amb-2, amb-1/.test(plan.notices[0]));
})();

// --- registry ---
var warnings = [];
var origWarn = console.warn; console.warn = function(m) { warnings.push(m); };
assert.strictEqual(reg.parseConfig(undefined), null);
assert.strictEqual(reg.parseConfig({ name: 'x', technologies: {} }), null);
var r = reg.parseConfig({ name: ' acme ', version: 3, technologies: {
  AWS_LAMBDA: { kind: 'COMPUTE', executable: true },
  bad_key: { kind: 'COMPUTE', executable: true },
  AWS_X: { kind: 'NOPE', executable: true },
  AWS_Y: { kind: 'STORAGE' },
} });
assert.deepStrictEqual(r, { name: 'acme', version: '3', technologies: { AWS_LAMBDA: { kind: 'COMPUTE', executable: true } } });
assert.strictEqual(warnings.length, 4); // missing version + 3 bad entries
global.window = {};
reg._reset();
assert(!reg.isLoaded());
assert.deepStrictEqual(reg.getTechnologyKeys(), []);
window.ArchitectureConfig = { name: 'a', version: '1', technologies: { AWS_S3: { kind: 'STORAGE', executable: false }, AWS_LAMBDA: { kind: 'COMPUTE', executable: true } } };
assert(!reg.isLoaded()); // cached as not loaded until reset (restart)
reg._reset();
assert(reg.isLoaded());
assert.deepStrictEqual(reg.getTechnologyKeys(), ['AWS_LAMBDA', 'AWS_S3']);
assert.strictEqual(reg.getKind('AWS_S3'), 'STORAGE');
assert(reg.isKnownTechnology('AWS_LAMBDA') && !reg.isKnownTechnology('X'));
console.warn = origWarn;

console.log('all checks passed');
