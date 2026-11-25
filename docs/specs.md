# DrawIO Properties Plugin — Application Specification

Version: 1.12.0
Status: Approved

---

## 1. Overview

A plugin for the standalone DrawIO desktop application (Linux and Windows) that allows users to manage custom properties on diagram shapes and connectors via a persistent, docked panel. Shapes carry an **ID**, **Name**, **Level** and optional **Description**; Node shapes additionally carry **Technology** and **Provisioning**. Connectors carry an optional **ID** and **Description**. The plugin enforces the level hierarchy by automatically re-parenting shapes into container shapes, and displays connectivity information for the selected shape or connector.

The whole `.drawio` file is exported as a single architecture model that conforms to the **Architecture Metamodel V1** (`docs/architecture-metamodel.md`; sample: `docs/architecture_1.yaml`). Where this specification and the metamodel use different words, the mapping is:

| Metamodel term | Plugin term |
|---|---|
| Element | Shape (vertex) with ID, Name and Level |
| Element `type` | Level (`prop_level`) |
| Flow | Connector (edge) |
| Technology registry | Architecture configuration file (section 19) |

Rule codes from the metamodel (e.g. `ID-001`, `FLOW-001`) are quoted where the plugin enforces or reports them.

---

## 2. Scope

- Target environment: DrawIO desktop application (Electron-based), Linux and Windows.
- Delivered as a single self-contained `.js` file loaded via DrawIO's standard plugin mechanism.
- Must not rely on OS-specific APIs or browser-only features unavailable in the Electron runtime.

---

## 3. Property Model

All data is stored as custom XML attributes on the cell's value, using DrawIO's native property mechanism. The following property keys are used:

| Property Key           | Applies to          | Required | Type               | Description                                                                 |
|------------------------|---------------------|----------|--------------------|-----------------------------------------------------------------------------|
| `prop_id`              | Shapes & connectors | Shapes: yes. Connectors: no | string (id syntax, section 4.2) | Stable, machine-facing identity of the element or flow. Independent of the name. |
| `prop_name`            | Shapes & connectors | Shapes: yes. Connectors: no | string | Human-facing name. On connectors it is a display label only and is not exported. |
| `prop_level`           | Shapes only         | yes      | string (enum)      | The level of the shape. One of the stored values in section 4.             |
| `prop_description`     | Shapes & connectors | no       | string             | Free-text description.                                                      |
| `prop_parent`          | Shapes only         | no       | string (an element id) | Explicit parent, used only when the shape is not inside an eligible container on its page (section 4.3). |
| `prop_technology`      | Node shapes only    | no       | string (registry key) | Technology of the node; a key of the Technology registry (section 19), e.g. `AWS_LAMBDA`. |
| `prop_provisioning`    | Node shapes only    | no       | string (enum)      | One of `IAC`, `EXTERNAL`, `RUNTIME` (section 4.4).                          |
| `prop_flow_lift`       | Connectors only     | no       | `"true"` or absent | Export a cross-level connector lifted to the common level of its ends (section 10.5.1). |
| `properties_ignored`   | Shapes & connectors | no       | boolean (`"true"`) | Marks a cell as explicitly excluded from property management and export.  |
| `prop_tags`            | Shapes & connectors | no       | string             | Comma-separated tag names (see section 14).                                 |

"Required" means the missing-properties popup is shown when the property is absent (section 6) and the shape is not exported without it (section 10.3).

Property changes are persisted to the DrawIO file immediately via DrawIO's model transaction mechanism (undoable).

---

## 4. Level Hierarchy

The `prop_level` property is constrained to the following values. The **stored value** (a slug) is what is written to the cell and exported; the **label** is what the UI shows.

| Rank | Stored value      | Label           | Valid parent level(s)          | Valid child level(s)        |
|------|-------------------|-----------------|--------------------------------|-----------------------------|
| 0    | `organization`    | Organization    | *(none — always root)*         | Software System             |
| 1    | `software-system` | Software System | Organization                   | Workflow, Tier, Node        |
| 2    | `workflow`        | Workflow        | Software System                | Service                     |
| 2    | `tier`            | Tier            | Software System                | Service                     |
| 3    | `service`         | Service         | Workflow, Tier                 | Node                        |
| 4    | `node`            | Node            | Service, Software System       | *(cannot contain children)* |

This table is the single source of truth for parent/child legality (metamodel §5.1, `HIER-002`). It is implemented as an explicit allowed-parent map, not as "one rank above".

- Workflow and Tier share rank 2: they are **alternatives at the same depth**, not parent and child. A Software System may contain Workflows, Tiers, or a mix of both; a Service may sit inside either; a Workflow never contains a Tier (or vice versa).
- A **Node directly inside a Software System** represents shared system infrastructure that does not belong to one Service (e.g. a shared topic, queue or KMS key). It skips the Workflow/Tier and Service levels.
- Organization shapes are at the top of the hierarchy, have no parent (`HIER-001`) and are never placed inside another container.
- Every other level must have exactly one parent (`HIER-001`). A shape without one is still exported but reported as an error (section 10.7).

In the Level dropdown (panel and popup) the levels appear in rank order, with Workflow and Tier grouped under a non-selectable **Workflow / Tier** heading.

Rank is still used for ordering (dropdown, export order) and for the metamodel's "same abstraction level" rule on flows (`FLOW-001`, section 10.7): two levels are at the same abstraction level when they have the same rank.

### 4.1 Legacy values

Plugin versions before 1.12 stored labels rather than slugs and had a single combined level. These are migrated as follows:

| Legacy value                 | Migrated to        |
|------------------------------|--------------------|
| `Organization`               | `organization`     |
| `Software System`            | `software-system`  |
| `Pipeline / Workflow / Tier` | `workflow`         |
| `Service`                    | `service`          |
| `Node`                       | `node`             |

- **Read time:** legacy values are always read as their migrated value, so every feature (hierarchy, sync, export, *Also in…*) behaves the same on pages that have not been migrated yet.
- **Write time:** the page on screen is rewritten when a file is opened and whenever another page is selected, in one undoable transaction per page. The file is marked as modified. A shape is also migrated individually when selected.
- Former *Pipeline / Workflow / Tier* shapes all become `workflow`; shapes that are really tiers must be switched to **Tier** by hand.
- Any other unrecognised value is removed when the shape is selected (unchanged from earlier versions).

### 4.2 Identity (`prop_id`)

Every exported element has an ID unique within the model (`ID-001`). Names are descriptive; IDs are the stable, machine-facing keys that `parent`, `from` and `to` refer to (`ID-003`), and that the implementation mapping (`docs/architecture-mapping-specification_1.md`) targets.

**Syntax.** Lowercase letters, digits, `-`, `_` and `.`; must start and end with a letter or digit; 1–100 characters. Regex: `^[a-z0-9]([a-z0-9._-]{0,98}[a-z0-9])?$`. Examples: `ingestion-lambda`, `trade.ingestion.lambda`.

