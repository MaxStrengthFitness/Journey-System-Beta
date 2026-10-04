// @vitest-environment jsdom
/**
 * THE HUB CARD, MOUNTED (calm Hub round, Sep 28 2026). It carries over every
 * promise the old card's test held (components/schedule, deleted with it):
 *
 *   - it stays live, with every mark, until the booking is done (AJ, Sep 24:
 *     done means logged), and a finished slot nobody logged says so quietly;
 *   - once it is over it recedes and drops its marks, the triangle included
 *     (AJ, Sep 28: "once the session is done it should make a lot less noise");
 *   - a Critical note that matters on the BOOKING's day is the red triangle,
 *     its words whole in the label — and the edge never turns red;
 *
 * and adds the round's own: the marks come from the Hub's one engine (the
 * same moments the Opportunities list reads), the Pulse flag is a plum glyph,
 * "No waiver signed" is a plum glyph, the clinical dot is gone, the name is
 * the floor name whole, the number shows from #4 and only when it may be
 * quoted, and Mindbody's "Unavailable" is time that isn't a session.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { HubCard } from "./HubCard";
import { bookingMarks, loggedSessions, type BookingMarks, type LoggedSessions } from "../../lib/booking-state";
import { momentsToday, type MomentsTodayInput, type RunSheetEntry } from "../hub-opportunities/moments-today";
import type { Client, WorkoutSession } from "../../types";
import type { JournalEntry } from "../../types/journal";
import type { FordEntry } from "../ford/types";

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const DAY = "2026-09-24";
const FRIDAY = "2026-09-25";
const at = (hm: string, day = DAY) => new Date(`${day}T${hm}:00-04:00`);
const NOW = at("12:00"); // Thursday, noon Eastern

const PRIORITY = "Left shoulder: no overhead press";
const PULSE = "Sleep & Recovery is Red";

const client = {
  id: "c1",
  firstName: "Maria",
  lastName: "Kowalski",
  priorityNote: PRIORITY,
  clinicalNotes: "Hip replacement, 2024",
  subjectiveSnapshot: { flags: [{ severity: "red", label: PULSE }] },
} as unknown as Client;

const booking = (hm: string, day = DAY, over: Record<string, unknown> = {}) => ({
  id: `b-${day}-${hm}`,
  clientId: "c1",
  clientName: "Maria Kowalski",
  trainerId: "t1",
  trainerName: "Sara Kim",
  studioId: "solon",
  startTime: at(hm, day),
  endTime: new Date(at(hm, day).getTime() + 30 * 60_000),
  status: "Scheduled",
  serviceName: "Training Session",
  ...over,
});

const session = (status: WorkoutSession["status"], hm: string) =>
  ({ id: `s-${hm}`, clientId: "c1", status, hostedAtStudioId: "solon", startTime: at(hm), date: DAY }) as WorkoutSession;

const NOTHING_LOGGED = loggedSessions([]);

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function mount({
  hm,
  day = DAY,
  logged = NOTHING_LOGGED,
  marks = null,
  workoutSession = null,
  withClient = true,
  who = client,
  criticalNotes = null,
  sessionNumber = null,
  newToJourney = false,
  usualService = null,
  bookingOver = {},
  ford,
  onOpen = () => {},
}: {
  hm: string;
  day?: string;
  logged?: LoggedSessions | null;
  marks?: BookingMarks | null;
  workoutSession?: WorkoutSession | null;
  withClient?: boolean;
  who?: Client;
  criticalNotes?: readonly JournalEntry[] | null;
  sessionNumber?: number | null;
  newToJourney?: boolean;
  usualService?: string | null;
  bookingOver?: Record<string, unknown>;
  /** The Hub's one FORD read (wave 2 hub), handed to the engine. */
  ford?: (clientId: string) => readonly FordEntry[] | null;
  onOpen?: (id: string, anchor: HTMLElement) => void;
}) {
  // One card at a time: a second mount in a test replaces the first.
  if (root) {
    act(() => root!.unmount());
    host?.remove();
    root = null;
    host = null;
  }
  const b = booking(hm, day, bookingOver);
  const c = withClient ? who : null;
  // The Hub's one engine, asked about the booking's day: the card reads its moments.
  const input: MomentsTodayInput = {
    day,
    today: DAY,
    now: NOW,
    schedules: [b as never],
    clientsById: new Map(c ? [[c.id as string, c]] : []),
    rowsById: new Map(),
    studios: [],
    logged,
    criticalFor: () => criticalNotes,
    fordFor: ford,
    myIds: [],
  };
  const entry = c ? momentsToday(input).find((e) => e.clientId === c.id) ?? null : null;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <StrictMode>
        <HubCard
          booking={b}
          client={c}
          entry={entry}
          sessionNumber={sessionNumber}
          newToJourney={newToJourney}
          usualService={usualService}
          workoutSession={workoutSession}
          logged={logged}
          noShows={marks}
          now={NOW}
          onOpen={onOpen}
        />
      </StrictMode>,
    );
  });
  const card = host.firstElementChild as HTMLElement;
  return {
    card,
    text: card.textContent || "",
    faded: card.dataset.recede === "true",
    flags: {
      priority: !!card.querySelector(`[aria-label="${PRIORITY}"]`),
      pulse: !!card.querySelector(`[aria-label="${PULSE}"]`),
      clinical: !!card.querySelector('[aria-label="Clinical history on file"]'),
    },
    notLogged: (card.textContent || "").includes("Not logged"),
    didntCome: (card.textContent || "").includes("Late cancel"),
    inSession: !!card.querySelector('[aria-label="Session in progress"]'),
    /** The triangle's words, when a Critical note put it there. */
    critical: card.querySelector('.hs-tri[aria-label^="Critical:"]')?.getAttribute("aria-label") ?? null,
  };
}

