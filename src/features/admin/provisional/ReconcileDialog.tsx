/**
 * Reconciling one temporary client against the real Mindbody record.
 *
 * The screen exists to make a human look before the merge happens. Nothing
 * here auto-selects and commits: the strongest candidate is pre-chosen, the
 * differences between the two records are shown side by side, and the confirm
 * step says in plain words what is about to move.
 *
 * That is not caution for its own sake. Merging two people's training
 * histories together cannot be undone by pressing anything.
 */

import React, { useMemo, useState } from "react";
import { ArrowRight, Check, Search } from "lucide-react";
import type { Client } from "../../../types";
import { useToast } from "../../../contexts/ToastContext";
import {
  AdminBadge,
  AdminButton,
  AdminEmpty,
  AdminInput,
  AdminNotice,
} from "../primitives";
import { checkMerge, rankCandidates, type Candidate } from "./reconcile";
import { mergeProvisionalClient, type MergeProgress } from "./mergeClient";
import { provisionalAgeDays } from "./provisional";

export interface ReconcileDialogProps {
  temp: Client;
  clients: Client[];
  onClose: () => void;
  onMerged?: () => Promise<void> | void;
}

/** Fields worth comparing side by side before someone commits. */
const COMPARE: { label: string; get: (c: Client) => string }[] = [
  { label: "Name", get: (c) => `${c.firstName} ${c.lastName}`.trim() },
  { label: "Email", get: (c) => c.email || "—" },
  { label: "Phone", get: (c) => c.phone || "—" },
  { label: "Date of birth", get: (c) => c.dateOfBirth || "—" },
  { label: "Home studio", get: (c) => c.homeStudioId || "—" },
  { label: "Mindbody id", get: (c) => c.mindbodyClientId || c.mindbodyId || "—" },
  { label: "Sessions left", get: (c) => String(c.remainingSessions ?? "—") },
];

