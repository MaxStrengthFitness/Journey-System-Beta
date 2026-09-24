import { useCallback, useMemo, useRef } from "react";
import { deleteField, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { Scale } from "lucide-react";
import { auth, db } from "../../firebase";
import { useToast } from "../../contexts/ToastContext";
import { studioDayKeyOf, studioTodayKey, type DateLike } from "../../lib/studio-time";
import type { Studio, Trainer } from "../../types";
import { AdminButton, AdminField, AdminGrid, AdminInput, AdminPanel, SaveBar } from "../admin/primitives";
import { useDirtyForm } from "../admin/useDirtyForm";
import { scanDateLabel } from "../inbody/scans";
import {
  DEFAULT_INBODY_VARIATION,
  VARIATION_FIELDS,
  VARIATION_KEYS,
  VARIATION_SOURCE,
  checkVariationForm,
  hasOwnVariation,
  inbodyVariationOf,
  isDefaultVariation,
  variationToForm,
  variationWrite,
  type VariationForm,
} from "../inbody/variation";

/**
 * MY STUDIO → STUDIO → InBody: the scanner's normal variation.
 *
 * Client codex, Sep 2026 (AJ's decision 8). An InBody scan of the same body
 * reads a little differently every time, so a change smaller than this
 * studio's numbers is not called a change anywhere: the InBody card, the
 * progress report the client takes home, the Renewal Brief, the renewal
 * card and the renewals pipeline. Every client is read against their HOME
 * studio's numbers. The rule itself is features/inbody/variation.ts.
 *
 * House rules (features/admin/README.md): controlled, dirty-tracked on the
 * save bar, and nothing is written while a number is out of range. The three
 * numbers are ONE field, so a save writes the whole map with who saved it
 * (`updatedBy` is the Auth uid) — or, when all three are back on Max
 * Strength's defaults, removes the field, so the studio follows the defaults
 * from then on. "Use Max Strength's defaults" only fills the form; the save
 * bar still asks. firestore.rules lets the studio's own leaders (and the
 * grant), franchise owners and administrators write a studio; that is the
 * boundary, and the studio tier is who sees this section.
 */

export interface InBodyVariationPanelProps {
  studioId: string;
  studio: Studio;
  /** To name who set the numbers. */
  trainers: Trainer[];
}

export function InBodyVariationPanel({ studioId, studio, trainers }: InBodyVariationPanelProps) {
  const { success: toastSuccess } = useToast();
  const stored = studio.inbodyVariation;
  const current = useMemo(() => inbodyVariationOf({ inbodyVariation: stored }), [stored]);
  const own = hasOwnVariation({ inbodyVariation: stored });
  const external = useMemo(() => variationToForm(current), [current]);

  // The save reads the whole draft, not just the patch: the three numbers
  // are written together. A ref keeps onSave's identity stable.
  const draftRef = useRef<VariationForm>(external);
  const onSave = useCallback(async () => {
    const { value, problems } = checkVariationForm(draftRef.current);
    if (!value) throw new Error(Object.values(problems)[0] ?? "Check the numbers.");
    // The Auth uid, never the trainer document's id: the two differ on
    // older accounts (CLAUDE.md), and this is "who changed it".
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error("Sign in again to save: the app can't tell who is changing this.");
    await updateDoc(doc(db, "studios", studioId), variationWrite(value, uid, { now: serverTimestamp(), remove: deleteField() }));
    toastSuccess(
      isDefaultVariation(value)
        ? "Saved. This studio is back on Max Strength's defaults."
        : "Saved. The InBody card, progress reports and renewals follow the new numbers.",
    );
  }, [studioId, toastSuccess]);

  const form = useDirtyForm<VariationForm>(external, onSave);
  draftRef.current = form.value;

  const check = useMemo(() => checkVariationForm(form.value), [form.value]);
  const firstProblem = Object.values(check.problems)[0] ?? null;
  const onDefaults = check.value !== null && isDefaultVariation(check.value);

  const setBy = useMemo(() => {
    if (!own || !stored) return null;
    const uid = typeof stored.updatedBy === "string" ? stored.updatedBy : null;
    const who = uid ? trainers.find((t) => t.id === uid || t.authUid === uid)?.fullName ?? null : null;
    const day = stored.updatedAt ? studioDayKeyOf(stored.updatedAt as DateLike) : null;
    const when = day ? scanDateLabel(day, studioTodayKey()) : null;
    return [who ? `set by ${who}` : null, when ? `on ${when}` : null].filter(Boolean).join(" ");
  }, [own, stored, trainers]);

  return (
    <AdminPanel
      title="InBody: the scanner's normal variation"
      icon={<Scale className="w-3.5 h-3.5" />}
      subtitle="An InBody scan of the same body reads a little differently every time. A change smaller than these numbers isn't called a change anywhere: the InBody card, the progress report, the Renewal Brief and Operations → Renewals. Every client is measured against their home studio's numbers."
      actions={
        <AdminButton
          size="sm"
          variant="quiet"
          disabled={onDefaults}
          onClick={() => form.setFields(variationToForm(DEFAULT_INBODY_VARIATION))}
        >
          Use Max Strength's defaults
        </AdminButton>
      }
      footer={
        <SaveBar
          status={firstProblem && form.dirty ? "error" : form.status}
          error={firstProblem ?? form.error}
          onSave={() => {
            if (firstProblem) return;
            void form.save();
          }}
          onDiscard={form.discard}
        />
      }
    >
      <p className="mb-3 text-sm" style={{ color: "var(--adm-ink)" }}>
        {own
          ? `This studio's own numbers${setBy ? `, ${setBy}` : ""}.`
          : "Max Strength's defaults. Change a number and save to make it this studio's own."}
      </p>
      <AdminGrid>
        {VARIATION_KEYS.map((key) => {
          const { label, unit } = VARIATION_FIELDS[key];
          return (
            <AdminField
              key={key}
              label={`${label} (${unit})`}
              hint={`Max Strength's default: ${DEFAULT_INBODY_VARIATION[key]} ${unit}.`}
              error={form.dirty ? check.problems[key] ?? null : null}
              htmlFor={`ms-inbody-${key}`}
            >
              <AdminInput
                id={`ms-inbody-${key}`}
                inputMode="decimal"
                value={form.value[key]}
                invalid={Boolean(check.problems[key])}
                onChange={(e) => form.setField(key, e.target.value)}
              />
            </AdminField>
          );
        })}
      </AdminGrid>
      <p className="mt-3 text-xs" style={{ color: "var(--adm-ink-muted)" }}>
        {VARIATION_SOURCE}
      </p>
    </AdminPanel>
  );
}
