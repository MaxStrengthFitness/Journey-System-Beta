import React from "react";
import { Plus, X } from "lucide-react";
import { AdminButton, AdminInput, AdminSelect, AdminTextarea } from "../../primitives";
import "../../admin.css";

/**
 * THE CODEX FORMAT'S CONTROLS (v2, Sep 28 2026).
 *
 * The format adds lists of small records — stop rules, watch-outs, faults,
 * abnormal procedures, phrasebook lines — and one control draws them all
 * from a short description of each record's fields. Same rules as the
 * editor's own controls (controls.tsx): nothing interactive under 40px,
 * controlled inputs only, and a read mode that is plain prose.
 */

export type RecordFieldKind = "input" | "textarea" | "select" | "lines" | "yesno";

export interface RecordField<T> {
  key: keyof T & string;
  label: string;
  kind: RecordFieldKind;
  placeholder?: string;
  /** select only. */
  options?: { value: string; label: string }[];
}

type Row = Record<string, unknown>;

function asLines(v: unknown): string {
  return Array.isArray(v) ? v.filter((x) => typeof x === "string").join("\n") : "";
}

function fromLines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/** One record's value as a reader sees it. */
function readField<T>(f: RecordField<T>, row: Row): string {
  const v = row[f.key];
  if (f.kind === "lines") return asLines(v).split("\n").filter(Boolean).join(" · ");
  if (f.kind === "yesno") return v === true ? "Yes" : "";
  if (f.kind === "select") return f.options?.find((o) => o.value === v)?.label ?? "";
  return typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
}

/**
 * A list of small records, each field an input. `required` is the field a
 * record is known by (a stop rule's words): a new row is added only when it
 * says something, and a record whose key field is cleared is kept on screen
 * so the typing is never lost mid-edit — the normaliser drops it on read.
 */
export function RecordList<T extends object>({
  items,
  fields,
  onChange,
  readOnly,
  addLabel,
  empty = "Not written yet",
  inherited = [],
  inheritedNote,
}: {
  items: T[];
  fields: RecordField<T>[];
  onChange: (next: T[]) => void;
  readOnly?: boolean;
  addLabel: string;
  empty?: string;
  /** Entries from the standard a studio's copy keeps (additive lists). */
  inherited?: T[];
  inheritedNote?: string;
}) {
  const rows = items as unknown as Row[];
  const set = (i: number, key: string, value: unknown) => {
    const next = [...rows];
    next[i] = { ...next[i], [key]: value };
    onChange(next as unknown as T[]);
  };

  const describe = (row: Row) =>
    fields
      .map((f) => {
        const text = readField(f, row);
        return text ? (f === fields[0] ? text : `${f.label}: ${text}`) : "";
      })
      .filter(Boolean);

  if (readOnly) {
    const all = [...(inherited as unknown as Row[]), ...rows];
    if (!all.length) return <p className="adm-me__empty">{empty}</p>;
    return (
      <ul className="adm-me__list">
        {all.map((row, i) => (
          <li key={i} className="adm-me__listitem">
            {describe(row).join(" — ")}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="adm-me__stack">
      {inherited.length > 0 && (
        <div className="adm-me__inherited">
          {inheritedNote && <span className="adm-me__inheritedhead">{inheritedNote}</span>}
          {(inherited as unknown as Row[]).map((row, i) => (
            <p key={i} className="adm-me__prose">
              {describe(row).join(" — ")}
            </p>
          ))}
        </div>
      )}
      {rows.map((row, i) => (
        <div key={i} className="adm-me__card">
          {fields.map((f) => (
            <div key={f.key} className="adm-field">
              <span className="adm-label">{f.label}</span>
              <RecordInput field={f} value={row[f.key]} onChange={(v) => set(i, f.key, v)} />
            </div>
          ))}
          <div className="adm-me__rowacts">
            <AdminButton
              variant="ghost"
              aria-label={`Remove “${readField(fields[0], row).slice(0, 40) || "this line"}”`}
              onClick={() => onChange(rows.filter((_, j) => j !== i) as unknown as T[])}
            >
              <X className="w-4 h-4" /> Remove
            </AdminButton>
          </div>
        </div>
      ))}
      <div>
        <AdminButton variant="quiet" onClick={() => onChange([...rows, {}] as unknown as T[])}>
          <Plus className="w-4 h-4" /> {addLabel}
        </AdminButton>
      </div>
    </div>
  );
}

function RecordInput<T>({
  field,
  value,
  onChange,
}: {
  field: RecordField<T>;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  switch (field.kind) {
    case "textarea":
      return (
        <AdminTextarea
          rows={2}
          value={typeof value === "string" ? value : ""}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "lines":
      return (
        <AdminTextarea
          rows={3}
          value={asLines(value)}
          placeholder={field.placeholder ?? "One step per line"}
          onChange={(e) => onChange(fromLines(e.target.value))}
        />
      );
    case "select":
      return (
        <AdminSelect value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)}>
          {(field.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </AdminSelect>
      );
    case "yesno":
      return (
        <AdminSelect value={value === true ? "yes" : "no"} onChange={(e) => onChange(e.target.value === "yes")}>
          <option value="no">No</option>
          <option value="yes">Yes</option>
        </AdminSelect>
      );
    default:
      return (
        <AdminInput
          value={typeof value === "string" ? value : ""}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

/** One line of an object leaf, as a textarea or its prose. */
export function LeafLine({
  value,
  onChange,
  readOnly,
  rows = 2,
  placeholder,
}: {
  value: string | undefined;
  onChange: (next: string) => void;
  readOnly?: boolean;
  rows?: number;
  placeholder?: string;
}) {
  if (readOnly) {
    return value && value.trim() ? (
      <p className="adm-me__prose">{value}</p>
    ) : (
      <p className="adm-me__empty">Not written yet</p>
    );
  }
  return (
    <AdminTextarea rows={rows} value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
  );
}

/**
 * Set one key of an object leaf, dropping a key cleared to nothing so an
 * emptied line is absent rather than stored as "" (and a leaf with nothing
 * left in it goes away entirely).
 */
export function withLine<T extends object>(leaf: T | undefined, key: keyof T, value: unknown): T | undefined {
  const next: Record<string, unknown> = { ...((leaf as Record<string, unknown>) ?? {}) };
  const blank =
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.trim() === "") ||
    (Array.isArray(value) && value.length === 0);
  if (blank) delete next[key as string];
  else next[key as string] = value;
  return Object.keys(next).length ? (next as T) : undefined;
}

/** A list with its blank records dropped, or undefined when nothing is left. */
export function cleanList<T extends object>(list: T[] | undefined, key: keyof T): T[] | undefined {
  const out = (list ?? []).filter((r) => {
    const v = (r as Record<string, unknown>)[key as string];
    return typeof v === "string" && v.trim().length > 0;
  });
  return out.length ? out : undefined;
}

/** Wraps a label + control, with the section's grid spacing. */
export function LeafField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="adm-me__field">
      <div className="adm-me__fieldhead">
        <span className="adm-label">{label}</span>
      </div>
      {children}
      {hint && <p className="adm-hint">{hint}</p>}
    </div>
  );
}
