'use strict';

// Property key constants — these are the XML attribute names stored on cells.
var PROP_NAME        = 'prop_name';
var PROP_LEVEL       = 'prop_level';
var PROP_DESCRIPTION = 'prop_description';
var PROP_IGNORED     = 'properties_ignored';
var PROP_TAGS        = 'prop_tags';
var PROP_TECHNOLOGY   = 'prop_technology';
var PROP_PROVISIONING = 'prop_provisioning';
var PROP_ID           = 'prop_id';
var PROP_PARENT       = 'prop_parent';

// Optional properties that apply only to shapes at NODE_LEVEL (specs §4.4).
var NODE_LEVEL = 'node';
var NODE_ONLY_PROPS = [PROP_TECHNOLOGY, PROP_PROVISIONING];
var PROVISIONING_VALUES = ['IAC', 'EXTERNAL', 'RUNTIME'];

var ORGANIZATION_LEVEL = 'organization';

// Element / flow id syntax (specs §4.2).
var ID_PATTERN = /^[a-z0-9]([a-z0-9._-]{0,98}[a-z0-9])?$/;
var ID_MAX_LENGTH = 100;

// Allowed values for the Level property, in hierarchy order. The stored value
// is the slug; `label` is what the UI shows. `parents` lists the levels that
// may contain this one (specs §4, metamodel §5.1) — the single source of truth
// for hierarchy legality. `rank` is the abstraction level, used for ordering
// and for the same-level rule on flows (FLOW-001). Levels sharing a rank are
// alternatives at the same depth (Workflow / Tier).
var LEVELS = [
  { value: 'organization',    label: 'Organization',    rank: 0, parents: [] },
  { value: 'software-system', label: 'Software System', rank: 1, parents: ['organization'] },
  { value: 'workflow',        label: 'Workflow',        rank: 2, parents: ['software-system'] },
  { value: 'tier',            label: 'Tier',            rank: 2, parents: ['software-system'] },
  { value: 'service',         label: 'Service',         rank: 3, parents: ['workflow', 'tier'] },
  // A Node directly in a Software System is shared system infrastructure.
  { value: 'node',            label: 'Node',            rank: 4, parents: ['service', 'software-system'] },
];

// UI heading for ranks shared by more than one level.
var RANK_GROUP_LABELS = { 2: 'Workflow / Tier' };

var VALID_LEVELS = LEVELS.map(function(l) { return l.value; });

// Level values written by plugin versions before 1.12, mapped to current ones.
var LEGACY_LEVELS = {
  'Organization':               'organization',
  'Software System':            'software-system',
  'Pipeline / Workflow / Tier': 'workflow',
  'Service':                    'service',
  'Node':                       'node',
};

function _levelDef(value) {
  for (var i = 0; i < LEVELS.length; i++) {
    if (LEVELS[i].value === value) return LEVELS[i];
  }
  return null;
}

function isValidLevel(value) {
  return !!_levelDef(value);
}

function getLevelRank(value) {
  var def = _levelDef(value);
  return def ? def.rank : null;
}

/** Display label for a level value; unknown values are returned unchanged. */
function getLevelLabel(value) {
  var def = _levelDef(value);
  return def ? def.label : value;
}

/** Levels a shape of the given level may contain ([] for none). */
function getChildLevels(level) {
  if (!isValidLevel(level)) return [];
  return LEVELS.filter(function(l) { return l.parents.indexOf(level) !== -1; })
               .map(function(l) { return l.value; });
}

/** Levels that may contain a shape of the given level ([] for none). */
function getParentLevels(level) {
  var def = _levelDef(level);
  return def ? def.parents.slice() : [];
}

/** True when a shape of parentLevel may contain one of childLevel (HIER-002). */
function isLegalParent(childLevel, parentLevel) {
  return getParentLevels(childLevel).indexOf(parentLevel) !== -1;
}

function isValidProvisioning(value) {
  return PROVISIONING_VALUES.indexOf(value) !== -1;
}

/**
 * Normalises the cell's stored Level: legacy values are rewritten to their
 * current equivalent and unknown values are removed.
 * Returns true if the cell was changed.
 */
