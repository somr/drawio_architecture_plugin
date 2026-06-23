# DrawIO Properties Plugin — Application Specification

Version: 1.10.1
Status: Approved

---

## 1. Overview

A plugin for the standalone DrawIO desktop application (Linux and Windows) that allows users to manage custom properties on diagram shapes and connectors via a persistent, docked panel. Shapes carry **Name**, **Level**, and **Description**; connectors carry **Name** and **Description** (no level). The plugin also enforces a strict level hierarchy by automatically re-parenting shapes into container shapes, and displays connectivity information for the selected shape or connector.

---

## 2. Scope

- Target environment: DrawIO desktop application (Electron-based), Linux and Windows.
- Delivered as a single self-contained `.js` file loaded via DrawIO's standard plugin mechanism.
- Must not rely on OS-specific APIs or browser-only features unavailable in the Electron runtime.

---

## 3. Property Model

All data is stored as custom XML attributes on the cell's value, using DrawIO's native property mechanism. The following property keys are used:

| Property Key           | Applies to          | Type               | Description                                                                 |
|------------------------|---------------------|--------------------|-----------------------------------------------------------------------------|
| `prop_name`            | Shapes & connectors | string             | The name assigned to the cell.                                              |
| `prop_level`           | Shapes only         | string (enum)      | The level assigned to the shape. Must be one of the values in section 4.   |
| `prop_description`     | Shapes & connectors | string             | A free-text description of the cell.                                        |
| `properties_ignored`   | Shapes & connectors | boolean (`"true"`) | Marks a cell as explicitly excluded from property management.               |
| `prop_tags`            | Shapes & connectors | string             | Comma-separated tag names (see section 13).                                 |

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

A persistent floating panel (`mxWindow`) is always visible when the plugin is loaded. The panel title is **Architect toolset** followed by the current version (e.g. `Architect toolset v1.10.1`) to allow users to confirm the deployed version.

**Shape fields** (shown when a shape is selected):

| Field       | Type         | Editable | Description                                                          |
|-------------|--------------|----------|----------------------------------------------------------------------|
| Parent      | Display only | No       | Name and level of the direct parent container, or `— no parent —` if the shape is at the diagram root. |
| Name        | Text input   | Yes      | The shape's `prop_name`.                                             |
| Level       | Dropdown     | Yes      | The shape's `prop_level`. Constrained to the values in section 4.   |
| Description | Textarea     | Yes      | The shape's `prop_description`.                                      |

The **Parent** field shows `ParentName (ParentLevel)` when a parent exists, or `— no parent —` in grey when the shape sits at the diagram root.

**Connector fields** (shown when a connector is selected, see section 5.7):

| Field       | Type         | Editable | Description                                          |
|-------------|--------------|----------|------------------------------------------------------|
| Name        | Text input   | Yes      | The connector's `prop_name`.                         |
| Description | Textarea     | Yes      | The connector's `prop_description`.                  |

Parent and Level are **not shown** for connectors.

### 5.2 States

| Condition                              | Panel State                                                                          |
|----------------------------------------|--------------------------------------------------------------------------------------|
| No shape selected                      | All fields reset. Parent shows `—`.                                                  |
| Multiple shapes selected               | All fields reset. Parent shows `—`.                                                  |
| Single shape selected (normal)         | Shape fields populated and editable. Adopt Children button visible if level has valid children. |
| Single shape selected (ignored)        | All fields reset. Parent shows `—`. Un-ignore button shown.                          |
| Single connector selected (normal)     | Name and Description editable. Connects section shows source and target shapes.      |
| Single connector selected (ignored)    | All fields reset. Un-ignore button shown.                                            |

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

### 5.7 Connector Properties

When a single connector is selected (and not ignored), the panel switches to connector mode:

