/**
 * OPERATIONS → MONTH — the screen: a month's renewals, birthdays and
 * anniversaries, and the studio's MIA list as of today.
 *
 * AJ, Sep 29 2026: "what do I need to worry about today, this week and
 * this month." Today is the brief, Week is the week; this is the month.
 * Any month can be opened (‹ › and This month); the four lists are worked
 * out by `month.ts` from what Operations already reads — nothing per
 * client, nothing written:
 *
 *   the roster              the app's client list (renewal snapshots, the
 *                           date of birth, the first day)
 *   the conversations       ONE chunked read of the cycles for the month's
 *                           renewals (`useCyclesRead`, at most a few dozen
 *                           keys), so "nobody has talked to them" is said
 *                           only when it was read
 *   the Journey             `useStudioJourneys`, the same listener pair
 *                           Today and Week use, for the MIA list
 *
 * A row opens the client inside Operations. Every list says what it can't
 * say: renewals whose timing is unknown are counted, a guessed anniversary
 * says it is a guess and where to set the real day, and nothing is MIA
 * until the Journey is ready.
 */
import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import type { Client, Studio, Trainer } from "../../../types";
import type { RenewalSnapshot } from "../../renewals/types";
import { useCyclesRead } from "../../renewals/usePipeline";
import { AdminBadge, AdminButton, AdminHeader, AdminNotice, AdminScreen } from "../primitives";
import { BottomLineBox, BriefEmpty, BriefSection } from "../overview/brief-pieces";
import { useStudioJourneys } from "../journey/useStudioJourneys";
import { useMinuteClock } from "../shell/useMinuteClock";
import {
  byDay,
  dayWords,
  monthAnniversaries,
  monthBirthdays,
  monthLabel,
  monthMia,
  monthOf,
  monthRenewals,
  monthSentence,
  shiftMonth,
  type MonthRow,
  type MonthTone,
} from "./month";
import "../shell/ops.css";

export interface MonthPageProps {
  studio: Studio;
  studios: Studio[];
  clients: Client[];
  trainers: Trainer[];
  authTrainer: Trainer;
  onOpenClient?: (clientId: string) => void;
}

const TONE_BADGE: Record<MonthTone, "alert" | "warn" | "neutral"> = { alert: "alert", warn: "warn", info: "neutral" };

/** How far the arrows go, either way: a year is enough to plan and to look back. */
export const MONTH_REACH = 12;

