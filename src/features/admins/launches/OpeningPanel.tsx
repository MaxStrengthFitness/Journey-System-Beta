/**
 * A STUDIO'S OPENING — its stage and its opening day, on its page in Admins
 * (Setup). Administrators set both (the second wave, Sep 28 2026).
 *
 * Setting up and Handed over put the studio on Studios → Launches and open
 * its setup checklist below; Running, or not recorded, takes it off. The
 * checklist's due dates count back from the opening day. A dirty-tracked
 * form (useDirtyForm), so only what changed is written and a half-changed
 * stage joins the leave question; each save leaves a line in the Activity
 * record.
 */
import { useMemo } from "react";
import { Flag } from "lucide-react";
import type { Studio } from "../../../types";
import { AdminField, AdminGrid, AdminInput, AdminPanel, AdminSelect, SaveBar } from "../../admin/primitives";
import { useDirtyForm } from "../../admin/useDirtyForm";
import { LAUNCH_STAGES, STAGE_WORDS, openingDayOf, stageOf, type LaunchStage } from "./checklist";
import { saveOpening } from "./setup-store";

interface OpeningForm {
  stage: string;
  openingDay: string;
}

export function OpeningPanel({
  studio,
  byName,
  onSaved,
}: {
  studio: Studio;
  byName: string;
  /** After a save lands: the dashboard reads the studios again. */
  onSaved?: () => void | Promise<void>;
}) {
  const studioId = studio.id ?? "";
  const name = studio.name || "the studio";
  const stage = stageOf(studio);
  const openingDay = openingDayOf(studio);
  const external = useMemo<OpeningForm>(() => ({ stage: stage ?? "", openingDay: openingDay ?? "" }), [stage, openingDay]);

  const form = useDirtyForm<OpeningForm>(
    external,
    async (patch) => {
      const next = { ...external, ...patch };
      const nowStage = (LAUNCH_STAGES as readonly string[]).includes(next.stage) ? (next.stage as LaunchStage) : null;
      const nowDay = /^\d{4}-\d{2}-\d{2}$/.test(next.openingDay) ? next.openingDay : null;
      await saveOpening({ studioId, studioName: name, byName }, { stage, openingDay }, { stage: nowStage, openingDay: nowDay });
      await onSaved?.();
    },
    { label: `${name}'s opening` },
  );

  return (
    <AdminPanel
      title="Opening"
      icon={<Flag className="w-3.5 h-3.5" />}
      subtitle={`Where ${name} stands, and the day it opens. Setting up and Handed over list it on Launches, with its setup checklist below; the checklist's due dates count back from the opening day.`}
      footer={<SaveBar status={form.status} error={form.error} onSave={() => void form.save()} onDiscard={form.discard} />}
    >
      <AdminGrid>
        <AdminField label="Stage" htmlFor="hq-opening-stage">
          <AdminSelect id="hq-opening-stage" value={form.value.stage} onChange={(e) => form.setField("stage", e.target.value)}>
            <option value="">Not recorded</option>
            {LAUNCH_STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_WORDS[s]}
              </option>
            ))}
          </AdminSelect>
        </AdminField>
        <AdminField label="Opening day" htmlFor="hq-opening-day" hint="The studio's own day. Leave it empty while nobody knows.">
          <AdminInput id="hq-opening-day" type="date" value={form.value.openingDay} onChange={(e) => form.setField("openingDay", e.target.value)} />
        </AdminField>
      </AdminGrid>
    </AdminPanel>
  );
}
