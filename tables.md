# Tables Feature — Implementation Plan

## Resolved Design Decisions

| # | Question | Decision |
|---|----------|----------|
| 1 | Grid line style | **roughjs** — hand-drawn, consistent with Excalidraw brand |
| 2 | Table rotation | **No** — skip `angle` support for tables |
| 3 | Merge cells | **v1** — include colspan/rowspan in initial release |
| 4 | Cell content | **Text-only in v1**, but data model supports generic content (extensible for images later) |
| 5 | Arrow binding | **Table bounding box only** — no per-cell binding |
| 6 | Copy/paste cells | **Yes** — tab-separated text to clipboard |
| 7 | Keyboard navigation | **Yes** — Tab/Shift+Tab/Enter/Arrow keys |
| 8 | Size picker UI | **Visual grid-picker** popup (hover NxM grid) |

---

## Data Model

```ts
/** Extensible cell content — text now, images/embeds later */
type TableCellContent = {
  type: "text";
  text: string;
  fontSize?: number;
  fontFamily?: FontFamilyValues;
  textAlign?: TextAlign;
  bold?: boolean;
  italic?: boolean;
};

type TableCell = {
  /** Cell content (extensible discriminated union) */
  content: TableCellContent;
  /** Per-cell background override (null = transparent/inherit) */
  backgroundColor: string | null;
  /** Number of columns this cell spans (≥1, default 1) */
  colspan: number;
  /** Number of rows this cell spans (≥1, default 1) */
  rowspan: number;
  /** True if this cell is "shadowed" by a merged cell's span (not rendered directly) */
  merged: boolean;
  /** For merged cells: id of the origin cell (top-left of the merge group) */
  mergeOrigin: { row: number; col: number } | null;
};

type ExcalidrawTableElement = _ExcalidrawElementBase & Readonly<{
  type: "table";
  /** Column widths in px (length = number of columns) */
  columns: readonly number[];
  /** Row heights in px (length = number of rows) */
  rows: readonly number[];
  /** 2D cell grid, row-major: cells[rowIndex][colIndex] */
  cells: readonly (readonly TableCell[])[];
}>;
```

**Why monolithic**: Single element to move/copy/delete/serialize. Clean undo/redo (one mutation per change). No orphan elements. The `TableEditor` sub-element editor pattern follows `LinearElementEditor` precedent.

**Why `TableCellContent` union**: Adding image support later means adding `{ type: "image"; fileId: FileId }` to the union — no structural migration needed.

**Merge model**: A merged region is defined by the top-left "origin" cell having `colspan > 1` and/or `rowspan > 1`. All other cells in the spanned region have `merged: true` and `mergeOrigin` pointing back to the origin. Rendering skips `merged` cells; the origin cell renders across the full spanned area. Unmerging resets all affected cells to `colspan: 1, rowspan: 1, merged: false, mergeOrigin: null`.

---

## Implementation Phases

### Phase 1 — Core element: types, factory, toolbar, creation, rendering

**Goal**: Place a table on canvas from toolbar, see it rendered with roughjs grid lines.

#### 1.1 Type system ✅
| File | Change |
|------|--------|
| `packages/element/src/types.ts` | Add `TableCellContent`, `TableCell`, `ExcalidrawTableElement`; add to `ExcalidrawElement` union and `ExcalidrawRectanguloidElement` |
| `packages/excalidraw/types.ts` | Add `"table"` to `ToolType` union (line ~142) |
| `packages/element/src/typeChecks.ts` | Add `isTableElement()`; add `case "table"` to `isExcalidrawElement()` (uses `assertNever` — compile error if missing); update `isBindableElement()`, `isRectanguloidElement()` |
| `packages/element/src/comparisons.ts` | Add `"table"` to `hasBackground()`, `hasStrokeColor()`, `hasStrokeWidth()`, `hasStrokeStyle()`; no change needed for `canChangeRoundness()`, `toolIsArrow()`, `canHaveArrowheads()` |

#### 1.2 Element factory ✅
| File | Change |
|------|--------|
| `packages/element/src/newElement.ts` | Add `newTableElement({ rows, cols, x, y, width, height })` |

- Computes equal `columns` widths (`width / cols`) and `rows` heights (`height / rows`)
- Initializes `cells` grid: each cell `{ content: { type: "text", text: "" }, backgroundColor: null, colspan: 1, rowspan: 1, merged: false, mergeOrigin: null }`
- Default cell size: **120×40px** (so a 3×4 table is 360×160)