function sanitizeLevel(graph, cell) {
  var current = _rawProperty(cell, PROP_LEVEL);
  if (current === null || isValidLevel(current)) return false;
  if (LEGACY_LEVELS[current]) {
    setProperty(graph, cell, PROP_LEVEL, LEGACY_LEVELS[current]);
  } else {
    removeProperty(graph, cell, PROP_LEVEL);
  }
  return true;
}

/**
 * Rewrites every legacy Level value in the graph's current model (the page
 * on screen) in one undoable transaction. Returns the number of cells changed.
 */
function migrateLegacyLevels(graph) {
  var model = graph.model;
  var changed = [];
  Object.keys(model.cells).forEach(function(id) {
    var cell = model.cells[id];
    if (LEGACY_LEVELS[_rawProperty(cell, PROP_LEVEL)]) changed.push(cell);
  });
  if (changed.length === 0) return 0;
  model.beginUpdate();
  try {
    changed.forEach(function(cell) {
      setProperty(graph, cell, PROP_LEVEL, LEGACY_LEVELS[_rawProperty(cell, PROP_LEVEL)]);
    });
  } finally {
    model.endUpdate();
  }
  return changed.length;
}

/**
 * Returns the value of a custom property on a cell, or null if absent.
 */
function getProperty(cell, key) {
  var value = _rawProperty(cell, key);
  // Legacy Level values are read as their current equivalent, so pages not
  // yet migrated (see migrateLegacyLevels) behave consistently everywhere.
  if (key === PROP_LEVEL && value !== null && LEGACY_LEVELS[value]) {
    return LEGACY_LEVELS[value];
  }
  return value;
}

function _rawProperty(cell, key) {
  if (!cell || !cell.value) return null;
  if (typeof cell.value === 'object' && typeof cell.value.getAttribute === 'function') {
    return cell.value.getAttribute(key) || null;
  }
  return null;
}

/**
 * Sets a custom property on a cell, preserving all existing properties.
 * Uses DrawIO's model transaction so the change is undoable.
 */
function setProperty(graph, cell, key, value) {
  var model = graph.model;
  model.beginUpdate();
  try {
    var obj = _ensureXmlValue(cell);
    obj.setAttribute(key, value);
    model.setValue(cell, obj);
  } finally {
    model.endUpdate();
  }
}

/**
 * Removes a custom property from a cell.
 */
function removeProperty(graph, cell, key) {
  var model = graph.model;
  model.beginUpdate();
  try {
    var cellValue = cell.value;
    if (typeof cellValue === 'object' && typeof cellValue.getAttribute === 'function') {
      var obj = cellValue.cloneNode(true);
      obj.removeAttribute(key);
      model.setValue(cell, obj);
    }
  } finally {
    model.endUpdate();
  }
}

/**
 * Sets multiple properties in a single model transaction.
 * @param {object} props - Plain object of { key: value } pairs.
 */
function setProperties(graph, cell, props) {
  var model = graph.model;
  model.beginUpdate();
  try {
    var obj = _ensureXmlValue(cell);
    Object.keys(props).forEach(function(key) {
      obj.setAttribute(key, props[key]);
    });
    model.setValue(cell, obj);
  } finally {
    model.endUpdate();
  }
}

/**
 * Returns the required shape properties missing from the cell (specs §6.1):
 * Name, ID and Level, in that order. Description is optional.
 */
function getMissingProperties(cell) {
  return [PROP_NAME, PROP_ID, PROP_LEVEL].filter(function(key) {
    var val = getProperty(cell, key);
    return !val || !val.trim();
  });
}

/** True when the cell can be the source of a cross-page sync (specs §17). */
function isCompleteSource(cell) {
  return getMissingProperties(cell).length === 0 && isValidLevel(getProperty(cell, PROP_LEVEL));
}

/**
 * Returns the properties copied by cross-page sync (specs §17.5): ID, Name,
 * Level, Description, the Node-only properties when the source is a Node, and
 * the explicit parent when the source has one and `target` is given and is not
 * inside an eligible container. Only non-empty values are included, so a sync
 * never blanks a property on the target.
 */
