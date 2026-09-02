/**
 * Shared field primitives for the client dossier.
 *
 * THE PROVENANCE RULE
 * -------------------
 * The single most useful thing a coach can know about any value on this screen
 * is whether they may change it and whether their change will survive the next
 * Mindbody sync. So provenance is carried by the control itself:
 *
 *   Looks like an input  ->  a coach owns it, type in it.
 *   Carries a source tab ->  something else owns it, and the tab says what.
 *
 * Editable coach fields get NO badge. Badging the majority of fields would be
 * noise; badging only the exceptions makes the exceptions readable. This is the
 * same idea as the Journal's dashed edge — "this app is not the system of
 * record here" — expressed in the vocabulary of a form.
 */
import React from "react";
import { ExternalLink, Lock } from "lucide-react";
import { cn } from "../../lib/utils";
import { SOURCE_META, type FieldSource } from "../../types/journal";

/* ------------------------------------------------------------------ */
/* Labels & shells                                                     */
/* ------------------------------------------------------------------ */

export function FieldLabel({
  children,
  source,
}: {
  children: React.ReactNode;
  source?: FieldSource;
}) {
  const meta = source && source !== "coach" ? SOURCE_META[source] : null;
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
        {children}
      </span>
      {meta && (
        <span
          title={meta.hint}
          className={cn(
            "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider",
            meta.chip,
          )}
        >
          {source === "mindbody" ? (
            <ExternalLink className="h-2.5 w-2.5" />
          ) : (
            <Lock className="h-2.5 w-2.5" />
          )}
          {meta.label}
        </span>
      )}
    </div>
  );
}

const inputBase =
  "h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm font-medium text-slate-900 outline-none transition-colors " +
  "placeholder:text-slate-400 focus:border-[#38BDF8] focus:bg-white " +
  "dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-[#38BDF8] dark:focus:bg-slate-800";

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <FieldLabel>{label}</FieldLabel>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={inputBase}
      />
      {hint && <p className="text-[10.5px] leading-tight text-slate-400">{hint}</p>}
    </div>
  );
}

export function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  rows = 4,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <FieldLabel>{label}</FieldLabel>
      <textarea
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          inputBase,
          "h-auto resize-y py-3 leading-relaxed",
        )}
      />
      {hint && <p className="text-[10.5px] leading-tight text-slate-400">{hint}</p>}
    </div>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder = "Not set",
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  placeholder?: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <FieldLabel>{label}</FieldLabel>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(inputBase, "cursor-pointer")}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      {hint && <p className="text-[10.5px] leading-tight text-slate-400">{hint}</p>}
    </div>
  );
}

/**
 * A value this app does not own. Rendered flat and unmistakably not-an-input,
 * with a coloured tab on the left naming the system that does own it.
 */
export function ReadOnlyField({
  label,
  value,
  source = "mindbody",
  hint,
}: {
  /** React 19 types require key to be declared on the props type. */
  key?: React.Key;
  label: string;
  value: React.ReactNode;
  source?: FieldSource;
  hint?: string;
}) {
  const meta = SOURCE_META[source];
  const empty =
    value === null ||
    value === undefined ||
    value === "" ||
    value === "—";

  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <FieldLabel source={source}>{label}</FieldLabel>
      <div
        className={cn(
          "relative flex min-h-11 items-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100/70 px-3.5 py-2.5 pl-4",
          "dark:border-slate-800 dark:bg-slate-950/40",
        )}
      >
        <span
          aria-hidden
          className={cn("absolute left-0 top-0 h-full w-[3px]", meta.bar)}
        />
        <span
          className={cn(
            "text-sm font-semibold",
            empty
              ? "italic text-slate-400 dark:text-slate-500"
              : "text-slate-800 dark:text-slate-100",
          )}
        >
          {empty ? "Not synced" : value}
        </span>
      </div>
      {hint && <p className="text-[10.5px] leading-tight text-slate-400">{hint}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Section shell                                                       */
/* ------------------------------------------------------------------ */

export function DossierSectionShell({
  id,
  title,
  blurb,
  icon,
  noteCount,
  children,
}: {
  id: string;
  title: string;
  blurb: string;
  icon?: React.ReactNode;
  noteCount?: number;
  children: React.ReactNode;
}) {
  return (
    <section
      id={`dossier-${id}`}
      data-dossier-section={id}
      // Enough headroom that a jump-link lands the heading below the sticky
      // snapshot bar rather than behind it.
      className="scroll-mt-6 border-t border-slate-200 pt-7 first:border-t-0 first:pt-0 dark:border-slate-800"
    >
      <header className="mb-5 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          {icon && (
            <span className="mt-0.5 shrink-0 text-[#38BDF8] opacity-80">{icon}</span>
          )}
          <div className="min-w-0">
            <h3 className="text-xl font-black uppercase italic tracking-tight text-slate-900 dark:text-white">
              {title}
            </h3>
            <p className="text-[12px] text-slate-500 dark:text-slate-400">{blurb}</p>
          </div>
        </div>
        {!!noteCount && (
          <span className="shrink-0 rounded-lg border border-violet-500/25 bg-violet-500/10 px-2 py-1 text-[9.5px] font-black uppercase tracking-wider text-violet-600 dark:text-violet-300">
            {noteCount} from journal
          </span>
        )}
      </header>
      <div className="flex flex-col gap-6">{children}</div>
    </section>
  );
}

/** A titled group of fields inside a section. */
export function FieldGroup({
  title,
  children,
  cols = 2,
}: {
  title?: string;
  children: React.ReactNode;
  cols?: 1 | 2 | 3;
}) {
  return (
    <div className="flex flex-col gap-3">
      {title && (
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
          {title}
        </span>
      )}
      <div
        className={cn(
          "grid gap-4",
          cols === 1 && "grid-cols-1",
          cols === 2 && "grid-cols-1 sm:grid-cols-2",
          cols === 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
        )}
      >
        {children}
      </div>
    </div>
  );
}
