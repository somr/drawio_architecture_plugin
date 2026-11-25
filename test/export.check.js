'use strict';
// Checks for ArchitectureModel (step 4) with a minimal mxGraph mock.
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var SRC = process.argv[2] || path.join(__dirname, '..', 'src');
var OUT = process.argv[3] || fs.mkdtempSync(path.join(require('os').tmpdir(), 'pp-export-'));

function El(attrs) { this.a = Object.assign({}, attrs); }
El.prototype.getAttribute = function(k) { return this.a[k] === undefined ? null : this.a[k]; };
El.prototype.setAttribute = function(k, v) { this.a[k] = String(v); };
El.prototype.removeAttribute = function(k) { delete this.a[k]; };
El.prototype.cloneNode = function() { return new El(this.a); };
global.mxUtils = { createXmlDocument: function() { return { createElement: function() { return new El({}); } }; } };

var sp = require(SRC + '/ShapeProperties');
var AM = require(SRC + '/ArchitectureModel');
var TR = require(SRC + '/TechnologyRegistry');

var n = 0;
function makePage(name) {
  var root = { id: 'r' + n++, children: [] };
  var layer = { id: 'l' + n++, children: [], parent: root };
  root.children.push(layer);
  var page = { getName: function() { return name; }, root: root,
    graph: { model: { root: root } } };
  page.shape = function(id, name, level, parent, extra) {
    var attrs = Object.assign({ label: name, prop_name: name, prop_level: level }, extra || {});
    if (id) attrs.prop_id = id;
    var c = { id: 'c' + n++, vertex: true, value: new El(attrs), children: [], parent: parent || layer, style: '' };
    c.parent.children.push(c);
    return c;
  };
  page.edge = function(src, tgt, extra) {
    var e = { id: 'e' + n++, edge: true, value: new El(extra || {}), source: src, target: tgt, parent: layer, children: [] };
    layer.children.push(e);
    return e;
  };
  return page;
}
function ui(pages) { return { pages: pages, currentPage: pages[0], editor: { graph: pages[0].graph } }; }

var REGISTRY = TR.parseConfig({ name: 'acme-aws', version: '3', technologies: {
  AWS_LAMBDA: { kind: 'COMPUTE', executable: true }, SPARK_JOB: { kind: 'COMPUTE', executable: true },
  AWS_S3: { kind: 'STORAGE', executable: false }, AWS_SNS: { kind: 'MESSAGING', executable: false },
  AWS_SQS: { kind: 'MESSAGING', executable: false }, AWS_KMS: { kind: 'SECURITY', executable: false },
} });

// ---------------------------------------------------------------------------
// 1. Clean model — metamodel §18 worked example over two pages
// ---------------------------------------------------------------------------
var ctx = makePage('Context'), proc = makePage('Processing');
var gt = ctx.shape('global-trade', 'Global Trade', 'organization');
var tp1 = ctx.shape('trade-processing', 'Trade Processing', 'software-system', gt, { prop_description: 'Processes incoming trade experiences.' });
var ed = ctx.shape('enterprise-data', 'Enterprise Data', 'organization');
var crd = ctx.shape('company-reference-data', 'Company Reference Data', 'software-system', ed);
ctx.edge(crd, tp1, { prop_id: 'system-reference-data-flow', prop_description: 'Company reference data is supplied to Trade Processing.' });
ctx.shape(null, 'Sticky note', null); // not an element: no level → silently skipped

