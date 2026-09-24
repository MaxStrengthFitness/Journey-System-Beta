/**
 * WORKING TOWARD NOW — the goal she is working toward, how much of S·M·A·R·T
 * it meets, its target, and "Mark achieved".
 *
 * Client codex, Sep 2026 (phase 14). Moved out of the long scroll's
 * GoalsPanel (deleted) with its writes unchanged, and laid out as a read view
 * with Edit on demand:
 *
 *   read   the goal as a 17px lede, five S M A R T squares (filled when
 *          ticked; not buttons), "3 of 5 ticked", the target ("May 1, 2027 ·
 *          in 6 weeks") and Mark achieved.
 *   edit   the goal, the five SMART toggles (a coach ticks them; nothing is
 *          inferred from the words) and the target date. A date ticks T.
 *
 * EVERY WRITE IS A FIELD EDIT through the shell's ONE record form
 * (`updateField`) in the same sequence GoalsPanel used, so the Save bar saves
 * it with the rest of the record: "Mark achieved" is four field edits —
 * the history grows by one, and the goal, the target and the checklist clear
 * for the next one — and nothing is written until Save. `buildAchievedGoal`
 * leaves every empty value out (Firestore refuses `undefined`). No "set by"
 * or "set on": no field records either.
 *
 * A reader who may not change the record (a cross-train studio) sees the read
 * view and no Edit and no Mark achieved: a button the rules would refuse is
 * worse than none.
 */
import { useState } from "react";
import { Target, Trophy } from "lucide-react";
import type { Client, Trainer } from "../../types";
import {
  Btn,
  CardHead,
  Chip,
  EditButton,
  EmptyLine,
  Fact,
  FactList,
  Lede,
  Meta,
  TextArea,
  TextInput,
  agree,
  anchorProps,
  cls,
  useReadEdit,
  type Pronouns,
} from "../client-codex/kit";
import type { RecordAnchor } from "../client-profile/profile-nav";
import {
  SMART_DEFS,
  SMART_KEYS,
  buildAchievedGoal,
  isDayKey,
  normalizeSmartChecks,
  pushGoalHistory,
  sameSmartChecks,
  type SmartKey,
} from "./goals";
import { smartLabel, smartSentence, targetLine } from "./goals-page";
import "./goals.css";

export interface WorkingTowardCardProps {
  client: Client;
  formData: Partial<Client>;
  updateField: (key: keyof Client, value: unknown) => void;
  authTrainer: Trainer | null;
  /** May change the client record (codexAccess().canEdit). */
  canEdit: boolean;
  /** An unsaved change on this card (the goal, its checklist, target or history). */
  dirty: boolean;
  /** The record form's revision; a save or a discard closes the editor. */
  revision: number;
  pronouns: Pronouns;
  id?: RecordAnchor;
  className?: string;
}

