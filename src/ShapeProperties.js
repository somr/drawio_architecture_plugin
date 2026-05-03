'use strict';

// Property key constants — these are the XML attribute names stored on cells.
var PROP_NAME        = 'prop_name';
var PROP_LEVEL       = 'prop_level';
var PROP_DESCRIPTION = 'prop_description';
var PROP_IGNORED     = 'properties_ignored';

// Allowed values for the Level property.
var VALID_LEVELS = [
  'Organization',
  'Software System',
  'Pipeline / Workflow / Tier',
  'Service',
  'Node',
];

function isValidLevel(value) {
  return value && VALID_LEVELS.indexOf(value) !== -1;
}

/**
 * Removes the Level property if its stored value is not in VALID_LEVELS.
 * Returns true if a removal was performed.
 */
function sanitizeLevel(graph, cell) {
  var current = getProperty(cell, PROP_LEVEL);
  if (current !== null && !isValidLevel(current)) {
    removeProperty(graph, cell, PROP_LEVEL);
    return true;
  }
  return false;
}

/**
 * Returns the value of a custom property on a cell, or null if absent.
 */
function getProperty(cell, key) {
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
 * Returns an array of property key names that are missing from the cell.
 * Only checks the three required properties.
 */
function getMissingProperties(cell) {
  var missing = [];
  if (!getProperty(cell, PROP_NAME))        missing.push(PROP_NAME);
  if (!getProperty(cell, PROP_LEVEL))       missing.push(PROP_LEVEL);
  if (!getProperty(cell, PROP_DESCRIPTION)) missing.push(PROP_DESCRIPTION);
  return missing;
}

/**
 * Returns true if the cell has been marked as ignored.
 */
function isIgnored(cell) {
  return getProperty(cell, PROP_IGNORED) === 'true';
}

// ---------------------------------------------------------------------------
// Hierarchy
// ---------------------------------------------------------------------------

var CHILD_LEVEL = {
  'Organization':              'Software System',
  'Software System':           'Pipeline / Workflow / Tier',
  'Pipeline / Workflow / Tier':'Service',
  'Service':                   'Node',
};

var PARENT_LEVEL = (function() {
  var map = {};
  Object.keys(CHILD_LEVEL).forEach(function(k) { map[CHILD_LEVEL[k]] = k; });
  return map;
}());

function getChildLevel(level)  { return CHILD_LEVEL[level]  || null; }
function getParentLevel(level) { return PARENT_LEVEL[level] || null; }

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
 * Finds the unique valid parent for cell based on level hierarchy and bounds.
 * Returns null if no parent found.
 * Throws a descriptive string if multiple candidates are found.
 */
function findValidParent(graph, cell) {
  var cellLevel = getProperty(cell, PROP_LEVEL);
  if (!cellLevel) return null;
  var needed = getParentLevel(cellLevel);
  if (!needed) return null;
  var cellBounds = getAbsoluteBounds(graph, cell);
  if (!cellBounds) return null;

  var found = [];
  var cells = graph.model.cells;
  Object.keys(cells).forEach(function(id) {
    var c = cells[id];
    if (!c.vertex || c === cell) return;
    if (getProperty(c, PROP_LEVEL) !== needed) return;
    var b = getAbsoluteBounds(graph, c);
    if (b && fullyContains(b, cellBounds)) found.push(c);
  });

  if (found.length === 0) return null;
  if (found.length > 1) {
    var names = found.map(function(c) {
      return '"' + (getProperty(c, PROP_NAME) || '(unnamed)') + '"';
    }).join(', ');
    throw 'Shape falls inside multiple ' + needed + ' containers: ' + names +
          '. Move it so it is inside exactly one.';
  }
  return found[0];
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
  var childLevel = getChildLevel(containerLevel);
  if (!childLevel) throw '"Node" shapes cannot contain children.';

  var containerBounds = getAbsoluteBounds(graph, container);
  if (!containerBounds) throw 'Cannot determine container bounds.';

  var model = graph.model;
  var defaultParent = graph.getDefaultParent();
  var toAdopt = [], conflicts = [];

  Object.keys(model.cells).forEach(function(id) {
    var c = model.cells[id];
    if (!c.vertex || c === container) return;
    if (getProperty(c, PROP_LEVEL) !== childLevel) return;
    var b = getAbsoluteBounds(graph, c);
    if (!b || !fullyContains(containerBounds, b)) return;

    var cp = model.getParent(c);
    if (cp === container)     return;              // already adopted
    if (cp === defaultParent) toAdopt.push(c);
    else                      conflicts.push({ cell: c, parent: cp });
  });

  if (conflicts.length > 0) {
    var msg = conflicts.map(function(item) {
      var cn = getProperty(item.cell,   PROP_NAME) || '(unnamed)';
      var pn = getProperty(item.parent, PROP_NAME) || '(unnamed)';
      return '"' + cn + '" (owned by "' + pn + '")';
    }).join(', ');
    throw 'Shapes already owned by another container: ' + msg +
          '. Fix the overlapping container bounds.';
  }

  model.beginUpdate();
  try {
    promoteToContainer(graph, container);
    toAdopt.forEach(function(c) { _moveToParent(graph, c, container); });
  } finally {
    model.endUpdate();
  }

  return toAdopt.length;
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
  if (!level || !getParentLevel(level)) {
    if (model.getParent(cell) !== defaultParent) {
      model.beginUpdate();
      try { _moveToParent(graph, cell, defaultParent); }
      finally { model.endUpdate(); }
    }
    return;
  }

  var validParent = findValidParent(graph, cell); // throws if multiple
  var currentParent = model.getParent(cell);
  if (validParent && currentParent === validParent) return; // already correct

  model.beginUpdate();
  try {
    if (validParent) {
      promoteToContainer(graph, validParent);
      _moveToParent(graph, cell, validParent);
    } else if (currentParent !== defaultParent) {
      _moveToParent(graph, cell, defaultParent);
    }
  } finally {
    model.endUpdate();
  }
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
  VALID_LEVELS,
  CHILD_LEVEL,
  PARENT_LEVEL,
  isValidLevel,
  sanitizeLevel,
  getChildLevel,
  getParentLevel,
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
  isIgnored,
};
