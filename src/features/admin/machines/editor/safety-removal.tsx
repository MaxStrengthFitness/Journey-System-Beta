import React from "react";
import { Lock, RotateCcw } from "lucide-react";
import { AdminButton, AdminTextarea } from "../../primitives";
import type { MachineDefinition, RemovedSafetyLine, SafetyListField } from "../../../../types/machines";
import { safetyLineKey } from "../../../../lib/resolve-machine";
import { MAX_REMOVAL_REASON, reasonIsEnough } from "../../../../lib/machine-template";
import { formatStudioDate } from "../../../../lib/studio-time";
import { putBack, removedFrom, splitSafety, takeOff } from "./safety-edit";
import "../../admin.css";
import "./codex-editor.css";

/**
 * MAX STRENGTH'S SAFETY LINES ON A STUDIO'S COPY — the Sep 21 rule, built
 * Sep 28 2026 (AJ: "Yes studios need to be able to customize their stuff
 * safety is definitely a worry but are trusted").
 *
 * The catalog's lines this unit keeps, each with "Take off this unit…",
 * which asks WHY before it does anything; and the lines taken off, each
 * with its reason, who and when, and "Put it back". A line leaves only with
 * a reason — the write gate refuses anything else — and the record is what
 * head office reads in Compare. Nothing here is a dialog: the question opens
 * in place, under the line it is about.
 */
export function InheritedSafety({
  field,
  value,
  standard,
  describe,
  readOnly,
  actor,
  onChange,
}: {
  field: SafetyListField;
  value: MachineDefinition;
  standard: MachineDefinition;
  /** How one entry reads ("Knee Tracking: knees over the feet"). */
  describe: (entry: unknown) => string;
  readOnly: boolean;
  /** Who is making the change (the Auth uid, and a name). Absent: removal is not offered. */
  actor?: { uid: string; name: string };
  onChange: (list: unknown[], records: RemovedSafetyLine[]) => void;
}) {
  const std = (standard[field] as unknown[] | undefined) ?? [];
  const current = (value[field] as unknown[] | undefined) ?? [];
  const { inherited } = splitSafety(field, current, std);
  const removed = removedFrom(value, field);
  const [asking, setAsking] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState("");
  const idBase = `why-${field}`;

  if (inherited.length === 0 && removed.length === 0) return null;

  return (
    <div className="adm-me__stack">
      {inherited.length > 0 && (
        <div className="adm-me__inherited">
          <span className="adm-me__inheritedhead">
            <Lock className="w-3 h-3" aria-hidden /> From Max Strength
          </span>
          {inherited.map((entry, i) => {
            const key = safetyLineKey(field, entry);
            const open = asking === key;
            const reasonId = `${idBase}-${i}`;
            return (
              <div key={key || i} className="adm-mx__safetyline">
                <p className="adm-me__prose">{describe(entry)}</p>
                {!readOnly && actor && !open && (
                  <div>
                    <AdminButton
                      variant="ghost"
                      onClick={() => {
                        setAsking(key);
                        setReason("");
                      }}
                    >
                      Take off this unit…
                    </AdminButton>
                  </div>
                )}
                {!readOnly && actor && open && (
                  <div className="adm-mx__reason">
                    <label className="adm-label" htmlFor={reasonId}>
                      Why does this come off your unit?
                    </label>
                    <AdminTextarea
                      id={reasonId}
                      rows={2}
                      maxLength={MAX_REMOVAL_REASON}
                      value={reason}
                      placeholder="This unit has no seat belt."
                      onChange={(e) => setReason(e.target.value)}
                    />
                    <p className="adm-hint">
                      Only your floor stops reading it. Head office sees the reason, your name and the
                      date when it compares the studios&apos; machines.
                    </p>
                    <div className="adm-mx__actions">
                      <AdminButton
                        variant="danger"
                        disabled={!reasonIsEnough(reason)}
                        onClick={() => {
                          const next = takeOff(value, field, entry, reason, actor);
                          onChange(next.list, next.records);
                          setAsking(null);
                          setReason("");
                        }}
                      >
                        Take it off this unit
                      </AdminButton>
                      <AdminButton
                        variant="ghost"
                        onClick={() => {
                          setAsking(null);
                          setReason("");
                        }}
                      >
                        Keep it
                      </AdminButton>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {removed.length > 0 && (
        <div className="adm-mx__removed adm-me__stack">
          <span className="adm-me__inheritedhead">Taken off this unit</span>
          {removed.map((r) => (
            <div key={r.line} className="adm-mx__safetyline">
              <p className="adm-me__prose adm-mx__was">{r.line}</p>
              <p className="adm-hint">
                Why: {r.reason}
                {r.by?.name ? ` · ${r.by.name}` : ""}
                {r.at ? ` · ${formatStudioDate(r.at, { month: "short", day: "numeric", year: "numeric" })}` : ""}
              </p>
              {!readOnly && (
                <div>
                  <AdminButton
                    variant="quiet"
                    onClick={() => {
                      const next = putBack(value, standard, field, r.line);
                      onChange(next.list, next.records);
                    }}
                  >
                    <RotateCcw className="w-4 h-4" aria-hidden /> Put it back
                  </AdminButton>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
