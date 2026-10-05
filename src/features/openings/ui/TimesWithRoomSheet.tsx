import { useMemo, useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "../../../components/ui/sheet";
import { offerable } from "../marks";
import { timesWithRoom } from "../next-days";
import { offers, type Offer } from "../offer";
import {
  CHECKING_COMING,
  COMING_CANT_CHECK,
  DONE,
  MOST_WEEKS,
  NEXT_7_DAYS,
  NO_OFFERS,
  NO_TIMES_NEXT_7,
  OFFER_FOOT,
  TIMES_WITH_ROOM,
  WRAP_UP_CANT_CHECK,
  WRAP_UP_CANT_TELL,
  WRAP_UP_LOOKING,
  YOU_NO_TIMES_NEXT_7,
  builtLine,
  chips,
  noOffersWithSentence,
  rotationLines,
  timesWithRoomByDay,
} from "../present";
import { clockLabel, weekdayPlural } from "../rows";
import { isStale } from "../summary-doc";
import { useComingWeeks, useNextSevenDays } from "./useNextSevenDays";
import type { OpeningsData } from "./useOpeningsData";

/**
 * TIMES WITH ROOM — the Wrap-up's sheet (Openings round, Sep 27 2026, phase 8).
 *
 * AJ: "if a client is like, Hey, I need to schedule for next week, what
 * times do you have available? ... not necessarily who has what, when, but
 * when are the times that are open". The trainer walking the client out opens
 * it from the Wrap-up's Next card. It opens ON TOP of the Wrap-up, a sheet
 * from the foot like the packages sheet, and never leaves it, so the Profile
 * note and any unfinished note are never lost.
 *
 * TIMES ONLY. It is turned to face the client, so it names nobody: no client,
 * no trainer ("Anyone" widens it to every trainer, with no names), and never
 * why a time is free (a regular out, a cancellation). "This week only" is the
 * one hint, and it is the core's (`timesWithRoomByDay`).
 *
 *   Next 7 days   `timesWithRoom` over this week's bookings, grouped by day
 *                 (`timesWithRoomByDay`): only the server's answer is one.
 *   Most weeks    `offers`, A new regular time's list after its checks
 *                 against agreed regulars and the coming weeks, as times.
 *                 NOTHING IS OFFERED UNTIL THE MARKS ARE READ (ui/README.md):
 *                 a time a colleague marked Always full is never offered, and
 *                 the core can only leave out a mark it is given. So offline,
 *                 where the proposal hoped to show Most weeks from the saved
 *                 summary, it says it can't tell, as Openings does.
 *   Rotation      one line per weekday with a Rotation time: the whole day
 *                 when every time that day with a word reads Rotation, its
 *                 rotation times otherwise (present.ts `rotationLines`), so
 *                 the sheet never offers a Monday time and says Mondays run
 *                 on the rotation in the same view.
 *   The foot      OFFER_FOOT, always.
 *
 * ONE LINE, NOT TWO THE SAME. When both parts would say the same thing (both
 * looking, both failed, both unknown offline, or both empty for the whole
 * studio) the sheet says it once (`wholeLine`). "No usual times with room
 * right now" is said only when that is true of the WHOLE studio: a part
 * emptied only by "With you" says so and points to Anyone, whatever the
 * other part says.
 *
 * WHOSE TIMES. It opens on the trainer running the Wrap-up ("With you") when
 * they have an agreed week here; "Anyone" widens it. Not remembered: every
 * Wrap-up opens on the trainer again. The toggle filters this sheet and
 * unmounts nothing, so it needs no leave question.
 *
 * THE READS. The summary, the standing weeks and the marks arrive in `data`
 * (`useOpeningsData`, which the Wrap-up already holds to decide its door).
 * The bookings are read only while the sheet is open: the next 7 days
 * (`useNextSevenDays`, with no "booked again from" read, which names
 * clients), and the coming weeks (`useComingWeeks`, only when the month was
 * read in full today). Nothing waits for them, so the sheet never slows the
 * Wrap-up (floor-loop rank 2). It is an ordinary import, not a lazy one
 * (lazy-screens.test.ts), and it imports no stylesheet: it sits in the
 * session's chunk, drawn with the Wrap-up's own tokens.
 *
 * It books nothing, holds nothing, asks Mindbody nothing and pings nobody.
 */

/**
 * WHETHER THE WRAP-UP SHOWS THE DOOR AT ALL: the studio's summary lists at
 * least one time with room (it reads, or is marked, Usually has room, and is
 * not marked Always full: marks.ts `offerable`), or at least one agreed
 * standing week of someone who works here exists. Before either, no door, so
 * the first weeks after launch never open an empty sheet. A studio whose
 * bookings aren't linked has nothing to offer.
 */
export function hasTimesToOffer(data: Pick<OpeningsData, "connected" | "weeks" | "worksHere" | "usual" | "marks">): boolean {
  if (!data.connected) return false;
  if (data.weeks.docs.some((d) => d.final && d.trainerId && data.worksHere(d.trainerId))) return true;
  const usual = data.usual;
  if (!usual) return false;
  for (const [key, u] of usual.times) if (offerable(u.word, data.marks.byTime.get(key))) return true;
  for (const [key, mark] of data.marks.byTime) if (offerable(usual.times.get(key)?.word, mark)) return true;
  return false;
}

/* ------------------------------------------------------------------ */

type Part<T> =
  | { kind: "looking" }
  | { kind: "cant-check" }
  | { kind: "cant-tell" }
  | { kind: "checking" }
  /**
   * `narrowed`: empty only because "With you" narrowed it while Anyone has
   * times (its sentence points to Anyone). Two empty parts become the one
   * studio-wide NO_OFFERS line only when neither was narrowed.
   */
  | { kind: "empty"; sentence: string; narrowed: boolean }
  | { kind: "list"; items: T; note: string | null; built: string | null };

/**
 * One line for the whole sheet, in place of its two parts, when both parts
 * would say the same thing: both still looking, both failed, both unknown
 * offline, or both empty for the WHOLE studio. Anything else, the parts
 * answer under their own headings.
 */
function wholeLine(parts: readonly Part<unknown>[]): string | null {
  if (parts.every((p) => p.kind === "looking")) return WRAP_UP_LOOKING;
  if (parts.every((p) => p.kind === "cant-check")) return WRAP_UP_CANT_CHECK;
  if (parts.every((p) => p.kind === "cant-tell")) return WRAP_UP_CANT_TELL;
  if (parts.every((p) => p.kind === "empty" && !p.narrowed)) return NO_OFFERS;
  return null;
}

interface TimeGroup {
  key: string;
  label: string;
  times: string[];
  /** The whole group as one sentence, for VoiceOver. */
  sentence: string;
}

/** Most weeks' times, by weekday: "Tuesdays: 10:30 AM · 11:00 AM". */
function byWeekday(list: readonly Offer[]): TimeGroup[] {
  const groups = new Map<number, Offer[]>();
  for (const o of list) {
    if (!groups.has(o.weekday)) groups.set(o.weekday, []);
    groups.get(o.weekday)!.push(o);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([weekday, os]) => {
      const label = weekdayPlural(weekday);
      const times = [...os].sort((a, b) => a.row - b.row).map((o) => clockLabel(o.row));
      return { key: String(weekday), label, times, sentence: `${label}: ${times.join(" · ")}` };
    });
}

export interface TimesWithRoomSheetProps {
  open: boolean;
  onClose: () => void;
  /** Openings' reads for the studio the iPad is in (`useOpeningsData`), held by the Wrap-up. */
  data: OpeningsData;
}

export function TimesWithRoomSheet({ open, onClose, data }: TimesWithRoomSheetProps) {
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="max-h-[88dvh] gap-0 p-0 bg-bg-dark-2 text-ink-d1 border-div-d rounded-t-2xl"
        data-testid="times-with-room"
      >
        {open ? <SheetBody data={data} onClose={onClose} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function SheetBody({ data, onClose }: { data: OpeningsData; onClose: () => void }) {
  const week = useNextSevenDays(data, { bookedAgain: false });
  const monthRead = week.monthRead;
  const coming = useComingWeeks(data, monthRead === true);

  // With you, when the trainer running the Wrap-up has an agreed week here.
  const own =
    data.viewer.trainerId && data.team.some((r) => r.trainerId === data.viewer.trainerId && r.doc?.final) ? data.viewer.trainerId : null;
  const [anyone, setAnyone] = useState(false);
  const forTrainer = anyone ? null : own;
  const choices = useMemo(() => (own ? chips([], data.names, data.viewer) : []), [own, data.names, data.viewer]);

  const next = useMemo<Part<ReturnType<typeof timesWithRoomByDay>>>(() => {
    if (!data.connected) return { kind: "cant-check" };
    if (week.read === "offline") return { kind: "cant-tell" };
    if (week.read === "failed" || data.weeks.error) return { kind: "cant-check" };
    if (week.read === "loading" || data.weeks.loading) return { kind: "looking" };
    const days = timesWithRoomByDay(timesWithRoom(week.input, forTrainer, week.next.lines), data.tz);
    if (days.length > 0) return { kind: "list", items: days, note: null, built: null };
    const anyoneHas = forTrainer !== null && timesWithRoom(week.input, null, week.next.lines).length > 0;
    return { kind: "empty", sentence: anyoneHas ? YOU_NO_TIMES_NEXT_7 : NO_TIMES_NEXT_7, narrowed: anyoneHas };
  }, [data.connected, data.weeks.error, data.weeks.loading, data.tz, week.read, week.input, week.next.lines, forTrainer]);

  const most = useMemo<Part<TimeGroup[]>>(() => {
    if (!data.connected) return { kind: "cant-check" };
    if (data.weeks.loading || data.summary.state === "loading" || data.marks.read === "loading") return { kind: "looking" };
    if (data.summary.state === "none") return { kind: "empty", sentence: NO_OFFERS, narrowed: false };
    if (data.summary.state === "unreadable" || !data.usual) return { kind: "cant-check" };
    // A mark can take a time off the list, so nothing is offered off marks not yet read.
    if (data.marks.read === "offline") return { kind: "cant-tell" };
    if (data.weeks.error || data.marks.read !== "ready") return { kind: "cant-check" };
    const usual = data.usual;
    const offersFor = (trainerId: string | null) =>
      offers({
        today: data.today,
        now: data.now,
        tz: data.tz,
        usual: usual.times,
        marks: data.marks.byTime,
        docs: data.weeks.docs,
        trainers: data.refs,
        worksHere: data.worksHere,
        forTrainer: trainerId,
        thisWeek: { read: week.read, bookings: week.input.bookings },
        // While the sync lease is still coming, the coming weeks are "checking", not "can't check".
        coming: monthRead === null ? null : coming,
        monthRead: monthRead !== false,
      });
    const list = offersFor(forTrainer);
    if (list.length === 0) {
      const narrowed = forTrainer !== null && offersFor(null).length > 0;
      return { kind: "empty", sentence: narrowed && forTrainer ? noOffersWithSentence(forTrainer, data.names, data.viewer) : NO_OFFERS, narrowed };
    }
    if (list.every((o) => o.coming.state === "checking")) return { kind: "checking" };
    const summary = data.summary.state === "ok" ? data.summary.summary : null;
    return {
      kind: "list",
      items: byWeekday(list),
      note: list.some((o) => o.coming.state === "cant-check") ? COMING_CANT_CHECK : null,
      built: summary && isStale(summary, data.now) ? builtLine(summary, data.tz) : null,
    };
  }, [data, week.read, week.input.bookings, monthRead, coming, forTrainer]);

  const rotation = useMemo(() => (data.connected && data.usual ? rotationLines(data.usual.times) : []), [data.connected, data.usual]);

  const whole = wholeLine([next, most]);

  // The Wrap-up's own column (max-w-205), so the sheet lines up with the
  // screen it opens over, in landscape as in portrait.
  return (
    <div className="mx-auto w-full max-w-205 flex flex-col min-h-0 max-h-[88dvh]">
      <header className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-div-d">
        <div className="flex flex-col gap-1 min-w-0">
          <SheetTitle className="text-[17px] font-extrabold leading-tight text-ink-d1 break-words">{TIMES_WITH_ROOM}</SheetTitle>
          <SheetDescription className="text-[12px] text-ink-d3 break-words">{data.studioName}</SheetDescription>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 min-w-11 px-4 rounded-xl border border-input bg-(--raised) shadow-(--raised-lift) active:translate-y-px active:shadow-(--press) transition-transform text-[14px] font-bold text-ink-d1 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--eq-focus-ring)"
        >
          {DONE}
        </button>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-5">
        {choices.length > 1 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Whose times">
            {choices.map((c) => {
              const pressed = c.trainerId === null ? forTrainer === null : forTrainer === c.trainerId;
              return (
                <button
                  key={c.trainerId ?? "anyone"}
                  type="button"
                  aria-pressed={pressed}
                  onClick={() => setAnyone(c.trainerId === null)}
                  className={`min-h-10 px-4 rounded-full border text-[14px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--eq-focus-ring) ${
                    pressed ? "border-(--eq-live) bg-(--eq-live-fill) text-(--eq-live-text)" : "border-input bg-bg-dark-3 text-ink-d1"
                  }`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        )}

        {whole ? (
          <p className="text-[14px] text-ink-d2" data-testid="times-whole" role="status">
            {whole}
          </p>
        ) : (
          <>
            <TimesPart title={NEXT_7_DAYS} testId="times-next" part={next} groups={(days) => days.map((d) => ({ key: d.dateKey, label: d.label, times: d.times.map((t) => t.said), sentence: d.sentence }))} />
            <TimesPart title={MOST_WEEKS} testId="times-most" part={most} groups={(g) => g} />
          </>
        )}

        {rotation.length > 0 && (
          <div className="flex flex-col gap-1" data-testid="times-rotation">
            {rotation.map((r) => (
              <p key={r.weekday} className="text-[14px] text-ink-d2">
                {r.sentence}
              </p>
            ))}
          </div>
        )}

        <p className="text-[12px] text-ink-d2" data-testid="times-foot">
          {OFFER_FOOT}
        </p>
      </div>
    </div>
  );
}

function TimesPart<T>({ title, testId, part, groups }: { title: string; testId: string; part: Part<T>; groups: (items: T) => TimeGroup[] }) {
  const line =
    part.kind === "looking"
      ? WRAP_UP_LOOKING
      : part.kind === "cant-check"
        ? WRAP_UP_CANT_CHECK
        : part.kind === "cant-tell"
          ? WRAP_UP_CANT_TELL
          : part.kind === "checking"
            ? CHECKING_COMING
            : part.kind === "empty"
              ? part.sentence
              : null;
  return (
    <section className="flex flex-col gap-2" data-testid={testId}>
      <h3 className="text-[17px] font-bold text-ink-d1 break-words">{title}</h3>
      {line && <p className="text-[14px] text-ink-d2">{line}</p>}
      {part.kind === "list" && (
        <>
          {part.built && <p className="text-[12px] text-ink-d3">{part.built}</p>}
          <ul className="flex flex-col gap-3">
            {groups(part.items).map((g) => (
              <li key={g.key} className="flex flex-col gap-1.5" aria-label={g.sentence}>
                <span className="text-[14px] font-bold text-ink-d1 break-words">{g.label}</span>
                <span className="flex flex-wrap gap-1.5">
                  {/* A time is a label, not a control: no border, no pill, so only the Whose-times buttons read as tappable (the final review). */}
                  {g.times.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center px-2.5 py-1 rounded-md bg-bg-dark-3 text-[14px] font-semibold text-ink-d1"
                      data-testid="time-chip"
                    >
                      {t}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
          {part.note && <p className="text-[12px] text-ink-d3">{part.note}</p>}
        </>
      )}
    </section>
  );
}