var tp2 = proc.shape('trade-processing', 'Trade Processing', 'software-system'); // same element, no container here
var ep  = proc.shape('experience-processing', 'Experience Processing', 'workflow', tp2);
var ing = proc.shape('ingestion', 'Ingestion', 'service', ep);
var nor = proc.shape('normalization', 'Normalization', 'service', ep, { prop_description: 'Normalizes incoming trade experiences.\nCanonical model v3.' });
var pub = proc.shape('publication', 'Publication', 'service', ep);
var il  = proc.shape('ingestion-lambda', 'Ingestion Lambda', 'node', ing, { prop_technology: 'AWS_LAMBDA', prop_provisioning: 'IAC' });
var nj  = proc.shape('normalization-job', 'Normalization Spark Job', 'node', nor, { prop_technology: 'SPARK_JOB', prop_provisioning: 'IAC' });
var pl  = proc.shape('publisher-lambda', 'Publisher Lambda', 'node', pub, { prop_technology: 'AWS_LAMBDA', prop_provisioning: 'IAC' });
var dt  = proc.shape('data-tier', 'Data', 'tier', tp2);
var cd  = proc.shape('curated-data', 'Curated Data', 'service', dt);
var cb  = proc.shape('curated-bucket', 'Curated Bucket', 'node', cd, { prop_technology: 'AWS_S3', prop_provisioning: 'IAC' });
var pt  = proc.shape('published-topic', 'Published Topic', 'node', tp2, { prop_technology: 'AWS_SNS', prop_provisioning: 'IAC' });
var dq  = proc.shape('delivery-queue', 'Delivery Queue', 'node', tp2, { prop_technology: 'AWS_SQS', prop_provisioning: 'IAC' });
proc.shape('shared-kms-key', 'Shared KMS Key', 'node', tp2, { prop_technology: 'AWS_KMS', prop_provisioning: 'IAC' });
// group in between: plain group inside the tier containing nothing eligible but a node? keep simple
proc.edge(ing, nor, { prop_id: 'ingestion-to-normalization', prop_description: 'Ingested records are provided for normalization.' });
proc.edge(nor, pub);
proc.edge(nor, cd);
proc.edge(il, nj); proc.edge(nj, cb); proc.edge(nj, pl); proc.edge(pl, pt); proc.edge(pt, dq);
proc.edge(ing, nor); // duplicate pair, no id → merged silently

var m1 = AM.buildModel(ui([ctx, proc]), sp, REGISTRY);
assert.deepStrictEqual(m1.findings.map(function(f) { return f.code + ' ' + f.message; }), []);
assert.strictEqual(m1.elements.length, 17);
assert.strictEqual(m1.flows.length, 9);
var yaml1 = AM.toYaml(m1, { source: 'Trade.drawio', generated: '2026-11-16' });
fs.writeFileSync(OUT + '/clean.yaml', yaml1);

var expectedHead = [
  '# Architecture model exported from: Trade.drawio',
  '# Generated: 2026-11-16',
  'modelVersion: 1',
  'technologyRegistry:',
  '  name: acme-aws',
  '  version: "3"',
  'elements:',
  '  - id: enterprise-data',
  '    name: Enterprise Data',
  '    type: organization',
  '  - id: company-reference-data',
  '    name: Company Reference Data',
  '    type: software-system',
  '    parent: enterprise-data',
  '  - id: global-trade',
  '    name: Global Trade',
  '    type: organization',
  '  - id: trade-processing',
  '    name: Trade Processing',
  '    type: software-system',
  '    parent: global-trade',
  '    description: Processes incoming trade experiences.',
  '  - id: data-tier',
  '    name: Data',
  '    type: tier',
  '    parent: trade-processing',
].join('\n');
assert.strictEqual(yaml1.substring(0, expectedHead.length), expectedHead);
assert(yaml1.indexOf([
  '  - id: normalization',
  '    name: Normalization',
  '    type: service',
  '    parent: experience-processing',
  '    description: |-',
  '      Normalizes incoming trade experiences.',
  '      Canonical model v3.',
].join('\n')) !== -1, 'multi-line description');
assert(yaml1.indexOf([
  'flows:',
  '  - id: system-reference-data-flow',
  '    from: company-reference-data',
  '    to: trade-processing',
  '    description: Company reference data is supplied to Trade Processing.',
  '  - id: ingestion-to-normalization',
  '    from: ingestion',
  '    to: normalization',
].join('\n')) !== -1, 'flows head');
assert(yaml1.indexOf('null') === -1, 'no nulls');
// Nodes directly under the system come after the tier/workflow (rank order)
var order = m1.elements.map(function(e) { return e.id; });
assert(order.indexOf('published-topic') > order.indexOf('experience-processing'));
assert(order.indexOf('ingestion-lambda') === order.indexOf('ingestion') + 1);
// No registry → no header block, PP-005 warning
var m1b = AM.buildModel(ui([ctx, proc]), sp, null);
assert.deepStrictEqual(m1b.findings.map(function(f) { return f.code; }), ['PP-005']);
assert(AM.toYaml(m1b).indexOf('technologyRegistry') === -1);

