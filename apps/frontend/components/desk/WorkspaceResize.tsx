"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max));

function Divider({
  label,
  axis,
  value,
  min,
  max,
  initial,
  reverse = false,
  onChange,
}: {
  label: string;
  axis: "horizontal" | "vertical";
  value: number;
  min: number;
  max: number;
  initial: number;
  reverse?: boolean;
  onChange: (value: number) => void;
}) {
  const drag = useRef<{
    position: number;
    value: number;
    pointer: number;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  const update = (next: number) => onChange(Math.round(clamp(next, min, max)));
  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation={axis}
      aria-valuemin={Math.round(min)}
      aria-valuemax={Math.round(max)}
      aria-valuenow={Math.round(value)}
      aria-valuetext={`${Math.round(value)} pixels`}
      title="Drag to resize. Double-click to reset. Arrow keys also resize."
      className="workspace-divider"
      data-dragging={dragging}
      onDoubleClick={() => update(initial)}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = {
          position: axis === "vertical" ? event.clientX : event.clientY,
          value,
          pointer: event.pointerId,
        };
        setDragging(true);
      }}
      onPointerMove={(event) => {
        if (!drag.current || drag.current.pointer !== event.pointerId) return;
        const position = axis === "vertical" ? event.clientX : event.clientY;
        update(
          drag.current.value +
            (position - drag.current.position) * (reverse ? -1 : 1),
        );
      }}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
        drag.current = null;
        setDragging(false);
      }}
      onPointerCancel={() => {
        drag.current = null;
        setDragging(false);
      }}
      onLostPointerCapture={() => {
        drag.current = null;
        setDragging(false);
      }}
      onKeyDown={(event) => {
        const keys =
          axis === "vertical"
            ? ["ArrowLeft", "ArrowRight"]
            : ["ArrowUp", "ArrowDown"];
        if (event.key === "Home") {
          event.preventDefault();
          update(min);
        } else if (event.key === "End") {
          event.preventDefault();
          update(max);
        } else if (keys.includes(event.key)) {
          event.preventDefault();
          update(
            value +
              (event.key === keys[0] ? -1 : 1) *
                (reverse ? -1 : 1) *
                (event.shiftKey ? 40 : 10),
          );
        }
      }}
    />
  );
}

export function useWorkspaceResize(mobile: boolean) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0),
    [availableHeight, setAvailableHeight] = useState(0);
  const [sizes, setSizes] = useState<{ left: number; right: number } | null>(
    null,
  );
  const [requestedHeight, setRequestedHeight] = useState<number | null>(null);
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const measure = () => {
      setWidth(grid.clientWidth);
      const footer = document.querySelector(".desk-layout > .site-footer");
      const top = grid.getBoundingClientRect().top + window.scrollY;
      setAvailableHeight(
        window.innerHeight -
          top -
          (footer?.getBoundingClientRect().height ?? 53),
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    for (const element of document.querySelectorAll(
      ".desk-header, .desk-main, .desk-layout > .site-footer",
    ))
      observer.observe(element);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  const defaultLeft = width && width < 1250 ? 260 : 300,
    defaultRight = width && width < 1250 ? 290 : 340;
  // Reserve room for both dividers and a usable chart. Resize never changes trade state.
  const sideBudget = Math.max(440, (width || 1100) - 16 - 320);
  let left = Math.max(200, sizes?.left ?? defaultLeft),
    right = Math.max(240, sizes?.right ?? defaultRight);
  if (left + right > sideBudget) {
    const excess = left + right - sideBudget,
      room = left - 200 + right - 240;
    left = 200 + (left - 200) * (1 - excess / (room || 1));
    right = sideBudget - left;
  }
  const totalHeight = Math.max(450, availableHeight || 875);
  const maxHeight = totalHeight - 120;
  const defaultHeight = clamp(totalHeight - 210, 320, maxHeight);
  const height = clamp(requestedHeight ?? defaultHeight, 320, maxHeight);
  const style = mobile
    ? {}
    : ({
        "--markets-width": `${left}px`,
        "--ticket-width": `${right}px`,
        "--workspace-height": `${height}px`,
        "--workspace-total-height": `${totalHeight}px`,
      } as CSSProperties);
  return {
    gridRef,
    style,
    leftDivider: mobile ? null : (
      <Divider
        label="Resize markets panel"
        axis="vertical"
        value={left}
        min={200}
        max={sideBudget - right}
        initial={defaultLeft}
        onChange={(value) => setSizes({ left: value, right })}
      />
    ),
    rightDivider: mobile ? null : (
      <Divider
        label="Resize trade ticket"
        axis="vertical"
        reverse
        value={right}
        min={240}
        max={sideBudget - left}
        initial={defaultRight}
        onChange={(value) => setSizes({ left, right: value })}
      />
    ),
    heightDivider: mobile ? null : (
      <Divider
        label="Resize trading and account panels"
        axis="horizontal"
        value={height}
        min={320}
        max={maxHeight}
        initial={defaultHeight}
        onChange={setRequestedHeight}
      />
    ),
  };
}