#### 1.3 Toolbar & grid-picker ✅
| File | Change |
|------|--------|
| `packages/excalidraw/components/icons.tsx` | Add `TableIcon` SVG |
| `packages/excalidraw/components/shapes.tsx` | Add table entry to `SHAPES` (after image, before eraser); each entry now requires `{ icon, value, key, numericKey, fillable, toolbar }` — set `toolbar: true` |
| `packages/excalidraw/components/TableGridPicker.tsx` | **New** — visual NxM grid picker popup |
| `packages/excalidraw/components/TableGridPicker.scss` | **New** — styles |

**Grid picker behavior**:
- Opens when table tool is clicked in toolbar
- 8×8 grid of small squares; hovering highlights top-left region
- Tooltip shows "N × M" at cursor
- Dragging beyond 8×8 expands the grid dynamically (max 50×50)
- Click confirms → stores config in `appState.pendingTableConfig: { rows, cols }`
- Cursor changes to crosshair; next click on canvas places the table

#### 1.4 Creation flow ✅
| File | Change |
|------|--------|
| `packages/excalidraw/components/App.tsx` | Add `createTableElementOnPointerDown()`; wire into `handleCanvasPointerDown` dispatch (around line 7630 — the `else if` chain that checks `activeTool.type`); add `else if (this.state.activeTool.type === "table")` branch before the generic fallthrough |
| `packages/excalidraw/types.ts` | Add `pendingTableConfig: { rows: number; cols: number } | null` to `AppState` interface |

- **Click-to-place**: single click → table at click point with default cell sizes
- **Drag-to-size**: pointer-down → pointer-move → pointer-up defines bounding box; cell sizes = bbox / rows×cols
- After placement, switch tool back to selection

#### 1.5 Shape generation & rendering
| File | Change |
|------|--------|
| `packages/element/src/shape.ts` | Add `case "table"` in `generateRoughOptions()` switch (line ~228); add `case "table"` in `_generateElementShape()` switch (line ~783): generate roughjs outer rect + inner grid lines as an array of `Drawable` |
| `packages/element/src/renderElement.ts` | Add `case "table"` in `drawElementOnCanvas()` switch (line ~393): draw cell backgrounds (native fill), then roughjs shapes; add `case "table"` in `renderElement()` switch (line ~881) |

**Rendering order per table**:
1. For each cell with `backgroundColor && !merged`: fill native rect at cell bounds
2. Draw roughjs outer border rectangle
3. Draw roughjs vertical lines at each column boundary
4. Draw roughjs horizontal lines at each row boundary
5. For merged cells: skip internal grid lines that fall within the merged region
6. For each non-merged cell with text: render text centered/aligned within cell bounds (reuse `wrapText()` + `measureText()`)

#### 1.6 Bounds & hit testing
| File | Change |
|------|--------|
| `packages/element/src/bounds.ts` | Table bounds: `[x, y, x + sum(columns), y + sum(rows)]` |
| `packages/element/src/collision.ts` | Point-in-table = point-in-bounding-rect |

Add utility in `packages/element/src/table.utils.ts` (**new file**):
```ts
/** Returns { row, col } for the cell at a given point, or null */
getTableCellAtPoint(element: ExcalidrawTableElement, point: GlobalPoint): { row: number; col: number } | null

/** Returns pixel bounds [x, y, w, h] of a cell, accounting for merges */
getTableCellBounds(element: ExcalidrawTableElement, row: number, col: number): [number, number, number, number]

/** Returns the effective (non-merged) cell for a position — follows mergeOrigin */
getEffectiveCell(element: ExcalidrawTableElement, row: number, col: number): { row: number; col: number }
```

#### 1.7 Basic resize
| File | Change |
|------|--------|
| `packages/element/src/resizeElements.ts` | Whole-table resize: scale all column widths and row heights proportionally |

#### 1.8 Serialization & restore
| File | Change |
|------|--------|
| `packages/excalidraw/data/restore.ts` | Add `case "table"` in `restoreElement()` switch (~line 524) — must restore `columns`, `rows`, `cells` with defaults; the switch has no `default` (unknown types return `null` and are silently filtered) |

---

### Phase 2 — Cell editing, selection & merge

**Goal**: Click cells, edit text, select cell ranges, merge/unmerge.

#### 2.1 TableEditor
| File | Change |
|------|--------|
| `packages/element/src/tableEditor.ts` | **New** — `TableEditor` class |
| `packages/excalidraw/types.ts` | Add `tableEditor: TableEditor \| null` to `AppState` |

`TableEditor` state:
```ts
{
  elementId: string;
  selectedCells: { startRow: number; startCol: number; endRow: number; endCol: number } | null;
  editingCell: { row: number; col: number } | null;
}
```

Methods:
- `handlePointerDown(point, event)` → set `selectedCells` to clicked cell
- `handlePointerMove(point, event)` → if dragging, extend `selectedCells` range
- `handleDoubleClick(point)` → set `editingCell`, open inline text editor
- `handleKeyDown(event)` → Tab/Enter/Arrow navigation, Delete to clear
- `getSelectedCellRange()` → normalized `{ startRow, startCol, endRow, endCol }`
- `isEntireRowSelected(row)` / `isEntireColumnSelected(col)`

