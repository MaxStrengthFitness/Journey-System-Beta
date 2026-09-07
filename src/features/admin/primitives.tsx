/**
 * Admin surface — shared primitives.
 *
 * The prep audit found the admin screens disagreeing on twelve separate
 * axes: five confirmation patterns, four list shapes, three ways of loading
 * data, two select implementations, and one screen out of twenty that
 * actually told a user their edit had committed. Every screen rebuilt in
 * this round composes the components below instead of inventing a
 * seventeenth card.
 *
 * House rules these encode, so a future screen does not have to re-derive
 * them:
 *
 *   1. ONE loud action per screen (`variant="hero"`). Everything else is
 *      primary, quiet, ghost or danger.
 *   2. Forms are CONTROLLED. There is no uncontrolled input here on
 *      purpose — an uncontrolled studio form is how every save in
 *      AdminStudioManager came to null out ownerId and headTrainerId.
 *   3. Edits commit through <SaveBar> (see useDirtyForm), never on blur and
 *      never silently.
 *   4. Anything destructive routes through <ConfirmDialog>. Not
 *      window.confirm, and not nothing.
 *   5. Colour comes from admin.tokens.css. No hex literals below this line.
 */

import React from "react";
import { AlertTriangle, Check, Info, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

// The kit carries its own styles rather than relying on a global import in
// main.tsx: the admin surface is lazy-loaded, so this keeps its CSS in the
// admin chunk instead of the first paint every trainer pays for.
import "./admin.css";

/* ==================================================================== *
 * Screen header
 * ==================================================================== */

export function AdminScreen({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("adm adm-screen", className)}>{children}</div>;
}

export function AdminHeader({
  icon,
  title,
  subtitle,
  actions,
}: {
  icon?: React.ReactNode;
  title: string;
  /** One line of plain English. What this screen is for, not what it is called. */
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="adm-head">
      <div className="adm-head__id">
        {icon && <div className="adm-head__icon">{icon}</div>}
        <div className="min-w-0">
          <h1 className="adm-head__title">{title}</h1>
          {subtitle && <p className="adm-head__sub">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="adm-head__actions">{actions}</div>}
    </header>
  );
}

/* ==================================================================== *
 * Panel
 * ==================================================================== */

export function AdminPanel({
  title,
  subtitle,
  icon,
  actions,
  flush,
  children,
  className,
  footer,
}: {
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  /** Body gets no padding — for a panel whose whole body is a row list. */
  flush?: boolean;
  children: React.ReactNode;
  className?: string;
  footer?: React.ReactNode;
}) {
  return (
    <section className={cn("adm-panel", className)}>
      {(title || actions) && (
        <div className="adm-panel__head">
          <div className="min-w-0">
            {title && (
              <h2 className="adm-panel__title">
                {icon}
                {title}
              </h2>
            )}
            {subtitle && <p className="adm-panel__sub">{subtitle}</p>}
          </div>
          {actions && <div className="adm-panel__actions">{actions}</div>}
        </div>
      )}
      <div className={cn("adm-panel__body", flush && "adm-panel__body--flush")}>
        {children}
      </div>
      {footer}
    </section>
  );
}

/** A run of rows that should read as one list. */
export function AdminRows({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("adm-rows", className)}>{children}</div>;
}

export function AdminRow({
  name,
  meta,
  leading,
  trailing,
  onClick,
  className,
}: {
  name: React.ReactNode;
  meta?: React.ReactNode;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const body = (
    <>
      {leading}
      <div className="adm-row__main">
        <div className="adm-row__name">{name}</div>
        {meta && <div className="adm-row__meta">{meta}</div>}
      </div>
      {trailing}
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn("adm-row adm-row--tappable", className)}
      >
        {body}
      </button>
    );
  }
  return <div className={cn("adm-row", className)}>{body}</div>;
}

/* ==================================================================== *
 * Fields — controlled only
 * ==================================================================== */

export function AdminGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("adm-grid", className)}>{children}</div>;
}

export function AdminField({
  label,
  required,
  hint,
  error,
  wide,
  htmlFor,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string | null;
  wide?: boolean;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("adm-field", wide && "adm-field--wide")}>
      <label className="adm-label" htmlFor={htmlFor}>
        {label}
        {required && (
          <span className="adm-label__req" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children}
      {error ? (
        <p className="adm-hint adm-hint--error">{error}</p>
      ) : hint ? (
        <p className="adm-hint">{hint}</p>
      ) : null}
    </div>
  );
}

export const AdminInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }
>(function AdminInput({ className, invalid, ...rest }, ref) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn("adm-input", className)}
      {...rest}
    />
  );
});

export const AdminTextarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(function AdminTextarea({ className, invalid, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn("adm-textarea", className)}
      {...rest}
    />
  );
});

export const AdminSelect = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }
>(function AdminSelect({ className, invalid, children, ...rest }, ref) {
  return (
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn("adm-select", className)}
      {...rest}
    >
      {children}
    </select>
  );
});

/**
 * A value the app displays but does not own — Mindbody wrote it. Rendering
 * these as disabled inputs was the old approach and read as "broken"; a
 * distinct blue read-only chip reads as "synced", which is what it means.
 */
export function AdminReadOnly({
  children,
  icon,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="adm-readonly">
      {icon}
      <span className="truncate">{children}</span>
    </div>
  );
}

/* ==================================================================== *
 * Buttons
 * ==================================================================== */

type ButtonVariant = "hero" | "primary" | "quiet" | "ghost" | "danger";

export const AdminButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: "sm" | "md";
    iconOnly?: boolean;
    busy?: boolean;
  }
