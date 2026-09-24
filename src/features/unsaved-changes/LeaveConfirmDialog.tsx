/**
 * The question: "You have unsaved changes to {label}. Leave without saving?"
 *
 * An in-app dialog, never the browser's confirm(). Two buttons, both 48px
 * tall and half the width, so the iPad held in one hand can hit either
 * without looking twice.
 *
 *   - "Keep editing" is the DEFAULT: it has the focus, it is the filled
 *     button, and Escape and a tap on the scrim both mean it. Losing work
 *     must never be what happens by accident.
 *   - "Leave" throws the typing away and carries on to wherever the trainer
 *     was going.
 *
 * Rendered straight into <body> AFTER whatever it sits over. That order is
 * what makes it work over an open drawer: Base UI's modal dialogs ignore a
 * press on an element injected after they opened, so a tap on "Keep editing"
 * is not read as a tap outside the Edit Routine drawer.
 */
import { useEffect, useId, useRef, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

export function LeaveConfirmDialog({
  question,
  onStay,
  onLeave,
}: {
  question: string;
  onStay: () => void;
  onLeave: () => void;
}) {
  const stayRef = useRef<HTMLButtonElement>(null);
  const leaveRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();

  // Focus the safe answer, and hand focus back to wherever the trainer was
  // typing if they keep editing.
  useEffect(() => {
    const previous =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    stayRef.current?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      // Stopped here so the drawer underneath does not also read it as its
      // own Escape.
      event.preventDefault();
      event.stopPropagation();
      onStay();
      return;
    }
    if (event.key === "Tab") {
      // Two buttons; Tab moves between them and never out of the dialog.
      event.preventDefault();
      const next =
        document.activeElement === stayRef.current ? leaveRef.current : stayRef.current;
      next?.focus();
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      data-testid="leave-confirm"
      onKeyDown={onKeyDown}
      onClick={(event) => {
        if (event.target === event.currentTarget) onStay();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-2xl"
      >
        <h2 id={titleId} className="text-lg font-bold text-foreground">
          Unsaved changes
        </h2>
        <p id={bodyId} className="mt-2 text-base leading-relaxed text-foreground">
          {question}
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            ref={leaveRef}
            type="button"
            data-action="leave"
            onClick={onLeave}
            className="min-h-12 rounded-xl border border-border bg-background px-4 text-sm font-bold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Leave
          </button>
          <button
            ref={stayRef}
            type="button"
            data-action="keep-editing"
            onClick={onStay}
            className="min-h-12 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Keep editing
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
