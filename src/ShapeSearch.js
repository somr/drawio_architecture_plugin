'use strict';

/**
 * ShapeSearch
 *
 * Pure search over the cells of one page (no DOM, no graph view): collects
 * one entry per searchable cell and ranks entries against a query by ID,
 * Name and visible label (specs §5.8). Testable in Node with a mock model.
 *
 * Ranking (highest first):
 *   exact ID > ID prefix > exact name > name prefix > every word starts a
 *   name word > ID contains > name contains > label prefix > label contains
 *   > fuzzy (letters in order, queries of 3+ characters)
 * Ties: shorter matched field first (closest match), then shorter name,
 * then alphabetical.
 */

var SCORE = {
  ID_EXACT:      1000,
  ID_PREFIX:      900,
  NAME_EXACT:     850,
  NAME_PREFIX:    800,
  NAME_WORDS:     700,
  ID_CONTAINS:    600,
  NAME_CONTAINS:  550,
  LABEL_PREFIX:   500,
  LABEL_CONTAINS: 450,
  FUZZY:          100,
};

var FUZZY_MIN_LENGTH = 3;

/** Lowercase, accents removed; one output character per input character. */
function foldChar(ch) {
  var s = ch.toLowerCase();
  if (s.normalize) s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return s.length === 1 ? s : ch.toLowerCase().charAt(0);
}

/** Folded copy of str, same length as str, so match offsets map back 1:1. */
function fold(str) {
  var s = String(str || '');
  var out = '';
  for (var i = 0; i < s.length; i++) out += foldChar(s.charAt(i));
  return out;
}

/** Query normalisation: folded, trimmed, inner whitespace collapsed. */
function normalizeQuery(q) {
  return fold(q).replace(/\s+/g, ' ').trim();
}

/** Only letters and digits — "payment-svc" and "Payment Svc" both → "paymentsvc". */
function compact(str) {
  return String(str || '').replace(/[^a-z0-9]+/g, '');
}

function _words(folded) {
  return folded.split(/[^a-z0-9]+/).filter(Boolean);
}

/** Start offset of each word in a folded string, in order. */
function _wordStarts(folded) {
  var starts = [];
  var re = /[a-z0-9]+/g;
  var m;
  while ((m = re.exec(folded)) !== null) starts.push(m.index);
  return starts;
}

/**
 * True when every query word is the start of some word in the text
 * ("pay svc" matches "Payment Service").
 */
function _wordsMatch(queryWords, text) {
  if (queryWords.length < 2) return false;
  var words = _words(text);
  return queryWords.every(function(qw) {
    return words.some(function(w) { return w.indexOf(qw) === 0; });
  });
}

/**
 * Letters of the query appear in the text in order. Returns the span length
 * (smaller = tighter match) or -1.
 */
function _fuzzySpan(query, text) {
  var qi = 0, first = -1;
  for (var i = 0; i < text.length && qi < query.length; i++) {
    if (text.charAt(i) === query.charAt(qi)) {
      if (first < 0) first = i;
      qi++;
      if (qi === query.length) return i - first + 1;
    }
  }
  return -1;
}

/**
 * Scores one entry. Returns null when it does not match, else
 * { score, field: 'id'|'name'|'label', start, end } — start/end is the
 * matched range in the original field text (-1 when not a single range).
 */
