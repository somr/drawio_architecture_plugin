# DrawIO Properties Plugin — Application Specification

Version: 1.4.2
Status: Approved

---

## 1. Overview

A plugin for the standalone DrawIO desktop application (Linux and Windows) that allows users to manage three custom properties — **Name**, **Level**, and **Description** — on diagram shapes via a persistent, docked panel. The plugin also enforces a strict level hierarchy by automatically re-parenting shapes into container shapes, and displays connectivity information for the selected shape.

---

## 2. Scope

- Target environment: DrawIO desktop application (Electron-based), Linux and Windows.
- Delivered as a single self-contained `.js` file loaded via DrawIO's standard plugin mechanism.
- Must not rely on OS-specific APIs or browser-only features unavailable in the Electron runtime.

---

## 3. Property Model

All data is stored as custom XML attributes on the shape's cell value, using DrawIO's native property mechanism. The following property keys are used:

| Property Key           | Type               | Description                                                                 |
|------------------------|--------------------|-----------------------------------------------------------------------------|
| `prop_name`            | string             | The name assigned to the shape.                                             |
| `prop_level`           | string (enum)      | The level assigned to the shape. Must be one of the values in section 4.   |
| `prop_description`     | string             | A free-text description of the shape.                                       |
| `properties_ignored`   | boolean (`"true"`) | Marks a shape as explicitly excluded from property management.              |

Property changes are persisted to the DrawIO file immediately via DrawIO's model transaction mechanism (undoable).

---

## 4. Level Hierarchy

The `prop_level` property is constrained to the following ordered values:

| Level                      | Valid child level              |
|----------------------------|--------------------------------|
| Organization               | Software System                |
| Software System            | Pipeline / Workflow / Tier     |
| Pipeline / Workflow / Tier | Service                        |
| Service                    | Node                           |
| Node                       | *(cannot contain children)*    |

The hierarchy is **strict**: a shape may only be contained by a shape exactly one level above it. A shape whose level does not match the expected child level of the enclosing container will not be auto-adopted, and the user will receive an error if a conflict arises.

Organization shapes are at the top of the hierarchy and are never placed inside another container.

---

## 5. Properties Panel

### 5.1 Display

A persistent floating panel (`mxWindow`) is always visible when the plugin is loaded. The panel title is **Architect toolset** followed by the current version (e.g. `Architect toolset v1.4.2`) to allow users to confirm the deployed version.

The panel displays the following fields, in order:

| Field       | Type         | Editable | Description                                                          |
|-------------|--------------|----------|----------------------------------------------------------------------|
| Parent      | Display only | No       | Name and level of the direct parent container, or `— no parent —` if the shape is at the diagram root. |
| Name        | Text input   | Yes      | The shape's `prop_name`.                                             |
| Level       | Dropdown     | Yes      | The shape's `prop_level`. Constrained to the values in section 4.   |
| Description | Textarea     | Yes      | The shape's `prop_description`.                                      |

The **Parent** field shows `ParentName (ParentLevel)` when a parent exists, or `— no parent —` in grey when the shape sits at the diagram root.

### 5.2 States

| Condition                         | Panel State                                                     |
|-----------------------------------|-----------------------------------------------------------------|
| No shape selected                 | All fields reset. Parent shows `—`.                             |
| Multiple shapes selected          | All fields reset. Parent shows `—`.                             |
| Single edge selected              | All fields reset. Parent shows `—`.                             |
| Single shape selected (normal)    | Fields populated and editable. Adopt Children button visible if level has valid children. |
| Single shape selected (ignored)   | All fields reset. Parent shows `—`. Un-ignore button shown.     |

### 5.3 Saving

- Name and Description save on field blur.
- Level saves immediately on dropdown change, then triggers automatic re-parenting (see section 7.2).
- No explicit Save button is required in the panel.

### 5.4 Adopt Children Button

When the selected shape has a level that can contain child shapes (any level except Node), an **Adopt Children** button is shown below the Level dropdown.

Clicking it performs the bulk adoption described in section 7.1. The button is hidden for Node shapes and in the empty/ignored states.

### 5.5 Connected Shapes

A **Connected shapes** section lists all shapes connected to the selected shape via a connector. Each entry shows:

- A directional arrow: `→` (blue) for outgoing connections, `←` (grey) for incoming connections.
- The connected shape's `prop_name`, or its diagram label if `prop_name` is absent.
- The connected shape's level in parentheses, if set.
- If the connector itself has a label, it is shown on a second line below the shape name, enclosed in parentheses and italicised.

HTML tags (including `<br>`) in both shape labels and connector labels are stripped before display.

The section is hidden in the empty and ignored states.

### 5.6 Also In...

An **Also in...** section lists the names of other pages in the same file where a shape with an identical `prop_name` **and** identical `prop_level` exists. The match is exact on both fields; shapes with the same name but a different level are not listed.

Each page name is a clickable link. Clicking it:
1. Switches to that page (`ui.selectPage`), without adding the navigation to the undo history.
2. Selects the matching shape and centres the viewport on it (`graph.scrollCellToVisible`).
3. The panel immediately populates with the target shape's properties as a result of the selection change.

