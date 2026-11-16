'use strict';

/**
 * Fills a <select> with the Level options in hierarchy order. Levels that
 * share a rank (e.g. Workflow and Tier) are grouped under a non-selectable
 * <optgroup> heading so they read as alternatives at the same depth.
 */
function fillLevelSelect(select, sp) {
  var placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '— select —';
  select.appendChild(placeholder);

  var groups = {};
  sp.LEVELS.forEach(function(lvl) {
    var opt = document.createElement('option');
    opt.value = lvl.value;
    opt.textContent = lvl.label;

    var groupLabel = sp.RANK_GROUP_LABELS[lvl.rank];
    if (!groupLabel) {
      select.appendChild(opt);
      return;
    }
    if (!groups[lvl.rank]) {
      groups[lvl.rank] = document.createElement('optgroup');
      groups[lvl.rank].label = groupLabel;
      select.appendChild(groups[lvl.rank]);
    }
    groups[lvl.rank].appendChild(opt);
  });
}

module.exports = fillLevelSelect;