function getSyncProps(cell, target) {
  var keys = [PROP_ID, PROP_NAME, PROP_LEVEL, PROP_DESCRIPTION];
  if (getProperty(cell, PROP_LEVEL) === NODE_LEVEL) keys = keys.concat(NODE_ONLY_PROPS);
  if (target && !getContainerAncestor(target)) keys.push(PROP_PARENT);
  var props = {};
  keys.forEach(function(key) {
    var val = getProperty(cell, key);
    if (val) props[key] = val;
  });
  return props;
}

/**
 * Returns true if the cell has been marked as ignored.
 */
function isIgnored(cell) {
  return getProperty(cell, PROP_IGNORED) === 'true';
}

/**
 * Returns the list of tags on a cell as a trimmed, non-empty string array.
 */
function getTags(cell) {
  var raw = getProperty(cell, PROP_TAGS) || '';
  return raw.split(',').map(function(t) { return t.trim(); }).filter(Boolean);
}

/**
 * Stores an array of tag strings on a cell as a comma-separated property.
 */
function setTags(graph, cell, tagsArray) {
  setProperty(graph, cell, PROP_TAGS, tagsArray.join(','));
}

// ---------------------------------------------------------------------------
// Geometry utilities
// ---------------------------------------------------------------------------

/**
 * Returns the bounding box of a cell in absolute diagram coordinates,
 * by summing geometry offsets up through the parent chain.
 */
function getAbsoluteBounds(graph, cell) {
  var geo = graph.model.getGeometry(cell);
  if (!geo) return null;
  var x = geo.x, y = geo.y, w = geo.width, h = geo.height;
  var parent = graph.model.getParent(cell);
  var defaultParent = graph.getDefaultParent();
  while (parent && parent !== defaultParent) {
    var pg = graph.model.getGeometry(parent);
    if (pg) { x += pg.x; y += pg.y; }
    parent = graph.model.getParent(parent);
  }
  return { x: x, y: y, width: w, height: h };
}

function fullyContains(outer, inner) {
  return inner.x >= outer.x &&
         inner.y >= outer.y &&
         (inner.x + inner.width)  <= (outer.x + outer.width) &&
         (inner.y + inner.height) <= (outer.y + outer.height);
}

// ---------------------------------------------------------------------------
// Container promotion
// ---------------------------------------------------------------------------

function promoteToContainer(graph, cell) {
  var model = graph.model;
  var style = model.getStyle(cell) || '';
  if (style.indexOf('container=1') !== -1) return;
  var sep = (style.length > 0 && style.charAt(style.length - 1) !== ';') ? ';' : '';
  model.beginUpdate();
  try {
    model.setStyle(cell, style + sep + 'container=1;collapsible=0;');
  } finally {
    model.endUpdate();
  }
}

// ---------------------------------------------------------------------------
// Parent resolution
// ---------------------------------------------------------------------------

/**
 * Finds the valid parent for cell based on level hierarchy and bounds: among
 * the non-ignored shapes at a legal parent level whose bounds fully contain the
 * cell, the innermost one (specs §7.2). Several candidates are fine when they
 * are nested (e.g. a Node inside a Service inside a Software System → the
 * Service).
 * Returns null if no parent found.
 * Throws a descriptive string if the candidates are not nested (overlapping
 * siblings).
 */
function findValidParent(graph, cell) {
  var cellLevel = getProperty(cell, PROP_LEVEL);
  if (!cellLevel) return null;
  var needed = getParentLevels(cellLevel);
  if (needed.length === 0) return null;
  var cellBounds = getAbsoluteBounds(graph, cell);
  if (!cellBounds) return null;

  var found = [];
  var cells = graph.model.cells;
  Object.keys(cells).forEach(function(id) {
    var c = cells[id];
    if (!c.vertex || c === cell || isIgnored(c)) return;
    if (needed.indexOf(getProperty(c, PROP_LEVEL)) === -1) return;
    var b = getAbsoluteBounds(graph, c);
    if (b && fullyContains(b, cellBounds)) found.push({ cell: c, bounds: b });
  });

  if (found.length === 0) return null;
  if (found.length === 1) return found[0].cell;

  // Nested candidates form a chain: sorted outermost-first, each one's bounds
  // contain the next. Then the last one is the innermost.
  found.sort(function(a, b) {
    return (b.bounds.width * b.bounds.height) - (a.bounds.width * a.bounds.height);
  });
  for (var i = 1; i < found.length; i++) {
    if (!fullyContains(found[i - 1].bounds, found[i].bounds)) {
      var names = found.map(function(f) {
        return '"' + (getProperty(f.cell, PROP_NAME) || '(unnamed)') + '"';
      }).join(', ');
      throw 'Shape falls inside multiple ' + needed.map(getLevelLabel).join(' / ') +
            ' containers: ' + names +
            '. Move it so it is inside exactly one.';
    }
  }
  return found[found.length - 1].cell;
}

