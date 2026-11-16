window.__panelState = function() {
  var win = [...document.querySelectorAll("div")].find(d => d.innerText && d.innerText.startsWith("Properties\nTags") && d.querySelector("label"));
  var pane = win;
  var rows = [...pane.querySelectorAll("label")].filter(l => l.offsetParent !== null).map(l => {
    var row = l.parentNode;
    var ctl = [...row.querySelectorAll("input,select,textarea,div")].find(e => e.offsetParent !== null && e !== l && (e.tagName !== "DIV" || e.children.length === 0));
    var v = ctl ? (ctl.tagName === "SELECT" ? ctl.options[ctl.selectedIndex] && ctl.options[ctl.selectedIndex].text : (ctl.value !== undefined && ctl.tagName !== "DIV" ? ctl.value : ctl.textContent)) : "";
    return l.textContent + " = " + v + (ctl && ctl.disabled ? " [disabled]" : "") + (ctl && ctl.tagName === "SELECT" ? " <select>" : "");
  });
  var buttons = [...pane.querySelectorAll("button")].filter(b => b.offsetParent !== null).map(b => b.textContent);
  var alsoIn = [...pane.querySelectorAll("div")].find(d => d.textContent === "Also in...");
  var connects = [...pane.querySelectorAll("div")].find(d => d.textContent === "Connects");
  return { rows, buttons,
    alsoIn: alsoIn && alsoIn.offsetParent ? alsoIn.parentNode.innerText.replace(/\n/g, " | ") : null,
    connects: connects && connects.offsetParent ? connects.parentNode.innerText.replace(/\n/g, " | ") : null };
};
"ok"
