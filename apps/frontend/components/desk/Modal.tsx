"use client";
import { useEffect, useRef, type ReactNode } from "react";
export function Modal({
  title,
  onClose,
  locked = false,
  className = "",
  children,
}: {
  title: string;
  onClose: () => void;
  locked?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.showModal();
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      className={`desk-dialog ${className}`}
      ref={ref}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        if (!locked) close.current();
      }}
    >
      <div className="dialog-top">
        <h2>{title}</h2>
        <button
          type="button"
          aria-label="Close dialog"
          disabled={locked}
          onClick={onClose}
        >
          Close
        </button>
      </div>
      {children}
    </dialog>
  );
}