export function ReconcileDialog({
  temp,
  clients,
  onClose,
  onMerged,
}: ReconcileDialogProps) {
  const { success: toastSuccess, error: toastError } = useToast();
  const ranked = useMemo(() => rankCandidates(temp, clients), [temp, clients]);
  const [search, setSearch] = useState("");
  const [chosenId, setChosenId] = useState<string | null>(
    ranked.find((c) => c.suggested)?.client.id ?? null,
  );
  const [confirming, setConfirming] = useState(false);
  const [progress, setProgress] = useState<MergeProgress | null>(null);
  const [running, setRunning] = useState(false);

  const visible: Candidate[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ranked.slice(0, 8);
    return clients
      .filter(
        (c) =>
          c.id !== temp.id &&
          !c.provisional &&
          `${c.firstName} ${c.lastName} ${c.email ?? ""}`
            .toLowerCase()
            .includes(q),
      )
      .slice(0, 8)
      .map((c) => ({ client: c, score: 0, reasons: [], suggested: false }));
  }, [search, ranked, clients, temp.id]);

  const survivor = clients.find((c) => c.id === chosenId) ?? null;
  const problem = survivor ? checkMerge(temp, survivor) : null;
  const age = provisionalAgeDays(temp);

  const run = async () => {
    if (!survivor || problem) return;
    setRunning(true);
    try {
      const res = await mergeProvisionalClient(temp, survivor, setProgress);
      toastSuccess(
        `Merged into ${survivor.firstName} ${survivor.lastName}. ${res.total} record${res.total === 1 ? "" : "s"} moved.`,
      );
      await onMerged?.();
      onClose();
    } catch (err) {
      toastError(
        err instanceof Error
          ? err.message
          : "The merge failed. Nothing is lost — the temporary profile is still there, and running it again picks up where it stopped.",
      );
    } finally {
      setRunning(false);
      setProgress(null);
    }
  };

  return (
    <div className="adm-scrim adm" role="presentation" onClick={(e) => {
      if (e.target === e.currentTarget && !running) onClose();
    }}>
      <div
        className="adm-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Reconcile temporary profile"
        style={{ maxWidth: 720, maxHeight: "88dvh", display: "flex", flexDirection: "column" }}
      >
        <div className="adm-dialog__body" style={{ overflowY: "auto" }}>
          <h3 className="adm-dialog__title">
            Reconcile {temp.firstName} {temp.lastName}
          </h3>
          <p className="adm-dialog__text">
            Temporary profile{temp.provisionalReason ? ` — ${temp.provisionalReason}` : ""}
            {age !== null && `, ${age === 0 ? "created today" : `${age} days old`}`}.
            Pick the Mindbody record this person really is. Their sessions,
            logs, journal, focuses and machine settings move across; the
            temporary profile is marked merged rather than deleted.
          </p>

          {ranked.length === 0 && !search && (
            <AdminEmpty title="No likely match yet">
              Nothing in Mindbody looks like this person. That is expected while
              the account is still being set up — search by name below if you
              know the record exists.
            </AdminEmpty>
          )}

          <div className="adm-field" style={{ marginTop: 8 }}>
            <label className="adm-label" htmlFor="reconcile-search">
              <Search className="w-3.5 h-3.5" />
              Find the real record
            </label>
            <AdminInput
              id="reconcile-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search every client by name or email"
            />
          </div>

          <div className="adm-rows" style={{ marginTop: 4 }}>
            {visible.map((c) => {
              const id = c.client.id!;
              const chosen = id === chosenId;
              return (
                <button
                  key={id}
                  type="button"
                  className="adm-row adm-row--tappable"
                  onClick={() => setChosenId(id)}
                  aria-pressed={chosen}
                >
                  <span style={{ width: 18 }}>
                    {chosen && <Check className="w-4 h-4" style={{ color: "var(--adm-live-text)" }} />}
                  </span>
                  <span className="adm-row__main">
                    <span className="adm-row__name">
                      {c.client.firstName} {c.client.lastName}
                    </span>
                    <span className="adm-row__meta">
                      {c.client.email || "no email"}
                      {c.reasons.length > 0 &&
                        ` · ${c.reasons.map((r) => r.label).join(", ")}`}
                    </span>
                  </span>
                  {c.suggested && <AdminBadge tone="ok">Likely match</AdminBadge>}
                </button>
              );
            })}
          </div>

          {survivor && (
            <div style={{ marginTop: 12 }}>
              <div className="adm-panel">
                <div className="adm-panel__head">
                  <h4 className="adm-panel__title">
                    Temporary <ArrowRight className="w-3.5 h-3.5" /> Mindbody
                  </h4>
                </div>
                <div className="adm-panel__body" style={{ padding: 0 }}>
                  <div className="adm-rows">
                    {COMPARE.map((f) => {
                      const a = f.get(temp);
                      const b = f.get(survivor);
                      const differs = a !== b && a !== "—" && b !== "—";
                      return (
                        <div key={f.label} className="adm-row">
                          <span
                            className="adm-label"
                            style={{ width: 120, flex: "0 0 auto" }}
                          >
                            {f.label}
                          </span>
                          <span className="adm-row__main" style={{ display: "flex", gap: 10 }}>
                            <span style={{ flex: 1, minWidth: 0, color: "var(--adm-ink-muted)" }}>
                              {a}
                            </span>
                            <span
                              style={{
                                flex: 1,
                                minWidth: 0,
                                fontWeight: differs ? 800 : 500,
                                color: differs
                                  ? "var(--adm-hero-text)"
                                  : "var(--adm-ink)",
                              }}
                            >
                              {b}
                            </span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              <p className="adm-hint" style={{ marginTop: 6 }}>
                The Mindbody values on the right are what the client keeps.
                Nothing from the temporary profile overwrites them.
              </p>
            </div>
          )}

          {problem && (
            <div style={{ marginTop: 10 }}>
              <AdminNotice tone="alert">{problem.message}</AdminNotice>
            </div>
          )}

          {progress && (
            <div style={{ marginTop: 10 }}>
              <AdminNotice tone="info">
                {progress.label}
                {progress.moved > 0 ? ` — ${progress.moved} moved` : ""}
              </AdminNotice>
            </div>
          )}

          {confirming && survivor && !problem && (
            <div style={{ marginTop: 10 }}>
              <AdminNotice tone="warn">
                This cannot be undone. {temp.firstName}'s sessions, logs,
                journal entries, focuses and machine settings will belong to{" "}
                <b>
                  {survivor.firstName} {survivor.lastName}
                </b>{" "}
                afterwards.
              </AdminNotice>
            </div>
          )}
        </div>

        <div className="adm-dialog__foot">
          <AdminButton variant="ghost" onClick={onClose} disabled={running}>
            Cancel
          </AdminButton>
          {confirming ? (
            <AdminButton
              variant="danger"
              busy={running}
              disabled={!survivor || !!problem}
              onClick={() => void run()}
            >
              Yes, merge them
            </AdminButton>
          ) : (
            <AdminButton
              variant="primary"
              disabled={!survivor || !!problem}
              onClick={() => setConfirming(true)}
            >
              Merge into this record
            </AdminButton>
          )}
        </div>
      </div>
    </div>
  );
}