**Suggestion.** When an ID is missing, the plugin suggests one by slugifying the Name: lowercase, accents removed, every run of characters outside `[a-z0-9]` replaced by a single `-`, leading/trailing `-` trimmed. If the slug is already used by an element that is not the same component (see below), `-2`, `-3`, … is appended. Example: `Ingestion Lambda` → `ingestion-lambda`.

**Stability (`ID-002`).** Once saved, an ID never changes automatically — renaming the shape does not touch it. The user may edit it in the panel (section 5.1); changing it does **not** rewrite references to the old ID in other shapes' `prop_parent` — the export then reports those references as unresolved (`REF-001`).

**Uniqueness and the same element on several pages.** The same element may be drawn on several pages (e.g. a context page and a detail page). All its shapes carry the **same** `prop_id`, and the export merges them into one element (section 10.4). Therefore:

| Situation | Treatment |
|---|---|
| Two shapes on the **same page** share an ID | Not allowed. The panel rejects the edit with an inline error; the export reports `ID-001`. |
| Shapes on **different pages** share an ID | Allowed: they are the same element. The panel shows a notice *"Same element as on: Page A, Page B"* (the *Also in…* section, 5.6). Their Name, Level, Technology, Provisioning and parent must agree; disagreements are reported by the export (section 10.7). |
| A connector ID equals another connector's ID | Same rule as shapes: allowed across pages (same flow), rejected on the same page. |
| A connector ID equals an element ID | Allowed — flows and elements are separate namespaces. |

Cross-page sync and pre-fill (section 17) copy `prop_id`, so copies of a component end up with one shared ID.

**Existing diagrams.** Shapes created before 1.12 have no `prop_id`. They are treated like any shape with a missing required property: selecting one opens the popup with a suggested ID. Until then they are left out of the export with a warning (section 10.3). *(Possible later addition, not in 1.12: a bulk "Assign missing IDs" action.)*

### 4.3 Parent resolution (`prop_parent`)

An element's parent (the `parent` exported for it) is resolved as follows:

1. **Container.** If the shape lies inside an eligible shape in the draw.io model hierarchy, the parent is the **nearest eligible ancestor** (non-eligible intermediates such as plain groups, unnamed or ignored shapes are skipped). Its `prop_id` is the parent ID.
2. **Explicit parent.** Otherwise, if the shape has `prop_parent`, that ID is the parent.
3. **None.** Otherwise the element has no parent (correct only for Organizations).

The explicit parent exists for pages that show a shape without its container — e.g. a page with only the Services of one Workflow. It is set with the **Parent** picker (section 5.1).

- A container always wins over `prop_parent`. When a shape is re-parented into a container (section 7), any `prop_parent` on it is removed in the same transaction.
- When the same element appears on several pages, each page contributes the parent resolved there. They must agree; pages where no parent resolves do not count as a disagreement (section 10.4).
- The parent's level must be legal for the child's level per section 4 (`HIER-002`), and parent links must not form a cycle (`HIER-004`). Both are checked at export (section 10.7).

### 4.4 Node properties

**Technology** (`prop_technology`) is a key of the Technology registry loaded from the architecture configuration file (section 19), e.g. `AWS_LAMBDA`. Each registry entry defines the technology's **kind** — one of `COMPUTE`, `STORAGE`, `MESSAGING`, `ORCHESTRATION`, `NETWORK`, `SECURITY`, `OBSERVABILITY` (metamodel §10) — and whether it is `executable`. The kind is derived from the registry; it is never stored on the shape (`NODE-001`, `NODE-002`).

**Provisioning** (`prop_provisioning`) is one of:

| Value | Meaning |
|---|---|
| `IAC` | Expected to be provisioned through Infrastructure as Code. |
| `EXTERNAL` | Supplied/owned outside the modelled implementation. |
| `RUNTIME` | Deliberately created dynamically at runtime. |

Both are optional. They apply only when Level is `node`; on other levels any stored value is kept but hidden and not exported.

**Values from earlier versions.** Technology and Provisioning were free text in pre-release 1.12 builds. Stored values are never rewritten automatically. A value that is not a registry key / not one of the three provisioning values is shown in the dropdown as an extra option marked *(unknown)* so it is not lost, and is reported by the export (`REF-003` for technology; section 10.7).

---

## 5. Properties Panel

### 5.1 Display

A persistent floating panel (`mxWindow`) is always visible when the plugin is loaded. The panel title is **Architect toolset** followed by the current version (e.g. `Architect toolset v1.11.0`) to allow users to confirm the deployed version.

The panel footer contains the version string on the left and a **Pause / Resume** toggle button on the right (see section 18).

**Shape fields** (shown when a shape is selected):

| Field       | Type         | Editable | Description                                                          |
|-------------|--------------|----------|----------------------------------------------------------------------|
| Parent      | Display or dropdown | See below | The resolved parent (section 4.3).                            |
| ID          | Text input   | Yes      | The shape's `prop_id` (section 4.2).                                 |
| Name        | Text input   | Yes      | The shape's `prop_name`.                                             |
| Level       | Dropdown     | Yes      | The shape's `prop_level`. Constrained to the values in section 4.   |
| Description | Textarea     | Yes      | The shape's `prop_description`. Optional.                            |
| Technology  | Dropdown (or text input) | Yes | The shape's `prop_technology`. Optional. Shown only when Level is `Node`. |
| Provisioning| Dropdown     | Yes      | The shape's `prop_provisioning`. Optional. Shown only when Level is `Node`. |

Technology and Provisioning appear or hide as soon as Level changes. Switching a shape away from `Node` hides the fields but keeps their stored values, which reappear if the shape becomes a `Node` again.

**Parent.**

| Situation | Field shows |
|---|---|
| Shape is inside an eligible container | Read-only `ParentName (ParentLevel)` — the container. |
| No container, Level is not Organization | A **dropdown**. First option `— no parent —`; then every element in the file (all pages, merged by ID) whose level is a legal parent for this shape's level (section 4), shown as `Name (Level) · id`, sorted by name. Selecting an option writes `prop_parent` (or removes it for `— no parent —`). A stored `prop_parent` that no longer resolves, or whose level is not legal, is shown as an extra selected option marked *(invalid)*. |
| Level is Organization | Read-only `— no parent —` in grey. |
| Level not set | Read-only `—`. |

The read-only states carry a tooltip explaining why the field cannot be edited (inside a container: move the shape to change its parent; Organization: no parent; no Level: set a Level first).

When Level changes, the picker's options are rebuilt; a stored `prop_parent` that is no longer legal for the new level is kept but shown as *(invalid)*.

**ID.**
- Saves on blur. The value is trimmed; invalid syntax or a clash with another shape on the same page (section 4.2) shows an inline red message under the field and the previous value is restored.
- An empty field is not saved (the ID is required); the previous value is restored.
- If the new ID is used by a shape on another page, the edit is saved and the *Also in…* section updates to show the pages (the shapes are now the same element).