// ---------------------------------------------------------------------------
// Element identity and resolved parent (specs §4.2, §4.3)
// ---------------------------------------------------------------------------

/**
 * True when the cell is an architecture element: a non-ignored vertex with a
 * Name, a valid Level and a syntactically valid ID (specs §10.3).
 */
function isElement(cell) {
  return !!(cell && cell.vertex && !isIgnored(cell) &&
            getProperty(cell, PROP_NAME) &&
            isValidLevel(getProperty(cell, PROP_LEVEL)) &&
            isValidId(getProperty(cell, PROP_ID)));
}

/**
 * Nearest ancestor of the cell (in the draw.io model tree) that is a
 * non-ignored vertex with a Name and a valid Level — the container that acts
 * as the cell's parent. Non-eligible intermediates such as plain groups are
 * skipped. The ID is not required here: a container without one still
 * "occupies" the parent slot (it is reported by the export instead).
 * Works on cells of any page (uses cell.parent links only).
 */
function getContainerAncestor(cell) {
  var p = cell ? cell.parent : null;
  while (p) {
    if (p.vertex && !isIgnored(p) && getProperty(p, PROP_NAME) &&
        isValidLevel(getProperty(p, PROP_LEVEL))) {
      return p;
    }
    p = p.parent;
  }
  return null;
}

/**
 * The parent of the cell as the export sees it (specs §4.3):
 *   { source: 'container', id, cell }  – inside an eligible container
 *                                        (id may be null if it has none)
 *   { source: 'explicit',  id }        – prop_parent
 *   { source: null,        id: null }  – no parent
 */
function resolveParent(cell) {
  var container = getContainerAncestor(cell);
  if (container) {
    return { source: 'container', id: getProperty(container, PROP_ID), cell: container };
  }
  var explicit = getProperty(cell, PROP_PARENT);
  if (explicit) return { source: 'explicit', id: explicit };
  return { source: null, id: null };
}

// ---------------------------------------------------------------------------
// Re-parenting helpers
// ---------------------------------------------------------------------------

/**
 * Moves cell to newParent, adjusting its geometry so its visual
 * position on the canvas remains unchanged.
 * Must be called inside an active model.beginUpdate / endUpdate block.
 */
function _moveToParent(graph, cell, newParent) {
  var model = graph.model;
  if (model.getParent(cell) === newParent) return;
  var cellBounds = getAbsoluteBounds(graph, cell);
  var geo = model.getGeometry(cell);
  model.add(newParent, cell);
  if (geo && cellBounds) {
    var newGeo = geo.clone();
    if (newParent !== graph.getDefaultParent()) {
      var pb = getAbsoluteBounds(graph, newParent);
      if (pb) {
        newGeo.x = cellBounds.x - pb.x;
        newGeo.y = cellBounds.y - pb.y;
      }
    } else {
      newGeo.x = cellBounds.x;
      newGeo.y = cellBounds.y;
    }
    model.setGeometry(cell, newGeo);
  }
}

// ---------------------------------------------------------------------------
// Public adoption API
// ---------------------------------------------------------------------------

/**
 * Bulk-adopts all shapes with the correct child level that are fully inside
 * the container's bounds. Promotes the container to container=1 if needed.
 * Throws a descriptive string on any conflict.
 * Returns the number of shapes adopted.
 */