function scoreEntry(entry, query) {
  var q = normalizeQuery(query);
  if (!q) return null;
  var qc = compact(q);
  var qWords = q.split(' ');

  var id    = fold(entry.id);
  var name  = fold(entry.name);
  var label = fold(entry.label);

  function hit(score, field, start, len) {
    return { score: score, field: field, start: start, end: start < 0 ? -1 : start + len };
  }

  if (id) {
    if (id === q || (qc && compact(id) === qc)) return hit(SCORE.ID_EXACT, 'id', 0, id.length);
    if (id.indexOf(q) === 0) return hit(SCORE.ID_PREFIX, 'id', 0, q.length);
  }
  if (name) {
    if (name.trim() === q) return hit(SCORE.NAME_EXACT, 'name', name.indexOf(q), q.length);
    if (name.indexOf(q) === 0) return hit(SCORE.NAME_PREFIX, 'name', 0, q.length);
    if (_wordsMatch(qWords, name)) return hit(SCORE.NAME_WORDS, 'name', -1, 0);
    // A single word starting a later name word ("serv" in "Payment Service").
    var nPos = name.indexOf(q);
    if (nPos > 0 && _wordStarts(name).indexOf(nPos) !== -1) {
      return hit(SCORE.NAME_WORDS, 'name', nPos, q.length);
    }
  }
  if (id) {
    var iPos = id.indexOf(q);
    if (iPos !== -1) return hit(SCORE.ID_CONTAINS, 'id', iPos, q.length);
    if (qc.length >= 2 && compact(id).indexOf(qc) !== -1) return hit(SCORE.ID_CONTAINS, 'id', -1, 0);
  }
  if (name) {
    var cPos = name.indexOf(q);
    if (cPos !== -1) return hit(SCORE.NAME_CONTAINS, 'name', cPos, q.length);
  }
  if (label && label !== name) {
    var lPos = label.indexOf(q);
    if (lPos === 0) return hit(SCORE.LABEL_PREFIX, 'label', 0, q.length);
    if (lPos > 0)   return hit(SCORE.LABEL_CONTAINS, 'label', lPos, q.length);
    if (_wordsMatch(qWords, label)) return hit(SCORE.LABEL_CONTAINS, 'label', -1, 0);
  }

  if (qc.length >= FUZZY_MIN_LENGTH && q.indexOf(' ') === -1) {
    var best = null;
    [['name', compact(name)], ['id', compact(id)], ['label', compact(label)]].forEach(function(f) {
      if (!f[1]) return;
      var span = _fuzzySpan(qc, f[1]);
      if (span < 0) return;
      // Tighter spans score higher, never reaching the next tier.
      var s = SCORE.FUZZY + Math.max(0, 99 - (span - qc.length) * 5);
      if (!best || s > best.score) best = hit(s, f[0], -1, 0);
    });
    if (best) return best;
  }
  return null;
}

/** Text the entry is listed under. */
function displayName(entry) {
  return entry.name || entry.label || '';
}

/**
 * Ranks entries against the query.
 * Returns [{ entry, score, field, start, end }], best first.
 */
function search(entries, query) {
  var results = [];
  entries.forEach(function(entry) {
    var m = scoreEntry(entry, query);
    if (m) {
      results.push({ entry: entry, score: m.score, field: m.field, start: m.start, end: m.end });
    }
  });
  results.sort(function(a, b) {
    if (b.score !== a.score) return b.score - a.score;
    var al = a.entry[a.field].length, bl = b.entry[b.field].length;
    if (al !== bl) return al - bl;
    var an = displayName(a.entry), bn = displayName(b.entry);
    if (an.length !== bn.length) return an.length - bn.length;
    return an < bn ? -1 : an > bn ? 1 : 0;
  });
  return results;
}

/**
 * One entry per vertex or connector under root that has an ID, a Name or a
 * visible label. sp is the ShapeProperties module.
 *   { cell, id, name, label, level, isEdge, ignored }
 */
function collectEntries(root, sp) {
  var entries = [];
  (function walk(node, depth) {
    if (!node) return;
    // depth 0 is the root, depth 1 the layers — neither is a shape.
    if (depth >= 2 && (node.vertex || node.edge)) {
      var id    = sp.getProperty(node, 'prop_id') || '';
      var name  = sp.getProperty(node, 'prop_name') || '';
      var label = sp.getLabelText(node).replace(/\s+/g, ' ').trim();
      if (id || name || label) {
        var level = node.vertex ? (sp.getProperty(node, 'prop_level') || '') : '';
        entries.push({
          cell:    node,
          id:      id,
          name:    name.trim(),
          label:   label,
          level:   level ? sp.getLevelLabel(level) : '',
          isEdge:  !!node.edge,
          ignored: sp.isIgnored(node),
        });
      }
    }
    var children = node.children;
    if (children) {
      for (var i = 0; i < children.length; i++) walk(children[i], depth + 1);
    }
  })(root, 0);
  return entries;
}

module.exports = {
  SCORE: SCORE,
  fold: fold,
  normalizeQuery: normalizeQuery,
  scoreEntry: scoreEntry,
  search: search,
  displayName: displayName,
  collectEntries: collectEntries,
};