**Technology.**
- When a registry is loaded (section 19): a dropdown with an empty option followed by every registry key, sorted, each shown as `KEY (KIND)`. The kind of the selected technology is also shown as grey text next to the field. An unknown stored value appears as an extra option marked *(unknown)*.
- When no registry is loaded: a free-text input, with a grey hint *"No technology registry loaded"*.

**Provisioning.** A dropdown: empty option, `IAC`, `EXTERNAL`, `RUNTIME`. An unknown stored value appears as an extra option marked *(unknown)*.

**Connector fields** (shown when a connector is selected, see section 5.7):

| Field       | Type         | Editable | Description                                          |
|-------------|--------------|----------|------------------------------------------------------|
| ID          | Text input   | Yes      | The connector's `prop_id`. Optional. Same syntax and same-page uniqueness rule as shapes; an empty field removes it. |
| Name        | Text input   | Yes      | The connector's `prop_name`. Optional display label; not exported. |
| Description | Textarea     | Yes      | The connector's `prop_description`. Optional.        |

Parent, Level, Technology and Provisioning are **not shown** for connectors. An **Ignore** button is shown for connectors (section 8), since the popup that used to offer it is no longer shown for connectors (section 6.1).

### 5.2 States

| Condition                              | Panel State                                                                          |
|----------------------------------------|--------------------------------------------------------------------------------------|
| Plugin paused (see section 18)         | All fields reset. Parent shows `—`. No dialogs triggered.                            |
| No shape selected                      | All fields reset. Parent shows `—`.                                                  |
| Multiple shapes selected               | All fields reset. Parent shows `—`.                                                  |
| Single shape selected (normal)         | Shape fields populated and editable. Adopt Children button visible if level has valid children. |
| Single shape selected (ignored)        | All fields reset. Parent shows `—`. Un-ignore button shown.                          |
| Single connector selected (normal)     | ID, Name and Description editable. Connects section shows source and target shapes. Ignore button shown. |
| Single connector selected (ignored)    | All fields reset. Un-ignore button shown.                                            |

### 5.3 Saving

- ID, Name and Description save on field blur (Technology too when it is a free-text input).
- Level saves immediately on dropdown change, then triggers automatic re-parenting (see section 7.2).
- Parent, Technology (dropdown) and Provisioning save immediately on dropdown change.
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

An **Also in...** section lists the names of other pages in the same file where a shape with the identical `prop_id` exists — i.e. the other pages where this same element is drawn (section 4.2). Name and Level are not used for matching.

Each page name is a clickable link. Clicking it:
1. Switches to that page (`ui.selectPage`), without adding the navigation to the undo history.
2. Selects the matching shape and centres the viewport on it (`graph.scrollCellToVisible`).
3. The panel immediately populates with the target shape's properties as a result of the selection change.

The section is only shown when:
- The selected shape has `prop_id` set.
- The file contains more than one page.
- At least one other page contains a matching shape.

The section is hidden in the empty and ignored states, and is not shown for single-page files.

### 5.7 Connector Properties

When a single connector is selected (and not ignored), the panel switches to connector mode:

- The **ID**, **Name** and **Description** fields are enabled and editable. Saving follows the same blur/change rules as shapes (section 5.3).
- The **Level** dropdown and **Parent** display are hidden.
- A **Connects** section replaces Connected Shapes, Also In, and the report button. It shows:

  `[source name] → [target name]`

  Each name is the connected shape's `prop_name`. If a connected shape has no `prop_name`, is marked as ignored, or the connector endpoint is unattached, the name is shown as **anonymous** in grey italic and is not clickable.

- Below the Connects line, a single grey warning line is shown when the connector would not be exported as a flow, with the reason: an endpoint is anonymous or has no ID, the endpoints are at different abstraction levels (`FLOW-001`), both ends are the same element (`FLOW-009`), or an end is an Organization (`FLOW-010`). These are the same checks as the export (section 10.7). When an end is outside the model (see section 10.5) the line states that, without the ⚠ marker, since it is not a problem.

