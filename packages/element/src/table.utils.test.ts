import { describe, expect, it } from "vitest";

import { ShapeCache } from "./shape";
import { newTableElement } from "./newElement";
import {
  getTableBoundarySegments,
  getTableCellBoundsLocal,
} from "./table.utils";

describe("tableUtils", () => {
  it("returns full boundary segments for an unmerged table", () => {
    const table = newTableElement({
      type: "table",
      x: 0,
      y: 0,
      rows: 2,
      cols: 2,
    });

    expect(getTableBoundarySegments(table, "vertical", 1)).toEqual([[0, 80]]);
    expect(getTableBoundarySegments(table, "horizontal", 1)).toEqual([
      [0, 240],
    ]);
  });

  it("skips merged spans in boundary segments and bounds", () => {
    const table = newTableElement({
      type: "table",
      x: 0,
      y: 0,
      rows: 2,
      cols: 2,
    });

    const mergedTable = {
      ...table,
      cells: [
        [
          {
            ...table.cells[0][0],
            colspan: 2,
          },
          {
            ...table.cells[0][1],
            merged: true,
            mergeOrigin: { row: 0, col: 0 },
          },
        ],
        [...table.cells[1]],
      ],
    } as const;

    expect(getTableBoundarySegments(mergedTable, "vertical", 1)).toEqual([
      [40, 80],
    ]);
    expect(getTableCellBoundsLocal(mergedTable, 0, 1)).toMatchObject({
      x: 0,
      y: 0,
      width: 240,
      height: 40,
      row: 0,
      col: 0,
    });
  });

  it("generates rough shapes for table borders and grid lines", () => {
    const table = newTableElement({
      type: "table",
      x: 0,
      y: 0,
      rows: 2,
      cols: 2,
    });

    const shapes = ShapeCache.generateElementShape(table, null);

    expect(Array.isArray(shapes)).toBe(true);
    expect(shapes).toHaveLength(3);
  });
});

