import { Box } from "@mui/material";
import { styled } from "@mui/material/styles";
import React, { useCallback, useRef, useState } from "react";

/**
 * Which of the two panes carries an explicit pixel width; the other one takes
 * whatever is left of the row. Named after the prop of the same name on
 * `react-split-pane`, which this component replaces.
 */
export type PrimaryPane = "first" | "second";

/** How far one arrow key press moves the divider, in pixels. */
export const KEYBOARD_STEP = 8;

/**
 * Keeps a pane width inside its bounds. A non-finite width means the stored
 * value was unusable (an empty or hand-edited `localStorage` entry parses to
 * `NaN`), so it falls back to the smallest allowed one rather than passing the
 * `NaN` on to a `width` style.
 */
export function clampPaneSize(
  size: number,
  minSize: number,
  maxSize: number,
): number {
  if (!Number.isFinite(size)) {
    return minSize;
  }
  return Math.min(Math.max(size, minSize), maxSize);
}

/**
 * Width of the sized pane while the divider is being dragged, measured against
 * where the drag started rather than against the previous pointer event: past
 * a bound the pane sticks there, and it starts following the pointer again at
 * exactly the position it stuck at.
 */
export function draggedPaneSize({
  startSize,
  startPosition,
  position,
  primary,
  minSize,
  maxSize,
}: {
  startSize: number;
  startPosition: number;
  position: number;
  primary: PrimaryPane;
  minSize: number;
  maxSize: number;
}): number {
  const delta = position - startPosition;
  // Moving the divider right grows the first pane and shrinks the second.
  const size = primary === "first" ? startSize + delta : startSize - delta;
  return clampPaneSize(size, minSize, maxSize);
}

/**
 * Width the sized pane takes for a key pressed on the divider, or null for a
 * key this component does not handle. The arrow keys move the divider the way
 * they point; Home and End are about the pane rather than the direction, and
 * give it its smallest and largest allowed size, which is also what the
 * separator reports as its minimum and maximum.
 */
export function keyedPaneSize(
  key: string,
  size: number,
  {
    primary,
    minSize,
    maxSize,
  }: { primary: PrimaryPane; minSize: number; maxSize: number },
): number | null {
  const rightwards = primary === "first" ? 1 : -1;
  switch (key) {
    case "ArrowRight":
      return clampPaneSize(size + KEYBOARD_STEP * rightwards, minSize, maxSize);
    case "ArrowLeft":
      return clampPaneSize(size - KEYBOARD_STEP * rightwards, minSize, maxSize);
    case "Home":
      return minSize;
    case "End":
      return maxSize;
    default:
      return null;
  }
}

const Root = styled(Box)({
  display: "flex",
  flexDirection: "row",
  width: "100%",
  height: "100%",
  overflow: "hidden",
});

const FlexiblePane = styled(Box)({
  flex: 1,
  minWidth: 0,
  position: "relative",
  overflow: "auto",
});

const SizedPane = styled(Box)({
  flex: "none",
  position: "relative",
});

const hiddenStyle = { display: "none" } as const;

// The divider lays out as a single pixel - a 11px box whose 5px transparent
// borders are pulled back by the negative margin - so that the line itself is
// hairline while the area that answers a pointer reaches into both panes.
const ResizeHandle = styled("span")(({ theme }) => ({
  "flex": "none",
  "boxSizing": "border-box",
  "width": "11px",
  "margin": "0 -5px",
  "zIndex": 1,
  "cursor": "col-resize",
  "userSelect": "none",
  // Without this the browser claims the touch gesture for scrolling and the
  // pointer events never arrive.
  "touchAction": "none",
  "backgroundColor": theme.palette.divider,
  "backgroundClip": "padding-box",
  "borderLeft": "5px solid transparent",
  "borderRight": "5px solid transparent",
  "transition": theme.transitions.create("border-color"),
  "&:hover": {
    borderColor: theme.palette.divider,
  },
  "&:focus-visible": {
    borderColor: theme.palette.primary.main,
  },
  "@media print": {
    display: "none",
  },
}));

