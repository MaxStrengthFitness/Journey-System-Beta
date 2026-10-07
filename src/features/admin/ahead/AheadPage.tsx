/**
 * OPERATIONS → AHEAD — everything past this week on one scroll (Oct 7 2026).
 *
 * AJ: Operations shows when a week is all clear, but a leader can't see
 * past it. Ahead sits beside Month ("1b") and answers two questions with one
 * switch:
 *
 *   Weeks     what needs me, and when: every client's dates on the week they
 *             land, the empty stretches folded into one All clear line
 *   Clients   where everyone stands: each client's two clocks on one line
 *
 * The dates come from the rules that already say them (events.ts), counted
 * from the day Mindbody counted with their ranges ("2a"), and the next
 * Journey line if nothing is booked ("3a"). It reads what Operations already
 * reads (useAhead.ts), writes nothing of its own (the plan picker on the
 * client's panel is the renewals dashboard's), asks Mindbody nothing and
 * contacts nobody.
 *
 * The calm round's rules hold: one line of counts with its rules behind the
 * (i), the nightly record's note said once, nothing called clear while the
 * record can't judge, a row is one sentence with its proof on its (i).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ChartNoAxesGantt } from "lucide-react";
import type { Client, Studio, Trainer } from "../../../types";
import type { RosterStatus } from "../../../hooks/useStudioRoster";
import { forgetOnSignOut } from "../../sign-out/memory";
import { useScrollerPad } from "../../client-profile/use-scroller-pad";
import { canSetRenewalPlan } from "../../renewals/permissions";
import { BOOKING_LOOKAHEAD_DAYS } from "../../renewals/projection";
import { addDays } from "../../client-history/model";
import { AdminButton, AdminHeader, AdminNotice, AdminScreen, AdminSelect } from "../primitives";
import { CountsLine, PageNote } from "../overview/brief-pieces";
import { useAhead } from "./useAhead";
import { eventsOf } from "./events";
import { axisOf } from "./clocks-geometry";
import { aheadLenses, clientGroups, clientInLens, eventInLens, headlineCounts, runOf, stripOf, weeksOf, type AheadLens } from "./weeks";
import { WeekRun } from "./WeekRun";
import { ClientClocks } from "./ClientClocks";
import { AheadPane, AheadSheet, type AheadPeekProps } from "./AheadPeek";
import "../shell/ops.css";
import "./ahead.css";

export interface AheadPageProps {
  studio: Studio;
  studios: Studio[];
  clients: Client[];
  rosterStatus?: RosterStatus;
  trainers: Trainer[];
  authTrainer: Trainer;
  onOpenClient?: (clientId: string) => void;
}

type AheadView = "weeks" | "clients";

/** Where a leader was on Ahead, until they sign out: the view, the lens and the trainer. */
let remembered: { view: AheadView; lens: AheadLens; trainer: string } = { view: "weeks", lens: "all", trainer: "" };
forgetOnSignOut(() => {
  remembered = { view: "weeks", lens: "all", trainer: "" };
});

/** The page is wide enough for the client's panel beside the list (an iPad on its side, a desk). */
export const PANE_MIN_WIDTH = 860;