function adoptChildren(graph, container) {
  var containerLevel = getProperty(container, PROP_LEVEL);
  if (!containerLevel) throw 'Shape has no level assigned.';
  var childLevels = getChildLevels(containerLevel);
  if (childLevels.length === 0) {
    throw '"' + getLevelLabel(containerLevel) + '" shapes cannot contain children.';
  }

  var containerBounds = getAbsoluteBounds(graph, container);
  if (!containerBounds) throw 'Cannot determine container bounds.';

  var model = graph.model;
  var defaultParent = graph.getDefaultParent();
  var toAdopt = [], conflicts = [];

  Object.keys(model.cells).forEach(function(id) {
    var c = model.cells[id];
    if (!c.vertex || c === container) return;
    if (childLevels.indexOf(getProperty(c, PROP_LEVEL)) === -1) return;
    var b = getAbsoluteBounds(graph, c);
    if (!b || !fullyContains(containerBounds, b)) return;

    // Only adopt shapes for which this container is the innermost valid
    // parent: a Node inside a Service inside this Software System belongs to
    // the Service (specs §7.1 step 3).
    var innermost;
    try {
      innermost = findValidParent(graph, c);
    } catch (e) {
      conflicts.push({ cell: c, parent: model.getParent(c), message: String(e) });
      return;
    }
    if (innermost !== container) return;

    var cp = model.getParent(c);
    if (cp === container)     return;              // already adopted
    if (cp === defaultParent) toAdopt.push(c);
    else                      conflicts.push({ cell: c, parent: cp });
  });

  if (conflicts.length > 0) {
    var msg = conflicts.map(function(item) {
      if (item.message) return item.message;
      var cn = getProperty(item.cell,   PROP_NAME) || '(unnamed)';
      var pn = getProperty(item.parent, PROP_NAME) || '(unnamed)';
      return '"' + cn + '" (owned by "' + pn + '")';
    }).join(' ');
    throw 'Shapes already owned by another container: ' + msg +
          ' Fix the overlapping container bounds.';
  }

  model.beginUpdate();
  try {
    promoteToContainer(graph, container);
    toAdopt.forEach(function(c) {
      _moveToParent(graph, c, container);
      _clearExplicitParent(graph, c);
    });
  } finally {
    model.endUpdate();
  }

  return toAdopt.length;
}

/** A container always wins over prop_parent (specs §4.3). */
function _clearExplicitParent(graph, cell) {
  if (_rawProperty(cell, PROP_PARENT) !== null) removeProperty(graph, cell, PROP_PARENT);
}

/**
 * Called after a cell's level is set or changed.
 * Finds the unique valid parent and re-parents the cell; if no parent is
 * found the cell is moved to the diagram root.
 * Throws a descriptive string on conflict.
 */
function reparentCell(graph, cell) {
  var model = graph.model;
  var defaultParent = graph.getDefaultParent();
  var level = getProperty(cell, PROP_LEVEL);

  // Organization (top of hierarchy) or no level → move to root
  if (!level || getParentLevels(level).length === 0) {
    if (model.getParent(cell) !== defaultParent) {
      model.beginUpdate();
      try { _moveToParent(graph, cell, defaultParent); }
      finally { model.endUpdate(); }
    }
    return;
  }

  var validParent = findValidParent(graph, cell); // throws if not nested
  var currentParent = model.getParent(cell);

  model.beginUpdate();
  try {
    if (validParent) {
      if (currentParent !== validParent) {
        promoteToContainer(graph, validParent);
        _moveToParent(graph, cell, validParent);
      }
      _clearExplicitParent(graph, cell);
    } else if (currentParent !== defaultParent) {
      // No container: prop_parent is kept, it may still apply (specs §7.2).
      _moveToParent(graph, cell, defaultParent);
    }
  } finally {
    model.endUpdate();
  }
}

// ---------------------------------------------------------------------------
// Cross-page label + shape type matching
// ---------------------------------------------------------------------------

/**
 * Returns the shape style token from the cell's style string, e.g. "mxgraph.cisco.routers.router".
 * Returns '' for plain shapes (no shape= token in style).
 */
function getShapeTypeKey(cell) {
  var style = cell.style || '';
  var m = style.match(/(?:^|;)shape=([^;]+)/);
  return m ? m[1] : '';
}

function _getCellRawLabel(cell) {
  var value = cell.value;
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value.getAttribute === 'function') return value.getAttribute('label') || '';
  return '';
}

