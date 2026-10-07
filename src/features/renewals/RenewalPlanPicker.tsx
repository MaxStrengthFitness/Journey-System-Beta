/**
 * The renewal plan on a dashboard row (the renewals dashboard, Oct 7 2026).
 *
 * AJ, Oct 6 2026: "allow in app response", and "strongsville does not
 * autorenew, allow on the new renewal dashboard for studios without auto
 * renew to mark if a client is set to renew or not in some way manually".
 * The choices are the ones that fit this contract's decided auto-renew
 * answer (plan.ts, planChoicesFor): a contract that renews by itself offers
 * Let it renew · Pause billing · Not renewing; one that doesn't (Strongsville)
 * offers Same package · Upgrading · Downgrading · Pay as you go · Not renewing.
 *
 * The picker's labels are short ("Let it renew", "Pause billing"), so a
 * closed select on an iPad never cuts one off (AJ, Oct 7 2026: "fix"); the
 * choice said whole (plan.ts PLAN_WORDS) is the line under it while picking,
 * and the plan's sentence once saved.
 *
 * Picking a choice opens the package (when the choice names one) and a
 * note, with Save and Cancel: a plan is a recorded decision, one touch on
 * the conversation history each time, so it is never written by a slip of
 * the select. The draft joins the unsaved-changes registry. Anyone who works
 * at the studio may set it (permissions.ts canSetRenewalPlan); someone who
 * may not reads the sentence only.
 */

import { useId, useState } from "react";
import { AdminButton, AdminSelect, AdminTextarea } from "../admin/primitives";
import { useUnsavedChanges } from "../unsaved-changes";
import {
  PLAN_LABELS,
  PLAN_NOTE_MAX,
  defaultPlanPackage,
  planChoicesFor,
  planNamesPackage,
  planPackageOptions,
  planMeaning,
  planProblem,
  type PlanDraft,
} from "./plan";
import { isUsableCycleKey, saveRenewalPlan } from "./useRenewalCycle";
import type { RenewalCycle, RenewalPlanChoice, RenewalSettings, RenewalSnapshot } from "./types";

export interface RenewalPlanPickerProps {
  studioId: string;
  clientId: string;
  clientName: string;
  snapshot: RenewalSnapshot;
  cycle: RenewalCycle | null | undefined;
  settings: Pick<RenewalSettings, "packages">;
  /** The plan's sentence ("Upgrading to Life Transformed · Jen, Oct 6"), worked out by the row. */
  sentence: string | null;
  /** May this person set the plan here (canSetRenewalPlan)? */
  canSet: boolean;
  /** The signed-in person's name, written on the plan and its touch. */
  authorName: string;
  /**
   * Which list this picker is in, when the client can be on the screen twice
   * (Running low beside Talk now), so a screen reader and the leave warning
   * tell the two apart: "Renewal plan for Sasha Reyes (Running low)".
   */
  where?: string;
}

function savedDraft(cycle: RenewalCycle | null | undefined): PlanDraft {
  const p = cycle?.plan;
  return { choice: p?.choice ?? null, packageKey: p?.packageKey ?? null, note: p?.note ?? "" };
}

function sameDraft(a: PlanDraft, b: PlanDraft): boolean {
  return a.choice === b.choice && (a.packageKey ?? null) === (b.packageKey ?? null) && a.note.trim() === b.note.trim();
}

export function RenewalPlanPicker({ studioId, clientId, clientName, snapshot, cycle, settings, sentence, canSet, authorName, where }: RenewalPlanPickerProps) {
  const inList = where ? ` (${where})` : "";
  const id = useId();
  const saved = savedDraft(cycle);
  const [draft, setDraft] = useState<PlanDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = draft !== null && !sameDraft(draft, saved);
  useUnsavedChanges(dirty, `${clientName}'s renewal plan${inList}`, { onDiscard: () => setDraft(null) });

  const plannable = canSet && isUsableCycleKey(snapshot.cycleKey);
  if (!plannable) {
    return (
      <div className="rr-plan">
        <p className="rr-plan__sentence">{sentence ?? (canSet ? "No package to plan for yet" : "No plan yet")}</p>
        {cycle?.plan?.note && <p className="rr-plan__note">{cycle.plan.note}</p>}
      </div>
    );
  }

  const choices = planChoicesFor(snapshot, cycle?.plan?.choice ?? null);
  const current = draft ?? saved;
  const packages = planPackageOptions(current.choice, settings, snapshot.packageKey);
  const problem = draft ? planProblem(draft, settings, snapshot.packageKey) : null;

  const pick = (value: string) => {
    setError(null);
    if (!value) return;
    const choice = value as RenewalPlanChoice;
    setDraft((prev) => ({
      choice,
      packageKey: planNamesPackage(choice)
        ? choice === saved.choice && saved.packageKey
          ? saved.packageKey
          : defaultPlanPackage(choice, settings, snapshot.packageKey)
        : null,
      note: prev?.note ?? saved.note,
    }));
  };

  const save = async () => {
    if (!draft || problem || !dirty) return;
    setBusy(true);
    setError(null);
    try {
      await saveRenewalPlan({ studioId, cycleKey: snapshot.cycleKey as string, clientId, clientName, snapshot, draft, authorName });
      setDraft(null);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Couldn't save the plan. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rr-plan">
      <AdminSelect
        id={`${id}-choice`}
        aria-label={`Renewal plan for ${clientName}${inList}`}
        value={current.choice ?? ""}
        disabled={busy}
        onChange={(e) => pick(e.target.value)}
      >
        {!current.choice && <option value="">Set the plan…</option>}
        {choices.map((c) => (
          <option key={c} value={c}>
            {PLAN_LABELS[c]}
          </option>
        ))}
      </AdminSelect>

      {draft ? (
        <div className="rr-plan__edit">
          {planMeaning(draft.choice) && <p className="rr-plan__sentence">{planMeaning(draft.choice)}</p>}
          {planNamesPackage(draft.choice) && packages.length > 0 && (
            <AdminSelect
              aria-label={`Package ${clientName} is renewing onto`}
              value={draft.packageKey ?? ""}
              disabled={busy}
              onChange={(e) => setDraft({ ...draft, packageKey: e.target.value || null })}
            >
              <option value="">Package not decided</option>
              {packages.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </AdminSelect>
          )}
          <AdminTextarea
            aria-label={`Note on ${clientName}'s renewal plan`}
            placeholder="Note (optional)"
            rows={2}
            maxLength={PLAN_NOTE_MAX}
            value={draft.note}
            disabled={busy}
            onChange={(e) => setDraft({ ...draft, note: e.target.value })}
          />
          {(problem || error) && (
            <p className="rr-plan__problem" role="alert">
              {error ?? problem}
            </p>
          )}
          <div className="rr-plan__buttons">
            <AdminButton variant="primary" size="sm" busy={busy} disabled={!dirty || Boolean(problem)} onClick={() => void save()}>
              Save plan
            </AdminButton>
            <AdminButton
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => {
                setDraft(null);
                setError(null);
              }}
            >
              Cancel
            </AdminButton>
          </div>
        </div>
      ) : (
        <>
          {sentence && <p className="rr-plan__sentence">{sentence}</p>}
          {cycle?.plan?.note && <p className="rr-plan__note">{cycle.plan.note}</p>}
          {cycle?.plan && (
            <AdminButton variant="ghost" size="sm" onClick={() => setDraft(savedDraft(cycle))}>
              Edit the plan
            </AdminButton>
          )}
        </>
      )}
    </div>
  );
}