export function AheadPage({ studio, studios, clients, rosterStatus, trainers, authTrainer, onOpenClient }: AheadPageProps) {
  const a = useAhead({ studio, studios, clients, rosterStatus, trainers, authTrainer });
  const j = a.journeys;
  const today = j.today;
  const studioId = studio.id as string;
  const [view, setView] = useState<AheadView>(remembered.view);
  const [lens, setLens] = useState<AheadLens>(remembered.lens);
  const [trainer, setTrainer] = useState<string>(remembered.trainer);
  const [picked, setPicked] = useState<string | null>(null);
  const [cantOpen, setCantOpen] = useState(false);
  useEffect(() => {
    remembered = { view, lens, trainer };
  }, [view, lens, trainer]);

  const rootRef = useRef<HTMLDivElement | null>(null);
  useScrollerPad(rootRef);
  const pane = usePaneWidth(rootRef);

  const lenses = useMemo(() => aheadLenses(a.trialLabel), [a.trialLabel]);
  const activeLens = lenses.some((l) => l.id === lens) ? lens : "all";
  const trainerChoices = useMemo(() => {
    const ids = new Set(a.clients.map((c) => c.trainerId).filter((id): id is string => Boolean(id)));
    return Array.from(ids)
      .map((id) => ({ id, name: a.trainerNames.get(id) || "" }))
      .filter((t) => t.name)
      .sort((x, y) => x.name.localeCompare(y.name));
  }, [a.clients, a.trainerNames]);
  // A trainer remembered from another studio, or no longer anyone's primary
  // trainer here, is Everyone: a filter nobody can see must never empty the page.
  const activeTrainer = trainer && trainerChoices.some((t) => t.id === trainer) ? trainer : "";
  const byTrainer = useMemo(() => a.clients.filter((c) => !activeTrainer || c.trainerId === activeTrainer), [a.clients, activeTrainer]);
  const clientsById = useMemo(() => new Map(a.clients.map((c) => [c.id, c])), [a.clients]);
  const events = useMemo(
    () => eventsOf(byTrainer).filter((e) => eventInLens(e, clientsById.get(e.clientId), activeLens)),
    [byTrainer, clientsById, activeLens],
  );
  const weeks = useMemo(() => weeksOf(events, a.span), [events, a.span]);
  const run = useMemo(() => runOf(weeks), [weeks]);
  const strip = useMemo(() => stripOf(weeks), [weeks]);
  const groups = useMemo(() => clientGroups(byTrainer.filter((c) => clientInLens(c, activeLens))), [byTrainer, activeLens]);
  const counts = useMemo(() => headlineCounts(a.clients, a.span), [a.clients, a.span]);
  const cant = useMemo(() => a.clients.filter((c) => c.cantPlace !== null), [a.clients]);
  const miaToday = j.ready ? a.clients.filter((c) => c.slipping && (!activeTrainer || c.trainerId === activeTrainer)).length : null;
  const axis = useMemo(() => axisOf(a.span), [a.span]);
  const bookingsSeenTo = addDays(today, BOOKING_LOOKAHEAD_DAYS);
  const pickedClient = picked ? clientsById.get(picked) ?? null : null;
  const canPlan = j.ready && !j.settingsFailed && canSetRenewalPlan(authTrainer, studioId);
  const n = (v: number) => (a.ready && !a.rosterUnknown ? v : null);

  const peekProps: AheadPeekProps | null = pickedClient
    ? {
        c: pickedClient,
        today,
        until: a.span.until,
        axis,
        bookingsSeenTo,
        studioId,
        settings: j.settings,
        cycle: pickedClient.snapshot?.cycleKey ? a.cycles[pickedClient.snapshot.cycleKey] ?? null : null,
        cyclesLoading: a.cyclesLoading,
        cyclesFailed: a.cyclesFailed,
        trainerNames: a.trainerNames,
        canPlan,
        authTrainer,
        onOpenClient,
        onClose: () => setPicked(null),
      }
    : null;

  return (
    <AdminScreen>
      <div className="ops-ah" ref={rootRef}>
        <AdminHeader icon={<ChartNoAxesGantt className="w-5 h-5" />} title="Ahead" subtitle={`${weekRange(a.span.first, a.span.until, today)}`} />

        <CountsLine
          pending={a.ready ? null : "Reading the studio's clients…"}
          items={[
            { n: n(counts.talks), label: counts.talks === 1 ? "talk due" : "talks due" },
            { n: n(counts.charges), label: "banked at a charge" },
            { n: n(counts.runsOut), label: counts.runsOut === 1 ? "runs out early" : "run out early" },
            { n: j.ready ? n(counts.maySlip) : null, label: "may slip" },
            { n: n(counts.moments), label: counts.moments === 1 ? "moment" : "moments" },
          ]}
          rules={[
            "The next 8 weeks, a client counted once for each.",
            `A talk is due when the sessions left reach the studio's number (${j.settings.conversationAtSessionsLeft}), at the client's own pace, counted from the day Mindbody counted them; it says "around" and its range, from the slowest and fastest 4 weeks.`,
            `Banked at a charge: the contract auto-renews with ${j.settings.chargeWarnMinBanked} or more sessions still on hand; Before the charge opens ${j.settings.chargeWarnDays} days ahead.`,
            "Runs out early: the sessions run out two weeks or more before the commitment ends.",
            `May slip: the day a client crosses the Journey's next line if nothing is booked, said only as far as Journey can see bookings (${BOOKING_LOOKAHEAD_DAYS} days).`,
            "Moments are Month's birthdays and anniversaries, Not confirmed kept. The studio's own clients only; an inactive client keeps only their moments.",
            "Nothing here is sent to anyone.",
          ]}
        />

        {a.note && <PageNote text={a.note.text} why={a.note.why} />}
        {j.settingsFailed && <AdminNotice tone="warn">The studio's renewal settings couldn't be read just now, so the talk and the charge use Max Strength's numbers.</AdminNotice>}
        {j.marks.failed && <AdminNotice tone="warn">The leaders' inactive marks couldn't be read just now, so a client marked inactive may still show their dates.</AdminNotice>}
        {a.cyclesFailed && <AdminNotice tone="warn">Who last talked, and the plans, couldn't be read just now: those rows say less until they are.</AdminNotice>}

        {a.ready && cant.length > 0 && (
          <div className="ops-ah-cant">
            <div className="ops-ah-cant__line">
              <span>
                {cant.length} {cant.length === 1 ? "client" : "clients"} can't be placed yet
              </span>
              <AdminButton variant="ghost" aria-expanded={cantOpen} onClick={() => setCantOpen((v) => !v)}>
                {cantOpen ? "Hide" : "Show"}
              </AdminButton>
            </div>
            {cantOpen && (
              <ul className="ops-ah-cant__list">
                {cant.map((c) => (
                  <li key={c.id} className="ops-ah-cant__item">
                    {onOpenClient ? (
                      <AdminButton variant="ghost" onClick={() => onOpenClient(c.id)}>
                        {c.name}
                      </AdminButton>
                    ) : (
                      <b>{c.name}</b>
                    )}
                    <span>{c.cantPlace}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="ops-ah__controls">
          <div className="ops-seg" role="group" aria-label="View">
            <button type="button" aria-pressed={view === "weeks"} onClick={() => setView("weeks")}>
              Weeks
            </button>
            <button type="button" aria-pressed={view === "clients"} onClick={() => setView("clients")}>
              Clients
            </button>
          </div>
          {trainerChoices.length > 1 && (
            <AdminSelect className="ops-ah__trainer" aria-label="Trainer" value={activeTrainer} onChange={(e) => setTrainer(e.target.value)}>
              <option value="">Everyone</option>
              {trainerChoices.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </AdminSelect>
          )}
        </div>
        <div className="ops-seg ops-ah-lenses" role="group" aria-label="Lens">
          {lenses.map((l) => (
            <button key={l.id} type="button" aria-pressed={activeLens === l.id} onClick={() => setLens(l.id)}>
              {l.label}
            </button>
          ))}
        </div>

        <div className={`ops-ah__frame${pane ? " ops-ah__frame--pane" : ""}`}>
          <div className="ops-ah__main">
            {!a.ready ? null : view === "weeks" ? (
              <WeekRun
                run={run}
                strip={strip}
                today={today}
                clientsById={clientsById}
                trainerNames={a.trainerNames}
                picked={picked}
                onPick={setPicked}
                covered={a.covered}
                miaToday={activeLens === "all" ? miaToday : null}
                filtered={Boolean(activeTrainer)}
              />
            ) : (
              <ClientClocks
                groups={groups}
                axis={axis}
                today={today}
                bookingsSeenTo={bookingsSeenTo}
                trainerNames={a.trainerNames}
                picked={picked}
                onPick={setPicked}
                until={a.span.until}
              />
            )}
          </div>
          {pane && <AheadPane peek={peekProps} />}
        </div>
        {!pane && peekProps && <AheadSheet peek={peekProps} />}
      </div>
    </AdminScreen>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Oct 5, 2026 – Apr 4, 2027": the weeks drawn. */
function weekRange(first: string, until: string, today: string): string {
  const words = (d: string) => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`;
  const sameYear = first.slice(0, 4) === until.slice(0, 4) && first.slice(0, 4) === today.slice(0, 4);
  return sameYear ? `${words(first)} – ${words(until)}` : `${words(first)}, ${first.slice(0, 4)} – ${words(until)}, ${until.slice(0, 4)}`;
}

/** Whether the page is wide enough for the client's panel beside the list. */
function usePaneWidth(ref: React.RefObject<HTMLDivElement | null>): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = () => setWide(el.clientWidth >= PANE_MIN_WIDTH);
    apply();
    if (typeof ResizeObserver !== "function") return;
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return wide;
}
