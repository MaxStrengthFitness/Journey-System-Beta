/**
 * The six steps of the 90-day progress report, in the order the trainer
 * talks through them with the client. Each carries the plain-language guide
 * that renders above the step while editing (never on the client copy).
 *
 * The order IS the conversation: celebrate first, then the numbers, then
 * the honest part, then leave them with a goal and a date.
 */
export type ReportStepId =
  | "celebrate"
  | "highlights"
  | "machines"
  | "fourps"
  | "checkin"
  | "goals";

export interface ReportStepDef {
  id: ReportStepId;
  n: number;
  title: string;
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
    title: "Celebrate",
    subtitle: "How far they've come",
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
    title: "Highlights",
    subtitle: "Two or three accolades",
    purpose:
      "Specific wins they can be proud of. Three slots; a strength gain on a machine they care about beats a generic stat every time.",
    howTo:
      "Choose a machine and the metric that tells the best story for it (strength gain, volume, perfect sets, time under tension), or write a custom highlight for something the data can't see.",
    clientSees: "Three trophy cards with one headline number each.",
  },
  {
    id: "machines",
    n: 3,
    title: "Machine progression",
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
    subtitle: "Posture · Pace · Path · Purpose",
    purpose:
      "The honest part. Where they excel, and what will make the next 90 days better. Rank each P, and use the talking points to say it in a way they can act on.",
    howTo:
      "Tap a rank 1–5 for each P. The suggested talking point changes with the rank — include it if it's true, or write your own note. Aim for one clear thing to improve, not four.",
    clientSees: "Four cards with the rank, the bar, and any note or talking point you included.",
  },
  {
    id: "checkin",
    n: 5,
    title: "90-day check-in",
    subtitle: "Sleep, energy, pain, habits, food",
    purpose:
      "How life is going outside the gym — scored the same way every 90 days so the trend is real. Protein, hydration, specific pain and what's stressing them live here too.",
    howTo:
      "Read each statement and tap the number that fits, using the words under the scale. Then protein, hydration, the pain map and any stressors. Open the coach view any time to see the flags and changes since last time.",
    clientSees:
      "Their biggest win, one thing to work on, the eight colour tiles, protein and hydration, and the pain map — whatever you switched on. Stress anchors stay off their copy unless you turn them on.",
  },
  {
    id: "goals",
    n: 6,
    title: "Goals",
    subtitle: "The next 90 days",
    purpose:
      "Close the loop and open the next one. How did the goal from last time go? What's the goal now, and when do we check it? A client with a dated goal has a reason to be here in 90 days.",
    howTo:
      "Review the previous goal and mark how it went. Write the next one as something measurable with a date. Add two or three checkpoints. Then pick the training track that gets them there, and write your closing note.",
    clientSees:
      "Why they started, how the last goal went, the new goal with its date, the checkpoints, the training plan and your closing note.",
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
