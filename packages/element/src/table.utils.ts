import type { ExcalidrawTableElement, TableCell } from "./types";

export type TableAxis = "vertical" | "horizontal";

export type TableSegment = readonly [start: number, end: number];

export const getTableOffsets = (sizes: readonly number[]): readonly number[] => {
  const offsets = new Array<number>(sizes.length + 1);
  offsets[0] = 0;

  let total = 0;
  for (let index = 0; index < sizes.length; index += 1) {
    total += sizes[index] ?? 0;
    offsets[index + 1] = total;
  }

  return offsets;
};

export const getTableWidth = (element: ExcalidrawTableElement) =>
  element.columns.reduce((sum, width) => sum + width, 0);

export const getTableHeight = (element: ExcalidrawTableElement) =>
  element.rows.reduce((sum, height) => sum + height, 0);

const getTableCell = (
  element: ExcalidrawTableElement,
  row: number,
  col: number,
): TableCell | null => {
  return element.cells[row]?.[col] ?? null;
};

export const getEffectiveTableCell = (
  element: ExcalidrawTableElement,
  row: number,
  col: number,
): { row: number; col: number; cell: TableCell } | null => {
  const cell = getTableCell(element, row, col);
  if (!cell) {
    return null;
  }

  if (!cell.merged || !cell.mergeOrigin) {
    return { row, col, cell };
  }

  const originRow = cell.mergeOrigin.row;
  const originCol = cell.mergeOrigin.col;
  const originCell = getTableCell(element, originRow, originCol);

  if (!originCell) {
    return null;
  }

  return {
    row: originRow,
    col: originCol,
    cell: originCell,
  };
};

export const getTableCellBoundsLocal = (
  element: ExcalidrawTableElement,
  row: number,
  col: number,
): {
  x: number;
  y: number;
  width: number;
  height: number;
  row: number;
  col: number;
  cell: TableCell;
} | null => {
  const effectiveCell = getEffectiveTableCell(element, row, col);
  if (!effectiveCell) {
    return null;
  }

  const columnOffsets = getTableOffsets(element.columns);
  const rowOffsets = getTableOffsets(element.rows);

  const { row: effectiveRow, col: effectiveCol, cell } = effectiveCell;
  const x = columnOffsets[effectiveCol] ?? 0;
  const y = rowOffsets[effectiveRow] ?? 0;
  const width =
    (columnOffsets[effectiveCol + cell.colspan] ?? columnOffsets.at(-1) ?? x) - x;
  const height =
    (rowOffsets[effectiveRow + cell.rowspan] ?? rowOffsets.at(-1) ?? y) - y;

  return {
    x,
    y,
    width,
    height,
    row: effectiveRow,
    col: effectiveCol,
    cell,
  };
};

const mergeSegments = (segments: readonly TableSegment[]): TableSegment[] => {
  if (segments.length <= 1) {
    return [...segments];
  }

  const sorted = [...segments].sort((left, right) => left[0] - right[0]);
  const merged: TableSegment[] = [];

  let currentStart = sorted[0][0];
  let currentEnd = sorted[0][1];

  for (let index = 1; index < sorted.length; index += 1) {
    const [start, end] = sorted[index];
    if (start <= currentEnd) {
      currentEnd = Math.max(currentEnd, end);
      continue;
    }

    merged.push([currentStart, currentEnd]);
    currentStart = start;
    currentEnd = end;
  }

  merged.push([currentStart, currentEnd]);
  return merged;
};

export const getTableBoundarySegments = (
  element: ExcalidrawTableElement,
  axis: TableAxis,
  boundaryIndex: number,
): readonly TableSegment[] => {
  const columnOffsets = getTableOffsets(element.columns);
  const rowOffsets = getTableOffsets(element.rows);
  const extent =
    axis === "vertical"
      ? (rowOffsets.at(-1) ?? 0)
      : (columnOffsets.at(-1) ?? 0);

  if (
    boundaryIndex <= 0 ||
    (axis === "vertical" && boundaryIndex >= element.columns.length) ||
    (axis === "horizontal" && boundaryIndex >= element.rows.length)
  ) {
    return [];
  }

  const gaps: TableSegment[] = [];

  for (let row = 0; row < element.rows.length; row += 1) {
    for (let col = 0; col < element.columns.length; col += 1) {
      const cell = getTableCell(element, row, col);
      if (!cell || cell.merged) {
        continue;
      }

      if (
        axis === "vertical" &&
        cell.colspan > 1 &&
        col < boundaryIndex &&
        col + cell.colspan > boundaryIndex
      ) {
        gaps.push([
          rowOffsets[row] ?? 0,
          rowOffsets[row + cell.rowspan] ?? rowOffsets.at(-1) ?? 0,
        ]);
      }

      if (
        axis === "horizontal" &&
        cell.rowspan > 1 &&
        row < boundaryIndex &&
        row + cell.rowspan > boundaryIndex
      ) {
        gaps.push([
          columnOffsets[col] ?? 0,
          columnOffsets[col + cell.colspan] ?? columnOffsets.at(-1) ?? 0,
        ]);
      }
    }
  }

  if (gaps.length === 0) {
    return [[0, extent]];
  }

  const mergedGaps = mergeSegments(gaps);
  const segments: TableSegment[] = [];

  let cursor = 0;
  for (const [start, end] of mergedGaps) {
    if (start > cursor) {
      segments.push([cursor, start]);
    }
    cursor = Math.max(cursor, end);
  }

  if (cursor < extent) {
    segments.push([cursor, extent]);
  }

  return segments;
};