- The **Name** and **Description** fields are enabled and editable. Saving follows the same blur/change rules as shapes (section 5.3).
- The **Level** dropdown and **Parent** display are hidden.
- A **Connects** section replaces Connected Shapes, Also In, and the report button. It shows:

  `[source name] → [target name]`

  Each name is the connected shape's `prop_name`. If a connected shape has no `prop_name`, is marked as ignored, or the connector endpoint is unattached, the name is shown as **anonymous** in grey italic and is not clickable.

  Named endpoints are rendered as blue underlined links. Clicking a link:
  1. Selects the connected shape (triggering the panel to switch to that shape's properties).
  2. Centres the viewport on the shape (`graph.scrollCellToVisible`).

---

## 6. Missing Properties Popup

### 6.1 Trigger

The popup is shown automatically when:
- A single non-ignored **shape** is selected and any of `prop_name`, `prop_level`, or `prop_description` is absent, **or**
- A single non-ignored **connector** is selected and any of `prop_name` or `prop_description` is absent.

### 6.2 Behaviour — Shapes

- Name, Level, and Description fields are shown.
- Fields that already have values are pre-filled and disabled.
- Only missing fields are editable.
- The Level field is a dropdown constrained to the valid level values.
- Dialog title: **Shape Properties Required**.

### 6.3 Behaviour — Connectors

- Name and Description fields are shown (Level is omitted entirely).
- Fields that already have values are pre-filled and disabled.
- Only missing fields are editable.
- Dialog title: **Connector Properties Required**.

### 6.4 Buttons

| Button     | Action                                                                                                  |
|------------|---------------------------------------------------------------------------------------------------------|
| **Save**   | Writes entered values to the cell. Dismisses popup. Panel populates with the new values.                |
| **Ignore** | Writes `properties_ignored: "true"` to the cell. Dismisses popup. Panel switches to ignored state.      |

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

The ignore mechanism applies to both shapes and connectors identically:

- A cell with `properties_ignored: "true"` will never trigger the missing properties popup.
- When an ignored shape or connector is selected, the panel shows an **Un-ignore** button. All editable fields are disabled.
- Clicking **Un-ignore** removes the `properties_ignored` attribute from the cell and immediately re-evaluates it as if newly selected (which may trigger the missing properties popup if properties are incomplete).
- Ignored connectors appear as **anonymous** in the Connects section of other connectors (section 5.7).

---

## 9. Multi-selection

- When two or more cells (shapes or connectors, in any combination) are selected simultaneously:
  - All panel fields are reset.
  - No popup is triggered.
  - The Adopt Children, Un-ignore, Connected Shapes, Connects, and Also In sections are all hidden.

---

## 10. Architecture Export

### 10.1 Trigger

An **Export architecture JSON** button is shown at the bottom of the panel **only when no shape is selected**. It is hidden in all other states (populated, ignored).

### 10.2 Output files

Clicking the button produces two files saved in the **same folder as the currently open `.drawio` file**:

| File | Contents |
|------|----------|
| `{diagramname}_{pagename}.png` | Full-page PNG export of the current page |
| `{diagramname}_{pagename}.json` | JSON document describing the shape hierarchy and connectors |

Naming convention: both `{diagramname}` and `{pagename}` are lowercased, whitespace removed, and non-alphanumeric characters (except `-`) stripped, then truncated to 64 characters each. If a tag highlight is active at export time, the active tag name is appended after the same sanitisation rules: `{diagramname}_{pagename}_{tagname}`.

Example: diagram `My Architecture.drawio`, page `Cloud Infra (EU)`, no tag active → `myarchitecture_cloudinfraeu.json` + `myarchitecture_cloudinfraeu.png`.

Example with tag `team-a` active → `myarchitecture_cloudinfraeu_team-a.json` + `myarchitecture_cloudinfraeu_team-a.png`.

### 10.3 Eligibility — shapes

A shape is included in the hierarchy if:
- It has `prop_name` set (required)
- It has `prop_level` set (required)
- It is **not** marked as ignored (`properties_ignored=true`)

`prop_description` is optional; it appears as `null` in the JSON when blank.

### 10.4 Eligibility — connectors

A connector is included in the connectors list if:
- It has `prop_name` set and non-empty (required)
- It is **not** marked as ignored

`prop_description` is optional; it appears as `null` when blank.

### 10.5 JSON structure

#### 10.5.1 Top-level document

| Field | Type | Description |
|-------|------|-------------|
| `page` | string | Raw page name as shown in the DrawIO tab. |
| `generated` | string | Local date of export in `YYYY-MM-DD` format. |
| `nodes` | array of shape nodes | All eligible root nodes and their full subtrees, sorted by level depth. A root node is an eligible shape whose draw.io parent is not itself eligible. Empty array if none. |
| `connectors` | array of connector entries | Named, non-ignored connectors. Empty array if none. |

#### 10.5.2 Shape node

Appears in `nodes`. Children of a shape are nested recursively.

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `name` | string | no | The shape's `prop_name`. |
| `level` | string | no | The shape's `prop_level`. One of the values from section 4. |
| `description` | string \| null | yes | The shape's `prop_description`. `null` when the property is absent or blank. |
| `children` | array of shape nodes | no | Eligible model-children of this shape. Always present; empty array `[]` when none. |

#### 10.5.3 Connector entry

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `name` | string | no | The connector's `prop_name`. Always set (required for inclusion). |
| `description` | string \| null | yes | The connector's `prop_description`. `null` when absent or blank. |
| `source` | endpoint object | no | The shape at the originating end of the connector. |
| `target` | endpoint object | no | The shape at the receiving end of the connector. |

#### 10.5.4 Endpoint object

Used for `source` and `target` inside a connector entry.

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | The connected shape's `prop_name`, or `"anonymous"` (see rules below). |
| `level` | string | The connected shape's `prop_level`, or `"undefined"` (see rules below). |

**Resolution rules** (applied in order):

| Condition | `name` | `level` |
|-----------|--------|---------|
| Endpoint cell is missing (dangling connector) | `"anonymous"` | `"undefined"` |
| Endpoint cell is not a vertex | `"anonymous"` | `"undefined"` |
| Endpoint shape is marked as ignored | `"anonymous"` | `"undefined"` |
| Endpoint shape has no `prop_name` | `"anonymous"` | `"undefined"` |
| Endpoint shape has `prop_name` but no `prop_level` | shape's `prop_name` | `"undefined"` |
| Endpoint shape has both `prop_name` and `prop_level` | shape's `prop_name` | shape's `prop_level` |

#### 10.5.5 Complete annotated example

```json
{
  "page": "Cloud Infrastructure",
  "generated": "2026-05-11",
  "nodes": [
    {
      "name": "Acme Corp",
      "level": "Organization",
      "description": "Primary organisation.",
      "children": [
        {
          "name": "Billing System",
          "level": "Software System",
          "description": null,
          "children": [
            {
              "name": "Payment Pipeline",
              "level": "Pipeline / Workflow / Tier",
              "description": "Handles card processing.",
              "children": [
                {
                  "name": "Auth Service",
                  "level": "Service",
                  "description": null,
                  "children": []
                }
              ]
            }
          ]
        }
      ]
    },
    {
      "name": "Legacy DB",
      "level": "Node",
      "description": "Old database, not yet migrated.",
      "children": []
    }
  ],
  "connectors": [
    {
      "name": "Charge request",
      "description": "Initiates card charge flow.",
      "source": { "name": "Billing System", "level": "Software System" },
      "target": { "name": "Auth Service",   "level": "Service" }
    },
    {
      "name": "DB read",
      "description": null,
      "source": { "name": "Auth Service", "level": "Service" },
      "target": { "name": "anonymous",    "level": "undefined" }
    }
  ]
}
```

In the example, `"DB read"` has an anonymous target because the connected shape has no `prop_name`. `"Legacy DB"` appears in `nodes` alongside `"Acme Corp"` because its draw.io parent is not an eligible shape.

### 10.6 Hierarchy traversal

The export uses the **mxGraph model hierarchy** (actual parent-child container relationships). A **root node** is an eligible shape whose draw.io parent is not itself eligible (i.e. the parent has no `prop_name` + `prop_level`, or is ignored). All root nodes are collected, sorted by level depth, and emitted as top-level entries in `nodes`, each with its eligible descendants nested recursively. Every eligible shape appears exactly once.

### 10.7 PNG export

The PNG is exported first via DrawIO's `editor.exportToCanvas()` API, covering the complete page content (not just the visible viewport). White background (`#ffffff`). The binary data is written via the Electron IPC `writeFile` action with `enc: 'base64'`. The JSON file is written only after the PNG succeeds.

### 10.8 Error conditions (disk export)

| Condition | Behaviour |
|-----------|-----------|
| Diagram not yet saved to disk | Alert: "Save the diagram before exporting." |
| No eligible shapes on current page | Alert: "No shapes with Name and Level found on this page." |
| PNG export failure | Alert: "PNG export failed: {reason}." |
| JSON file write failure | Alert: "Could not write export: {reason}." |

---

## 11. Confluence Push

### 11.1 Overview

The Properties tab contains a **Confluence** section below the Export button. It lets the user push the current page's PNG and JSON exports directly to one or more Confluence pages as attachments, without writing any files to disk.

### 11.2 Target pages

Target Confluence pages are declared on the diagram itself via a `confluence_page` diagram property (right-click diagram background → Edit Data → add `confluence_page`). The value is one URL per line. A URL is **valid** if it contains `/pages/{id}/` where `{id}` is a numeric page ID; any other line is **invalid** and shown as a warning.

The Confluence section displays the list of valid target page URLs as clickable links (opens in browser) and flags invalid entries.

### 11.3 Credentials

Confluence API credentials are stored in `localStorage` under the key `confluence_plugin_config`. The stored object contains:

| Field | Description |
|-------|-------------|
| `baseUrl` | Confluence Cloud base URL, e.g. `https://company.atlassian.net` (trailing slashes stripped). |
| `email` | Atlassian account email address. |
| `apiToken` | Atlassian API token. |

The credentials form is revealed by clicking the `⚙` toggle below the push button. Save and Clear buttons manage the stored config. All three fields are required to save.

### 11.4 Push behaviour

Clicking **Push to Confluence** triggers the following sequence:

1. PNG is rendered in-memory via `editor.exportToCanvas()` (same as disk export but no file is written).
2. For each valid target page URL (in order):
   a. Upload `{diagramname}_{pagename}.png` with `contentType: image/png`.
   b. Upload `{diagramname}_{pagename}.json` with `contentType: application/json`.
3. `onProgress` fires after each page completes (success or failure).
4. When all pages are done, the status area shows a per-page result line: `✓ {page title}` on success, `✗ {page title}: {reason}` on failure.

The push button is disabled (grey) when credentials are not configured or there are no valid target page URLs.

### 11.5 Upload mechanism

Uploads route through a custom `httpRequest` IPC action added to the DrawIO Desktop main process (`src/main/electron.js`). This is necessary because:
- DrawIO Desktop's CSP blocks `fetch()`/XHR to non-whitelisted domains (including `*.atlassian.net`).
- The built-in DrawIO `confluenceUpload` IPC action does not exist in this build.
- Node.js `https` is not available in the renderer (`nodeIntegration: false`).
- The main process is not subject to CSP and can make arbitrary outbound HTTPS requests.

The renderer builds the `multipart/form-data` body (preamble + file bytes + epilogue), base64-encodes it for IPC transport, and sends it via `window.electron.request`. The main process decodes it back to a `Buffer` and sends the raw bytes.

| Request detail | Value |
|----------------|-------|
| Method | `POST` |
| URL | `{baseUrl}/wiki/rest/api/content/{pageId}/child/attachment` |
| `Authorization` header | `Basic {base64({email}:{apiToken})}` |
| `X-Atlassian-Token` header | `no-check` (required by Confluence to bypass CSRF protection) |
| Body | `multipart/form-data` assembled in the renderer, transported as base64 over IPC |

**Prerequisite:** The `httpRequest` case must be present in the `rendererReq` switch in `drawio-desktop/src/main/electron.js`, and DrawIO Desktop must be rebuilt from source. Available on the `drawio-desktop` `dev` branch from commit `8c435ed` onward. Note: `electron.js` uses ESM (`"type": "module"` in `package.json`); `http` and `https` must be top-level ESM imports — `require()` is not available.

### 11.6 Error conditions (Confluence push)

| Condition | Behaviour |
|-----------|-----------|
| Credentials not configured | Credentials form expanded; status: "Enter credentials above." |
| Diagram not yet saved to disk | Status: "Save the diagram before pushing to Confluence." |
| No eligible shapes on current page | Status: "No shapes with Name and Level found on this page." |
| No valid target page URLs | Status message describing whether `confluence_page` is absent or only contains invalid URLs. |
| PNG export failure | Status: "PNG export failed: {reason}." |
| HTTP error from Confluence | Per-page `✗` line with `HTTP {status}: {message}` parsed from the response body. Other pages continue. |
| Network error (no response) | Per-page `✗` line with `Network error: {reason}`. |

---

## 12. General Error Handling

All errors are surfaced to the user via a `mxUtils.alert()` dialog. No operation leaves the diagram in a partial or inconsistent state — transactions are always completed or not started.

| Error condition                           | Message summary                                                              |
|-------------------------------------------|------------------------------------------------------------------------------|
| Adopt Children on a shape with no level   | "Shape has no level assigned."                                               |
| Adopt Children on a Node shape            | `"Node" shapes cannot contain children.`                                     |
| Candidate owned by sibling container      | Lists the conflicting shapes and their current owners.                       |
| Multiple valid parents found              | Lists the competing parent containers. User must resolve the spatial overlap.|
| No shapes found to adopt                  | "No eligible shapes found inside the container bounds."                      |

---

## 13. Cross-platform Compatibility

- The plugin must function identically on DrawIO desktop for Linux and Windows.
- No OS-specific APIs may be used.
- The plugin must be delivered as a single bundled `.js` file.
- All mxGraph library objects (`mxEvent`, `mxWindow`, `mxUtils`, `mxEventObject`, `mxRectangle`) are used as globals provided by the DrawIO runtime — they must not be bundled.

---

## 14. Tags

### 14.1 Property storage

Shapes and connectors (edges) may each carry an optional `prop_tags` property — a
comma-separated string of arbitrary tag names (e.g. `"team-a,security,core"`). Tags are
case-sensitive and trimmed of leading/trailing whitespace when read.

### 14.2 Tags tab

The panel is split into two tabs:

| Tab | Content |
|-----|---------|
| **Properties** | Shape mode: Parent, Name, Level, Description, Adopt Children, Connected shapes, Also in..., Export architecture JSON button. Connector mode: Name, Description, Connects section. |
| **Tags** | Tags field for the selected cell; Highlight section (see section 15). |

### 14.3 Tags field

The Tags field is a single-line text input in the Tags tab showing a comma-separated list of
the selected cell's tags.

| State | Tags field |
|-------|-----------|
| No selection | Disabled and blank |
| Single shape selected (normal or ignored) | Enabled and editable |
| Single edge selected | Enabled and editable |
| Multiple shapes selected | Disabled and blank |

The field saves on blur via `ShapeProperties.setTags()`. An empty field removes the `prop_tags`
attribute from the cell.

### 14.4 Connector selection

When a single connector is selected, the panel switches to the **Properties tab** (not the Tags
tab) and activates Name and Description fields for the connector. The Tags tab remains accessible
and editable. Selecting a shape also keeps the Properties tab active.

---

## 15. Tag Highlight

### 15.1 Overview

The Highlight section is always visible in the Tags tab. It lets the user select a tag from a
dropdown and visually emphasise all shapes and connectors that carry that tag, de-emphasising
everything else.

### 15.2 Highlight dropdown

The dropdown lists all unique tag values found on any vertex or edge in the current page,
sorted alphabetically. If no tags are defined, the dropdown shows `(no tags defined)` with
the placeholder option disabled. The dropdown is refreshed whenever the Tags tab becomes active
and whenever tags are saved on a cell.

### 15.3 Activate

Clicking **Activate** with a tag selected:

1. Stores the current `style` attribute of every vertex and edge in the graph model.
2. Applies style overrides in a single undoable transaction:
   - Shapes **with** the tag → highlighted style overrides.
   - Shapes **without** the tag (including shapes with no tags at all) → de-emphasised style overrides.
   - Connectors follow the same rule, using separate edge style overrides.
3. Style overrides are **merged** on top of the cell's existing style — only specific keys
   (stroke colour, stroke width, fill colour, font colour, opacity) are changed. All other style
   attributes (shape type, edge routing, text alignment, etc.) are preserved.

The operation is undoable (Ctrl+Z restores original styles as one step).

### 15.4 Style constants

Style override keys and their placeholder values (defined in `src/TagHighlight.js`; change there
to adjust the visual appearance):

| Constant | Applied to | Keys overridden |
|---|---|---|
| `HIGHLIGHT_VERTEX` | Highlighted shapes | `strokeColor`, `strokeWidth`, `fillColor` |
| `DEEMPH_VERTEX` | De-emphasised shapes | `strokeColor`, `strokeWidth`, `fillColor`, `fontColor`, `opacity` |
| `HIGHLIGHT_EDGE` | Highlighted connectors | `strokeColor`, `strokeWidth` |
| `DEEMPH_EDGE` | De-emphasised connectors | `strokeColor`, `strokeWidth`, `fontColor`, `opacity` |

### 15.5 Clear

Clicking **Clear** restores all original styles from the stored snapshot in one undoable
transaction and deactivates the highlight.

### 15.6 Persistence

Highlight is applied via `graph.model.setStyle()` and therefore marks the file as having
unsaved changes. The user should click **Clear** before saving to avoid saving highlight styles
to the `.drawio` file. When a new file is opened (`fileLoaded`), the plugin resets its
internal highlight state automatically without touching the model.

### 15.7 Scope

The highlight operates on the current page only. Switching pages or opening a new file resets
the internal state. There is no multi-tag simultaneous highlight; only one tag can be active
at a time.

---

## 17. Cross-Page Property Consolidation

### 17.1 Overview

When the same component appears on multiple pages (e.g. "Auth Service" in both a system context diagram and a deployment diagram), users should not need to re-enter the same Name, Level, and Description on every page.

Two shapes are considered the **same component** if both of the following match exactly:

- **Label text**: The visible shape label with HTML stripped and trimmed (case-sensitive).
- **Shape style type**: The `shape=X` token in the DrawIO style string. Plain shapes with no `shape=` token also match each other.

### 17.2 Missing Properties Dialog — Pre-fill from another page (Layer 1)

When the Missing Properties Dialog opens for a shape, the plugin scans all other pages for vertices matching by label + shape type.

If a matching shape with complete properties (Name, Level, and Description all set) is found on another page:
- The missing fields are automatically pre-filled from that source.
- A blue banner above the fields reads **"Pre-filled from: [Page Name]"**.
- If multiple pages provide complete matches with different values, a dropdown replaces the page name so the user can select which source to apply. Changing the selection re-fills the fields.
- The user reviews the values and clicks **Save** as normal. No behaviour changes otherwise.

This is read-only from the other pages — no write occurs until Save is clicked.

### 17.3 "Sync to all matching pages" button (Layer 2)

When a shape is selected and has all three properties set (Name, Level, Description), and at least one other page contains a shape with the same label + shape type, a **"Sync to all matching pages"** button appears at the bottom of the **Also in...** section.

Clicking the button opens the Sync Preview Dialog (section 17.5).

### 17.4 "Sync cross-page shapes" button (Layer 3)

In the empty panel state (no shape selected), a **"Sync cross-page shapes"** button is shown below the Export button. It is only shown when the file contains more than one page.

Clicking it scans all pages, groups vertices by label + shape type, identifies a source for each group (the member with all three properties set), and builds a list of all proposed property writes.

This list is presented in the Sync Preview Dialog (section 17.5).

If no cross-page shape groups have a member with complete properties, an alert is shown: "No cross-page shapes with matching labels and complete properties were found."

### 17.5 Sync Preview Dialog

The Sync Preview Dialog shows:

- A scrollable list of proposed updates, one row per target shape.
- Each row shows: the target page name, the shape's label, and a brief description of what will change (e.g. "adds Name, Level, Description").
- All rows are checked by default. The user may uncheck individual rows to exclude them.
- A **Select all** checkbox controls all rows at once.
- **Cancel** closes the dialog without changes.
- **Confirm** applies the checked writes, then closes the dialog.

Writes are applied by temporarily switching to each target page and calling the model transaction API. Each write is undoable on that page's undo stack via Ctrl+Z. After all writes, the plugin restores the original page and re-selects the original cell.

### 17.6 Constraints

- Matching is exact on both label text and shape type. Case-sensitive.
- Connectors are matched in Layer 1 (dialog pre-fill) using prop_name and prop_description (no Level).
- Layer 2 and Layer 3 apply only to shapes (vertices), not connectors.
- Cross-page writes go into each target page's own undo history.

---

## 16. Out of Scope

- Bulk editing across multiple shapes.
- Custom property field definitions (Name/Level/Description are fixed).
- Export or reporting of property data.
- DrawIO web application or VS Code extension support.
- Recursive bulk adoption (a shape adopted as a child does not automatically trigger adoption of its own children; the user must run Adopt Children on each container level in turn).
- Multi-page report in a single run (the Architecture Report covers the current page only; run it once per page for multi-page coverage).
- HTML or PDF report output.
- Shape ordering within a level in the report (currently follows model iteration order).