function _stripHtml(str) {
  return (str || '').replace(/<[^>]*>/g, '').trim();
}

/**
 * Returns the visible text label of a cell, with HTML stripped.
 * Works on cells from any page (does not need the active graph).
 */
function getLabelText(cell) {
  return _stripHtml(_getCellRawLabel(cell));
}

/**
 * Finds all vertices across all pages (excluding the current page) that match
 * the given cell by label text AND shape type.
 * Returns an array of { page, cell, pageName }.
 */
function findCrossPageMatches(ui, cell) {
  if (!ui || !ui.pages || ui.pages.length <= 1) return [];
  var currentPage = ui.currentPage;
  var cellLabel = getLabelText(cell);
  var cellShape = getShapeTypeKey(cell);
  if (!cellLabel) return [];

  var matches = [];
  ui.pages.forEach(function(page) {
    if (page === currentPage) return;
    if (!page.root) return;
    var pageName = page.getName ? page.getName() : (page.name || '(unnamed page)');
    _collectLabelMatches(page.root, cellLabel, cellShape, page, pageName, matches);
  });
  return matches;
}

function _collectLabelMatches(node, label, shapeType, page, pageName, results) {
  if (!node) return;
  if (node.vertex && getLabelText(node) === label && getShapeTypeKey(node) === shapeType) {
    results.push({ page: page, cell: node, pageName: pageName });
  }
  var children = node.children;
  if (children) {
    for (var i = 0; i < children.length; i++) {
      _collectLabelMatches(children[i], label, shapeType, page, pageName, results);
    }
  }
}

// ---------------------------------------------------------------------------
// IDs (specs §4.2)
// ---------------------------------------------------------------------------

function isValidId(id) {
  return typeof id === 'string' && ID_PATTERN.test(id);
}

/**
 * Slug of a name: lowercase, accents removed, every run of characters outside
 * [a-z0-9] replaced by one '-', trimmed of '-', at most ID_MAX_LENGTH long.
 * Returns '' when nothing usable is left.
 */
function slugifyId(name) {
  var s = String(name || '').toLowerCase();
  if (s.normalize) s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  s = s.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (s.length > ID_MAX_LENGTH) s = s.substring(0, ID_MAX_LENGTH).replace(/-+$/, '');
  return s;
}

/** Root of a page's model; the live model root for the page on screen. */
function _pageRoot(ui, page) {
  if (page === ui.currentPage && ui.editor && ui.editor.graph) return ui.editor.graph.model.root;
  return page.root;
}

function _pageName(page) {
  return page.getName ? page.getName() : (page.name || '(unnamed page)');
}

/** Calls fn(page, pageName, root) for every page, in tab order. */
function _forEachPage(ui, fn) {
  var pages = (ui && ui.pages && ui.pages.length) ? ui.pages : (ui && ui.currentPage ? [ui.currentPage] : []);
  pages.forEach(function(page) {
    var root = _pageRoot(ui, page);
    if (root) fn(page, _pageName(page), root);
  });
}

/** Depth-first walk of a cell tree, in model order. */
function _walk(node, fn) {
  if (!node) return;
  fn(node);
  var children = node.children;
  if (children) {
    for (var i = 0; i < children.length; i++) _walk(children[i], fn);
  }
}

function _sameKind(a, b) {
  return (!!a.vertex === !!b.vertex) && (!!a.edge === !!b.edge);
}

/**
 * Another non-ignored cell of the same kind (shape vs connector) under `root`
 * that carries `id`, or null. Shapes and connectors are separate namespaces.
 */
function findSameIdOnPage(root, cell, id) {
  var found = null;
  _walk(root, function(c) {
    if (found || c === cell || !_sameKind(c, cell) || isIgnored(c)) return;
    if (getProperty(c, PROP_ID) === id) found = c;
  });
  return found;
}

/**
 * Checks an ID typed for `cell` on the page shown in `graph`. Returns null
 * when it is acceptable, otherwise the message to show. Empty is reported as
 * an error; callers that allow an empty ID (connectors) check that first.
 */