>(function AdminButton(
  {
    variant = "quiet",
    size = "md",
    iconOnly,
    busy,
    className,
    children,
    disabled,
    type = "button",
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || busy}
      className={cn(
        "adm-btn",
        `adm-btn--${variant}`,
        size === "sm" && "adm-btn--sm",
        iconOnly && "adm-btn--icon",
        className,
      )}
      {...rest}
    >
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
      {children}
    </button>
  );
});

/* ==================================================================== *
 * Badges, tiles, notices, empty states
 * ==================================================================== */

export function AdminBadge({
  tone = "neutral",
  children,
  icon,
}: {
  tone?: "neutral" | "live" | "ok" | "warn" | "alert" | "hero";
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <span className={cn("adm-badge", `adm-badge--${tone}`)}>
      {icon}
      {children}
    </span>
  );
}

export function AdminTiles({ children }: { children: React.ReactNode }) {
  return <div className="adm-tiles">{children}</div>;
}

export function AdminStatTile({
  label,
  value,
  foot,
  tone,
  onClick,
  loading,
}: {
  label: string;
  value: React.ReactNode;
  foot?: React.ReactNode;
  tone?: "attention" | "alert";
  onClick?: () => void;
  loading?: boolean;
}) {
  const inner = (
    <>
      <span className="adm-tile__label">{label}</span>
      {loading ? (
        <span className="adm-skeleton" style={{ height: 28, width: "3.5ch" }} />
      ) : (
        <span
          className={cn("adm-tile__value", tone && `adm-tile__value--${tone}`)}
        >
          {value}
        </span>
      )}
      {foot && <span className="adm-tile__foot">{foot}</span>}
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="adm-tile adm-tile--tappable"
      >
        {inner}
      </button>
    );
  }
  return <div className="adm-tile">{inner}</div>;
}

export function AdminNotice({
  tone = "info",
  children,
}: {
  tone?: "info" | "warn" | "alert" | "ok";
  children: React.ReactNode;
}) {
  const Icon =
    tone === "ok" ? Check : tone === "info" ? Info : AlertTriangle;
  return (
    <div className={cn("adm-notice", `adm-notice--${tone}`)}>
      <Icon className="adm-notice__icon w-4 h-4" />
      <div>{children}</div>
    </div>
  );
}

export function AdminEmpty({
  title,
  children,
  action,
}: {
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="adm-empty">
      <div className="adm-empty__title">{title}</div>
      {children && <div className="adm-empty__body">{children}</div>}
      {action}
    </div>
  );
}

/* ==================================================================== *
 * Confirm dialog
 * ==================================================================== */

/**
 * The house answer to "are you sure". Escape and the scrim both cancel;
 * the confirming button is the only loud thing in the dialog, and a
 * destructive one is red. Nothing in the admin surface should call
 * window.confirm, and nothing destructive should skip this outright — the
 * audit found template delete, announcement archive, limbo dismiss and
 * roster removal all committing on a single tap.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="adm-scrim adm"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="adm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="adm-dialog__body">
          <h3 className="adm-dialog__title">{title}</h3>
          {body && <p className="adm-dialog__text">{body}</p>}
        </div>
        <div className="adm-dialog__foot">
          <AdminButton variant="ghost" onClick={onCancel} disabled={busy}>
            <X className="w-3.5 h-3.5" />
            {cancelLabel}
          </AdminButton>
          <AdminButton
            variant={destructive ? "danger" : "primary"}
            onClick={onConfirm}
            busy={busy}
          >
            {confirmLabel}
          </AdminButton>
        </div>
      </div>
    </div>
  );
}

/* ==================================================================== *
 * Save bar
 * ==================================================================== */

/**
 * Pairs with useDirtyForm. It exists because of one finding in the prep
 * audit: of twenty admin screens, exactly one told a user their edit had
 * committed. Everything else either wrote on change with no feedback at all,
 * or had a Save button that looked identical before and after it worked.
 *
 * So this bar is present only when there is something to save, names its own
 * state in words, and keeps the failure on screen rather than in a console.
 */
export function SaveBar({
  status,
  error,
  onSave,
  onDiscard,
  saveLabel = "Save changes",
  /** Rendered on the left when the form is clean — usually a hint or nothing. */
  idle,
}: {
  status: "clean" | "dirty" | "saving" | "saved" | "error";
  error?: string | null;
  onSave: () => void;
  onDiscard: () => void;
  saveLabel?: string;
  idle?: React.ReactNode;
}) {
  if (status === "clean") {
    return idle ? (
      <div className="adm-savebar">
        <span className="adm-savebar__status adm-savebar__status--dirty">
          {idle}
        </span>
      </div>
    ) : null;
  }

  const message =
    status === "saving"
      ? "Saving…"
      : status === "saved"
        ? "Saved"
        : status === "error"
          ? error || "Could not save"
          : "Unsaved changes";

  return (
    <div className="adm-savebar">
      <span
        className={cn("adm-savebar__status", `adm-savebar__status--${status}`)}
        role={status === "error" ? "alert" : "status"}
      >
        {status === "saving" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        {status === "saved" && <Check className="w-3.5 h-3.5" />}
        {status === "error" && <AlertTriangle className="w-3.5 h-3.5" />}
        <span className="truncate">{message}</span>
      </span>

      {status !== "saved" && (
        <span className="adm-savebar__actions">
          <AdminButton
            variant="ghost"
            size="sm"
            onClick={onDiscard}
            disabled={status === "saving"}
          >
            Discard
          </AdminButton>
          <AdminButton
            variant="primary"
            size="sm"
            onClick={onSave}
            busy={status === "saving"}
          >
            {status === "error" ? "Try again" : saveLabel}
          </AdminButton>
        </span>
      )}
    </div>
  );
}