export function WorkingTowardCard({
  client,
  formData,
  updateField,
  authTrainer,
  canEdit,
  dirty,
  revision,
  pronouns: p,
  id = "goals-now",
  className,
}: WorkingTowardCardProps) {
  const { open, toggle, setOpen } = useReadEdit({ canEdit, revision });

  /** The form's value when it has one, else what is on the record. */
  function current<K extends keyof Client>(key: K): Client[K] {
    const v = formData[key];
    return (v !== undefined ? v : client[key]) as Client[K];
  }

  const goal = (current("smartGoal") as string) || "";
  const checks = normalizeSmartChecks(current("smartChecks"));
  const rawTarget = current("goalTargetDate");
  const target = isDayKey(rawTarget) ? rawTarget : "";

  const [achieving, setAchieving] = useState(false);
  const [reward, setReward] = useState("");

  /**
   * Write the checklist. When the result matches what is already on the
   * record, hand back the record's own value so the Save bar does not count
   * a toggle-and-untoggle as an edit.
   */
  const writeChecks = (next: typeof checks) => {
    const onRecord = normalizeSmartChecks(client.smartChecks);
    updateField("smartChecks", sameSmartChecks(next, onRecord) ? client.smartChecks : next);
  };

  const toggleCheck = (k: SmartKey) => writeChecks({ ...checks, [k]: !checks[k] });

  const setTarget = (value: string) => {
    updateField("goalTargetDate", value);
    // A date is what makes a goal time-bound: tick T for the coach.
    if (isDayKey(value) && !checks.t) writeChecks({ ...checks, t: true });
  };

  const confirmAchieved = () => {
    const entry = buildAchievedGoal({
      goal,
      targetDate: target || null,
      reward,
      byTrainerId: authTrainer?.id ?? null,
      byName: authTrainer?.fullName ?? null,
    });
    if (!entry) return;
    updateField("goalHistory", pushGoalHistory(current("goalHistory"), entry));
    updateField("smartGoal", "");
    updateField("goalTargetDate", "");
    // Clear the checklist for the next goal. A client with no checklist on
    // record keeps none (the record's own value, so nothing is written);
    // `null` is only written over one that exists.
    updateField("smartChecks", client.smartChecks ? null : client.smartChecks);
    setReward("");
    setAchieving(false);
  };

  const hasGoal = goal.trim().length > 0;
  const when = targetLine(target);

  return (
    <section
      className={cls("cx-card", className)}
      data-editing={open ? "" : undefined}
      data-testid="goal-now"
      {...anchorProps(id)}
    >
      <CardHead
        eyebrow="Working toward now"
        icon={Target}
        meta={dirty && !open ? <Chip tone="live">Unsaved</Chip> : null}
        actions={canEdit ? <EditButton open={open} onToggle={toggle} label="Working toward now" /> : null}
      />

      {open ? (
        <div className="gf-edit">
          <TextArea
            label="The goal"
            value={goal}
            onChange={(v) => updateField("smartGoal", v)}
            rows={2}
            placeholder="e.g. Carry both grandkids up the stairs by Thanksgiving"
          />
          <div className="gf-edit">
            <Meta>Is it SMART? Tick what it already has.</Meta>
            <div className="gf-smart" role="group" aria-label="SMART checklist">
              {SMART_KEYS.map((k) => {
                const def = SMART_DEFS[k];
                return (
                  <button
                    key={k}
                    type="button"
                    className="gf-smart-toggle"
                    aria-pressed={checks[k]}
                    onClick={() => toggleCheck(k)}
                  >
                    <span className="gf-smart-letter" aria-hidden="true">
                      {def.letter}
                    </span>
                    <span className="gf-smart-text">
                      <span className="gf-smart-word">{def.word}</span>
                      <span className="gf-smart-line">{def.line}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <TextInput
            label="Target date"
            type="date"
            value={target}
            onChange={setTarget}
            hint="A date ticks Time-bound."
          />
          <Meta>Nothing is saved until you tap Save changes on the bar at the bottom.</Meta>
        </div>
      ) : hasGoal ? (
        <>
          <Lede>{goal}</Lede>
          <div className="gf-smart-row">
            <span className="gf-squares" role="img" aria-label={smartLabel(checks)}>
              {SMART_KEYS.map((k) => (
                <span key={k} className="gf-square" data-on={checks[k] ? "" : undefined} aria-hidden="true">
                  {SMART_DEFS[k].letter}
                </span>
              ))}
            </span>
            <Meta>{smartSentence(checks)}</Meta>
          </div>
          {when ? (
            <FactList>
              <Fact label="Target">{when}</Fact>
            </FactList>
          ) : null}
          {canEdit ? (
            achieving ? (
              <div className="gf-inline">
                <TextInput
                  label="Reward (optional)"
                  value={reward}
                  maxLength={200}
                  placeholder="e.g. Kaizen pin, shout-out on the board"
                  onChange={setReward}
                />
                <div className="gf-buttons gf-buttons--end">
                  <Btn variant="quiet" onClick={() => setAchieving(false)}>
                    Cancel
                  </Btn>
                  <Btn variant="solid" icon={Trophy} onClick={confirmAchieved}>
                    Goal achieved
                  </Btn>
                </div>
                <Meta>Moves this goal to Reached and clears it for the next one. Save the record to keep it.</Meta>
              </div>
            ) : (
              <div className="gf-buttons">
                <Btn icon={Trophy} onClick={() => setAchieving(true)}>
                  Mark achieved
                </Btn>
              </div>
            )
          ) : null}
        </>
      ) : (
        <EmptyLine action={canEdit ? { label: "Set a goal", onClick: () => setOpen(true) } : undefined}>
          {`Nothing set yet. What ${agree(p, "is", "are")} ${p.subject} working toward now?`}
        </EmptyLine>
      )}
    </section>
  );
}
