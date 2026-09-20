import { isDemoStudio, isDemoStudioId } from "./is-demo";

/**
 * WHO MAY DO WHAT IN DEMO MODE.
 *
 * AJ's brief (Sep 20 2026): "a demo mode that can be accessed by selecting the
 * demo studio which every user will have full access to."
 *
 * "Full access" is taken literally. Inside Demo Mode every signed-in trainer
 * has the run of the place — the leader screens, Operations, the studio's own
 * settings, all of it — because the whole point is to let somebody see and
 * rehearse the parts of the app their own role would normally keep shut,
 * against people who do not exist. The Firestore rules say the same thing
 * (Demo 5), so nothing here offers a button the database will refuse.
 *
 * ── The distinction that matters ──────────────────────────────────────────
 *
 * This is deliberately NOT done by making `worksAt()` / `leadsStudio()` return
 * true for the demo studio, tempting as that is, because those two answer a
 * different question depending on who is asking:
 *
 *   "May I act here?"        subject is the signed-in trainer  → yes, in demo
 *   "Is this person on the   subject is every trainer in the
 *    studio's team?"          company, filtered to a studio    → NO
 *
 * Operations → Renewals and the Delight queue both build their people lists by
 * filtering ALL trainers through `worksAt`. A blanket true would have put the
 * entire company's staff directory on Demo Mode's team screens — and Demo
 * Mode's team is Aragorn, Pippin and Gimli, who belong to it for real.
 *
 * So membership stays honest and this file only ever widens AUTHORISATION.
 */

/**
 * Anybody signed in.
 *
 * Deliberately `object` rather than a Trainer shape: these two functions ask
 * "is somebody there", not "who", so they must accept every trainer type in
 * the app — and there are several narrowed ones (TrainerLike in renewals,
 * another in learning, another in inbody). Naming one of them here would make
 * this file the reason those shapes could never diverge.
 */
type SignedIn = object | null | undefined;

/** A signed-in trainer — anybody at all — may enter Demo Mode. */
export function canEnterDemo(trainer: SignedIn): boolean {
  return Boolean(trainer);
}

/**
 * True when this trainer has the run of this studio because it is Demo Mode.
 *
 * Added as an extra clause beside the real leader checks, never in place of
 * them: `isEveryStudioRole(t) || leadsStudio(t, sid) || hasRunOfDemo(t, sid)`.
 */
export function hasRunOfDemo(
  trainer: SignedIn,
  studioId: string | null | undefined,
): boolean {
  return Boolean(trainer) && isDemoStudioId(studioId ?? null);
}

/**
 * THE REALM RULE, applied to a list of studios: from inside Demo Mode you see
 * Demo Mode and nothing else; from anywhere else you do not see it at all.
 *
 * This is what keeps Operations honest without a single check inside any of
 * its nine tabs. A studio leader's "all my studios" can never quietly include
 * practice numbers, because the demo studio is not in the list it spans; and
 * Operations opened from inside Demo Mode has exactly one studio in it, so the
 * "all my studios" control does not even appear.
 *
 * The same shape as `excludeDemo` / `onlyDemo` in is-demo.ts, one level up: a
 * studio is either in your realm or it is not, and you are only ever in one.
 */
export function studiosInRealm<T extends { id?: string; isDemo?: boolean }>(
  studios: T[],
  activeStudioId: string | null | undefined,
): T[] {
  const inDemo = isDemoStudioId(activeStudioId ?? null);
  return studios.filter((s) => isDemoStudio(s) === inDemo);
}

/**
 * Pull the demo studio out of a list so a screen can give it its own place.
 *
 * The studio selection screen shows it in a section of its own rather than
 * among "Your studios": a trainer scanning for the location they are standing
 * in should never have to read past a practice studio to find it, and nobody
 * should enter Demo Mode by accident because the card looked like the others.
 */
export function splitOutDemo<T extends { id?: string; isDemo?: boolean }>(
  studios: T[],
): { demo: T | null; rest: T[] } {
  let demo: T | null = null;
  const rest: T[] = [];
  for (const studio of studios) {
    if (!demo && isDemoStudio(studio)) demo = studio;
    else rest.push(studio);
  }
  return { demo, rest };
}
