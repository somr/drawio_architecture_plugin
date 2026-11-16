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
a.edge(s1, null);                                                           // PP-007
a.edge(lone, lone, { properties_ignored: 'true' });                         // ignored → nothing
var wfB = b.shape('wf', 'WF renamed', 'workflow', null, { prop_description: 'two' }); // PP-003 name, PP-004
b.edge(b.shape('s1', 'S1', 'service'), a.shape('x-s1', 'X', 'service')); // cross-page edge? separate pages: s1 copy → FLOW-009 below
var s1b = b.shape('s1', 'S1', 'service');                                   // second s1 on page B → ID-001 on B
var m2 = AM.buildModel(ui([a, b]), sp, REGISTRY);
var codes = m2.findings.map(function(f) { return f.code; });
fs.writeFileSync(OUT + '/findings.txt', m2.findings.map(function(f) {
  return f.severity + ' ' + f.code + ' ' + f.message + ' @ ' + f.refs.map(function(r) { return r.pageName; }).join(',');
}).join('\n') + '\n');
['PP-001', 'PP-002', 'ID-001', 'PP-008', 'PP-009', 'WF-001', 'WF-003', 'HIER-001', 'HIER-002', 'REF-001',
 'HIER-004', 'REF-003', 'PP-006', 'FLOW-001', 'FLOW-010', 'PP-007', 'PP-003', 'PP-004'].forEach(function(c) {
  assert(codes.indexOf(c) !== -1, 'missing finding ' + c);
});
assert(codes.indexOf('PP-005') === -1);
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

console.log('all export checks passed');
