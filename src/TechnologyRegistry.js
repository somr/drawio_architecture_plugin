'use strict';

// Technology registry (specs §19). Supplied by the architecture configuration
// file installed next to the plugin, which assigns window.ArchitectureConfig.
// Read lazily so the load order of the two plugin files does not matter, then
// validated once and cached for the session.

var NODE_KINDS = [
  'COMPUTE',
  'STORAGE',
  'MESSAGING',
  'ORCHESTRATION',
  'NETWORK',
  'SECURITY',
  'OBSERVABILITY',
];

var KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;

var _cache;      // undefined = not read yet; null = read, not loaded
var _warn = function(msg) {
  if (typeof console !== 'undefined' && console.warn) console.warn('[architecture-config] ' + msg);
};

function _nonEmptyString(v) {
  return typeof v === 'string' && v.trim() !== '';
}

/**
 * Validates a raw configuration object. Returns the cleaned registry, or null
 * when the configuration as a whole is unusable. Invalid technology entries
 * are dropped individually with a warning.
 */
function parseConfig(raw) {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'object') {
    _warn('window.ArchitectureConfig is not an object; ignored.');
    return null;
  }
  if (!_nonEmptyString(raw.name)) {
    _warn('"name" is missing or empty; configuration ignored.');
    return null;
  }
  var version = typeof raw.version === 'number' ? String(raw.version) : raw.version;
  if (!_nonEmptyString(version)) {
    _warn('"version" is missing or empty; configuration ignored.');
    return null;
  }
  var techs = raw.technologies;
  if (!techs || typeof techs !== 'object' || Array.isArray(techs)) {
    _warn('"technologies" is missing or not an object; configuration ignored.');
    return null;
  }

  var clean = {};
  Object.keys(techs).forEach(function(key) {
    var def = techs[key];
    if (!KEY_PATTERN.test(key)) {
      _warn('technology "' + key + '" dropped: key must match ' + KEY_PATTERN);
      return;
    }
    if (!def || typeof def !== 'object') {
      _warn('technology "' + key + '" dropped: definition is not an object');
      return;
    }
    if (NODE_KINDS.indexOf(def.kind) === -1) {
      _warn('technology "' + key + '" dropped: kind must be one of ' + NODE_KINDS.join(', '));
      return;
    }
    if (typeof def.executable !== 'boolean') {
      _warn('technology "' + key + '" dropped: executable must be true or false');
      return;
    }
    clean[key] = { kind: def.kind, executable: def.executable };
  });

  return { name: raw.name.trim(), version: version.trim(), technologies: clean };
}

/** The loaded registry ({name, version, technologies}), or null if none. */
function getRegistry() {
  if (_cache === undefined) {
    var raw = (typeof window !== 'undefined') ? window.ArchitectureConfig : undefined;
    _cache = parseConfig(raw);
  }
  return _cache;
}

function isLoaded() {
  return getRegistry() !== null;
}

/** Sorted technology keys, or [] when no registry is loaded. */
function getTechnologyKeys() {
  var reg = getRegistry();
  return reg ? Object.keys(reg.technologies).sort() : [];
}

/** Kind of a technology key, or null when unknown / no registry. */
function getKind(key) {
  var reg = getRegistry();
  var def = reg && key ? reg.technologies[key] : null;
  return def ? def.kind : null;
}

/** True when a registry is loaded and contains the key (REF-003). */
function isKnownTechnology(key) {
  return getKind(key) !== null;
}

/** Forgets the cached registry. For tests only. */
function _reset() {
  _cache = undefined;
}

module.exports = {
  NODE_KINDS,
  parseConfig,
  getRegistry,
  isLoaded,
  getTechnologyKeys,
  getKind,
  isKnownTechnology,
  _reset,
};