#### 2.2 Cell text editing
- Double-click cell → overlay `<textarea>` positioned at cell screen bounds (reuse approach from `textWysiwyg.tsx`)
- Commit on blur / Escape / Tab / Enter (configurable: Enter can mean newline-in-cell or next-row)
- Delete key on selected cells (not editing) → clear text content

#### 2.3 Cell range selection rendering
| File | Change |
|------|--------|
| `packages/excalidraw/renderer/interactiveScene.ts` | Render blue highlight overlay on selected cells |

- Single cell: thin blue border
- Range: filled semi-transparent blue over all cells in range

#### 2.4 Keyboard navigation
| Key | Behavior |
|-----|----------|
| `Tab` | Move to next cell (left→right, wrap to next row) |
| `Shift+Tab` | Move to previous cell |
| `Enter` | Move to cell below (when not editing); confirm edit (when editing) |
| `Arrow keys` | Move selection (when not editing) |
| `Delete` / `Backspace` | Clear selected cell content |
| `Escape` | Exit cell editing → exit cell selection → deselect table |
| Any printable key | Start editing current cell (replace content) |

#### 2.5 Merge cells
| File | Change |
|------|--------|
| `packages/element/src/table.utils.ts` | `mergeCells()`, `unmergeCells()` |
| `packages/excalidraw/actions/actionTable.ts` | `actionTableMergeCells`, `actionTableUnmergeCells` |

**`mergeCells(element, startRow, startCol, endRow, endCol)`**:
1. Validate: selection is rectangular, no partially-overlapping existing merges
2. Set origin cell: `colspan = endCol - startCol + 1`, `rowspan = endRow - startRow + 1`
3. All other cells in range: `merged = true`, `mergeOrigin = { row: startRow, col: startCol }`, content cleared
4. Origin cell keeps/concatenates content from merged cells

**`unmergeCells(element, row, col)`**:
1. Find origin cell at (row, col) with `colspan > 1` or `rowspan > 1`
2. Reset all cells in spanned range: `merged = false`, `mergeOrigin = null`, `colspan = 1`, `rowspan = 1`
3. Origin cell keeps content; restored cells get empty content

**Merge constraints**:
- Cannot merge if selection contains cells that are partially inside an existing merge
- Merge available in context menu when ≥2 cells selected
- Unmerge available when a merged cell is selected

---

### Phase 3 — Row/column manipulation & interactive overlays

**Goal**: Add/remove/reorder rows and columns via hover UI.

#### 3.1 Hover overlay buttons
| File | Change |
|------|--------|
| `packages/excalidraw/renderer/interactiveScene.ts` | Render overlay buttons when table is hovered |
| `packages/excalidraw/components/App.tsx` | Hit-test overlay buttons on pointer events |

**Button positions** (rendered as small circles with icons):
- **Bottom "+" button**: centered at bottom edge of table → appends row
- **Right "+" button**: centered at right edge of table → appends column
- **Left side** (on hover over left edge, per-row):
  - "+" icon between rows → insert row at that position
  - "⋮" (3-dot) icon at row center → open row context menu / drag to reorder
- **Top side** (on hover over top edge, per-column):
  - "+" icon between columns → insert column at that position
  - "⋮" icon at column center → open column context menu / drag to reorder

Buttons appear when pointer is within ~20px of the respective edge. The "+" button near pointer becomes highlighted (blue, like image_4→image_5 transition).

#### 3.2 Add/insert row and column
| File | Change |
|------|--------|
| `packages/element/src/table.utils.ts` | `addTableRow()`, `addTableColumn()`, `insertTableRow()`, `insertTableColumn()` |

- `addTableRow(element)`: append to `rows` array (height = last row height), append empty cells row to `cells`
- `addTableColumn(element)`: append to `columns` array (width = last col width), append empty cell to each row
- `insertTableRow(element, atIndex)` / `insertTableColumn(element, atIndex)`: splice at position
- When inserting into a merged region: extend the relevant merge's rowspan/colspan

#### 3.3 Delete row/column
| File | Change |
|------|--------|
| `packages/element/src/table.utils.ts` | `deleteTableRow()`, `deleteTableColumn()` |

- Guard: cannot delete if it would leave 0 rows or 0 columns
- When deleting through a merged region: shrink the merge's rowspan/colspan; if it reduces to 1 → unmerge
- Update all `mergeOrigin` references that point to shifted indices

#### 3.4 Reorder rows/columns by drag
- Pointer down on "⋮" handle → enter drag mode
- Render ghost row/column following pointer + drop indicator line
- On drop: reorder `rows`/`columns`/`cells` arrays; update `mergeOrigin` references
- Cancel on Escape

