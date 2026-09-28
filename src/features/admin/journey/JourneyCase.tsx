/**
 * HER JOURNEY AND HER CASE, on the client opened inside Operations.
 *
 * The redesign's Operations room, phase 4 (Sep 28 2026; research-operations
 * §6.3, "the case pane"): her state and why, the proof, what we know, the
 * next step with its owner and when it becomes the leader's, and the outcome.
 * Worked out by the pure rules (states.ts, case.ts) from what Operations
 * already holds; nothing about the case is stored (the case fields wait for
 * AJ's OK), so it offers no "Take it" or "Hand to…".
 *
 * What a leader CAN do here writes what the attendance watch always wrote
 * (studios/{s}/watchlist): Snooze ("remind me again"), Dismiss ("I know why
 * they're out"), and Back on the watch (the disposition deleted).
 */
import { useState } from "react";
import type { Client } from "../../../types";
import { chipText, situationSentence } from "../../renewals/sentences";
import type { RenewalSnapshot } from "../../renewals/types";
import { AdminBadge, AdminButton } from "../primitives";
import { SnoozeChooser } from "../overview/pieces";
import { clearWatch, writeWatch } from "../attention/useAttention";
import { dismissal, snooze } from "../attention/attention";
import type { JourneyEntry } from "./journey-list";
import { STATE_NAMES, type JourneyState } from "./states";
import "../shell/ops.css";

export const STATE_TONE: Record<JourneyState, "ok" | "warn" | "neutral" | "live" | "alert"> = {
  new: "live",
  settling: "live",
  steady: "ok",
  drifting: "warn",
  "at-risk": "warn",
  lapsed: "neutral",
  away: "neutral",
  back: "ok",
  unknown: "neutral",
};

const dayWords = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
};

export function JourneyCase({ entry, studioId, today, me }: { entry: JourneyEntry; studioId: string; today: string; me: { id: string; name: string } }) {
  const { journey: j, case: c } = entry;
  const snapshot = (entry.client.renewal as RenewalSnapshot | undefined) ?? null;
  const [snoozing, setSnoozing] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
    } catch {
      /* the toast has already said so */
    } finally {
      setBusy(false);
    }
  };
  const known = [
    snapshot ? `Renewal: ${situationSentence(snapshot, today)}.` : `${chipText(null, today)}.`,
    ...(snapshot?.flags ?? []).map((f) => f.text),
    entry.watch === "snoozed" && entry.watchEntry?.snoozedUntil ? `Snoozed until ${dayWords(entry.watchEntry.snoozedUntil)}.` : null,
    entry.watch === "dismissed" && entry.watchEntry ? `Dismissed${entry.watchEntry.dismissedByName ? ` by ${entry.watchEntry.dismissedByName}` : ""}${entry.watchEntry.dismissedAt ? ` on ${dayWords(entry.watchEntry.dismissedAt)}` : ""}: someone knows why she's out.` : null,
  ].filter((t): t is string => Boolean(t));

  return (
    <section className="ops-case" aria-label={`${entry.row.name.display}'s journey`}>
      <header className="ops-case__h">
        <h2 className="ops-case__t">Her journey</h2>
        <AdminBadge tone={STATE_TONE[j.state]}>{STATE_NAMES[j.state]}</AdminBadge>
        {!j.judged && j.state !== "unknown" && <span className="ops-quiet">Too new to judge her rhythm</span>}
      </header>
      <dl className="ops-case__body">
        <div className="ops-case__b">
          <dt className="ops-case__lab">Why</dt>
          <dd className="ops-line">{j.why}</dd>
        </div>
        <div className="ops-case__b">
          <dt className="ops-case__lab">Proof</dt>
          <dd className="ops-quiet">{j.proof}</dd>
          {j.rhythmWhy && <dd className="ops-quiet">No usual gap yet: {j.rhythmWhy}.</dd>}
        </div>
        <div className="ops-case__b">
          <dt className="ops-case__lab">What we know</dt>
          {known.map((k) => (
            <dd key={k} className="ops-quiet">
              {k}
            </dd>
          ))}
        </div>
        <div className="ops-case__b">
          <dt className="ops-case__lab">Next step</dt>
          <dd className="ops-line">
            <b>Owner: {c.owner.name}</b>
            {c.owner.usual ? " · her usual trainer" : " · no usual trainer on record"}
            {entry.usualInToday ? ` · in today, ${entry.usualInToday}` : ""}
          </dd>
          <dd className="ops-line">{c.nextStep}</dd>
          {c.open && c.dueDay && !c.leaders && <dd className="ops-quiet">If nobody has caught her by {dayWords(c.dueDay)}, it's the leader's.</dd>}
        </div>
        {(c.open || c.outcome) && (
          <div className="ops-case__b">
            <dt className="ops-case__lab">Outcome</dt>
            <dd className="ops-quiet">{c.outcomeWords}</dd>
          </div>
        )}
      </dl>
      {(c.open || entry.watch !== "watching") && (
        <div className="ops-case__acts">
          {entry.watch === "watching" ? (
            <>
              <AdminButton size="sm" busy={busy} aria-expanded={snoozing} onClick={() => setSnoozing((v) => !v)}>
                Snooze
              </AdminButton>
              <AdminButton size="sm" variant="ghost" busy={busy} onClick={() => void run(() => writeWatch(studioId, dismissal(entry.id, entry.client as Client, me, today)))}>
                Dismiss: I know why she's out
              </AdminButton>
            </>
          ) : (
            <AdminButton size="sm" busy={busy} onClick={() => void run(() => clearWatch(studioId, entry.id))}>
              Back on the watch
            </AdminButton>
          )}
        </div>
      )}
      {snoozing && (
        <SnoozeChooser
          today={today}
          onPick={(day) =>
            void run(async () => {
              await writeWatch(studioId, snooze(entry.id, day));
              setSnoozing(false);
            })
          }
          onCancel={() => setSnoozing(false)}
        />
      )}
    </section>
  );
}