export interface SplitPaneProps {
  /** Which pane keeps the pixel width. */
  primary: PrimaryPane;
  /**
   * Width the sized pane starts at. Read once, when the component mounts:
   * later changes do not move a pane the user is looking at.
   */
  defaultSize: number;
  minSize: number;
  maxSize: number;
  /** Hides the sized pane and the divider, leaving the other pane the row. */
  sizedPaneHidden?: boolean;
  /** Called with the new width once a drag or a key press settles it. */
  onResizeEnd?: (size: number) => void;
  /**
   * Accessible name for the divider. Required rather than optional: the
   * divider is focusable, so leaving it out would put a separator with no
   * name in the tab order.
   */
  label: string;
  children: [React.ReactNode, React.ReactNode];
}

/**
 * Two panes side by side with a draggable divider between them. One pane keeps
 * a pixel width the user sets, the other takes the rest of the row.
 */
export default function SplitPane({
  primary,
  defaultSize,
  minSize,
  maxSize,
  sizedPaneHidden = false,
  onResizeEnd,
  label,
  children,
}: SplitPaneProps) {
  const [size, setSize] = useState(() =>
    clampPaneSize(defaultSize, minSize, maxSize),
  );
  // The handlers read the width back while a gesture is in flight, which state
  // alone cannot give them: the value they close over is one render old.
  const sizeRef = useRef(size);
  // Pointer capture is granted per pointer, so a drag has to name the one it
  // belongs to: a second finger landing on the divider would otherwise reanchor
  // the gesture, and either pointer could then end it.
  const dragRef = useRef<{
    pointerId: number;
    startSize: number;
    startPosition: number;
  } | null>(null);

  const applySize = useCallback((next: number) => {
    sizeRef.current = next;
    setSize(next);
  }, []);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLSpanElement>) => {
      if (event.button !== 0 || dragRef.current) {
        return;
      }
      // Keeps the gesture from starting a text selection in either pane.
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = {
        pointerId: event.pointerId,
        startSize: sizeRef.current,
        startPosition: event.clientX,
      };
    },
    [],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLSpanElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) {
        return;
      }
      applySize(
        draggedPaneSize({
          startSize: drag.startSize,
          startPosition: drag.startPosition,
          position: event.clientX,
          primary,
          minSize,
          maxSize,
        }),
      );
    },
    [applySize, primary, minSize, maxSize],
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent<HTMLSpanElement>) => {
      if (dragRef.current?.pointerId !== event.pointerId) {
        return;
      }
      dragRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      onResizeEnd?.(sizeRef.current);
    },
    [onResizeEnd],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLSpanElement>) => {
      const next = keyedPaneSize(event.key, sizeRef.current, {
        primary,
        minSize,
        maxSize,
      });
      if (next === null) {
        return;
      }
      event.preventDefault();
      applySize(next);
      onResizeEnd?.(next);
    },
    [applySize, onResizeEnd, primary, minSize, maxSize],
  );

  const sizedPane = (
    <SizedPane style={sizedPaneHidden ? hiddenStyle : { width: `${size}px` }}>
      {primary === "first" ? children[0] : children[1]}
    </SizedPane>
  );
  const flexiblePane = (
    <FlexiblePane>
      {primary === "first" ? children[1] : children[0]}
    </FlexiblePane>
  );

  return (
    <Root>
      {primary === "first" ? sizedPane : flexiblePane}
      <ResizeHandle
        role={"separator"}
        aria-label={label}
        aria-orientation={"vertical"}
        aria-valuenow={Math.round(size)}
        aria-valuemin={minSize}
        aria-valuemax={maxSize}
        tabIndex={sizedPaneHidden ? -1 : 0}
        style={sizedPaneHidden ? hiddenStyle : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      ></ResizeHandle>
      {primary === "first" ? flexiblePane : sizedPane}
    </Root>
  );
}