// ---------------------------------------------------------------------------
// 2. Every finding
// ---------------------------------------------------------------------------
var a = makePage('A'), b = makePage('B');
var org = a.shape('org', 'Org', 'organization');
var sys = a.shape('sys', 'Sys', 'software-system', org);
a.shape(null, 'No Id', 'service', sys);                                     // PP-001
a.shape('Bad Id', 'Bad', 'service');                                        // PP-002
var wf = a.shape('wf', 'WF', 'workflow', sys, { prop_description: 'one' });
var s1 = a.shape('s1', 'S1', 'service', wf);
var s2 = a.shape('s2', 'S2', 'service', wf);
var s3 = a.shape('s3', 'S3', 'service', wf);
var s4 = a.shape('s4', 'S4', 'service', wf);
a.shape('s1', 'S1 dup', 'service', wf);                                     // ID-001
a.edge(s1, s2, { prop_id: 'f12', prop_description: 'x' });
a.edge(s3, s4, { prop_id: 'f12' });                                         // PP-008 same id, other pair
a.edge(s1, s2, { prop_id: 'f12b', prop_description: 'y' });                 // PP-008 several ids + PP-009
var emptyWf = a.shape('wf-empty', 'Empty WF', 'workflow', sys);             // WF-001
var wf2 = a.shape('wf2', 'WF2', 'workflow', sys);
var t1 = a.shape('t1', 'T1', 'service', wf2);
a.shape('t2', 'T2', 'service', wf2);                                        // WF-003 (t2 idle)
var t3 = a.shape('t3', 'T3', 'service', wf2);
a.edge(t1, t3);
var lone = a.shape('lone', 'Lone', 'service');                              // HIER-001
var badParent = a.shape('bp', 'BadParent', 'service', sys);                 // HIER-002 (service in system)
var ref = a.shape('ref', 'Ref', 'service', null, { prop_parent: 'nowhere' }); // REF-001 (+ HIER-001)
var c1 = a.shape('cy1', 'Cy1', 'workflow', null, { prop_parent: 'cy2' });  // HIER-002 + cycle
var c2 = a.shape('cy2', 'Cy2', 'software-system', null, { prop_parent: 'cy1' });
var n1 = a.shape('n1', 'N1', 'node', s1, { prop_technology: 'MAINFRAME', prop_provisioning: 'Terraform' }); // REF-003, PP-006
a.edge(s1, n1);                                                             // FLOW-001
a.edge(org, a.shape('org2', 'Org2', 'organization'));                       // FLOW-010
a.edge(s1, null);                                                           // loose end → skipped silently
var note = a.shape(null, 'Note', null); note.value.removeAttribute('prop_name'); note.value.removeAttribute('prop_level');
a.edge(s1, note);                                                           // decoration → skipped silently
a.edge(s2, a.shape(null, 'Half', 'service'));                               // PP-007 (no id; also PP-001)
a.edge(lone, lone, { properties_ignored: 'true' });                         // ignored → nothing
var wfB = b.shape('wf', 'WF renamed', 'workflow', null, { prop_description: 'two' }); // PP-003 name, PP-004
b.edge(b.shape('s1', 'S1', 'service'), a.shape('x-s1', 'X', 'service')); // cross-page edge? separate pages: s1 copy → FLOW-009 below
var s1b = b.shape('s1', 'S1', 'service');                                   // second s1 on page B → ID-001 on B
var m2 = AM.buildModel(ui([a, b]), sp, REGISTRY);
var pp007 = m2.findings.filter(function(f) { return f.code === 'PP-007'; });
assert.strictEqual(pp007.length, 1, pp007.map(function(f) { return f.message; }).join('\n'));
assert(pp007[0].message.indexOf('Target shape has no ID.') !== -1);
var codes = m2.findings.map(function(f) { return f.code; });
fs.writeFileSync(OUT + '/findings.txt', m2.findings.map(function(f) {
  return f.severity + ' ' + f.code + ' ' + f.message + ' @ ' + f.refs.map(function(r) { return r.pageName; }).join(',');
}).join('\n') + '\n');
['PP-001', 'PP-002', 'ID-001', 'PP-008', 'PP-009', 'WF-001', 'WF-003', 'HIER-001', 'HIER-002', 'REF-001',
 'HIER-004', 'REF-003', 'PP-006', 'FLOW-001', 'FLOW-010', 'PP-007', 'PP-003', 'PP-004'].forEach(function(c) {
  assert(codes.indexOf(c) !== -1, 'missing finding ' + c);
});
assert(codes.indexOf('PP-005') === -1);
var hier1 = m2.findings.filter(function(f) { return f.code === 'HIER-001' && f.message.indexOf('"lone"') !== -1; });
assert.strictEqual(hier1.length, 1);
assert(hier1[0].message.indexOf('Place it inside a Workflow or a Tier, or pick one in its Parent field.') !== -1, hier1[0].message);
var hier2 = m2.findings.filter(function(f) { return f.code === 'HIER-002' && f.message.indexOf('"bp"') !== -1; });
assert.strictEqual(hier2.length, 1);
assert(hier2[0].message.indexOf('A Service belongs inside a Workflow or a Tier.') !== -1, hier2[0].message);
// errors first
var sev = m2.findings.map(function(f) { return f.severity; });
assert.deepStrictEqual(sev.slice().sort(function(x, y) { return ['error','warning','advisory'].indexOf(x) - ['error','warning','advisory'].indexOf(y); }), sev);
// Faithful output: invalid flows excluded, ids handled
var fl = m2.flows.map(function(f) { return (f.id || '-') + ':' + f.from + '>' + f.to; });
assert(fl.indexOf('f12:s1>s2') !== -1);
assert(fl.indexOf('-:s3>s4') !== -1);
assert(!m2.flows.some(function(f) { return f.to === 'n1' || f.from === 'org'; }));
var refEl = m2.elements.filter(function(e) { return e.id === 'ref'; })[0];
assert.strictEqual(refEl.parent, undefined);
var ids = m2.elements.map(function(e) { return e.id; });
assert.deepStrictEqual(ids.slice(-2).sort(), ['cy1', 'cy2']); // cycle last
assert.strictEqual(ids.filter(function(i) { return i === 's1'; }).length, 1);

