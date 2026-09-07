/**
 * One machine's upkeep: log a job, and see the record.
 *
 * The tally is the point. "Last cleaned: never" tells a manager nothing about
 * whether the floor is being looked after; a count with dates does, and it is
 * what turns equipment longevity from an intention into something anyone can
 * check.
 */

import React, { useMemo, useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { History, Sparkles } from "lucide-react";
import { auth, db } from "../../../firebase";
import type { Trainer } from "../../../types";
import { studioDateKey } from "../../../lib/studio-time";
import { useToast } from "../../../contexts/ToastContext";
import {
  OperationType,
  handleFirestoreError,
} from "../../../lib/firestore-errors";
import {
  AdminBadge,
  AdminButton,
  AdminEmpty,
  AdminField,
  AdminRow,
  AdminRows,
  AdminSelect,
  AdminTextarea,
} from "../primitives";
import {
  DEFAULT_UPKEEP_POLICY,
  UPKEEP_LABEL,
  tallyUpkeep,
  upkeepStatus,
  type UpkeepEvent,
  type UpkeepKind,
} from "./upkeepLog";

const STATUS_TONE = {
  ok: "ok",
  never: "neutral",
  due: "warn",
  overdue: "alert",
} as const;

const STATUS_WORD = {
  ok: "Up to date",
  never: "Never logged",
  due: "Due",
  overdue: "Overdue",
} as const;

export function UpkeepDialog({
  studioId,
  machineId,
  machineName,
  events,
  authTrainer,
  onClose,
}: {
  studioId: string;
  machineId: string;
  machineName: string;
  events: UpkeepEvent[];
  authTrainer?: Trainer | null;
  onClose: () => void;
}) {
  const { success: toastSuccess } = useToast();
  const [kind, setKind] = useState<UpkeepKind>("clean");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const todayKey = studioDateKey(new Date()) ?? "";
  const history = useMemo(
    () => events.filter((e) => e.machineId === machineId),
    [events, machineId],
  );
  const tally = useMemo(
    () => tallyUpkeep(events, machineId, todayKey),
    [events, machineId, todayKey],
  );

  const cleanStatus = upkeepStatus(
    tally.daysSinceCleaned,
    DEFAULT_UPKEEP_POLICY.cleanEveryDays,
  );
  const serviceStatus = upkeepStatus(
    tally.daysSinceServiced,
    DEFAULT_UPKEEP_POLICY.serviceEveryDays,
  );

  const log = async () => {
    setSaving(true);
    try {
      await addDoc(collection(db, "studios", studioId, "upkeepLog"), {
        machineId,
        kind,
        // A client clock on purpose: the person doing the job decides when it
        // happened, and a serverTimestamp reads back null for a moment, which
        // would drop the entry out of the timeline it was just added to.
        at: new Date().toISOString(),
        byId: authTrainer?.id ?? null,
        byName: authTrainer?.fullName ?? null,
        ...(note.trim() ? { note: note.trim() } : {}),
        createdAt: serverTimestamp(),
      });
      setNote("");
      toastSuccess(`${UPKEEP_LABEL[kind]} — logged against ${machineName}.`);
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.CREATE,
        `studios/${studioId}/upkeepLog`,
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="adm-scrim adm"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div
        className="adm-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Upkeep for ${machineName}`}
        style={{ maxWidth: 620, maxHeight: "88dvh", display: "flex", flexDirection: "column" }}
      >
        <div className="adm-dialog__body" style={{ overflowY: "auto" }}>
          <h3 className="adm-dialog__title">{machineName}</h3>

          <div className="adm-tiles" style={{ marginTop: 6 }}>
            <div className="adm-tile">
              <span className="adm-tile__label">Cleans logged</span>
              <span className="adm-tile__value">{tally.cleans}</span>
              <span className="adm-tile__foot">
                <AdminBadge tone={STATUS_TONE[cleanStatus]}>
                  {STATUS_WORD[cleanStatus]}
                </AdminBadge>{" "}
                {tally.lastCleanedDay
                  ? `last ${tally.lastCleanedDay}`
                  : "no record yet"}
              </span>
            </div>
            <div className="adm-tile">
              <span className="adm-tile__label">Services logged</span>
              <span className="adm-tile__value">{tally.services}</span>
              <span className="adm-tile__foot">
                <AdminBadge tone={STATUS_TONE[serviceStatus]}>
                  {STATUS_WORD[serviceStatus]}
                </AdminBadge>{" "}
                {tally.lastServicedDay
                  ? `last ${tally.lastServicedDay}`
                  : "no record yet"}
              </span>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <AdminField label="Log some work" hint="For anything the scheduled list did not cover.">
              <AdminSelect
                value={kind}
                onChange={(e) => setKind(e.target.value as UpkeepKind)}
              >
                <option value="clean">Cleaned</option>
                <option value="deep-clean">Deep cleaned</option>
                <option value="service">Serviced or repaired</option>
              </AdminSelect>
            </AdminField>
            <div style={{ marginTop: 10 }}>
              <AdminField label="What was done" hint="Optional, but it is what makes the log worth reading later.">
                <AdminTextarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Replaced the seat pad. Pin was sticking on the 90lb stack."
                />
              </AdminField>
            </div>
            <div style={{ marginTop: 10 }}>
              <AdminButton variant="primary" busy={saving} onClick={() => void log()}>
                <Sparkles className="w-3.5 h-3.5" />
                Log it
              </AdminButton>
            </div>
          </div>

          <div style={{ marginTop: 18 }}>
            <h4 className="adm-label" style={{ marginBottom: 6 }}>
              <History className="w-3.5 h-3.5" />
              History ({history.length})
            </h4>
            {history.length === 0 ? (
              <AdminEmpty title="Nothing logged yet">
                Completed cleaning and maintenance tasks appear here
                automatically, alongside anything logged by hand.
              </AdminEmpty>
            ) : (
              <AdminRows>
                {history.slice(0, 30).map((e) => (
                  <AdminRow
                    key={`${e.source}-${e.id}`}
                    name={UPKEEP_LABEL[e.kind]}
                    meta={
                      <>
                        {e.day}
                        {e.byName ? ` · ${e.byName}` : ""}
                        {e.note ? ` · ${e.note}` : ""}
                      </>
                    }
                    trailing={
                      <AdminBadge tone={e.source === "logged" ? "live" : "neutral"}>
                        {e.source === "logged" ? "Logged" : "From the list"}
                      </AdminBadge>
                    }
                  />
                ))}
              </AdminRows>
            )}
          </div>
        </div>

        <div className="adm-dialog__foot">
          <AdminButton variant="ghost" onClick={onClose}>
            Done
          </AdminButton>
        </div>
      </div>
    </div>
  );
}
