/**
 * HER JOURNEY AND HER CASE, on the client opened inside Operations.
 *
 * The redesign's Operations room, phase 4 (Sep 28 2026; research-operations
 * §6.3, "the case pane"): her state and why, the proof, what we know, the
 * next step with its owner and when it becomes the leader's, and the outcome.
 * Worked out by the pure rules (states.ts, case.ts) from what Operations
 * already holds, and read from the stored case when a leader opened one
 * (case-store.ts, wave 2).
 *
 * THE CASE FORM (wave 3, Sep 29 2026; CaseForm.tsx): a leader opens a case
 * and changes its owner, next step, due day, outcome and reason; the owner
 * changes their own four; everyone else reads. A trainer who owns a case
 * can't read the studio's collection (the rules), so when that read failed
 * and the person isn't a leader, the one document is read here
 * (`useClientCase`) and her case worked out again from it.
 *
 * What a leader CAN also do here writes what the attendance watch always
 * wrote (studios/{s}/watchlist): Snooze ("remind me again"), Dismiss ("I
 * know why they're out"), and Back on the watch (the disposition deleted).
 */
import { useMemo, useState } from "react";
import type { Client, Trainer } from "../../../types";
import { studioDateKey } from "../../../lib/studio-time";
import { leadsHere } from "../../relay/leads";
import { chipText, situationSentence } from "../../renewals/sentences";
import type { RenewalSnapshot } from "../../renewals/types";
import { renewalOf } from "../../renewals/auto-renew";
import { AdminBadge, AdminButton } from "../primitives";
import { SnoozeChooser } from "../overview/pieces";
import { clearWatch, writeWatch } from "../attention/useAttention";
import { dismissal, snooze } from "../attention/attention";
import { caseOf } from "./case";
import { caseRights, ownerChoices } from "./case-form";
import { useClientCase } from "./case-store";
import { CaseForm } from "./CaseForm";
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
  inactive: "neutral",
  away: "neutral",
  back: "ok",
  unknown: "neutral",
};

const dayWords = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
};

/** A stamp's studio day in words, or null when there is no readable stamp. */
const stampWords = (at: Date | null, tz?: string): string | null => {
  const key = at ? studioDateKey(at, tz) : null;
  return key ? dayWords(key) : null;
};

export interface JourneyCaseProps {
  entry: JourneyEntry;
  studioId: string;
  today: string;
  /** The signed-in person: Auth uid and name (what the watchlist and a case are signed with). */
  me: { id: string; name: string };
  /** The studio's timezone, for the day a stored case was last changed. */
  tz?: string;
  /** Who works here (the owner choices) and who is asking (the rights). Without them the case is read-only. */
  trainers?: readonly Trainer[];
  authTrainer?: Trainer | null;
  /** The studio's cases couldn't be read (a non-leader): the one document is read here instead. */
  casesFailed?: boolean;
}

export function JourneyCase({ entry, studioId, today, me, tz, trainers = [], authTrainer = null, casesFailed = false }: JourneyCaseProps) {
  const { journey: j } = entry;
  const leads = leadsHere(authTrainer, studioId);
  // The owner's read, only when the leaders' read was refused.
  const own = useClientCase(studioId, entry.id, casesFailed && !leads && Boolean(authTrainer));
  const stored = entry.storedCase ?? own.stored;
  const c = useMemo(
    () =>
      own.stored && !entry.storedCase
        ? caseOf(j, { trainer: entry.usual, inToday: entry.usualInToday }, today, { stored: own.stored, updatedOn: own.stored.updatedAt ? studioDateKey(own.stored.updatedAt, tz) : null })
        : entry.case,
    [own.stored, entry.storedCase, entry.case, entry.usual, entry.usualInToday, j, today, tz],
  );
  const rights = caseRights({ leads, uid: me.id || null, stored });
  const choices = useMemo(() => ownerChoices(trainers, studioId, stored?.owner ?? null), [trainers, studioId, stored?.owner]);
  // Her renewal with the auto-renewal mark and the lock applied now (renewals/auto-renew.ts).
  const snapshot: RenewalSnapshot | null = renewalOf(entry.client);
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
      {stored && (
        <p className="ops-quiet">
          Case opened{stampWords(stored.openedAt, tz) ? ` on ${stampWords(stored.openedAt, tz)}` : ""}
          {stampWords(stored.updatedAt, tz) ? `, last changed ${stampWords(stored.updatedAt, tz)}` : ""}.
        </p>
      )}
      {casesFailed && !leads && own.failed && <p className="ops-quiet">Her stored case couldn't be read on this iPad, so the case above is worked out by the rules.</p>}
      {authTrainer && !own.loading && (
        <CaseForm studioId={studioId} clientId={entry.id} clientName={entry.row.name.display} stored={stored} view={c} rights={rights} choices={choices} />
      )}
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
