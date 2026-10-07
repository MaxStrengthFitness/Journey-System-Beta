/**
 * AHEAD — one client, opened from a row: the two clocks drawn large, the
 * dates Ahead adds (the talk and its range, the run-out day and its range,
 * the next visit, the next line), and then the renewals dashboard's own row
 * (features/renewals/RenewalRow.tsx), plan picker included, so a client is
 * never said two ways. Open client goes to the client's page inside
 * Operations, with the journey and the case.
 *
 * Upright it is a sheet from the bottom, so closing it keeps your place;
 * where the page is wide it is a pane beside the list, so a leader walks down
 * the weeks without going back and forth.
 */

import { X } from "lucide-react";
import type { Trainer } from "../../../types";
import { Sheet, SheetContent, SheetTitle } from "../../../components/ui/sheet";
import { AdminBadge, AdminButton } from "../primitives";
import { RenewalRow, RenewalRowList } from "../../renewals/RenewalRow";
import { conversationDueRange, nextStep } from "../../renewals/pipeline";
import { situationWord } from "../../renewals/row-facts";
import { dayLabel, SITUATION_TONE } from "../../renewals/sentences";
import type { RenewalCycle, RenewalSettings } from "../../renewals/types";
import { STATE_NAMES } from "../journey/states";
import { at, clockMarks, type Axis } from "./clocks-geometry";
import { KIND_GROUP, KIND_TONE, type AheadClient } from "./events";
import { ClockBar, KindBadge } from "./marks";

const TONE_BADGE = { ok: "ok", warn: "warn", alert: "alert", neutral: "neutral" } as const;

export interface AheadPeekProps {
  c: AheadClient;
  today: string;
  until: string;
  axis: Axis;
  bookingsSeenTo: string;
  studioId: string;
  settings: RenewalSettings;
  cycle: RenewalCycle | null;
  cyclesLoading: boolean;
  cyclesFailed: boolean;
  trainerNames: ReadonlyMap<string, string>;
  canPlan: boolean;
  authTrainer: Trainer;
  onOpenClient?: (clientId: string) => void;
  onClose: () => void;
}

