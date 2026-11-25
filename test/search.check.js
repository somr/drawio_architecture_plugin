'use strict';
// Checks for ShapeSearch: entry collection and ranking (specs §5.8).
var assert = require('assert');
var path = require('path');
var SRC = process.argv[2] || path.join(__dirname, '..', 'src');

function El(attrs) { this.a = Object.assign({}, attrs); }
El.prototype.getAttribute = function(k) { return this.a[k] === undefined ? null : this.a[k]; };
global.mxUtils = { createXmlDocument: function() { return { createElement: function() { return new El({}); } }; } };

var sp = require(SRC + '/ShapeProperties');
var S  = require(SRC + '/ShapeSearch');

var n = 0;
function v(attrs, extra) {
  return Object.assign({ id: 'c' + (n++), vertex: true, value: new El(attrs), children: [], style: '' }, extra || {});
}
var cells = [
  v({ label: 'Payment Service', prop_id: 'payment-svc', prop_name: 'Payment Service', prop_level: 'service' }),
  v({ label: 'Payments', prop_id: 'payments', prop_name: 'Payments', prop_level: 'software-system' }),
  v({ label: 'Order API', prop_id: 'order-api', prop_name: 'Order API', prop_level: 'service' }),
  v({ label: '<b>Café</b> Gateway', prop_id: 'cafe-gw', prop_name: 'Café Gateway', prop_level: 'node' }),
  v({ label: 'Legacy box' }),                                   // no properties
  v({ label: 'Shown label', prop_name: 'Other Name' }),          // label differs from name
  v({ label: '', prop_id: 'api', prop_name: 'Gateway API', prop_level: 'service', properties_ignored: 'true' }),
  v({ label: '' }),                                              // nothing to search
  Object.assign(v({ label: 'HTTPS', prop_id: 'pay-to-order' }), { vertex: false, edge: true }),
];
var layer = { id: 'l', children: cells };
var root  = { id: 'r', children: [layer] };

var entries = S.collectEntries(root, sp);
assert.strictEqual(entries.length, cells.length - 1, 'empty cell skipped, root/layer skipped');
assert.strictEqual(entries[3].label, 'Café Gateway', 'HTML stripped from label');
assert.strictEqual(entries[0].level, sp.getLevelLabel('service'));
assert.ok(entries[6].ignored);
assert.ok(entries[7].isEdge);

function ids(q) { return S.search(entries, q).map(function(r) { return r.entry.id || r.entry.label; }); }
function top(q) { return S.search(entries, q)[0]; }

// Exact ID first, even when names also match.
assert.strictEqual(top('payments').entry.id, 'payments');
assert.strictEqual(top('payments').field, 'id');
assert.strictEqual(top('api').entry.id, 'api', 'exact ID beats name word match');
// ID prefix beats name contains.
assert.deepStrictEqual(ids('pay').slice(0, 3), ['payments', 'payment-svc', 'pay-to-order']);
// Case, accents and separators are ignored.
assert.strictEqual(top('CAFE').entry.id, 'cafe-gw');
assert.strictEqual(top('café gw').entry.id, 'cafe-gw');
assert.strictEqual(top('Payment SVC').entry.id, 'payment-svc', 'compact ID match');
assert.strictEqual(top('  order   api ').entry.id, 'order-api', 'whitespace collapsed');
// Every word starts a name word.
assert.strictEqual(top('pay serv').entry.id, 'payment-svc');
// A later word of the name.
assert.strictEqual(top('gateway').field, 'name');
// Label-only shapes and labels that differ from the name.
assert.strictEqual(top('legacy').entry.label, 'Legacy box');
var lab = top('shown');
assert.strictEqual(lab.field, 'label');
assert.strictEqual(lab.entry.label.substring(lab.start, lab.end).toLowerCase(), 'shown');
// Connectors are found by ID and label.
assert.ok(ids('https').indexOf('pay-to-order') !== -1);
// Fuzzy only for 3+ characters, ranked below real matches.
var fz = top('pymtsvc');
assert.strictEqual(fz.entry.id, 'payment-svc');
assert.ok(fz.score < S.SCORE.LABEL_CONTAINS);
assert.strictEqual(S.search(entries, 'pm').length, 0, 'no fuzzy under 3 characters');
// Match range maps back to the original text (accents kept).
var cafe = top('café');
assert.strictEqual(cafe.entry.id.substring(cafe.start, cafe.end), 'cafe');
var gw = S.search(entries, 'gate').filter(function(r) { return r.entry.id === 'cafe-gw'; })[0];
assert.strictEqual(gw.entry.name.substring(gw.start, gw.end), 'Gate');
// Empty and blank queries match nothing; no match returns [].
assert.strictEqual(S.search(entries, '').length, 0);
assert.strictEqual(S.search(entries, '   ').length, 0);
assert.strictEqual(S.search(entries, 'zzzz').length, 0);

console.log('all search checks passed');