export function MonthPage({ studio, studios, clients, trainers, authTrainer, onOpenClient }: MonthPageProps) {
  const now = useMinuteClock();
  const j = useStudioJourneys({ studio, studios, clients, trainers, authTrainer, now });
  const thisMonth = monthOf(j.today);
  const [month, setMonth] = useState(thisMonth);
  const cutover = studio.journeyCutoverDate ?? null;

  // The cycles for this month's renewals only: the keys of the snapshots
  // whose package ends in the month.
  const cycleKeys = useMemo(
    () =>
      clients
        .map((c) => c.renewal as RenewalSnapshot | undefined)
        .filter((s): s is RenewalSnapshot => !!s && !!s.cycleKey && !!s.focusDate && monthOf(s.focusDate) === month)
        .map((s) => s.cycleKey as string),
    [clients, month],
  );
  const cyclesRead = useCyclesRead(studio.id ?? null, cycleKeys);

  const renewals = useMemo(
    () => monthRenewals(clients, month, cyclesRead.cycles, j.settings, j.today, !cyclesRead.loading && !cyclesRead.failed),
    [clients, month, cyclesRead.cycles, cyclesRead.loading, cyclesRead.failed, j.settings, j.today],
  );
  const birthdays = useMemo(() => monthBirthdays(clients, month), [clients, month]);
  const anniversaries = useMemo(() => monthAnniversaries(clients, month, cutover, j.tz), [clients, month, cutover, j.tz]);
  const mia = useMemo(() => (j.ready ? monthMia(j.entries, j.today, month) : null), [j.ready, j.entries, j.today, month]);

  const sentence = monthSentence({ month, today: j.today, renewals, birthdays, anniversaries, mia });
  const past = month < thisMonth;
  const canBack = shiftMonth(thisMonth, -MONTH_REACH) < month;
  const canForward = month < shiftMonth(thisMonth, MONTH_REACH);

  return (
    <AdminScreen>
      <AdminHeader
        icon={<CalendarDays className="w-5 h-5" />}
        title="The month"
        subtitle={`${studio.name}: the renewals, birthdays and anniversaries of any month, and who is MIA today.`}
      />

      <div className="ops-month-nav" role="group" aria-label="Which month">
        <AdminButton variant="quiet" aria-label="Previous month" disabled={!canBack} onClick={() => setMonth((m) => shiftMonth(m, -1))}>
          <ChevronLeft className="w-4 h-4" aria-hidden="true" />
        </AdminButton>
        <h2 className="ops-month-nav__label" aria-live="polite">
          {monthLabel(month)}
          {month === thisMonth ? <span className="ops-month-nav__now"> · this month</span> : null}
        </h2>
        <AdminButton variant="quiet" aria-label="Next month" disabled={!canForward} onClick={() => setMonth((m) => shiftMonth(m, 1))}>
          <ChevronRight className="w-4 h-4" aria-hidden="true" />
        </AdminButton>
        {month !== thisMonth && (
          <AdminButton variant="ghost" onClick={() => setMonth(thisMonth)}>
            This month
          </AdminButton>
        )}
      </div>

      <BottomLineBox
        sentence={sentence}
        rules={[
          "A renewal is placed in the month its package effectively ends (the pipeline's own date); a client whose renewal timing is unknown is counted, never dropped.",
          "Birthdays come from the date of birth on the record; anniversaries from the first day a person set on Account, else the earliest day Mindbody proves — and then they are called a guess.",
          "MIA is the Journey's one rule (Drifting · At risk · Lapsed), as of today whichever month is open. Nothing is said until the Journey is ready.",
          "Written by rules each time the page reads. Nothing here is sent to anyone.",
        ]}
      />

      {j.nightly.stale && (
        <AdminNotice tone="warn">
          {j.nightly.lastChangedAt
            ? "The nightly record has stopped changing, so the MIA list can't be judged from it: every client reads Unknown until it runs again."
            : "There is no nightly record for this studio yet, so nobody can be judged MIA."}
        </AdminNotice>
      )}

      <BriefSection
        id="month-renewals"
        title="Renewals"
        count={renewals.rows.length}
        sub={
          [
            `packages ending in ${monthLabel(month).split(" ")[0]}`,
            renewals.unknown > 0 ? `${renewals.unknown} ${renewals.unknown === 1 ? "client's" : "clients'"} timing unknown` : null,
            renewals.notTalked === null
              ? cyclesRead.loading
                ? "reading the conversations…"
                : "the conversations couldn't be read"
              : renewals.notTalked > 0
                ? `${renewals.notTalked} nobody has talked to yet`
                : null,
          ]
            .filter(Boolean)
            .join(" · ")
        }
      >
        <MonthList rows={renewals.rows} onOpenClient={onOpenClient} empty={`No package ends in ${monthLabel(month)}.`} />
      </BriefSection>

      <BriefSection id="month-birthdays" title="Birthdays" count={birthdays.rows.length} sub={birthdays.noDate > 0 ? `${birthdays.noDate} ${birthdays.noDate === 1 ? "client has" : "clients have"} no date of birth on file` : "from the date of birth on file"}>
        <MonthList rows={birthdays.rows} onOpenClient={onOpenClient} empty={`No birthdays on file in ${monthLabel(month).split(" ")[0]}.`} />
      </BriefSection>

      <BriefSection
        id="month-anniversaries"
        title="Anniversaries"
        count={anniversaries.rows.length}
        sub={
          [
            "whole years with the studio",
            anniversaries.guessed > 0 ? `${anniversaries.guessed} ${anniversaries.guessed === 1 ? "is a guess" : "are guesses"} — set the first day on Account` : null,
            anniversaries.noDate > 0 ? `${anniversaries.noDate} with no first day to count from` : null,
          ]
            .filter(Boolean)
            .join(" · ")
        }
      >
        <MonthList rows={anniversaries.rows} onOpenClient={onOpenClient} empty={`No anniversaries fall in ${monthLabel(month).split(" ")[0]}.`} />
      </BriefSection>

      <BriefSection
        id="month-mia"
        title="MIA"
        count={mia ? mia.rows.length : null}
        hot
        sub={
          mia
            ? [
                `as of today${past ? ", not the month shown" : ""}`,
                `${mia.counts.drifting} drifting · ${mia.counts["at-risk"]} at risk · ${mia.counts.lapsed} lapsed`,
                mia.unknown > 0 ? `${mia.unknown} can't be judged yet` : null,
                // The inactive round (Oct 1 2026): not MIA, so counted beside it; the list is Clients → Journey → Inactive.
                `${mia.wentInactive} went inactive in ${monthLabel(month).split(" ")[0]} and ${mia.wentInactive === 1 ? "is" : "are"} still inactive (Clients → Journey → Inactive)`,
              ]
                .filter(Boolean)
                .join(" · ")
            : "reading the Journey…"
        }
      >
        {!mia ? (
          <BriefEmpty>Reading the Journey…</BriefEmpty>
        ) : mia.rows.length === 0 ? (
          <BriefEmpty>Nobody is drifting, at risk or lapsed today{mia.unknown > 0 ? `, among the clients the Journey can judge` : ""}.</BriefEmpty>
        ) : (
          <MonthList rows={mia.rows} onOpenClient={onOpenClient} empty="" grouped={false} />
        )}
      </BriefSection>
    </AdminScreen>
  );
}

/** A month's list: rows grouped by day (a heading per day), or one flat list. */
function MonthList({ rows, onOpenClient, empty, grouped = true }: { rows: MonthRow[]; onOpenClient?: (id: string) => void; empty: string; grouped?: boolean }) {
  if (rows.length === 0) return empty ? <BriefEmpty>{empty}</BriefEmpty> : null;
  const groups = grouped ? byDay(rows) : [{ day: "", rows }];
  return (
    <div>
      {groups.map((g) => (
        <div key={g.day || "all"} className="ops-jr-group">
          {g.day && <h3 className="ops-jr-group__h">{dayWords(g.day)}</h3>}
          <ul className="ops-jr-list">
            {g.rows.map((r) => (
              <li key={r.key}>
                <button type="button" className="ops-jr-row" onClick={() => onOpenClient?.(r.clientId)} disabled={!onOpenClient}>
                  <span className="ops-month-row__head">
                    <span className="ops-jr-row__name">{r.name}</span>
                    <AdminBadge tone={TONE_BADGE[r.tone]}>{r.badge}</AdminBadge>
                  </span>
                  <span className="ops-jr-row__why">{r.sentence}</span>
                  {r.proof && <span className="ops-jr-row__meta">{r.proof}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
