"use client";
import { Popover } from "@base-ui/react/popover";
import type { ReactNode } from "react";

export function InfoPopover({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger
        className="info-trigger"
        aria-label={`About ${label}`}
        openOnHover
        delay={150}
        closeDelay={150}
      >
        <span aria-hidden="true">i</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          className="info-positioner"
          side="top"
          sideOffset={8}
          collisionPadding={12}
        >
          <Popover.Popup className="info-popup">
            <Popover.Title className="info-title">{label}</Popover.Title>
            <Popover.Description className="info-description">
              {children}
            </Popover.Description>
            <Popover.Close
              className="info-close"
              aria-label={`Close ${label} explanation`}
            >
              Close
            </Popover.Close>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