function validateId(graph, cell, id) {
  if (!id) return 'ID is required.';
  if (id.length > ID_MAX_LENGTH) return 'ID is longer than ' + ID_MAX_LENGTH + ' characters.';
  if (!isValidId(id)) {
    return 'Use lowercase letters, digits, "-", "_" and "."; start and end with a letter or digit.';
  }
  var other = findSameIdOnPage(graph.model.root, cell, id);
  if (other) {
    var what = other.edge ? 'connector' : 'shape';
    var name = getProperty(other, PROP_NAME) || getLabelText(other) || '(unnamed)';
    return 'ID already used on this page by the ' + what + ' "' + name + '".';
  }
  return null;
}

/**
 * Cells of the same kind on *other* pages that carry `id` — i.e. the other
 * pages where the same element (or flow) is drawn. Returns [{page, pageName, cell}].
 */
function findOtherPagesWithId(ui, cell, id) {
  var results = [];
  if (!id) return results;
  _forEachPage(ui, function(page, pageName, root) {
    if (page === ui.currentPage) return;
    _walk(root, function(c) {
      if (_sameKind(c, cell) && !isIgnored(c) && getProperty(c, PROP_ID) === id) {
        results.push({ page: page, pageName: pageName, cell: c });
      }
    });
  });
  return results;
}

function _isCandidateCopy(a, b) {
  var label = getLabelText(a);
  return !!label && label === getLabelText(b) && getShapeTypeKey(a) === getShapeTypeKey(b);
}

/**
 * Suggests an ID for `cell` from `name` (specs §4.2): the slug of the name,
 * with -2, -3, … appended while it is taken. A slug is taken when another
 * shape on this page uses it, or a shape on another page uses it that is not a
 * candidate copy of this one (same label + shape type) — reusing a copy's ID
 * is wanted, since it makes them the same element. Returns '' if the name has
 * nothing usable.
 */
function suggestId(ui, cell, name) {
  var base = slugifyId(name);
  if (!base) return '';

  var used = {};   // id -> true when taken for this cell
  _forEachPage(ui, function(page, pageName, root) {
    var onThisPage = page === ui.currentPage;
    _walk(root, function(c) {
      if (c === cell || !c.vertex || isIgnored(c)) return;
      var id = getProperty(c, PROP_ID);
      if (!id) return;
      if (onThisPage || !_isCandidateCopy(c, cell)) used[id] = true;
    });
  });

  if (!used[base]) return base;
  for (var n = 2; ; n++) {
    var suffix = '-' + n;
    var stem = base.substring(0, ID_MAX_LENGTH - suffix.length).replace(/-+$/, '');
    if (!used[stem + suffix]) return stem + suffix;
  }
}

// ---------------------------------------------------------------------------
// Elements across the whole file (Parent picker, export)
// ---------------------------------------------------------------------------

/**
 * All elements in the file merged by ID, in order of first appearance (pages
 * in tab order, model order within a page). Name and Level come from the
 * first occurrence; conflicts between occurrences are the export's concern.
 * Returns [{ id, name, level, pageNames: [...], occurrences: [{page, pageName, cell}] }].
 */
function collectElements(ui) {
  var byId = {}, list = [];
  _forEachPage(ui, function(page, pageName, root) {
    _walk(root, function(c) {
      if (!isElement(c)) return;
      var id = getProperty(c, PROP_ID);
      var el = byId[id];
      if (!el) {
        el = byId[id] = {
          id: id,
          name: getProperty(c, PROP_NAME),
          level: getProperty(c, PROP_LEVEL),
          pageNames: [],
          occurrences: [],
        };
        list.push(el);
      }
      if (el.pageNames.indexOf(pageName) === -1) el.pageNames.push(pageName);
      el.occurrences.push({ page: page, pageName: pageName, cell: c });
    });
  });
  return list;
}

/**
 * Elements that may be chosen as the explicit parent of a shape at `level`
 * (specs §5.1 Parent picker), sorted by name then ID. `excludeId` (the shape's
 * own ID) is left out.
 */
function getParentCandidates(ui, level, excludeId) {
  var legal = getParentLevels(level);
  if (legal.length === 0) return [];
  return collectElements(ui)
    .filter(function(el) { return el.id !== excludeId && legal.indexOf(el.level) !== -1; })
    .sort(function(a, b) {
      var an = a.name.toLowerCase(), bn = b.name.toLowerCase();
      if (an !== bn) return an < bn ? -1 : 1;
      return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
    });
}

