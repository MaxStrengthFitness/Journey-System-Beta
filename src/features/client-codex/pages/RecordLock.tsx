import type { ReactNode } from "react";

/**
 * The record's editors, locked for a reader who may not change the record
 * (codexAccess().canEdit false: a cross-train studio, a franchise owner who
 * does not work at the home studio). A disabled fieldset, so every field
 * shows what is on file and none can be changed — the reader is never
 * offered an edit the database would refuse.
 *
 * Interim, for the shell phase: the moved sections are forms, and each page
 * area replaces them with read views and an Edit button a locked reader
 * never sees (the kit's ReadEdit). Only record fields go inside: notes, FORD
 * details, Pulse rounds and InBody scans keep their own rules and buttons.
 */
export function RecordLock({ locked, children }: { locked: boolean; children: ReactNode }) {
  return (
    <fieldset className="cx-lock" disabled={locked} data-locked={locked ? "" : undefined}>
      {children}
    </fieldset>
  );
}
