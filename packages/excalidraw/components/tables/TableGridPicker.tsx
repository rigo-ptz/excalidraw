import React, { useCallback, useEffect, useRef, useState } from "react";

import { KEYS } from "@excalidraw/common";

import "./TableGridPicker.scss";

const INITIAL_GRID_SIZE = 8;
const MAX_GRID_SIZE = 50;

type TableGridPickerProps = {
  onSelect: (rows: number, cols: number) => void;
  onClose: () => void;
};

export const TableGridPicker: React.FC<TableGridPickerProps> = ({
  onSelect,
  onClose,
}) => {
  const [hoveredRow, setHoveredRow] = useState(-1);
  const [hoveredCol, setHoveredCol] = useState(-1);
  const [gridRows, setGridRows] = useState(INITIAL_GRID_SIZE);
  const [gridCols, setGridCols] = useState(INITIAL_GRID_SIZE);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === KEYS.ESCAPE) {
        event.stopImmediatePropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown, { capture: true });
    return () =>
      document.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [onClose]);

  const handleCellPointerEnter = useCallback((row: number, col: number) => {
    setHoveredRow(row);
    setHoveredCol(col);

    // Grid grows when near edge, shrinks back when hovering fewer cells
    const BUFFER = 2;
    const newRows = Math.min(
      Math.max(INITIAL_GRID_SIZE, row + 1 + BUFFER),
      MAX_GRID_SIZE,
    );
    const newCols = Math.min(
      Math.max(INITIAL_GRID_SIZE, col + 1 + BUFFER),
      MAX_GRID_SIZE,
    );
    setGridRows(newRows);
    setGridCols(newCols);
  }, []);

  const handleCellClick = useCallback(
    (row: number, col: number) => {
      onSelect(row + 1, col + 1);
    },
    [onSelect],
  );

  const handlePointerLeave = useCallback(() => {
    setHoveredRow(-1);
    setHoveredCol(-1);
  }, []);

  const label =
    hoveredRow >= 0 && hoveredCol >= 0
      ? `${hoveredRow + 1} \u00D7 ${hoveredCol + 1}`
      : "";

  return (
    <div
      className="TableGridPicker"
      ref={containerRef}
      onPointerLeave={handlePointerLeave}
    >
      <div
        className="TableGridPicker__grid"
        style={{
          gridTemplateColumns: `repeat(${gridCols}, 16px)`,
        }}
      >
        {Array.from({ length: gridRows }, (_, row) =>
          Array.from({ length: gridCols }, (_, col) => {
            const isHighlighted = row <= hoveredRow && col <= hoveredCol;
            return (
              <button
                key={`${row}-${col}`}
                className={`TableGridPicker__cell${
                  isHighlighted ? " TableGridPicker__cell--highlighted" : ""
                }`}
                onPointerEnter={() => handleCellPointerEnter(row, col)}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  handleCellClick(row, col);
                }}
              />
            );
          }),
        )}
      </div>
      <div className="TableGridPicker__label">{label}</div>
    </div>
  );
};
