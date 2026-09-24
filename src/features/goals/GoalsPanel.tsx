/**
 * THE GOALS PANEL — the top of the Goals section on the client record.
 *
 *   1. THE ORIGINAL WHY   (`globalNotes`) — the anchor. What brought them in,
 *      in their words. Everything below is measured against it.
 *   2. CURRENT GOAL       (`smartGoal`) — what they are working toward now,
 *      with a five-toggle SMART checklist and a target date. The badge says
 *      "SMART goal" only when all five are ticked, otherwise "Raw goal · n
 *      of 5", so a coach can see at a glance whether an ambition has been
 *      turned into something checkable.
 *   3. MARK ACHIEVED      — pushes the goal (and an optional reward) onto
 *      `goalHistory` and clears the current goal, ready for the next one.
 *   4. ACHIEVED GOALS     — the history, newest first.
 *
 * Everything is a field edit through the dossier's `updateField`, so the
 * sticky Save bar writes it with the rest of the record (only changed
 * fields). Nothing here writes to Firestore on its own.
 *
 * The dossier's form state is initialised from a fixed field list that
 * predates these fields, so every read falls back to the client document
 * when the form has no value of its own.
 */
import { useState } from "react";
import { Award, CalendarDays, Target, Trophy } from "lucide-react";
import type { Client, Trainer } from "../../types";
import {
  SMART_DEFS,
  SMART_KEYS,
  buildAchievedGoal,
  formatDayKey,
  isDayKey,
  normalizeSmartChecks,
  pushGoalHistory,
  readGoalHistory,
  sameSmartChecks,
  smartBadge,
  targetDateLabel,
  type SmartKey,
} from "./goals";
import "./goals.css";

export interface GoalsPanelProps {
  client: Client;
  formData: Partial<Client>;
  updateField: (key: keyof Client, value: any) => void;
  authTrainer?: Trainer | null;
  /**
   * Element ids for the two cards a door may land on (client codex, Sep
   * 2026: the Save bar's "Show" and the Overview's doors). Each also gets
   * `data-cx-anchor`, which clears the sticky sub-toggle. Left out, no ids.
   */
  anchors?: { why?: string; now?: string };
}

const anchorOf = (id: string | undefined) => (id ? { id, "data-cx-anchor": id } : {});

const fmtAchieved = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