export function AheadPeekBody(p: AheadPeekProps) {
  const { c, today, until, axis, settings } = p;
  const s = c.snapshot;
  const trainer = c.trainerId ? p.trainerNames.get(c.trainerId) || null : null;
  const lead = c.events.find((e) => KIND_GROUP[e.kind] !== "moment") ?? null;
  const marks = clockMarks(c, axis, today);
  const talk = c.events.find((e) => e.kind === "talk" || e.kind === "talk-now") ?? null;
  const talkRange = s ? conversationDueRange(s, settings, today) : null;
  const slip = c.events.find((e) => e.kind === "may-slip") ?? null;
  const next = c.journey?.nextBooking ?? s?.nextBookingDate ?? null;
  const label = (pos: number) => ({ left: `${Math.max(9, Math.min(91, pos))}%` });

  return (
    <div className="ops-ah-peek">
      <div className="ops-ah-peek__h">
        <div className="ops-ah-peek__who">
          <h2 className="ops-ah-peek__name">{c.name}</h2>
          <div className="ops-ah-peek__meta">
            {trainer && <span>{trainer}</span>}
            {c.journey && <span>{STATE_NAMES[c.journey.state]}</span>}
            {c.onTrial && <span className="ops-ah-tag">{s?.packageLabel?.split(" · ")[0] ?? "Trial"}</span>}
          </div>
        </div>
        <AdminButton variant="quiet" iconOnly aria-label="Close" onClick={p.onClose}>
          <X className="w-4 h-4" aria-hidden />
        </AdminButton>
      </div>

      {lead ? (
        <div className={`ops-ah-peek__lead${KIND_TONE[lead.kind] === "caution" ? " ops-ah-peek__lead--caution" : ""}`}>
          <KindBadge kind={lead.kind} />
          <span>
            {lead.now ? "" : `${dayLabel(lead.day, today)} · `}
            {lead.sentence}
          </span>
        </div>
      ) : (
        !c.cantPlace && <div className="ops-ah-peek__lead">Nothing to decide before {dayLabel(until, today)}.</div>
      )}

      {!c.cantPlace && s && (
        <div className="ops-ah-peek__chart" aria-hidden="true">
          <span className="ops-ah-peek__lab ops-ah-peek__lab--top ops-ah-peek__lab--today" style={label(marks.today)}>
            Today
          </span>
          {marks.end !== null && marks.endWord && (
            <span className="ops-ah-peek__lab ops-ah-peek__lab--top" style={label(marks.end)}>
              {marks.endWord} {dayLabel(s.commitmentEnd ?? s.chargeDate, today)}
            </span>
          )}
          {talk && !talk.now && (
            <span className="ops-ah-peek__lab ops-ah-peek__lab--bottom" style={label(at(talk.day, axis))}>
              Talk ~{dayLabel(talk.day, today)}
            </span>
          )}
          <div className="ops-ah-peek__track">
            <ClockBar marks={marks} today={today} />
          </div>
        </div>
      )}

      <dl className="ops-ah-peek__facts">
        {c.cantPlace && (
          <>
            <dt>Can't place</dt>
            <dd>{c.cantPlace}</dd>
          </>
        )}
        {talk && (
          <>
            <dt>Talk</dt>
            <dd>
              {talk.now ? `Now · ${s?.sessionsLeft ?? "?"} left` : `Around ${dayLabel(talk.day, today)}`}
              {!talk.now && talkRange && talkRange.earliest !== talkRange.latest && (
                <span className="ops-ah-peek__sub">
                  {dayLabel(talkRange.earliest, today)} – {dayLabel(talkRange.latest, today)}, when {settings.conversationAtSessionsLeft} are left
                </span>
              )}
            </dd>
          </>
        )}
        {s?.runOutDate && s.pacePerWeek !== null && s.situation !== "away" && (
          <>
            <dt>Runs out</dt>
            <dd>
              Around {dayLabel(s.runOutDate, today)}
              {s.runOutRange && (
                <span className="ops-ah-peek__sub">
                  {dayLabel(s.runOutRange.earliest, today)} – {dayLabel(s.runOutRange.latest, today)}, at the slowest and fastest 4 weeks
                </span>
              )}
            </dd>
          </>
        )}
        {c.noPace && (
          <>
            <dt>Pace</dt>
            <dd>Not enough to project yet: fewer than 21 days of visits.</dd>
          </>
        )}
        <dt>Next here</dt>
        <dd>
          {next ? dayLabel(next, today) : s?.situation === "away" ? "Away" : "Nothing booked"}
          <span className="ops-ah-peek__sub">
            {next ? "The next chance to talk on the floor" : `As far as Journey can see, to ${dayLabel(p.bookingsSeenTo, today)}`}
          </span>
        </dd>
        {c.journey && (
          <>
            <dt>Journey</dt>
            <dd>
              {STATE_NAMES[c.journey.state]}
              {c.journey.since ? ` since ${dayLabel(c.journey.since, today)}` : ""}
              {slip && <span className="ops-ah-peek__sub">{slip.sentence}</span>}
            </dd>
          </>
        )}
      </dl>

      {s && !c.cantPlace && (
        <RenewalRowList label={`${c.name}'s renewal`}>
          <RenewalRow
            studioId={p.studioId}
            clientId={c.id}
            name={c.name}
            snapshot={s}
            cycle={p.cycle}
            cyclesFailed={p.cyclesFailed}
            cyclesLoading={p.cyclesLoading}
            settings={settings}
            today={today}
            trainerName={trainer}
            nextStep={nextStep(s, p.cycle, settings, today)}
            badges={<AdminBadge tone={TONE_BADGE[SITUATION_TONE[s.situation]]}>{situationWord(s.situation)}</AdminBadge>}
            canPlan={p.canPlan}
            authorName={p.authTrainer.fullName?.trim() || "Someone at the studio"}
          />
        </RenewalRowList>
      )}

      {p.onOpenClient && (
        <div className="ops-ah-peek__actions">
          <AdminButton variant="quiet" onClick={() => p.onOpenClient?.(c.id)}>
            Open client
          </AdminButton>
        </div>
      )}
    </div>
  );
}

/** The pane beside the list, where the page is wide: the client picked, or a word on what opens here. */
export function AheadPane({ peek }: { peek: AheadPeekProps | null }) {
  return (
    <aside className="ops-ah-pane" aria-label="Client">
      {peek ? (
        <AheadPeekBody {...peek} />
      ) : (
        <div className="ops-ah-pane__empty">
          <span className="ops-ah-pane__empty-t">Pick a client</span>
          <span>Their two clocks, the next visit, who last talked and the plan open here.</span>
        </div>
      )}
    </aside>
  );
}

/** The sheet from the bottom, upright: closing it keeps the list where it was. */
export function AheadSheet({ peek }: { peek: AheadPeekProps }) {
  return (
    <Sheet
      open
      onOpenChange={(next) => {
        if (!next) peek.onClose();
      }}
    >
      <SheetContent side="bottom" showCloseButton={false} className="ops-ah-sheet gap-0 p-0">
        <SheetTitle className="sr-only">{peek.c.name}</SheetTitle>
        <AheadPeekBody {...peek} />
      </SheetContent>
    </Sheet>
  );
}