// ---------------------------------------------------------------------------
// Flow checks (specs §10.5) — shared by the panel warning and the export
// ---------------------------------------------------------------------------

function _endpointProblem(terminal, which) {
  if (!terminal)                return which + ' end is not attached to a shape.';
  if (!terminal.vertex)         return which + ' end is not attached to a shape.';
  if (isIgnored(terminal))      return which + ' shape is ignored.';
  if (!getProperty(terminal, PROP_NAME) || !isValidLevel(getProperty(terminal, PROP_LEVEL))) {
    return which + ' shape has no Name or Level.';
  }
  if (!getProperty(terminal, PROP_ID)) return which + ' shape has no ID.';
  if (!isValidId(getProperty(terminal, PROP_ID))) return which + ' shape has an invalid ID.';
  return null;
}

/**
 * Why a connector would not be exported as a flow, or null if it would.
 * Returns { code, message }. Ignored connectors return null (excluding them is
 * deliberate, not a problem). Works on edges of any page.
 */
function getFlowProblem(edge) {
  if (!edge || !edge.edge || isIgnored(edge)) return null;
  var src = edge.source, tgt = edge.target;

  var p = _endpointProblem(src, 'Source') || _endpointProblem(tgt, 'Target');
  if (p) return { code: 'PP-007', message: p + ' The connector is not exported.' };

  var sl = getProperty(src, PROP_LEVEL), tl = getProperty(tgt, PROP_LEVEL);
  if (sl === ORGANIZATION_LEVEL || tl === ORGANIZATION_LEVEL) {
    return { code: 'FLOW-010', message: 'An Organization cannot be a flow endpoint.' };
  }
  if (getProperty(src, PROP_ID) === getProperty(tgt, PROP_ID)) {
    return { code: 'FLOW-009', message: 'Both ends are the same element.' };
  }
  if (getLevelRank(sl) !== getLevelRank(tl)) {
    return {
      code: 'FLOW-001',
      message: 'Ends are at different levels (' + getLevelLabel(sl) + ' → ' + getLevelLabel(tl) +
               '); flows must connect elements at the same level.',
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function _ensureXmlValue(cell) {
  var cellValue = cell.value;
  if (typeof cellValue === 'object' && typeof cellValue.getAttribute === 'function') {
    return cellValue.cloneNode(true);
  }
  // Cell value is a plain string label — wrap it in an XML element.
  var doc = mxUtils.createXmlDocument();
  var obj = doc.createElement('object');
  obj.setAttribute('label', cellValue || '');
  return obj;
}

module.exports = {
  PROP_NAME,
  PROP_LEVEL,
  PROP_DESCRIPTION,
  PROP_IGNORED,
  PROP_TAGS,
  PROP_TECHNOLOGY,
  PROP_PROVISIONING,
  PROP_ID,
  PROP_PARENT,
  NODE_LEVEL,
  NODE_ONLY_PROPS,
  ORGANIZATION_LEVEL,
  PROVISIONING_VALUES,
  ID_MAX_LENGTH,
  LEVELS,
  RANK_GROUP_LABELS,
  VALID_LEVELS,
  isValidLevel,
  isValidProvisioning,
  getLevelRank,
  getLevelLabel,
  sanitizeLevel,
  migrateLegacyLevels,
  getChildLevels,
  getParentLevels,
  isLegalParent,
  isValidId,
  slugifyId,
  validateId,
  suggestId,
  findSameIdOnPage,
  findOtherPagesWithId,
  isElement,
  isCompleteSource,
  getContainerAncestor,
  resolveParent,
  collectElements,
  getParentCandidates,
  getFlowProblem,
  forEachPage: _forEachPage,
  walkCells: _walk,
  getAbsoluteBounds,
  fullyContains,
  promoteToContainer,
  findValidParent,
  adoptChildren,
  reparentCell,
  getProperty,
  setProperty,
  removeProperty,
  setProperties,
  getMissingProperties,
  getSyncProps,
  isIgnored,
  getTags,
  setTags,
  getShapeTypeKey,
  getLabelText,
  findCrossPageMatches,
};