export function GoalsPanel({ client, formData, updateField, authTrainer = null, anchors }: GoalsPanelProps) {
  /** The form's value when it has one, else what is on the record. */
  function current<K extends keyof Client>(key: K): Client[K] {
    const v = formData[key];
    return (v !== undefined ? v : client[key]) as Client[K];
  }

  const why = (current("globalNotes") as string) || "";
  const goal = (current("smartGoal") as string) || "";
  const checks = normalizeSmartChecks(current("smartChecks"));
  const rawTarget = current("goalTargetDate");
  const target = isDayKey(rawTarget) ? rawTarget : "";
  const history = readGoalHistory(current("goalHistory"));
  const badge = smartBadge(checks);

  const [achieving, setAchieving] = useState(false);
  const [reward, setReward] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);

  /**
   * Write the checklist. When the result matches what is already on the
   * record, hand back the record's own value so the Save bar does not count
   * a toggle-and-untoggle as an edit.
   */
  const writeChecks = (next: typeof checks) => {
    const onRecord = normalizeSmartChecks(client.smartChecks);
    updateField("smartChecks", sameSmartChecks(next, onRecord) ? client.smartChecks : next);
  };

  const toggle = (k: SmartKey) => writeChecks({ ...checks, [k]: !checks[k] });

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
    setHistoryOpen(true);
  };

  const shownHistory = historyOpen ? history : history.slice(0, 3);

  return (
    <div className="gf-goals" data-testid="goals-panel">
      {/* 1 · the anchor */}
      <section className="gf-card gf-anchor" {...anchorOf(anchors?.why)}>
        <label htmlFor="gf-why" className="gf-kicker">
          The original why
        </label>
        <p className="gf-muted mt-0.5 mb-2 text-[12px]">
          What actually brought them in. In their words, not yours.
        </p>
        <textarea
          id="gf-why"
          className="gf-input"
          rows={3}
          value={why}
          placeholder="e.g. “I want to be able to garden again without my back giving out.”"
          onChange={(e) => updateField("globalNotes", e.target.value)}
        />
      </section>

      {/* 2 · the current goal */}
      <section className="gf-card" {...anchorOf(anchors?.now)}>
        <div className="gf-goal-head">
          <label htmlFor="gf-goal" className="gf-kicker inline-flex items-center gap-1.5">
            <Target className="h-3.5 w-3.5" aria-hidden /> Working toward now
          </label>
          {goal.trim() ? (
            <span
              className={`gf-pill ${badge.smart ? "gf-pill--ok" : ""}`}
              data-testid="smart-badge"
            >
              {badge.smart && <Award className="h-3 w-3" aria-hidden />}
              {badge.label}
            </span>
          ) : null}
        </div>
        <textarea
          id="gf-goal"
          className="gf-input mt-2"
          rows={2}
          value={goal}
          placeholder="e.g. Carry both grandkids up the stairs by Thanksgiving"
          onChange={(e) => updateField("smartGoal", e.target.value)}
        />

        <p className="gf-kicker mt-4 mb-2">Is it SMART? Tick what it already has.</p>
        <div className="gf-smart" role="group" aria-label="SMART checklist">
          {SMART_KEYS.map((k) => {
            const def = SMART_DEFS[k];
            return (
              <button
                key={k}
                type="button"
                className="gf-smart-toggle"
                aria-pressed={checks[k]}
                onClick={() => toggle(k)}
              >
                <span className="gf-smart-letter" aria-hidden>
                  {def.letter}
                </span>
                <span className="min-w-0">
                  <span className="gf-smart-word">{def.word}</span>
                  <span className="gf-smart-line">{def.line}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="flex min-w-[200px] flex-col gap-1">
            <label htmlFor="gf-target" className="gf-kicker inline-flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" aria-hidden /> Target date
            </label>
            <input
              id="gf-target"
              type="date"
              className="gf-input"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          </div>
          {target ? (
            <span className="gf-pill gf-pill--live mb-3">
              {formatDayKey(target)} · {targetDateLabel(target)}
            </span>
          ) : null}
        </div>

        {goal.trim() ? (
          achieving ? (
            <div className="gf-inline mt-4">
              <label htmlFor="gf-reward" className="gf-kicker">
                Reward (optional)
              </label>
              <input
                id="gf-reward"
                className="gf-input"
                value={reward}
                maxLength={200}
                placeholder="e.g. Kaizen pin, shout-out on the board"
                onChange={(e) => setReward(e.target.value)}
              />
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" className="gf-btn gf-btn--quiet" onClick={() => setAchieving(false)}>
                  Cancel
                </button>
                <button type="button" className="gf-btn gf-btn--ok" onClick={confirmAchieved}>
                  <Trophy className="h-3.5 w-3.5" aria-hidden /> Goal achieved
                </button>
              </div>
              <p className="gf-muted text-[11px]">
                Moves this goal to the history below and clears it for the next one. Save the
                record to keep it.
              </p>
            </div>
          ) : (
            <div className="mt-4 flex justify-end">
              <button type="button" className="gf-btn gf-btn--ok" onClick={() => setAchieving(true)}>
                <Trophy className="h-3.5 w-3.5" aria-hidden /> Mark achieved
              </button>
            </div>
          )
        ) : null}
      </section>

      {/* 4 · the history */}
      {history.length > 0 ? (
        <section className="gf-card" data-testid="goal-history">
          <p className="gf-kicker mb-2">
            Achieved goals · {history.length}
          </p>
          <ul className="gf-history">
            {shownHistory.map((g, i) => (
              <li key={`${g.achievedAt}-${i}`}>
                <p className="text-[14px] font-semibold">{g.goal}</p>
                <p className="gf-muted mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px]">
                  <span>Achieved {fmtAchieved(g.achievedAt)}</span>
                  {g.targetDate ? <span>Target was {formatDayKey(g.targetDate)}</span> : null}
                  {g.byName ? <span>Marked by {g.byName}</span> : null}
                </p>
                {g.reward ? (
                  <span className="gf-pill gf-pill--ok mt-1">
                    <Award className="h-3 w-3" aria-hidden /> {g.reward}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
          {history.length > 3 ? (
            <button
              type="button"
              className="gf-btn gf-btn--quiet mt-1"
              onClick={() => setHistoryOpen((v) => !v)}
            >
              {historyOpen ? "Show fewer" : `See all ${history.length}`}
            </button>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
