/**
 * The five steps of the Client Progress Report, in the order the trainer
 * talks through them with the client. Each carries the plain-language guide
 * that renders above the step while editing (never on the client copy).
 *
 * The order IS the conversation, and the titles follow the owner's
 * four-phase report (accolades round, Sep 2026):
 *   1. Volume & gratitude — congratulate, validate consistency, total volume
 *   2. Accolades — exactly three data-backed wins
 *   3. The 4 P's — what they execute well and what to refine
 *   4. Kaizen blueprint — what's next
 * Machine progression (the proof behind the accolades) sits between them.
 * Step ids never change: saved state and the rail's done-marks key on them.
 *
 * Reporting round, Sep 2026: the Assessment step (`checkin`) is gone — the
 * Pulse is the living record on the client's profile, and the report shows
 * a read-only snapshot of it on the Kaizen blueprint step instead (audit
 * action item A). The id is kept in `RETIRED_STEP_IDS` so an old saved
 * "active step" still resolves.
 */
export type ReportStepId =
  | "celebrate"
  | "highlights"
  | "machines"
  | "fourps"
  | "goals";

/** Step ids older code may still hand us, and where they land now. */
export const RETIRED_STEP_IDS: Record<string, ReportStepId> = {
  checkin: "goals",
};

/** Any step id, current or retired, → a step the rail has. */
export function resolveStepId(id: string | null | undefined): ReportStepId {
  if (id && id in STEP_INDEX) return id as ReportStepId;
  if (id && id in RETIRED_STEP_IDS) return RETIRED_STEP_IDS[id];
  return "celebrate";
}

export interface ReportStepDef {
  id: ReportStepId;
  n: number;
  title: string;
  /**
   * The name on the step tab. Short enough to fit one of five equal
   * columns on an iPad in portrait without ever being truncated.
   */
  label: string;
  /** One line under the title in the step rail. */
  subtitle: string;
  /** What this section of the conversation is for. */
  purpose: string;
  /** What to fill in, and how. */
  howTo: string;
  /** What the client will see from this step on their copy. */
  clientSees: string;
}

export const REPORT_STEPS: ReportStepDef[] = [
  {
    id: "celebrate",
    n: 1,
    title: "Volume & gratitude",
    label: "Volume",
    subtitle: "Thank them · how far they've come",
    purpose:
      "Open by congratulating them. Everything here is about showing up — sessions, volume, reps, rest — so the client feels the size of what they've already done before anything else is said.",
    howTo:
      "Pick the window (blank = since their first session). Switch off any number that won't land for this client. Write the narrative in the second person, as you'd say it out loud — it prints as a quote.",
    clientSees:
      "The big session count, your quote, and the numbers you left switched on.",
  },
  {
    id: "highlights",
    n: 2,
    title: "Accolades",
    label: "Accolades",
    subtitle: "Three wins the data proves",
    purpose:
      "Positivity padding before the honest part: exactly three specific wins they can be proud of — a big strength gain on a stubborn machine, an unbroken run of top-quality sets, or more time under tension.",
    howTo:
      "The system drafts the three strongest wins it can prove from their sessions (marked 'Suggested from data'). Keep them, swap any slot for another suggestion, pick a machine and accolade yourself, or write a custom highlight for something the data can't see. A slot the data can't back says 'not enough data yet' and is never printed.",
    clientSees: "Up to three accolade cards, each titled by the kind of win, with one headline number.",
  },
  {
    id: "machines",
    n: 3,
    title: "Machine progression",
    label: "Machines",
    subtitle: "Where the weight went",
    purpose:
      "The proof behind the highlights: start weight to current weight, machine by machine. This is where 'I feel stronger' becomes a number.",
    howTo:
      "Every machine with history in the window is listed. Tick the ones worth showing — usually the biggest gains plus anything they've asked about. Add a line if there's a story (a plateau you broke, a machine you rested).",
    clientSees: "A table of the machines you ticked: start → now, and the change.",
  },
  {
    id: "fourps",
    n: 4,
    title: "The 4 P's",
    label: "4 P's",
    subtitle: "Posture · Pace · Path · Purpose",
    purpose:
      "The honest part — clinical methodology. Where they execute well, and what will make the next 90 days better. Rate each P on the Dial, and use the talking points to say it in a way they can act on.",
    howTo:
      "Their coaching focus history is at the top: what's being worked on now and what has been achieved. Tap where each P is today — Needs work · Developing · Solid · Strong · Mastered. A P you don't tap stays unrated. The suggested talking point changes with the word — include it if it's true, or write your own note. Aim for one clear thing to improve, not four.",
    clientSees:
      "Four cards with the word for each P, the bar, and any note or talking point you included, plus their focus history as it stood when you saved.",
  },
  {
    id: "goals",
    n: 5,
    title: "Kaizen blueprint",
    label: "Blueprint",
    subtitle: "Pulse · what's next · the next 90 days",
    purpose:
      "Close the loop and open the next one. Their Pulse — how life is going outside the gym — sits at the top, read-only, as it stands on their record. Then: how did the goal from last time go? What's the goal now, and when do we check it? A client with a dated goal has a reason to be here in 90 days.",
    howTo:
      "Read the Pulse snapshot for context (update it from the client's record, not here). Review the previous goal and mark how it went. Write the next one as something measurable with a date. Add two or three checkpoints. Then pick the training track that gets them there (the refinement track starts on their newest active focus), and write your closing note.",
    clientSees:
      "Why they started, how the last goal went, the new goal with its date, the checkpoints, the training plan and your closing note — and their Pulse, only what its own client-copy switches allow.",
  },
];

export const STEP_INDEX: Record<ReportStepId, number> = Object.fromEntries(
  REPORT_STEPS.map((s, i) => [s.id, i]),
) as Record<ReportStepId, number>;

export const GOAL_OUTCOME_LABELS = {
  achieved: "Achieved",
  on_track: "On track",
  stalled: "Stalled",
  revised: "Changed course",
} as const;
