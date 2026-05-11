# Changelog

All notable changes to the DrawIO Architecture Properties Plugin are documented here.

---

## [1.8] — 2026-05-11

### Changed
- **Architecture export replaces Markdown report** — the export button (now labelled **Export architecture JSON**) produces a `.json` file instead of a `.md` file. The PNG export is retained. Both files continue to use the `{diagramname}_{pagename}` naming convention.

### JSON output format

The exported JSON document has five top-level fields:

| Field | Description |
|-------|-------------|
| `page` | Page name as shown in the DrawIO tab. |
| `generated` | Export date in `YYYY-MM-DD` format. |
| `hierarchy` | Array of Organisation-rooted shape trees (see shape node below). |
| `uncategorised` | Eligible shapes not inside any Organisation, sorted by level depth. |
| `connectors` | Named, non-ignored connectors (see connector entry below). |

**Shape node** (used in both `hierarchy` and `uncategorised`, recursively):

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | `prop_name` of the shape. |
| `level` | string | `prop_level` of the shape. |
| `description` | string \| null | `prop_description`, or `null` if absent or blank. |
| `children` | array | Nested eligible model-children. Empty array if none. |

**Connector entry**:

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | `prop_name` of the connector. |
| `description` | string \| null | `prop_description`, or `null` if absent or blank. |
| `source` | endpoint | Shape at the originating end. |
| `target` | endpoint | Shape at the receiving end. |

**Endpoint** (`source` / `target`): `{ "name": string, "level": string }`. If the endpoint shape is missing, not a vertex, marked as ignored, or has no `prop_name`, both fields fall back to `"anonymous"` and `"undefined"` respectively. If the shape has a name but no level, `"level"` is `"undefined"`.

### Eligibility rules
- **Shapes**: must have `prop_name` and `prop_level` set, and not be ignored.
- **Connectors**: must have `prop_name` set and not be ignored.

---

## [1.7] — 2026-05-11

### Added
- **Connector properties** — connectors (edges) now support **Name** and **Description** fields, editable directly in the Properties tab.
- **Missing properties dialog for connectors** — selecting a connector with an incomplete Name or Description triggers the same modal dialog as shapes. The Level field is omitted (connectors have no level). Dialog title reads *Connector Properties Required*.
- **Ignore / Un-ignore for connectors** — connectors can be marked as ignored from the dialog, suppressing future prompts. The Un-ignore button appears in the panel when an ignored connector is selected.
- **Connects section** — when a connector is selected, the Properties tab shows a *Connects* section with the source and target shape names rendered as clickable links. Clicking a link selects that shape and centres the viewport on it. Shapes with no name or marked as ignored appear as *anonymous* (grey italic, not clickable).

### Changed
- Selecting a connector now activates the **Properties tab** (previously auto-switched to the Tags tab). The Tags tab remains accessible.
- Level and Parent fields are hidden when a connector is selected; they are restored when a shape or no cell is selected.

---

## [1.6] — 2026-05-04

### Added
- **Tags system** — shapes and connectors can carry an optional `prop_tags` property (comma-separated tag names), editable in a new **Tags** tab.
- **Tag highlight engine** — select any tag from a dropdown and click **Activate** to visually emphasise all cells with that tag and de-emphasise everything else. **Clear** restores original styles. Both operations are undoable.
- **Two-tab panel** — the Properties panel is reorganised into a **Properties** tab (all existing fields unchanged) and a **Tags** tab (tags field + highlight controls).

### Fixed
- Tags input on connectors was not becoming editable due to a partial `style.background` override being unreliable in Electron; replaced with full `cssText` swap.

### Changed
- Panel height increased from 480 px to 580 px so the Connected shapes and Also in… sections are visible without manual resizing.
- Plugin version moved from the `mxWindow` title bar to a pinned footer at the bottom of the panel; the content area now scrolls independently.
- Architecture report PNG export uses a white background instead of transparent.

---

## [1.5] — 2026-04-27

### Added
- **Architecture report** — when no shape is selected, a *Generate architecture report* button appears at the bottom of the panel. Clicking it exports the current page as a PNG and produces a Markdown document embedding the image and listing all eligible shapes in hierarchy order (Organisation → Node), with descriptions and connections. Both files are saved next to the `.drawio` file using a `{diagramname}_{pagename}` naming convention.
- An *Uncategorised* section in the report covers shapes with properties that are not contained within any Organisation.

---

## [1.4.2] — 2026-04-20

### Changed
- Panel title renamed from *Properties* to **Architect toolset**.

---

## [1.4.1] — 2026-04-20

Initial release. Core features:

- **Properties panel** — persistent floating panel always visible while the plugin is loaded; shows Parent (read-only), Name, Level, and Description for the selected shape.
- **Level hierarchy** — Level is constrained to Organisation → Software System → Pipeline / Workflow / Tier → Service → Node. A shape may only be contained by a shape exactly one level above it.
- **Adopt Children** — bulk re-parenting of shapes at the correct child level whose bounding boxes lie fully inside the container.
- **Auto re-parenting** — changing the Level dropdown automatically finds and assigns the correct parent container.
- **Missing properties dialog** — modal prompt when a shape is selected with incomplete Name, Level, or Description. Shapes can be marked as *Ignored* to suppress the prompt.
- **Connected shapes** — lists all shapes connected to the selected shape via a connector, with directional arrows, shape name/level, and connector label.
- **Also in…** — lists other pages in the file containing a shape with the same name and level; each entry is a clickable link that navigates to that page and centres the viewport on the shape.
