'use strict';
// Checks for the generated model page (specs §10.9): tree layout and the
// model page being skipped by forEachPage.
var assert = require('assert');
var path = require('path');
var SRC = process.argv[2] || path.join(__dirname, '..', 'src');

var md = require(SRC + '/ModelDiagram');
var sp = require(SRC + '/ShapeProperties');

function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}
function box(l, id) { return l.boxes.filter(function(b) { return b.el.id === id; })[0]; }

// org > sys > {wf > {svc1 > {n1, n2}, svc2}, n3}; orphan svc; cycle a <-> b
var els = [
  { id: 'org', type: 'organization' },
  { id: 'sys', type: 'software-system', parent: 'org' },
  { id: 'wf', type: 'workflow', parent: 'sys' },
  { id: 'svc1', type: 'service', parent: 'wf' },
  { id: 'n1', type: 'node', parent: 'svc1' },
  { id: 'n2', type: 'node', parent: 'svc1' },
  { id: 'svc2', type: 'service', parent: 'wf' },
  { id: 'n3', type: 'node', parent: 'sys' },
  { id: 'lost', type: 'service', parent: 'missing' },
  { id: 'a', type: 'workflow', parent: 'b' },
  { id: 'b', type: 'workflow', parent: 'a' },
];
var l = md.layoutTree(els);

assert.strictEqual(l.boxes.length, els.length, 'every element drawn once');
var ids = l.boxes.map(function(b) { return b.el.id; }).sort();
assert.deepStrictEqual(ids, els.map(function(e) { return e.id; }).sort());
for (var i = 0; i < l.boxes.length; i++)
  for (var j = i + 1; j < l.boxes.length; j++)
    assert(!overlaps(l.boxes[i], l.boxes[j]), 'overlap ' + l.boxes[i].el.id + ' / ' + l.boxes[j].el.id);

// Edges: one per drawn parent link (the cycle contributes one).
assert.strictEqual(l.edges.length, 8);
assert(l.edges.some(function(e) { return e.from === 'svc1' && e.to === 'n1' && e.stacked; }), 'leaves stacked');
assert(l.edges.some(function(e) { return e.from === 'sys' && e.to === 'wf' && !e.stacked; }), 'mixed row not stacked');

// Children below parents; stacked leaves in one column below their parent.
l.edges.forEach(function(e) { assert(box(l, e.to).y > box(l, e.from).y, 'child below parent ' + e.to); });
assert.strictEqual(box(l, 'n1').x, box(l, 'n2').x);
assert(box(l, 'n2').y > box(l, 'n1').y);
// Orphan and cycle start their own trees, right of the main one.
assert(box(l, 'lost').y === 0 && box(l, 'lost').x > box(l, 'n3').x);
assert(box(l, 'a').y === 0, 'cycle member as root');
assert.strictEqual(md.layoutTree([]).boxes.length, 0);

// forEachPage skips the generated page.
function El(a) { this.a = a; }
El.prototype.getAttribute = function(k) { return this.a[k] === undefined ? null : this.a[k]; };
function page(name, marked) {
  var layer = { children: [{ vertex: true, value: new El(marked ? { pp_model_view: '1' } : { prop_id: 'x' }) }] };
  return { getName: function() { return name; }, root: { children: [layer] } };
}
var p1 = page('A', false), p2 = page('Model', true), p3 = page('C', false);
var fakeUi = { pages: [p1, p2, p3], currentPage: p1, editor: { graph: { model: { root: p1.root } } } };
var seen = [];
sp.forEachPage(fakeUi, function(pg, name) { seen.push(name); });
assert.deepStrictEqual(seen, ['A', 'C']);
assert(sp.isModelViewPage(fakeUi, p2) && !sp.isModelViewPage(fakeUi, p1));

console.log('all model page checks passed');