// WF-004: two internal groups
var w = makePage('W');
var o3 = w.shape('o', 'O', 'organization'), s3s = w.shape('sy', 'Sy', 'software-system', o3);
var wfx = w.shape('wfx', 'WFX', 'workflow', s3s);
var p1 = w.shape('p1', 'P1', 'service', wfx), p2 = w.shape('p2', 'P2', 'service', wfx);
var p3 = w.shape('p3', 'P3', 'service', wfx), p4 = w.shape('p4', 'P4', 'service', wfx);
w.edge(p1, p2); w.edge(p3, p4);
var m3 = AM.buildModel(ui([w]), sp, REGISTRY);
assert.deepStrictEqual(m3.findings.map(function(f) { return f.code; }), ['WF-004']);
w.edge(p4, p1);
assert.deepStrictEqual(AM.buildModel(ui([w]), sp, REGISTRY).findings, []);

// WF-001 / WF-003 messages: a Service drawn over a Workflow but not nested in
// it (parent from its Parent property) is named on WF-001; WF-003 names the
// parent origin and the other Services.
var g = makePage('G');
var go = g.shape('o', 'O', 'organization'), gs = g.shape('sy', 'Sy', 'software-system', go);
var wfA = g.shape('wf-a', 'WF A', 'workflow', gs);
var wfB2 = g.shape('wf-b', 'WF B', 'workflow', gs);
gs.geometry = { x: 100, y: 100, width: 1000, height: 600 };
wfA.geometry = { x: 10, y: 10, width: 300, height: 200 };     // absolute 110,110 – 410,310
wfB2.geometry = { x: 400, y: 10, width: 300, height: 200 };
var over = g.shape('over', 'Over', 'service', null, { prop_parent: 'wf-b' });
over.geometry = { x: 150, y: 150, width: 80, height: 40 };    // top level, centre inside wf-a
var q1 = g.shape('q1', 'Q1', 'service', wfB2), q2 = g.shape('q2', 'Q2', 'service', wfB2);
q1.geometry = { x: 20, y: 20, width: 80, height: 40 };        // nested: absolute 520,130 – outside wf-a
g.edge(q1, q2);
var mg = AM.buildModel(ui([g]), sp, REGISTRY);
assert.deepStrictEqual(mg.findings.map(function(f) { return f.code; }), ['WF-001', 'WF-003']);
var wf001 = mg.findings[0], wf003 = mg.findings[1];
assert(wf001.message.indexOf('Drawn inside it but belonging elsewhere: "over" (parent "wf-b", set by its Parent property on page "G")') !== -1, wf001.message);
assert.strictEqual(wf001.refs.length, 2);
assert.strictEqual(wf001.refs[1].cell, over);
assert(wf003.message.indexOf('Service "over" takes part in no flow inside Workflow "wf-b" (set by its Parent property on page "G")') === 0, wf003.message);
assert(wf003.message.indexOf('Services: "q1", "q2".') !== -1, wf003.message);
var wf003b = m2.findings.filter(function(f) { return f.code === 'WF-003'; })[0];
assert(wf003b.message.indexOf('Workflow "wf2" (nested in it on page "A")') !== -1, wf003b.message);
// no geometry → generic hint only
var wf001b = m2.findings.filter(function(f) { return f.code === 'WF-001'; })[0];
assert(wf001b.message.indexOf('Drawn inside') === -1 && wf001b.message.indexOf('names the Workflow as its Parent') !== -1);

