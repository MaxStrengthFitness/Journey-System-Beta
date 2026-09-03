import { memo, useMemo, useState } from "react";
import { buildDayPlan, studioMinutes } from "./selectors";
import { toneClass } from "./trainer-tone";
import { TrainerAvatar } from "./TrainerAvatar";
import type { CalendarSession, DayLane, TrainerRef } from "./types";

/**
 * DAY — horizontal trainer swimlanes.
 *
 * The old Day view was vertical trainer columns against a time axis running
 * down the page. That is exactly what the Hub already is, so opening it told
 * you nothing new and cost a long scroll to see a whole day.
 *
 * Turned on its side it becomes a different instrument. One row per trainer,
 * sessions laid along a shared left-to-right time axis: the day's whole shape
 * fits on one screen, and the thing a manager is actually looking for — who is
 * loaded, who has a two-hour hole at 11 — is visible without reading a single
 * client name.
 *
 * Names are still one tap away. A 30-minute booking is one slot wide and no
 * name fits there at any sane axis width, so rather than truncating everything
 * to "Ma…", tapping a lane expands a row of that trainer's sessions in full
 * underneath. Progressive disclosure instead of illegible text.
 */

const SLOT_MIN = 30;

function formatHour(hour: number): string {
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}${hour >= 12 ? "p" : "a"}`;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

const SessionBlock = memo(function SessionBlock({
  session,
  startHour,
  onSelectClient,
}: {
  session: CalendarSession;
  startHour: number;
  onSelectClient?: (clientId: string) => void;
}) {
  const startMin = studioMinutes(session.start);
  const offsetSlots = Math.max(0, Math.round((startMin - startHour * 60) / SLOT_MIN));
  // Every booking occupies at least one slot: a zero- or ten-minute row in the
  // data must still be visible, not collapse to a hairline.
  const spanSlots = Math.max(1, Math.round(session.durationMin / SLOT_MIN));

  const clickable = Boolean(session.clientId && onSelectClient && !session.isUnavailability);

  return (
    <button
      type="button"
      className={`cal-block ${session.isUnavailability ? "cal-block--unavail" : ""}`}
      style={{ gridColumn: `${offsetSlots + 1} / span ${spanSlots}` }}
      onClick={() => {
        if (clickable && session.clientId) onSelectClient!(session.clientId);
      }}
      disabled={!clickable}
      title={`${session.clientName} · ${formatTime(session.start)} · ${session.trainerName}`}
      aria-label={`${session.clientName} at ${formatTime(session.start)} with ${session.trainerName}`}
    >
      <span className="cal-block__name">{session.clientName}</span>
      {spanSlots > 1 && <span className="cal-block__time">{formatTime(session.start)}</span>}
    </button>
  );
});

const Lane = memo(function Lane({
  lane,
  startHour,
  slots,
  expanded,
  onToggle,
  onSelectClient,
}: {
  lane: DayLane;
  startHour: number;
  slots: number;
  expanded: boolean;
  onToggle: (trainerId: string) => void;
  onSelectClient?: (clientId: string) => void;
}) {
  return (
    <div className={`cal-lane-group ${toneClass(lane.trainer.tone)}`}>
      <div className="cal-lane" style={{ ["--cal-slots" as string]: slots }}>
        <button
          type="button"
          className="cal-lane__label"
          onClick={() => onToggle(lane.trainer.id)}
          aria-expanded={expanded}
          aria-label={`${lane.trainer.name}, ${lane.count} sessions. Toggle details.`}
        >
          <TrainerAvatar trainer={lane.trainer} size="sm" />
          <span className="cal-lane__name">{lane.trainer.shortName}</span>
          <span className="cal-lane__count">{lane.count}</span>
        </button>

        <div className="cal-lane__grid" />

        {lane.sessions.map((s) => (
          <SessionBlock
            key={s.id}
            session={s}
            startHour={startHour}
            onSelectClient={onSelectClient}
          />
        ))}
      </div>

      {expanded && (
        <div className="cal-lane__detail">
          {lane.sessions.map((s) => (
            <button
              key={`d-${s.id}`}
              type="button"
              className="cal-lane__item"
              onClick={() => {
                if (s.clientId && onSelectClient) onSelectClient(s.clientId);
              }}
              disabled={!s.clientId || !onSelectClient}
            >
              <span>{formatTime(s.start)}</span>
              <b>{s.clientName}</b>
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

export interface DayViewProps {
  date: Date;
  sessions: CalendarSession[];
  trainerRefs: Map<string, TrainerRef>;
  onSelectClient?: (clientId: string) => void;
}

export function DayView({ date, sessions, trainerRefs, onSelectClient }: DayViewProps) {
  const plan = useMemo(
    () => buildDayPlan(date, sessions, trainerRefs),
    [date, sessions, trainerRefs],
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const slots = ((plan.endHour - plan.startHour) * 60) / SLOT_MIN;
  const hours = Array.from({ length: plan.endHour - plan.startHour }, (_, i) => plan.startHour + i);

  const busiest = plan.lanes[0];

  if (plan.lanes.length === 0 && plan.unassigned.length === 0) {
    return (
      <div className="cal-card">
        <div className="cal-empty">
          <span className="cal-empty__title">Nothing booked</span>
          <span className="cal-empty__hint">
            No sessions on this day for the current filter. Try “All trainers”, or step to
            another date.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="cal-dayview">
      <section className="cal-card">
        <div className="cal-daystat">
          <span className="cal-daystat__big">
            <b>{plan.total}</b>
            <span>{plan.total === 1 ? "session" : "sessions"}</span>
          </span>
          <span className="cal-daystat__sep" />
          <span className="cal-daystat__big">
            <b>{plan.lanes.length}</b>
            <span>{plan.lanes.length === 1 ? "trainer" : "trainers"}</span>
          </span>
          {busiest && (
            <>
              <span className="cal-daystat__sep" />
              <span className="cal-card__note">
                Busiest: {busiest.trainer.shortName} ({busiest.count})
              </span>
            </>
          )}
        </div>
      </section>

      <section className="cal-card">
        <header className="cal-card__head">
          <h3 className="cal-card__title">Trainer timeline</h3>
          <span className="cal-card__note">Tap a trainer for names</span>
        </header>

        <div className="cal-lanes__scroller">
          <div className="cal-lanes">
            <div className="cal-lane__axis" style={{ ["--cal-slots" as string]: slots }}>
              <div className="cal-axis__corner">Trainer</div>
              {hours.map((h) => (
                <div key={h} className="cal-axis__tick">
                  {formatHour(h)}
                </div>
              ))}
            </div>

            {plan.lanes.map((lane) => (
              <Lane
                key={lane.trainer.id}
                lane={lane}
                startHour={plan.startHour}
                slots={slots}
                expanded={expandedId === lane.trainer.id}
                onToggle={(id) => setExpandedId((cur) => (cur === id ? null : id))}
                onSelectClient={onSelectClient}
              />
            ))}
          </div>
        </div>
      </section>

      {plan.unassigned.length > 0 && (
        /* Surfaced rather than dropped: a booking whose trainer name Mindbody
           spelled differently is a data problem someone should see, not a
           session that quietly vanishes from the day. */
        <section className="cal-card">
          <header className="cal-card__head">
            <h3 className="cal-card__title">Unassigned</h3>
            <span className="cal-card__note">
              {plan.unassigned.length} booking{plan.unassigned.length === 1 ? "" : "s"} with no
              matching trainer
            </span>
          </header>
          <div className="cal-card__body">
            <div className="cal-lane__detail" style={{ padding: 0, border: 0, background: "none" }}>
              {plan.unassigned.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="cal-lane__item"
                  onClick={() => {
                    if (s.clientId && onSelectClient) onSelectClient(s.clientId);
                  }}
                  disabled={!s.clientId || !onSelectClient}
                >
                  <span>{formatTime(s.start)}</span>
                  <b>{s.clientName}</b>
                  <span>{s.trainerName || "—"}</span>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