#### 3.5 Column/row resize handles
- Hover over internal grid line → cursor changes to `col-resize` or `row-resize`
- Drag → update `columns[i]` or `rows[j]`; minimum size 30×24px
- Hold Alt while dragging → resize only that column/row (table grows); default → adjacent absorbs delta

#### 3.6 Context menu / actions
| File | Change |
|------|--------|
| `packages/excalidraw/actions/actionTable.ts` | **New** — all table actions |

Actions and when they appear:

| Action | Condition |
|--------|-----------|
| Add row below | Always (table or cells selected) |
| Add column right | Always |
| Cell background | Always |
| Merge cells | ≥2 cells selected, valid rectangular selection |
| Unmerge cells | Merged cell selected |
| Text bold/italic/align | Always |
| Font family / size | Always |
| Delete row | Entire row selected |
| Delete column | Entire column selected |
| Delete table | Table selected (not in cell mode) |

Surface these in:
- **Context menu** (right-click on table/cells)
- **Properties panel** (existing left sidebar, extending current shape properties pattern)
- **3-dot popup** (from row/column "⋮" handle)

---

### Phase 4 — Polish & edge cases

#### 4.1 Copy/paste
- `Ctrl+C` on selected cells → tab-separated text to clipboard
- `Ctrl+V` tab-separated text → fill cells from selection anchor
- Copy entire table → standard element duplication

#### 4.2 Undo/redo
- Every table mutation bumps `version`/`versionNonce` → existing `Store` delta system handles it
- Batch related operations (e.g., merge = one undo step)

#### 4.3 Export
- **SVG**: render as `<g>` containing `<rect>` (cells/backgrounds) + `<line>` (grid) + `<text>` (content)
- **PNG**: works via canvas rendering (no extra work if Phase 1 rendering is correct)
- **JSON**: `columns`, `rows`, `cells` serialize as plain arrays/objects

#### 4.4 Collaboration
- Table syncs as single element via existing reconciliation
- Last-write-wins on conflicts (same as all other elements)

#### 4.5 Edge cases to handle
- Very long text in cell: wrap with ellipsis or scroll (decision: wrap, grow row height to fit)
- Empty table (all cells empty): still renders grid
- Pasting more data than selection fits: expand selection rightward/downward, but don't add rows/cols automatically
- Deleting a row/column that contains part of a merge: shrink merge or block deletion with warning

---

## File Change Map

| File | Type | Changes |
|------|------|---------|
| `packages/element/src/types.ts` | Modify | `TableCellContent`, `TableCell`, `ExcalidrawTableElement`, update unions |
| `packages/element/src/typeChecks.ts` | Modify | `isTableElement()`, update guards |
| `packages/element/src/newElement.ts` | Modify | `newTableElement()` factory |
| `packages/element/src/table.utils.ts` | **New** | Cell lookup, merge/unmerge, add/delete/reorder row/col |
| `packages/element/src/tableEditor.ts` | **New** | Sub-element editor for cell interaction |
| `packages/element/src/shape.ts` | Modify | roughjs shape generation for table grid |
| `packages/element/src/renderElement.ts` | Modify | Canvas rendering: backgrounds, grid lines, text |
| `packages/element/src/bounds.ts` | Modify | Bounds calculation |
| `packages/element/src/resizeElements.ts` | Modify | Proportional + per-col/row resize |
| `packages/element/src/comparisons.ts` | Modify | `hasBackground()` etc. |
| `packages/excalidraw/types.ts` | Modify | `"table"` in `ToolType`, `pendingTableConfig` + `tableEditor` in `AppState` |
| `packages/excalidraw/components/shapes.tsx` | Modify | Table in `SHAPES` array |
| `packages/excalidraw/components/icons.tsx` | Modify | `TableIcon` SVG |
| `packages/excalidraw/components/App.tsx` | Modify | Creation flow, pointer handlers, table editor wiring |
| `packages/excalidraw/components/TableGridPicker.tsx` | **New** | Visual NxM grid picker popup |
| `packages/excalidraw/components/TableGridPicker.scss` | **New** | Grid picker styles |
| `packages/excalidraw/actions/actionTable.ts` | **New** | All table-specific actions |
| `packages/excalidraw/renderer/interactiveScene.ts` | Modify | Cell selection overlay, hover +/⋮ buttons |
| `packages/excalidraw/renderer/staticScene.ts` | Modify | Static table rendering |
| `packages/excalidraw/data/restore.ts` | Modify | Table element restore/migration |

---

## Non-goals for v1

- Nested tables
- Formulas / computed cells
- Table rotation (`angle`)
- Images in cells (data model supports it; UI deferred)
- Per-cell arrow binding
- Auto-sizing columns to content