// FLOW-009: an edge between two shapes that are the same element
var f9 = makePage('F9');
var oo = f9.shape('o', 'O', 'organization'), ss = f9.shape('sy', 'Sy', 'software-system', oo);
var tt = f9.shape('tt', 'TT', 'tier', ss);
var x1 = f9.shape('svc', 'Svc', 'service', tt);
var f9b = makePage('F9b');
var x2 = f9b.shape('svc', 'Svc', 'service', null, { prop_parent: 'tt' });
var x3 = f9b.shape('svc2', 'Svc2', 'service', null, { prop_parent: 'tt' });
f9b.edge(x2, x3);
// the same id on one page twice joined by an edge
var x4 = f9.shape('svc', 'Svc', 'service', tt);
f9.edge(x1, x4);
var m4 = AM.buildModel(ui([f9, f9b]), sp, REGISTRY);
assert(m4.findings.some(function(f) { return f.code === 'FLOW-009'; }));
assert.deepStrictEqual(m4.flows.map(function(f) { return f.from + '>' + f.to; }), ['svc>svc2']);
assert.strictEqual(m4.elements.filter(function(e) { return e.id === 'svc'; })[0].parent, 'tt');

// ---------------------------------------------------------------------------
// Lifted flows (specs §10.5.1)
// ---------------------------------------------------------------------------
(function() {
  var L = makePage('Lift'), L2 = makePage('Lift2');
  var org = L.shape('o', 'O', 'organization');
  var sx = L.shape('system-x', 'X', 'software-system', org);
  var sy = L.shape('system-y', 'Y', 'software-system', org);
  var wx = L.shape('wx', 'WX', 'workflow', sx);
  var xa = L.shape('service-xa', 'XA', 'service', wx);
  var xb = L.shape('service-xb', 'XB', 'service', wx);
  L.edge(xa, xb);
  var na = L.shape('node-a', 'NA', 'node', xa);
  var shared = L.shape('shared', 'Shared', 'node', sx);
  var lift = { prop_flow_lift: 'true' };

  L.edge(xa, sy, Object.assign({ prop_id: 'xa-to-y', prop_description: 'Orders' }, lift)); // → system-x > system-y
  L2.edge(L2.shape('service-xa', 'XA', 'service', null, { prop_parent: 'wx' }),
          L2.shape('system-y', 'Y', 'software-system', null, { prop_parent: 'o' }), lift);  // same entry, other page
  L.edge(na, sy, lift);                                   // second entry, from a Node
  L.edge(sx, xb);                                         // FLOW-001 without flag → error + hint
  L.edge(xa, sx, lift);                                   // lifts to system-x > system-x → FLOW-009
  L.edge(shared, xb, lift);                               // node in system vs service: both climb → self → FLOW-009
  var lone = L.shape('lone', 'Lone', 'service');          // no parent
  L.edge(lone, sy, lift);                                 // PP-011
  L.edge(xb, xa, lift);                                   // same level: flag has no effect

  var m = AM.buildModel(ui([L, L2]), sp, REGISTRY);
  var byPair = {};
  m.flows.forEach(function(f) { byPair[f.from + '>' + f.to] = f; });
  var xy = byPair['system-x>system-y'];
  assert(xy, 'lifted flow exported');
  assert.strictEqual(xy.declared, false);
  assert.strictEqual(xy.id, undefined);
  assert.deepStrictEqual(xy.lifted_from, [
    { from: 'node-a', to: 'system-y' },
    { id: 'xa-to-y', from: 'service-xa', to: 'system-y', description: 'Orders' },
  ]);
  assert(byPair['service-xb>service-xa'] && byPair['service-xb>service-xa'].declared === undefined);
  var codes = m.findings.map(function(f) { return f.code; });
  assert.strictEqual(codes.filter(function(c) { return c === 'PP-010'; }).length, 2);
  assert.strictEqual(codes.filter(function(c) { return c === 'FLOW-009'; }).length, 2);
  assert(codes.indexOf('PP-011') !== -1);
  var f1 = m.findings.filter(function(f) { return f.code === 'FLOW-001'; });
  assert.strictEqual(f1.length, 1);
  assert(/Lift to common level/.test(f1[0].message));
  assert(!m.flows.some(function(f) { return f.from === f.to; }));

  var y = AM.toYaml(m);
  assert(y.indexOf([
    '  - from: system-x',
    '    to: system-y',
    '    declared: false',
    '    lifted_from:',
    '      - from: node-a',
    '        to: system-y',
    '      - id: xa-to-y',
    '        from: service-xa',
    '        to: system-y',
    '        description: Orders',
  ].join('\n')) !== -1, 'lifted YAML layout:\n' + y);

  // A declared system-level flow keeps its own fields; entries attach to it.
  L.edge(sx, sy, { prop_id: 'x-to-y' });
  m = AM.buildModel(ui([L, L2]), sp, REGISTRY);
  xy = m.flows.filter(function(f) { return f.from === 'system-x' && f.to === 'system-y'; })[0];
  assert.strictEqual(xy.id, 'x-to-y');
  assert.strictEqual(xy.declared, undefined);
  assert.strictEqual(xy.lifted_from.length, 2);

  // Superseded: a Service-level flow from service-xa into Y covers the
  // service-xa entry (PP-012) but not the node-a one.
  var yb = L.shape('yb', 'YB', 'tier', sy);
  var y1 = L.shape('service-y1', 'Y1', 'service', yb);
  L.edge(xa, y1);
  m = AM.buildModel(ui([L, L2]), sp, REGISTRY);
  xy = m.flows.filter(function(f) { return f.from === 'system-x' && f.to === 'system-y'; })[0];
  assert.deepStrictEqual(xy.lifted_from.map(function(e) { return e.from; }), ['node-a']);
  assert.strictEqual(m.findings.filter(function(f) { return f.code === 'PP-012'; }).length, 1);

  // Only superseded entries and no declared connector → the flow disappears.
  var S = makePage('S');
  var so = S.shape('o', 'O', 'organization');
  var s1 = S.shape('s1', 'S1', 'software-system', so), s2 = S.shape('s2', 'S2', 'software-system', so);
  var t1 = S.shape('t1', 'T1', 'tier', s1), t2 = S.shape('t2', 'T2', 'tier', s2);
  var a1 = S.shape('a1', 'A1', 'service', t1), b2 = S.shape('b2', 'B2', 'service', t2);
  S.edge(a1, s2, lift);
  S.edge(a1, b2);
  m = AM.buildModel(ui([S]), sp, REGISTRY);
  assert.deepStrictEqual(m.flows.map(function(f) { return f.from + '>' + f.to; }), ['a1>b2']);
  assert.deepStrictEqual(m.findings.map(function(f) { return f.code; }), ['PP-012']);
})();

console.log('all export checks passed');