/** Every mark a live card shows for Maria: the triangle and the plum Pulse glyph. The clinical dot is gone. */
const ALL_FLAGS = { priority: true, pulse: true, clinical: false };
const NO_FLAGS = { priority: false, pulse: false, clinical: false };

describe("the Hub card on the floor", () => {
  it("is live, with every mark, in its slot before the session has started — the trainer is a few minutes late", () => {
    const c = mount({ hm: "11:45" });
    expect(c.faded).toBe(false);
    expect(c.flags).toEqual(ALL_FLAGS);
    expect(c.notLogged).toBe(false);
  });

  it("is live, with every mark, before its start", () => {
    const c = mount({ hm: "15:00" });
    expect(c.faded).toBe(false);
    expect(c.flags).toEqual(ALL_FLAGS);
  });

  it("is in session while a Journey session is open, and keeps its marks", () => {
    const c = mount({ hm: "11:45", workoutSession: session("In-Progress", "11:46") });
    expect(c.inSession).toBe(true);
    expect(c.text).toContain("In session");
    expect(c.faded).toBe(false);
    expect(c.flags).toEqual(ALL_FLAGS);
  });

  it("stays in session past the slot while the session is still open", () => {
    const c = mount({ hm: "10:00", workoutSession: session("In-Progress", "10:01") });
    expect(c.inSession).toBe(true);
    expect(c.faded).toBe(false);
  });

  it("recedes and drops its marks once a session was completed for the client today", () => {
    const logged = loggedSessions([session("Completed", "10:05")]);
    const c = mount({ hm: "10:00", logged });
    expect(c.faded).toBe(true);
    expect(c.flags).toEqual(NO_FLAGS);
    expect(c.notLogged).toBe(false);
    expect(c.card.querySelector('[aria-label="Done"]')).toBeTruthy();
  });

  it("recedes as soon as End Session is pressed, even inside the slot", () => {
    const logged = loggedSessions([session("Completed", "11:55")]);
    const c = mount({ hm: "11:45", logged, workoutSession: session("Completed", "11:55") });
    expect(c.faded).toBe(true);
    expect(c.notLogged).toBe(false);
  });

  it("recedes with a quiet 'Not logged' when the slot is over and nothing was logged", () => {
    const c = mount({ hm: "10:00" });
    expect(c.faded).toBe(true);
    expect(c.flags).toEqual(NO_FLAGS);
    expect(c.notLogged).toBe(true);
  });

  it("reads a leader's 'didn't come' mark as a quiet 'Didn't come', never 'Not logged' (Operations wave 3)", () => {
    const marks = bookingMarks([{ id: "b-marked", noShow: true }]);
    const c = mount({ hm: "10:00", marks, bookingOver: { id: "b-marked" } });
    expect(c.faded).toBe(true);
    expect(c.flags).toEqual(NO_FLAGS);
    expect(c.didntCome).toBe(true);
    expect(c.notLogged).toBe(false);
    const other = mount({ hm: "10:00", marks, bookingOver: { id: "b-other" } });
    expect(other.notLogged).toBe(true);
    expect(other.didntCome).toBe(false);
  });

  it("says nothing when the sessions could not be read: receded, never 'Not logged'", () => {
    const c = mount({ hm: "10:00", logged: null });
    expect(c.faded).toBe(true);
    expect(c.notLogged).toBe(false);
  });

  it("keeps a slot in progress live while the sessions are still loading", () => {
    const c = mount({ hm: "11:45", logged: null });
    expect(c.faded).toBe(false);
    expect(c.flags).toEqual(ALL_FLAGS);
  });

  it("booked twice: the later card keeps its marks until it starts, though the morning session was logged", () => {
    const logged = loggedSessions([session("Completed", "09:05")]);
    const c = mount({ hm: "15:00", logged });
    expect(c.faded).toBe(false);
    expect(c.flags).toEqual(ALL_FLAGS);
  });

  it("a card with no profile never says 'Not logged': the cloud mark already says why, and it opens nothing", () => {
    const onOpen = vi.fn();
    const c = mount({ hm: "10:00", withClient: false, onOpen });
    expect(c.notLogged).toBe(false);
    expect(c.card.querySelector('[aria-label="Not synced to a Max Strength profile yet"]')).toBeTruthy();
    expect(c.text).toContain("Not synced yet");
    expect(c.card.getAttribute("role")).toBeNull();
    act(() => c.card.click());
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("a 'Not logged' card still opens: its client is where the session can be logged", () => {
    const onOpen = vi.fn();
    const c = mount({ hm: "10:00", onOpen });
    act(() => c.card.click());
    expect(onOpen).toHaveBeenCalledWith("c1", c.card);
  });
});

describe("the card's words and marks come from the Hub's one engine", () => {
  it("the Pulse flag is a plum glyph with its words, and the clinical dot has left the card", () => {
    const c = mount({ hm: "15:00" });
    expect(c.card.querySelector(`.hs-g[aria-label="${PULSE}"]`)?.getAttribute("data-family")).toBe("watch");
    expect(c.flags.clinical).toBe(false);
  });

  it("'No waiver signed' is a plum glyph, only for a definite 'not signed'", () => {
    const unsigned = { id: "c1", firstName: "Estella", lastName: "Bolger", isLiabilityReleased: false } as unknown as Client;
    const c = mount({ hm: "15:00", who: unsigned });
    expect(c.card.querySelector('.hs-g[aria-label="No waiver signed"]')?.getAttribute("data-family")).toBe("watch");
    const unknown = { id: "c1", firstName: "Estella", lastName: "Bolger" } as unknown as Client;
    expect(mount({ hm: "15:00", who: unknown }).card.querySelector('[aria-label="No waiver signed"]')).toBeNull();
  });

  it("names the client by her floor name, whole", () => {
    const judy = { id: "c1", firstName: "Judith", nickname: "Judy", lastName: "Sackville-Baggins" } as unknown as Client;
    expect(mount({ hm: "15:00", who: judy }).card.querySelector(".hs-card-name")?.textContent).toBe("Judy Sackville-Baggins");
  });

  it("shows her number from #4, and only when it may be quoted; 1 to 3 are the Welcome glyph's to say", () => {
    expect(mount({ hm: "15:00", sessionNumber: 264 }).text).toContain("#264");
    expect(mount({ hm: "15:00", sessionNumber: 2 }).text).not.toContain("#2");
    expect(mount({ hm: "15:00", sessionNumber: null }).text).not.toContain("#");
  });

  it("says 'New to Journey' in the number's place when her story began before the cutover", () => {
    expect(mount({ hm: "15:00", newToJourney: true }).text).toContain("New to Journey");
  });

  it("names its service only when it isn't the day's usual one", () => {
    const usual = "1:1 Strength Training";
    expect(mount({ hm: "15:00", usualService: usual, bookingOver: { serviceName: usual } }).text).not.toContain(usual);
    expect(mount({ hm: "15:00", usualService: usual, bookingOver: { serviceName: "InBody Scan" } }).text).toContain("InBody Scan");
  });

  it("gives a booking that isn't the usual half hour its span (a 45-minute consult)", () => {
    const c = mount({ hm: "15:00", bookingOver: { endTime: at("15:45"), serviceName: "New Client Consultation" } });
    expect(c.text).toContain("3:00 – 3:45 PM");
    expect(c.card.querySelector('.hs-g[aria-label="Consultation"]')).toBeTruthy();
  });

  it("Get to know is the ✎ alone: 'Something to ask about', and the detail's words nowhere on the card (wave 2 hub)", () => {
    const words = "Her grandson Hamson moves into Bag End on Saturday";
    const moving = { id: "f1", clientId: "c1", studioId: "solon", pillar: "family", body: words, subject: "the move", eventDate: at("00:00", "2026-09-26"), recurrence: "none", occurredAt: at("10:00", "2026-09-01"), isArchived: false } as unknown as FordEntry;
    const plainClient = { id: "c1", firstName: "Bell", lastName: "Gamgee" } as unknown as Client;
    const c = mount({ hm: "15:00", who: plainClient, ford: () => [moving] });
    const glyph = c.card.querySelector('.hs-g[data-family="get-to-know"]');
    expect(glyph?.getAttribute("aria-label")).toBe("Something to ask about");
    expect(glyph?.querySelector(".hs-g-word")).toBeNull();
    expect(c.card.outerHTML).not.toContain("Bag End");
    expect(c.card.outerHTML).not.toContain("the move");
    // A finished card goes quiet: the ✎ leaves with every other mark.
    const done = session("Completed", "11:02");
    const quiet = mount({ hm: "11:00", who: plainClient, ford: () => [moving], logged: loggedSessions([done]), workoutSession: done });
    expect(quiet.card.querySelector('.hs-g[data-family="get-to-know"]')).toBeNull();
  });

  it("draws Mindbody's 'Unavailable' as time that isn't a session: never a button, never counted as her", () => {
    const onOpen = vi.fn();
    const c = mount({ hm: "12:00", withClient: false, bookingOver: { clientId: "", clientName: "Unavailable", endTime: at("12:30") }, onOpen });
    expect(c.card.dataset.kind).toBe("staff");
    expect(c.text).toContain("Unavailable");
    expect(c.text).toContain("12:00 – 12:30 PM");
    expect(c.card.getAttribute("role")).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * Your own column, in words (hub cherry round, Sep 28 2026): a card in the
 * focus column may say every mark's word, "first with you" among them; and
 * on every card the time and her number are never the part that is cut.
 * ------------------------------------------------------------------ */

describe("your own column, in words", () => {
  const entryWith = (moments: RunSheetEntry["moments"]) =>
    ({ key: "b1", clientId: "c1", moments, sessionNumber: 5, criticalUnknown: false, clinicalOnFile: false }) as unknown as RunSheetEntry;
  const firstWithYou = { family: "welcome", kind: "first-with-trainer", chip: "First with Sara", sentence: "First session with Sara." } as const;
  const milestone = { family: "celebrate", kind: "milestone", chip: "100th", sentence: "100th session." } as const;

  function card(wordy: boolean, moments: RunSheetEntry["moments"] = [firstWithYou, milestone]) {
    if (root) {
      act(() => root!.unmount());
      host?.remove();
    }
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root!.render(
        <HubCard booking={booking("15:00")} client={client} entry={entryWith([...moments])} sessionNumber={264} wordy={wordy} logged={NOTHING_LOGGED} now={NOW} onOpen={() => {}} />,
      );
    });
    return host.firstElementChild as HTMLElement;
  }

  it("marks a card in your column for its words, and says 'first with you' there", () => {
    const mine = card(true);
    expect(mine.dataset.words).toBe("all");
    expect([...mine.querySelectorAll(".hs-g-word")].map((w) => w.textContent)).toEqual(["first with you", "100th"]);
    const theirs = card(false);
    expect(theirs.dataset.words).toBeUndefined();
    expect([...theirs.querySelectorAll(".hs-g-word")].map((w) => w.textContent)).toEqual(["100th"]);
  });

  it("puts her number in the top-right corner, beside the name, and off the time's line (AJ, Oct 1 2026)", () => {
    const c = card(false, []);
    expect(c.querySelector(".hs-card-when")?.textContent).toBe("3:00");
    const num = c.querySelector<HTMLElement>(".hs-card-top .hs-card-num");
    expect(num?.textContent).toBe("#264");
    expect(num?.getAttribute("aria-label")).toBe("Session 264");
    // In the same row as the name, after it; the triangle keeps its own slot outside that row.
    expect(num?.parentElement?.className).toBe("hs-card-head");
    expect(num?.nextElementSibling?.className).toBe("hs-card-name");
    const late = mount({ hm: "10:00", sessionNumber: 264 });
    expect(late.card.querySelector(".hs-card-num")?.textContent).toBe("#264");
    expect(late.card.querySelector(".hs-card-when")?.textContent).not.toContain("#");
  });

  it("never cuts its second line: the state word sits with the time, and the rest shows whole or not at all (hub fixes, Oct 1 2026)", () => {
    const late = mount({ hm: "10:00", sessionNumber: 264 });
    // "Not logged" is in the part that never shrinks, beside the time.
    expect(late.card.querySelector(".hs-card-when")?.textContent).toBe("10:00 · Not logged");
    expect(late.card.querySelector(".hs-card-when .hs-card-state")?.textContent).toBe("Not logged");
    expect(late.card.querySelector(".hs-card-rest")).toBeNull();
    // "New to Journey" is a whole part, never a cut string.
    const fresh = mount({ hm: "15:00", newToJourney: true });
    expect([...fresh.card.querySelectorAll(".hs-card-rest .hs-card-part")].map((p) => p.textContent)).toEqual([" · New to Journey"]);
    // The stylesheet never ellipsises the line: a part that doesn't fit drops whole.
    const css = readFileSync(resolve(__dirname, "hub-card.css"), "utf8");
    const rest = css.match(/\.hs-card-rest\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(rest).not.toMatch(/text-overflow/);
    expect(rest).toMatch(/flex-wrap:\s*wrap/);
    expect(css.match(/\.hs-card-part\s*\{([^}]*)\}/)?.[1] ?? "").toMatch(/flex:\s*none/);
    expect(css).not.toMatch(/text-overflow:\s*ellipsis/);
  });

  it("says 'Left open' on a session gone quiet for an hour, never 'In session' all day (hub fixes, Oct 1 2026)", () => {
    const left = { ...session("In-Progress", "09:02"), lastHeartbeatAt: at("09:40") } as WorkoutSession;
    const c = mount({ hm: "09:00", workoutSession: left });
    expect(c.card.dataset.state).toBe("left-open");
    expect(c.faded).toBe(true);
    expect(c.card.querySelector(".hs-card-when .hs-card-state")?.textContent).toBe("Left open");
    expect(c.text).not.toContain("In session");
    // Still beating: in session, past its slot too.
    const running = { ...session("In-Progress", "11:02"), lastHeartbeatAt: at("11:55") } as WorkoutSession;
    const r = mount({ hm: "11:00", workoutSession: running });
    expect(r.card.dataset.state).toBe("in-session");
    expect(r.text).toContain("In session");
  });

  it("shows no number, and no placeholder, where it may not be quoted", () => {
    expect(mount({ hm: "15:00", sessionNumber: null }).card.querySelector(".hs-card-num")).toBeNull();
    expect(mount({ hm: "15:00", sessionNumber: 3 }).card.querySelector(".hs-card-num")).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * A Critical note written in Journey marks the card (question 12 of the
 * Sep 20 audit, AJ Sep 24 2026): the red triangle only, for every trainer,
 * from one read of the day's notes — and only a note that matters on the
 * booking's day.
 * ------------------------------------------------------------------ */

/** A client with nothing on the record: whatever lights, a note lit it. */
const plain = { id: "c1", firstName: "Maria", lastName: "Kowalski" } as Client;

const SHOULDER = "Left shoulder: no overhead pressing until the MRI";
let seq = 0;
const critical = (over: Partial<JournalEntry> = {}) =>
  ({
    id: `note-${++seq}`,
    clientId: "c1",
    studioId: "solon",
    kind: "injury",
    body: SHOULDER,
    importance: "critical",
    threadId: null,
    occurredAt: at("09:00", "2026-09-10"),
    effectiveFrom: null,
    effectiveUntil: null,
    repeat: null,
    resolvedAt: null,
    isArchived: false,
    ...over,
  }) as JournalEntry;

describe("the Hub card and a Critical note", () => {
  it("shows the red triangle for a Critical note that matters today, with its words whole", () => {
    const c = mount({ hm: "15:00", who: plain, criticalNotes: [critical()] });
    expect(c.critical).toBe(`Critical: ${SHOULDER}`);
    expect(c.card.getAttribute("title")).toBe(`Critical: ${SHOULDER}`);
  });

  it("the triangle is the one red mark — a legacy priority note included — and spends no glyph", () => {
    const legacy = mount({ hm: "15:00", who: { ...plain, priorityNote: "Pacemaker" } as Client });
    expect(legacy.card.querySelectorAll(".hs-tri")).toHaveLength(1);
    expect(legacy.card.querySelectorAll(".hs-g")).toHaveLength(0);
  });

  it("stays dark for a closed thread", () => {
    expect(mount({ hm: "15:00", who: plain, criticalNotes: [critical({ resolvedAt: at("08:00") })] }).critical).toBeNull();
  });

  it("stays dark for an archived thread", () => {
    expect(mount({ hm: "15:00", who: plain, criticalNotes: [critical({ isArchived: true })] }).critical).toBeNull();
  });

  it("stays dark once the note's window has run out", () => {
    const ended = critical({ effectiveUntil: at("23:59", "2026-09-23") });
    expect(mount({ hm: "15:00", who: plain, criticalNotes: [ended] }).critical).toBeNull();
  });

  it("a window that opens tomorrow leaves today's card alone and marks tomorrow's", () => {
    const fromFriday = critical({ occurredAt: at("08:00"), effectiveFrom: at("12:00", FRIDAY) });
    expect(mount({ hm: "15:00", who: plain, criticalNotes: [fromFriday] }).critical).toBeNull();
    expect(mount({ hm: "09:00", day: FRIDAY, who: plain, criticalNotes: [fromFriday] }).critical).toBe(`Critical: ${SHOULDER}`);
  });

  it("a Heads up does not mark the Hub card", () => {
    expect(mount({ hm: "15:00", who: plain, criticalNotes: [critical({ importance: "elevated" })] }).critical).toBeNull();
  });

  it("claims nothing while the notes are unknown", () => {
    const c = mount({ hm: "15:00", who: plain, criticalNotes: null });
    expect(c.critical).toBeNull();
    expect(c.flags.priority).toBe(false);
  });

  it("keeps the triangle while the trainer is late, and drops it once the session is logged", () => {
    expect(mount({ hm: "11:45", who: plain, criticalNotes: [critical()] }).critical).not.toBeNull();
    const done = session("Completed", "11:02");
    const c = mount({ hm: "11:00", who: plain, criticalNotes: [critical()], logged: loggedSessions([done]), workoutSession: done });
    expect(c.faded).toBe(true);
    expect(c.critical).toBeNull();
  });

  it("says every live Critical note, newest first", () => {
    const older = critical({ body: "Pacemaker: no chest-compression machines", occurredAt: at("09:00", "2026-08-01") });
    const c = mount({ hm: "15:00", who: plain, criticalNotes: [older, critical()] });
    expect(c.critical).toBe(`Critical: ${SHOULDER} · Critical: Pacemaker: no chest-compression machines`);
  });
});