The section is only shown when:
- The selected shape has both `prop_name` and `prop_level` set.
- The file contains more than one page.
- At least one other page contains a matching shape.

The section is hidden in the empty and ignored states, and is not shown for single-page files.

---

## 6. Missing Properties Popup

### 6.1 Trigger

The popup is shown automatically when a single non-ignored shape is selected and any of `prop_name`, `prop_level`, or `prop_description` is absent.

### 6.2 Behaviour

- All three fields are shown.
- Fields that already have values on the shape are pre-filled and disabled.
- Only missing fields are editable.
- The Level field is a dropdown constrained to the valid level values.

### 6.3 Buttons

| Button     | Action                                                                                                  |
|------------|---------------------------------------------------------------------------------------------------------|
| **Save**   | Writes entered values to the shape. Dismisses popup. Panel is populated with the new values.            |
| **Ignore** | Writes `properties_ignored: "true"` to the shape. Dismisses popup. Panel switches to ignored state.     |

---

## 7. Hierarchical Container Adoption

### 7.1 Bulk Adoption (Adopt Children button)

When triggered on a selected shape, the plugin:

1. Determines the expected child level from the shape's own level (section 4).
2. Scans all shapes in the diagram whose `prop_level` matches the expected child level and whose bounding box is **fully inside** the container's bounding box.
3. Raises an error if any candidate is already parented to a different container at the same level (overlapping sibling containers — see section 7.3).
4. If no conflicts: promotes the container to `container=1;collapsible=0;` (if not already) and re-parents all candidates in a single undoable transaction. Each adopted shape's geometry is adjusted so its visual position on the canvas is unchanged.

Shapes with no level, the wrong level, or a partially-overlapping bounding box are silently ignored.

### 7.2 Automatic Re-parenting on Level Change

When the Level dropdown is changed on a selected shape, the plugin:

1. Saves the new level value.
2. Searches for a shape at the parent level (one level above) whose bounds fully contain the selected shape.
3. If a unique valid parent is found: promotes it to a container and re-parents the shape into it, preserving visual position.
4. If no valid parent is found: moves the shape to the diagram root.
5. If multiple valid parents are found: shows an error and leaves the shape in place.

Organization shapes (top of hierarchy) and shapes with no level are always placed at the diagram root.

### 7.3 Conflict Rules

| Situation                                                         | Outcome                                         |
|-------------------------------------------------------------------|-------------------------------------------------|
| Shape already parented to the correct container                   | Skipped (idempotent).                           |
| Shape at the right level but inside a nested container hierarchy  | Skipped (strict hierarchy rules apply).         |
| Shape already parented to a sibling container (overlapping bounds)| Error raised. User must fix the diagram layout. |
| Multiple valid parent containers found                            | Error raised. Shape left in place.              |
| Level changed; conflict with existing parent container            | Error raised. Shape left in place.              |

### 7.4 Container Promotion

A shape is promoted to a DrawIO container (`container=1;collapsible=0;` added to its style) automatically when it becomes the parent of another shape via bulk adoption or auto re-parenting. Promotion is non-destructive — existing style attributes are preserved.

---

## 8. Ignore / Un-ignore

- A shape with `properties_ignored: "true"` will never trigger the missing properties popup.
- When an ignored shape is selected, the panel shows an **Un-ignore this shape** button.
- Clicking **Un-ignore** removes the `properties_ignored` attribute from the shape and immediately re-evaluates the shape as if it was newly selected (which may trigger the missing properties popup).

---

## 9. Multi-selection

- When two or more shapes are selected simultaneously:
  - All panel fields are reset.
  - No popup is triggered.
  - The Adopt Children, Un-ignore, Connected Shapes, and Also In sections are all hidden.

---

## 10. Error Handling

All errors are surfaced to the user via a `mxUtils.alert()` dialog. No operation leaves the diagram in a partial or inconsistent state — transactions are always completed or not started.

| Error condition                           | Message summary                                                              |
|-------------------------------------------|------------------------------------------------------------------------------|
| Adopt Children on a shape with no level   | "Shape has no level assigned."                                               |
| Adopt Children on a Node shape            | `"Node" shapes cannot contain children.`                                     |
| Candidate owned by sibling container      | Lists the conflicting shapes and their current owners.                       |
| Multiple valid parents found              | Lists the competing parent containers. User must resolve the spatial overlap.|
| No shapes found to adopt                  | "No eligible shapes found inside the container bounds."                      |

---

## 11. Cross-platform Compatibility

- The plugin must function identically on DrawIO desktop for Linux and Windows.
- No OS-specific APIs may be used.
- The plugin must be delivered as a single bundled `.js` file.
- All mxGraph library objects (`mxEvent`, `mxWindow`, `mxUtils`, `mxEventObject`, `mxRectangle`) are used as globals provided by the DrawIO runtime — they must not be bundled.

---

## 12. Out of Scope

- Bulk editing across multiple shapes.
- Custom property field definitions (Name/Level/Description are fixed).
- Export or reporting of property data.
- DrawIO web application or VS Code extension support.
- Recursive bulk adoption (a shape adopted as a child does not automatically trigger adoption of its own children; the user must run Adopt Children on each container level in turn).