- On a cross-level connector (`FLOW-001`), a checkbox **Lift to common level — one end is not known in detail** is shown below the Connects line. Ticking it sets `prop_flow_lift="true"` (undoable); unticking removes it. While ticked, the `FLOW-001` warning is replaced by a note that the connector is exported lifted (section 10.5.1). If the flag is set on a connector whose ends are at the same level, the checkbox stays visible with the note *"Has no effect: the ends are not at different levels."* so it can be cleared.

  Named endpoints are rendered as blue underlined links. Clicking a link:
  1. Selects the connected shape (triggering the panel to switch to that shape's properties).
  2. Centres the viewport on the shape (`graph.scrollCellToVisible`).

---

## 6. Missing Properties Popup

### 6.1 Trigger

The popup is shown automatically when a single non-ignored **shape** is selected and any of `prop_name`, `prop_level` or `prop_id` is absent.

Description, Technology and Provisioning are optional and never trigger the popup.

The popup is **never shown for connectors**: no connector property is required. Connectors are edited in the panel (section 5.7).

### 6.2 Behaviour — Shapes

- Name, ID, Level and Description fields are shown, in that order.
- Required fields (Name, ID, Level) that already have values are pre-filled and disabled; missing ones are editable.
- Description is editable when empty, and pre-filled and disabled when it already has a value.
- **ID** is pre-filled with a suggestion derived from the Name (section 4.2). While the user types the Name, the suggestion follows it, until the user edits the ID field directly; from then on it is left alone. The same syntax and same-page uniqueness rules as the panel apply; **Save** is disabled while the ID is invalid, with the reason shown under the field. If the ID matches an element on another page, a grey notice says *"Same element as on: Page A"*.
- The Level field is a dropdown constrained to the valid level values.
- Technology and Provisioning are shown when Level is (or is set to) `Node`, using the same controls as the panel (section 5.1). They are always editable and are saved only if Level is `Node` on Save. When pre-filling from another page (section 17.2), they are copied only if the source is a `Node` and the shape has no value yet.
- The Parent picker is **not** in the popup; it is set in the panel.
- Dialog title: **Shape Properties Required**.

### 6.3 Behaviour — Connectors

Removed in 1.12 — the popup is not shown for connectors (section 6.1).

### 6.4 Buttons

| Button     | Action                                                                                                  |
|------------|---------------------------------------------------------------------------------------------------------|
| **Save**   | Writes entered values to the cell. Dismisses popup. Panel populates with the new values.                |
| **Ignore** | Writes `properties_ignored: "true"` to the cell. Dismisses popup. Panel switches to ignored state.      |

---

## 7. Hierarchical Container Adoption

### 7.1 Bulk Adoption (Adopt Children button)

When triggered on a selected shape, the plugin:

1. Determines the valid child level(s) from the shape's own level (section 4) — for a Software System: Workflow, Tier and Node.
2. Scans all shapes in the diagram whose `prop_level` is one of the valid child levels and whose bounding box is **fully inside** the container's bounding box.
3. Keeps only the candidates for which this shape is the **innermost** valid parent (section 7.2, step 2). Example: a Node inside a Service inside a Software System is adopted by the Service, not by the Software System.
4. Raises an error if any remaining candidate is already parented to a different container at the same level (overlapping sibling containers — see section 7.3).
5. If no conflicts: promotes the container to `container=1;collapsible=0;` (if not already) and re-parents all candidates in a single undoable transaction. Each adopted shape's geometry is adjusted so its visual position on the canvas is unchanged, and any `prop_parent` on an adopted shape is removed (section 4.3).

Shapes with no level, the wrong level, or a partially-overlapping bounding box are silently ignored.

### 7.2 Automatic Re-parenting on Level Change

When the Level dropdown is changed on a selected shape, the plugin:

1. Saves the new level value.
2. Searches for shapes at a valid parent level (section 4 — for a Service, a Workflow or a Tier; for a Node, a Service or a Software System) whose bounds fully contain the selected shape. If several are found and they are **nested** (each one's bounds fully contain the next), the **innermost** one is chosen. Example: a Node inside a Service inside a Software System → the Service.
3. If a unique valid parent is found: promotes it to a container, re-parents the shape into it (preserving visual position) and removes any `prop_parent` from the shape.
4. If no valid parent is found: moves the shape to the diagram root. Any `prop_parent` is kept (it may still apply, section 4.3).
5. If several valid parents are found that are **not** nested (overlapping siblings): shows an error and leaves the shape in place.

Organization shapes (top of hierarchy) and shapes with no level are always placed at the diagram root.

### 7.3 Conflict Rules

| Situation                                                         | Outcome                                         |
|-------------------------------------------------------------------|-------------------------------------------------|
| Shape already parented to the correct container                   | Skipped (idempotent).                           |
| Shape at the right level but inside a nested container hierarchy  | Skipped (strict hierarchy rules apply).         |
| Shape already parented to a sibling container (overlapping bounds)| Error raised. User must fix the diagram layout. |
| Multiple valid parent containers found, nested                    | Innermost one is used (7.2 step 2).             |
| Multiple valid parent containers found, not nested                | Error raised. Shape left in place.              |
| Level changed; conflict with existing parent container            | Error raised. Shape left in place.              |

### 7.4 Container Promotion

A shape is promoted to a DrawIO container (`container=1;collapsible=0;` added to its style) automatically when it becomes the parent of another shape via bulk adoption or auto re-parenting. Promotion is non-destructive — existing style attributes are preserved.

---

## 8. Ignore / Un-ignore

The ignore mechanism applies to both shapes and connectors identically:

- A cell with `properties_ignored: "true"` will never trigger the missing properties popup and is never exported (section 10.3).
- Shapes are ignored from the popup's **Ignore** button. Connectors are ignored from the **Ignore** button in the panel (section 5.1), since the popup is not shown for them.
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

The export writes the **whole `.drawio` file** — all pages — as one architecture model conforming to the Architecture Metamodel V1 (`docs/architecture-metamodel.md` §19). Elements drawn on several pages are merged by ID.

### 10.1 Trigger

Three buttons are shown at the bottom of the Properties tab **only when nothing is selected** (empty state). They are hidden in all other states.

| Button | Action |
|---|---|
| **Export architecture YAML** | Builds and validates the model (10.3–10.7), shows the validation report if there are findings, then offers the YAML file for saving (10.2). |
| **Validate model** | Builds and validates the model and shows the validation report (10.7). Writes nothing. |
| **Generate model page** | Builds and validates the model and draws it as a hierarchy tree on the generated model page (10.9). |

### 10.2 Output file

A single YAML file. No PNG is written by the export (the Confluence push still renders one, section 11).

The file is offered as a **browser download** (a `Blob` link with a `download` attribute). Electron shows its native **save dialog** for it, where the user picks the folder and can change the name.

- Proposed name: `{diagramname}.yaml`, or `{diagramname}_{tagname}.yaml` when a tag highlight is active (the highlight only affects the name, not the content). `{diagramname}` and `{tagname}` are sanitised as before: lowercased, whitespace removed, non-alphanumeric characters (except `-`) stripped, truncated to 64 characters. Example: `My Architecture.drawio` → `myarchitecture.yaml`.
- Proposed folder: chosen by Electron (normally the user's Downloads folder). The plugin cannot preset it to the diagram's folder.
- The plugin is not told whether the user saved or cancelled, so the status line says *"Choose where to save {filename}."* rather than confirming the write.

**Why not `writeFile`.** DrawIO desktop's `writeFile` IPC action refuses any content that is not a recognised diagram / image / PDF / HTML / XML format (`checkFileContent` in `electron.js`), so it cannot write YAML at any path. It also only accepts paths the user picked through its own dialogs. The download route needs no desktop change and works on any DrawIO desktop build.

### 10.3 Eligibility — shapes

All pages of the file are scanned. A shape (vertex) becomes an element when:

- it is **not** ignored (`properties_ignored=true`), and
- it has `prop_name` and a valid `prop_level` (legacy values are read migrated), and
- it has a `prop_id` with valid syntax (section 4.2).

A shape with Name and Level but no `prop_id`, or with an `prop_id` of invalid syntax, is left out and reported (10.7). Shapes without Name or Level are not architecture elements and are skipped silently.

`prop_description`, `prop_technology` and `prop_provisioning` are optional.

### 10.4 Merging elements across pages

Eligible shapes are grouped by `prop_id`. Each group becomes **one** element. Pages are processed in tab order; within a page, in model order.

| Field | Rule across the shapes of one group |
|---|---|
| `name`, `type` | Must be identical. Otherwise an error is reported and the value from the first page is used. |
| `technology`, `provisioning` | Only considered when `type` is `node`. Shapes with no value do not count. The remaining values must be identical; otherwise error, first value used. |
| `description` | First non-empty value in page order. Different non-empty values are reported as a warning. |
| `parent` | Each shape contributes its parent resolved on its own page (section 4.3). Shapes with no resolved parent do not count. The remaining values must be identical; otherwise error, first value used. |

Two shapes with the same ID **on the same page** are a duplicate (`ID-001`): the first one is used, the others are ignored and reported.

### 10.5 Flows

**Eligibility.** A connector (edge) on any page becomes a flow candidate when:

- it is not ignored, and
- both its source and target terminals are eligible shapes (10.3) — the terminal shape itself, not an ancestor.

`from` and `to` are the `prop_id`s of the terminal shapes. A connector with an end **outside the model** — a loose end (not attached to a shape, or attached to another connector), an ignored shape, or a shape with no architecture property at all (none of `prop_id`, `prop_name`, `prop_level`, `prop_description`, `prop_parent`, `prop_technology`, `prop_provisioning`; `prop_tags` does not count) — is left out silently: it links the model to annotations, not two elements. A connector whose ends are both meant to be modelled but one cannot be exported (it has some architecture property but no ID, no Name/Level, or an invalid ID) is left out and reported as a warning (`PP-007`). Either way every exported `from`/`to` resolves to an element (`REF-002`).

**Merging.** Candidates are grouped by the ordered pair `(from, to)`; each group becomes one flow (`A → B` and `B → A` are different flows).

| Field | Rule across the connectors of one group |
|---|---|
| `id` | The connectors' `prop_id`s, ignoring empty ones. None → the flow has no `id` (allowed, metamodel §4.1). One distinct value → that value. Several distinct values → error ("duplicate flow between the same elements", metamodel §4.1), the first is used. |
| `description` | First non-empty value in page order. Different non-empty values → warning. |

The same flow `id` used for two different `(from, to)` pairs is an error; the second flow is exported without `id`.

**Validity.** A merged flow is excluded from the export, and reported as an error, when:

- its endpoints are at different abstraction levels — different rank in section 4; Workflow and Tier count as the same level (`FLOW-001`);
- `from` equals `to` — e.g. a connector between two shapes on different pages that carry the same ID (`FLOW-009`);
- either endpoint is an Organization (`FLOW-010`).

Connector `prop_name` is never exported.

#### 10.5.1 Lifted flows

A connector between elements at different levels usually means that one end is not known in detail yet, e.g. a Service of System X is known to talk to System Y, but not to which part of Y. Rather than inventing an element, the connector can be **lifted** (`prop_flow_lift="true"`, section 5.7). This is the metamodel's upward projection (metamodel §7.1) applied to the connector. The amendment accepted for this purpose adds the flow fields `declared` and `lifted_from` (10.6.3).

**Lifting.** Only connectors that would otherwise fail `FLOW-001` are lifted; the flag has no effect on any other connector. The deeper end is replaced by its parent (the merged `parent` of 10.4), repeatedly, until both ends are at the same rank. If the parent climb overshoots (e.g. a Node directly in a Software System towards a Service), the other end climbs in turn, so both always meet at the deepest common rank.

| Result | Effect |
|---|---|
| Both ends reach the same rank | The connector is added to the flow between the lifted ends, as an entry of its `lifted_from` list. Reported as advisory `PP-010`. |
| An element on the way has no exported parent (or is in a parent cycle) | Not exported, error `PP-011`. |
| Both ends lift to the same element (e.g. a Service towards its own System) | Not exported, error `FLOW-009`. |

**Merging.** A lifted flow merges with connectors drawn directly between the lifted ends: their `id` and `description` stay on the flow; the lifted connectors become `lifted_from` entries. A flow with no direct connector — one that exists only through lifting — is exported with `declared: false`. Lifted connectors with the same original `(from, to)` (e.g. on several pages) form one entry; its `id` and `description` follow the rules of 10.5, and entry IDs share the flow ID namespace (`PP-008`, `PP-009`).

**Superseded lifts.** A lift is only used where a connection is not already modelled at a single level. When a valid flow drawn directly (not lifted) links the entry's `from` (or an element below it) to the entry's `to` (or an element below it) — e.g. the entry `service-xa → system-y` and the flow `service-xa → service-y1` — the entry is left out and reported as advisory `PP-012`: the lower-level flow already projects onto the same pair. A lifted flow left without entries and without direct connectors is not exported.

Lifted flows count as flows for the Workflow rules (10.7).

### 10.6 YAML structure

The file is YAML 1.2, UTF-8. Strings that could be misread as another YAML type (numbers, booleans, dates, text with `:`/`#`/quotes, non-ASCII) are emitted double-quoted; multi-line descriptions are emitted as literal blocks (`|-`). Fields with no value are **omitted** (never written as `null`). An empty list is written as `[]`.

#### 10.6.1 Top-level document

The file starts with a comment header, then the document:

```yaml
# Architecture model exported from: My Architecture.drawio
# Generated: 2026-11-12
```

| Field | Type | Description |
|-------|------|-------------|
| `modelVersion` | integer | Always `1` (Architecture Metamodel V1, with the lifted-flow amendment of 10.5.1). |
| `technologyRegistry` | map | `name` and `version` of the loaded architecture configuration (section 19). Omitted when no configuration is loaded. |
| `elements` | list | The merged elements (10.4). |
| `flows` | list | The merged, valid flows (10.5). |

#### 10.6.2 Element

Fields are emitted in this order; absent ones are omitted.

| Field | Present | Description |
|-------|---------|-------------|
| `id` | always | `prop_id`. |
| `name` | always | `prop_name`. |
| `type` | always | `prop_level` slug (section 4), e.g. `software-system`. |
| `parent` | when resolved | The parent element's `id` (sections 4.3, 10.4). Omitted for Organizations, and when no parent resolves or the resolved ID does not exist (reported, 10.7). |
| `technology` | `node` only, when set | `prop_technology`. |
| `provisioning` | `node` only, when set | `prop_provisioning`. |
| `description` | when non-empty | `prop_description`. |

**Order.** Depth-first, so every parent precedes its children: root elements (no exported parent) sorted by level rank, then by name; after each element, its children sorted the same way. Elements caught in a parent cycle are emitted last, sorted by ID.

#### 10.6.3 Flow

| Field | Present | Description |
|-------|---------|-------------|
| `id` | when set | The flow ID (10.5). |
| `from` | always | `id` of the source element. |
| `to` | always | `id` of the target element. |
| `declared` | only when `false` | `false` when the flow exists only through lifted connectors (10.5.1). Omitted for flows drawn directly. |
| `description` | when non-empty | The flow description (10.5). |
| `lifted_from` | when lifted connectors exist | List of the original connections lifted onto this flow (10.5.1), each with `id` (when set), `from`, `to` and `description` (when non-empty) — the original, cross-level ends. Sorted by `from`, then `to`. |

Example:

```yaml
  - from: system-x
    to: system-y
    declared: false
    lifted_from:
      - id: xa-to-y
        from: service-xa
        to: system-y
        description: Orders
```

**Order.** By the rank of `from` (Software System flows first, Node flows last), then by `from`, then by `to`.

#### 10.6.4 Complete annotated example

```yaml
# Architecture model exported from: Trade.drawio
# Generated: 2026-11-12
modelVersion: 1
technologyRegistry:
  name: acme-aws
  version: "3"
elements:
  - id: global-trade
    name: Global Trade
    type: organization
  - id: trade-processing
    name: Trade Processing
    type: software-system
    parent: global-trade
    description: Processes incoming trade experiences.
  - id: experience-processing
    name: Experience Processing
    type: workflow
    parent: trade-processing
  - id: ingestion
    name: Ingestion
    type: service
    parent: experience-processing
  - id: ingestion-lambda
    name: Ingestion Lambda
    type: node
    parent: ingestion
    technology: AWS_LAMBDA
    provisioning: IAC
  - id: normalization
    name: Normalization
    type: service
    parent: experience-processing
    description: |-
      Normalizes incoming trade experiences.
      Canonical model v3.
  - id: published-topic
    name: Trade Experiences Topic
    type: node
    parent: trade-processing
    technology: AWS_SNS
    provisioning: IAC
flows:
  - id: ingestion-to-normalization
    from: ingestion
    to: normalization
    description: Ingested records are provided for normalization.
  - from: ingestion-lambda
    to: published-topic
```

`published-topic` is a Node parented directly by the Software System (shared infrastructure, section 4). The second flow has no `id` because its connector has no `prop_id`.

### 10.7 Validation

Building the model produces a list of **findings**. Each finding has a severity, a rule code (the metamodel's where one exists, otherwise a plugin code `PP-…`), a message, and the page(s) and shape(s) involved.

| Severity | Meaning |
|---|---|
| **Error** | The model is invalid or contradictory per the metamodel. |
| **Warning** | Something in the diagram was left out of the export, or could not be checked. |
| **Advisory** | Valid, but might deserve attention. |

| Code | Severity | Condition | Effect on output |
|---|---|---|---|
| `PP-001` | Warning | Shape has Name and Level but no `prop_id` | Shape not exported. |
| `PP-002` | Error | `prop_id` has invalid syntax (e.g. edited by hand via *Edit Data*) | Shape not exported. |
| `ID-001` | Error | Same element ID twice on one page | First used, others ignored. |
| `PP-003` | Error | Shapes of one element disagree on name, type, technology, provisioning or parent (10.4) | First page's value used. |
| `PP-004` | Warning | Shapes of one element have different descriptions | First used. |
| `REF-001` | Error | `prop_parent` refers to an ID that is not an exported element | `parent` omitted. |
| `HIER-001` | Error | A non-Organization element has no parent. The message names the legal parent levels (section 4), e.g. for a Node: *Place it inside a Service or a Software System, or pick one in its Parent field.* | Exported without `parent`. |
| `HIER-002` | Error | Parent's level is not a legal parent for the child's level (section 4). The message names the legal parent levels, e.g. *A Node belongs inside a Service or a Software System.* | Exported as is. |
| `HIER-004` | Error | Parent links form a cycle | Exported as is; ordered last. |
| `REF-003` | Error | Node technology is not a key of the registry | Exported as is. |
| `PP-005` | Warning | No technology registry loaded — technologies were not checked (reported once) | — |
| `PP-006` | Error | Provisioning is not `IAC`, `EXTERNAL` or `RUNTIME` | Exported as is. |
| `PP-007` | Warning | Connector end is on a shape with some architecture property that is not exported (no ID, no Name/Level, invalid ID). Loose ends and ends on ignored or property-less shapes are skipped silently (10.5) | Connector not exported. |
| `FLOW-001` | Error | Flow between different abstraction levels, connector not marked to be lifted | Flow not exported. |
| `FLOW-009` | Error | Flow from an element to itself, also when a lifted connector's ends lift to the same element | Flow not exported. |
| `FLOW-010` | Error | Flow to or from an Organization | Flow not exported. |
| `PP-008` | Error | Several different flow IDs on one `(from, to)` pair, or one flow ID on several pairs | See 10.5. |
| `PP-009` | Warning | Connectors of one flow (or one lifted entry) have different descriptions | First used. |
| `PP-010` | Advisory | A cross-level connector is exported lifted (10.5.1) | Added under `lifted_from` of the lifted flow. |
| `PP-011` | Error | A connector marked to be lifted cannot be lifted: an end is not an exported element, or has no parent to climb through | Connector not exported. |
| `PP-012` | Advisory | A lifted connector is already modelled by a flow drawn at a single level (10.5.1) | Entry left out. |
| `WF-001` | Error | Workflow contains no Service. The message names any Service drawn inside the Workflow's area on the same page (centre within its bounds) that resolves to another parent or none, with where that parent comes from, and links to it | — |
| `WF-003` | Error | In a multi-Service Workflow, a Service takes part in no internal flow (a Service flow whose other end is in the same Workflow). The message says how the Service's parent was found (nesting or Parent property, and on which page) and lists the Workflow's other Services | — |
| `WF-004` | Error | A multi-Service Workflow's internal Service flows, ignoring direction, do not connect all its Services | — |

The general rule: the export is **faithful** to the diagram. It only drops or changes content where the output would otherwise not be well-formed (unresolvable references, duplicate IDs, invalid flows); everything else is exported as drawn and reported.

**Not checked by the plugin** (left to an external validator working on the exported YAML): upward flow projection and the consistency rules between levels (`FLOW-002` … `FLOW-007`), ownership scope, and implementation mapping.

**Report dialog.** Findings are shown in a modal dialog, grouped by severity (errors first) with a count per group. Each row shows the code, the message and the page name. Clicking a row closes the dialog, switches to that page and selects the shape (or connector), as *Also in…* does (section 5.6).

| Opened from | Buttons |
|---|---|
| **Validate model** | **Close**. With no findings, the dialog shows *"No problems found."* |
| **Export architecture YAML** | **Cancel** and **Export** (labelled **Export anyway** when there are errors). With no findings the dialog is skipped and the save dialog opens directly. |

Validation never blocks the export (the metamodel tooling is report-only).

#### 10.7.1 Fixing missing IDs

When the report has `PP-001` findings, it gets an extra button, **Fix N missing IDs…**, left of the usual buttons, whether it was opened from Validate, Export or Push. It plans an ID for every non-ignored shape in the file that has a Name and a valid Level but no ID:

- Shapes are grouped by **Name + Level** (exact match).
- If complete shapes elsewhere in the file with that Name + Level all carry **one** ID, the group reuses it: they are the same element drawn again.
- If they carry **several** IDs, the group is not fixed. A notice in the preview lists the IDs, and those shapes must be given an ID by hand.
- Otherwise, the group gets a **new ID**: the slug of the name (section 4.2), made unique across the whole file with `-2`, `-3`, …
- Shapes of one group on different pages share the ID. A second shape of the group on the **same** page gets its own new ID, because one page cannot hold one ID twice (`ID-001`).

The planned IDs are shown in a preview, one row per shape with its page, Name, Level and ID, all checked by default. **Set IDs** writes the checked rows, with one undo step per page, then rebuilds the report it was opened from (Validate, Export or Push) from the fixed diagram. **Cancel** writes nothing. If a Push was in progress, it reports *"Push cancelled — nothing was uploaded."*

#### 10.7.2 Lifting cross-level connectors in bulk

When the file has connectors that fail `FLOW-001` (ends at different levels), are not marked to lift, and could be lifted, the report gets an extra button, **Lift N cross-level connectors…**, after **Fix N missing IDs…** (when shown) and left of the usual buttons, whether it was opened from Validate, Export or Push. N counts connectors, not flows: the same pair drawn on two pages counts twice.

For each such connector, the lift of section 10.5.1 is worked out against the merged model:

- **Liftable** — both ends reach the same rank at two different elements, and no flow drawn at a single level already covers the lifted pair. Listed in the preview, one row per connector with its page, its original pair and levels (`"service-xa" → "system-y" (Service → Software System)`) and the pair it would be exported as (`exported as "system-x" → "system-y"`), all checked by default.
- **Not liftable** — an end is not an exported element, an element on the way has no parent to lift through (would be `PP-011`), both ends lift to the same element (would be `FLOW-009`), or a single-level flow already covers it (would be `PP-012`; the connector can be removed instead). Listed as notices above the preview, not selectable.

Lifting every cross-level connector would hide connectors drawn between levels by mistake, so the preview is a selection: untick the connectors that should stay errors. **Lift** sets `prop_flow_lift="true"` on the checked connectors, with one undo step per page, then rebuilds the report it was opened from from the changed diagram. **Cancel** writes nothing; if a Push was in progress, it reports *"Push cancelled — nothing was uploaded."* Lifting a connector one at a time stays available in the panel (section 5.7).

### 10.8 Error conditions (disk export)

Messages are shown in the panel status line next to the button.

| Condition | Behaviour |
|-----------|-----------|
| No eligible shapes in the file | "No shapes with ID, Name and Level found in this file." Nothing else happens. |
| Report dialog cancelled | Nothing happens. |
| Download started | "Choose where to save {filename}." (Saving or cancelling in the save dialog is not reported back.) |

### 10.9 Generated model page

**Generate model page** (10.1) draws the merged model (10.3–10.7) as a top-down hierarchy tree on a page named **Architecture Model**. The page is output only:

- **Re-created on every run.** The first run adds the page at the end of the file; later runs find it, delete everything on it (all layers) and draw it again. Hand edits on the page are lost. Wiping and redrawing is one undo step (adding the page is a separate one). The page is shown afterwards.
- **Identification.** Every cell on the page carries `pp_model_view="1"`. A page with such a cell is the model page, whatever its name, so renaming it is fine.
- **Excluded from the model.** The model page is skipped wherever the plugin reads pages: export, validation, Confluence push, cross-page matching, sync and the missing-ID fix. Selecting one of its cells shows the empty panel state and never opens the missing-properties popup.

**Tree.** One box per exported element, linked to its parent by a plain connector. Children follow the export order. A parent whose children are all leaves gets them stacked in one indented column below it (org-chart style) to keep the tree narrow; otherwise children are laid out side by side, centred under the parent. Elements without a parent, with an unresolved parent (`REF-001`) or in a parent cycle (`HIER-004`) start trees of their own, placed to the right. Flows are not drawn.

**Box.** Name (bold), level and ID; for Nodes also technology · provisioning. Fill colour by level. When the element has findings (a finding whose shapes include one carrying the element's ID — flow findings are therefore not shown), the border is red for errors, orange for warnings or blue for advisories (the worst one counts), and a line gives the count of the worst severity. The tooltip holds the description, the pages the element is drawn on and the full finding messages. The box links to the first page the element is drawn on (`data:page/id,…`).

**Title** above the tree: file name, date, element count, error and warning counts, and a note that the page is generated.

| Condition | Behaviour |
|-----------|-----------|
| No eligible shapes in the file | "No shapes with ID, Name and Level found in this file." The page is not touched. |
| Page drawn | "Model page updated: N elements, E error(s), W warning(s)." |

---

## 11. Confluence Push

### 11.1 Overview

The Properties tab contains a **Confluence** section below the Export button. It lets the user push the architecture model YAML (the whole file, as in section 10) and a PNG of the current page directly to one or more Confluence pages as attachments, without writing any files to disk.

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

1. The model is built and validated exactly as for the disk export (sections 10.3–10.7). If there are findings, the report dialog is shown with **Cancel** and **Push** (labelled **Push anyway** when there are errors).
2. A PNG of the current page is rendered in-memory via `editor.exportToCanvas()` — complete page content, white background (`#ffffff`).
3. For each valid target page URL (in order):
   a. Upload `{diagramname}_{pagename}.png` with `contentType: image/png`.
   b. Upload `{diagramname}.yaml` (whole model) with `contentType: application/yaml`.
4. `onProgress` fires after each page completes (success or failure).
5. When all pages are done, the status area shows a per-page result line: `✓ {page title}` on success, `✗ {page title}: {reason}` on failure.

Names are sanitised as in section 10.2; an active tag highlight appends `_{tagname}` to both. YAML attachments named `{diagramname}_{pagename}.yaml` by earlier versions are left on the Confluence page untouched.

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
| Method | `PUT` (creates the attachment, or adds a new version when one with the same file name exists — since 1.11.1) |
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
| No eligible shapes in the file | Status: "No shapes with ID, Name and Level found in this file." |
| Validation report cancelled | Nothing is uploaded. |
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
| **Properties** | Shape mode: Parent, ID, Name, Level, Description, Technology, Provisioning, Adopt Children, Connected shapes, Also in... Connector mode: ID, Name, Description, Connects section, Ignore. Empty state: Export architecture YAML, Validate model, Sync cross-page shapes, Confluence. |
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
tab) and activates the ID, Name and Description fields for the connector. The Tags tab remains accessible
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

When the same component appears on multiple pages (e.g. "Auth Service" in both a system context diagram and a deployment diagram), users should not need to re-enter the same properties on every page — and all copies must carry the **same ID** so the export merges them into one element (section 4.2).

This section is about **finding** copies that do not share an ID yet. Once copies share an `prop_id` they are the same element by definition, and *Also in…* (section 5.6) links them.

Two shapes are considered **candidate copies of the same component** if both of the following match exactly:

- **Label text**: The visible shape label with HTML stripped and trimmed (case-sensitive).
- **Shape style type**: The `shape=X` token in the DrawIO style string. Plain shapes with no `shape=` token also match each other.

### 17.2 Missing Properties Dialog — Pre-fill from another page (Layer 1)

When the Missing Properties Dialog opens for a shape, the plugin scans all other pages for vertices matching by label + shape type.

If a matching shape with complete properties (ID, Name and Level all set — Description is optional) is found on another page:
- The missing fields are automatically pre-filled from that source, **including the ID** (instead of the suggestion derived from the Name), so the new shape joins the existing element. Description is pre-filled when the source has one.
- A blue banner above the fields reads **"Pre-filled from: [Page Name]"**.
- If multiple pages provide complete matches with different values, a dropdown replaces the page name so the user can select which source to apply. Changing the selection re-fills the fields.
- The user reviews the values and clicks **Save** as normal. No behaviour changes otherwise.

This is read-only from the other pages — no write occurs until Save is clicked.

### 17.3 "Sync to all matching pages" button (Layer 2)

When a shape is selected and has ID, Name and Level set, and at least one other page contains a shape with the same label + shape type whose synced properties differ, a **"Sync to all matching pages"** button appears at the bottom of the **Also in...** section. The section is shown for this button even when no other page shares the ID yet.

Clicking the button opens the Sync Preview Dialog (section 17.5).

### 17.4 "Sync cross-page shapes" button (Layer 3)

In the empty panel state (no shape selected), a **"Sync cross-page shapes"** button is shown below the Export button. It is only shown when the file contains more than one page.

Clicking it scans all pages, groups vertices by label + shape type, identifies a source for each group (the member with ID, Name and Level set), and builds a list of all proposed property writes.

This list is presented in the Sync Preview Dialog (section 17.5).

If no cross-page shape groups have a member with complete properties, an alert is shown: "No cross-page shapes with matching labels and complete properties were found."

### 17.5 Sync Preview Dialog

The Sync Preview Dialog shows:

- A scrollable list of proposed updates, one row per target shape.
- Each row shows: the target page name, the shape's label, and a brief description of what will change (e.g. "adds ID, Name, Level, Technology" or "updates Provisioning"). A change of ID is spelled out as "changes ID old-id → new-id", because it changes which element the target shape is.
- All rows are checked by default. The user may uncheck individual rows to exclude them.
- A **Select all** checkbox controls all rows at once.
- **Cancel** closes the dialog without changes.
- **Confirm** applies the checked writes, then closes the dialog.

Properties copied by both sync buttons: ID, Name, Level and Description, plus Technology and Provisioning when the source is a `Node`, plus the explicit parent (`prop_parent`) when the source has one **and** the target is not inside an eligible container (section 4.3). Only non-empty source values are copied; a sync never blanks a property on the target. Description, Technology, Provisioning and parent do not count towards a shape being a complete source.

If several group members are complete sources with different IDs, the group is skipped and listed at the top of the dialog as *"Not synced — conflicting IDs: …"*; the user resolves it by hand.

Writes are applied by temporarily switching to each target page and calling the model transaction API. Each write is undoable on that page's undo stack via Ctrl+Z. After all writes, the plugin restores the original page and re-selects the original cell.

### 17.6 Constraints

- Matching is exact on both label text and shape type. Case-sensitive.
- Connectors are not matched (the popup is no longer shown for connectors, section 6.1).
- Layer 2 and Layer 3 apply only to shapes (vertices), not connectors.
- Cross-page writes go into each target page's own undo history.

---

## 18. Plugin Pause / Resume

### 18.1 Overview

A **Pause / Resume** toggle button in the panel footer lets users temporarily suspend all selection-driven behaviour. When paused, shapes and connectors can be freely selected, moved, and rearranged without the plugin prompting for properties or populating the panel.

### 18.2 Toggle button

The button is always visible in the panel footer, right-aligned beside the version string.

| State | Button label | Button colour |
|-------|-------------|---------------|
| Active (default) | ⏸ Pause | Grey |
| Paused | ▶ Resume | Amber / orange |

Clicking the button toggles the state immediately.

### 18.3 Behaviour when paused

- The selection change handler returns immediately without evaluating properties, triggering dialogs, or updating the panel.
- The panel is reset to the empty state when the plugin is paused.
- All panel buttons (Export architecture YAML, Validate model, Sync cross-page shapes, Tags, Confluence) remain functional — they are independent of shape selection.

### 18.4 Persistence

The paused/active state is stored in `localStorage` under the key `drawio-pp-active` (`"true"` = active, `"false"` = paused). The default when the key is absent is active. The state persists across DrawIO restarts.

---

## 19. Architecture Configuration File (Technology Registry)

### 19.1 Purpose

The Technology registry (metamodel §11.1) lists the technologies a Node may use and their intrinsic characteristics. It is supplied as a configuration file installed **next to the plugin**, so every diagram opened on that machine uses the same registry. Coupling the registry to the plugin installation is deliberate: the registry is organisation-wide, not per diagram.

### 19.2 File and installation

- File name: `architecture-config.js` (any name works; this is the convention).
- Installed like a plugin: **Extras → Plugins → Add**, select the file, restart DrawIO. DrawIO copies it into its plugins folder (`~/.config/draw.io/plugins/` on Linux, `%APPDATA%\draw.io\plugins\` on Windows), next to `properties-plugin.js`.
- To change the registry, edit the copy in the plugins folder and restart DrawIO.
- The repository ships an example, `config/architecture-config.example.js`, and a copy in `dist/` for direct download.

It is a JavaScript file rather than YAML because DrawIO desktop can load scripts from its plugins folder but does not let a plugin read data files there (its `readFile` action only accepts diagram files, and the page's security policy blocks reading local files directly).

### 19.3 Format

The file assigns one object to `window.ArchitectureConfig`:

```js
window.ArchitectureConfig = {
  name: 'acme-aws',          // required: identifies the registry
  version: '3',              // required: string; bump on every change
  technologies: {            // required: map of technology key -> definition
    AWS_LAMBDA:               { kind: 'COMPUTE',       executable: true  },
    SPARK_JOB:                { kind: 'COMPUTE',       executable: true  },
    AWS_S3:                   { kind: 'STORAGE',       executable: false },
    AWS_SNS:                  { kind: 'MESSAGING',     executable: false },
    AWS_SQS:                  { kind: 'MESSAGING',     executable: false },
    AWS_KMS:                  { kind: 'SECURITY',      executable: false },
    AWS_CLOUDWATCH_LOG_GROUP: { kind: 'OBSERVABILITY', executable: false },
  },
};
```

| Field | Rules |
|---|---|
| `name` | Non-empty string. |
| `version` | Non-empty string (a number is accepted and converted). |
| `technologies` | Object. Each key must match `^[A-Z][A-Z0-9_]*$`. |
| `kind` | One of `COMPUTE`, `STORAGE`, `MESSAGING`, `ORCHESTRATION`, `NETWORK`, `SECURITY`, `OBSERVABILITY` (metamodel §10). |
| `executable` | Boolean. |

The example file contains the technologies used by `docs/architecture_1.yaml`, as above.

### 19.4 Loading

- The plugin reads `window.ArchitectureConfig` **lazily** — the first time the registry is needed (Technology field shown, validation, export) — so the load order of the two plugin files does not matter.
- The object is validated once. An entry that breaks the rules in 19.3 is dropped with a `console.warn` naming the key and the reason. If `name`, `version` or `technologies` is missing or invalid, the whole configuration is treated as **not loaded**, with a `console.warn`.
- The validated registry is cached for the session. Changes take effect after restarting DrawIO.

### 19.5 Effect

| | Registry loaded | Not loaded |
|---|---|---|
| Technology field (5.1) | Dropdown of keys with kind | Free-text input with hint |
| Validation (10.7) | `REF-003` checked | `PP-005` warning, once |
| Export header (10.6.1) | `technologyRegistry: {name, version}` | Omitted |

`executable` is not used by the plugin in 1.12; it is part of the registry for downstream tooling (metamodel §11.3).

---

## 16. Out of Scope

- Bulk editing across multiple shapes.
- Custom property field definitions (the property set in section 3 is fixed).
- DrawIO web application or VS Code extension support.
- Recursive bulk adoption (a shape adopted as a child does not automatically trigger adoption of its own children; the user must run Adopt Children on each container level in turn).
- HTML or PDF report output.
- PNG export to disk (removed in 1.12; the Confluence push still uploads a PNG of the current page).
- Element and flow `documentation[]` links (metamodel §13) — not modelled in 1.12.
- Flow `contract` (metamodel §14) — deferred by the metamodel.
- Flow projection and the consistency rules between levels (`FLOW-002` … `FLOW-007`), ownership scope, implementation mapping and compliance — left to external tooling working on the exported YAML.
- Bulk assignment of missing IDs.
- Importing a YAML model back into a diagram.
