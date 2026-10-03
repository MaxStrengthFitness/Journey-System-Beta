/**
 * WHERE THIS NOTE PROBABLY GOES — read from the trainer's own words (notes
 * round, Oct 3 2026).
 *
 * AJ, on the note box: "that is so clunky looking". The fix is not fewer
 * categories — category is "the one thing capture must get" — but fewer
 * taps to give it: a trainer types "left knee sore after the hike" and the
 * box already says Health · Injury · left knee, on the Save button itself
 * ("Save as Health"). One tap files it; any other pick changes it.
 *
 * A SUGGESTION, NEVER A DECISION. It is shown before the save, named on the
 * button, and the trainer's own pick always wins. It is conservative: only
 * plain words, whole words, and when two kinds of words disagree the one
 * that matters more to someone else wins (an incident over a health note,
 * a health note over a preference). No word it knows: no suggestion, and
 * the note saves to file later, as before. A wrong guess is worse than
 * none, so the lists hold only words that mean one thing on a studio floor.
 *
 * Pure: no React, no Firebase. `suggest.test.ts` pins it.
 */
import type { NoteBodyMark } from "../../types/journal";
import { bodyMarksFromWords } from "./pain-notes";
import type { FilingCategory, NoteCategory, NoteFlavour } from "./note-catalog";

export interface FilingSuggestion {
  category: Exclude<NoteCategory, "admin">;
  flavour: NoteFlavour | null;
  bodyParts: NoteBodyMark[];
  /** The word that decided it, for the line under the choices ("from “sore”"). */
  because: string;
}

const words = (list: string) => list.split("|").map((w) => w.trim()).filter(Boolean);

/** Something happened in the room. Checked first: it reaches the leaders and names a moment. */
const INCIDENT = words(
  "fell|had a fall|took a fall|slipped|tripped|fainted|passed out|dizzy|lightheaded|light-headed|lost her balance|lost his balance|lost her footing|lost his footing|dropped the weight|dropped the bar|dropped the handle|bumped her|bumped his|banged her|banged his|cut herself|cut himself|bleeding|nosebleed|left her phone|left his phone|left her keys|left his keys|stopped the set|ended the set|got stuck|caught her finger|caught his finger|pinched her|pinched his",
);

/** Her health, by flavour; the first list that matches names it. */
const HEALTH_FLAVOURS: readonly [NoteFlavour, string[]][] = [
  ["Surgery", words("surgery|surgeon|operation|replaced|replacement|post-op|post op|arthroscopy|stitches")],
  ["Medication", words("meds|medication|medicine|prescription|glp-1|glp1|ozempic|wegovy|mounjaro|zepbound|blood thinner|blood thinners|statin|insulin|beta blocker|steroid|steroids")],
  ["Diagnosis", words("diagnosed|diagnosis|arthritis|osteoarthritis|osteoporosis|osteopenia|diabetes|diabetic|cancer|parkinson|parkinson's|copd|afib|a-fib|hypertension|high blood pressure|neuropathy|scoliosis|stenosis|hernia")],
  ["OutsideCare", words("chiro|chiropractor|massage|physio|physiotherapy|physical therapy|pt appointment|acupuncture|adjustment|osteopath")],
  ["Injury", words("pain|painful|sore|soreness|ache|aching|hurt|hurts|hurting|injury|injured|sprain|sprained|strain|strained|tweaked|pulled a muscle|tender|swollen|swelling|stiff|flare|flared|cramp|cramping|numb|tingling")],
];

const RETENTION = words(
  "renew|renewal|renewing|cancel|cancelling|canceling|cancelled|quit|quitting|leaving|stop coming|package|price|prices|cost|costs|afford|money|contract|membership|pause|freeze|refund|switching gyms|moving away",
);

const COACHING_PS: readonly [NoteFlavour, string[]][] = [
  ["Posture", words("posture|slouch|slouching|shoulders up|head forward|neck forward|arched|arching")],
  ["Pace", words("pace|tempo|too fast|too slow|rushes|rushing|rushed|turnaround|dumping|jerks|jerking|bouncing|momentum")],
  ["Path", words("path|range|rom|drifting|drifts|shifting|line of the load")],
  ["Purpose", words("purpose|focus|intent|mind-muscle|holding her breath|holding his breath|breath|breathing|valsalva|grip|gripping")],
];
const SETUP = words("seat|pad|padding|setting|settings|notch|notches|pin|belt|handle|footstool|cushion|back angle|set-up|setup");
const COACHING = words("cue|cued|coach|form|reps|rep|set|machine|load|weight");

const LIFE = words(
  "wife|husband|daughter|son|grandson|granddaughter|grandkids|grandchild|grandchildren|kids|family|mom|mother|dad|father|sister|brother|wedding|birthday|anniversary|vacation|holiday|trip|travel|travelling|traveling|cruise|retired|retirement|her job|his job|new job|at work|promotion|dog|cat|puppy|golf|pickleball|hiking|garden|gardening|church|graduation|graduates|baby|pregnant",
);

const PREFERENCE = words("likes|like|prefers|prefer|music|fan|quiet|chatty|talk|talking|cold|hot|warm|towel|water|playlist|lights");

/** Whole words or phrases, case-insensitive, never a piece of another word ("op" is not in "stop"). */
function firstHit(text: string, list: readonly string[]): string | null {
  for (const w of list) {
    const re = new RegExp(`(^|[^a-z0-9'])${w.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&")}($|[^a-z0-9'])`, "i");
    if (re.test(text)) return w;
  }
  return null;
}

/**
 * What the words suggest, or null. `inSession` lets a few machine words
 * ("seat", "pad") read as set-up only where a machine is in front of her.
 */
export function suggestFiling(text: string, options: { inSession?: boolean } = {}): FilingSuggestion | null {
  const t = ` ${(text ?? "").toLowerCase()} `;
  if (t.trim().length < 3) return null;
  const parts = bodyMarksFromWords(t);

  const incident = firstHit(t, INCIDENT);
  if (incident) return { category: "incident", flavour: null, bodyParts: parts, because: incident };

  for (const [flavour, list] of HEALTH_FLAVOURS) {
    const hit = firstHit(t, list);
    if (hit) return { category: "health", flavour, bodyParts: parts, because: hit };
  }

  const retention = firstHit(t, RETENTION);
  if (retention) return { category: "retention", flavour: null, bodyParts: [], because: retention };

  for (const [flavour, list] of COACHING_PS) {
    const hit = firstHit(t, list);
    if (hit) return { category: "coaching", flavour, bodyParts: [], because: hit };
  }
  const setup = firstHit(t, SETUP);
  if (setup && options.inSession !== false) return { category: "coaching", flavour: "Setup", bodyParts: [], because: setup };

  const life = firstHit(t, LIFE);
  if (life) return { category: "ford", flavour: null, bodyParts: [], because: life };

  const pref = firstHit(t, PREFERENCE);
  if (pref) return { category: "preference", flavour: null, bodyParts: [], because: pref };

  const coaching = firstHit(t, COACHING);
  if (coaching) return { category: "coaching", flavour: null, bodyParts: [], because: coaching };

  // A body part alone ("left knee") is about her body: Health.
  if (parts.length > 0) return { category: "health", flavour: null, bodyParts: parts, because: "the body part" };
  return null;
}

/** The suggestion as a filing category the composer writes (FORD hands off; Admin never). */
export function suggestedFiling(s: FilingSuggestion | null): FilingCategory | "ford" | null {
  return s ? s.category : null;
}
