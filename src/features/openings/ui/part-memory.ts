/**
 * WHICH PART OF OPENINGS THIS iPAD WAS ON, AND WHOSE TIMES IT WAS SHOWING
 * (Openings round, Sep 27 2026). Module memory, like My Studio's section
 * (my-studio/section-memory.ts): a plain open returns to where it was, a
 * restart forgets it, and a sign-out forgets it for the next person.
 *
 *   part   The usual week · Next 7 days · A new regular time · Who's usually in.
 *          It opens on The usual week, because AJ asked first to know "what
 *          our regular times are and our busy times are".
 *   whose  the narrowing chips: "With you", "Anyone", or one trainer. Null
 *          until someone chooses: then it is "With you" for a trainer with an
 *          agreed week here, "Anyone" for everyone else.
 *
 * A door from elsewhere (Team's line about the free slots, the Overview's
 * line) sets both, then opens the section: `showOpenings("next", { kind:
 * "anyone" })`, then `openMyStudioSection("openings")` from inside My Studio
 * or `rememberMyStudioSection("openings")` and the app's view from outside.
 *
 * PURE MODULE (no React).
 */
import { forgetOnSignOut } from "../../sign-out/memory";

export type OpeningsPart = "usual" | "next" | "offer" | "who";

export const OPENINGS_PARTS: readonly OpeningsPart[] = ["usual", "next", "offer", "who"];

export type WhoseTimes = { kind: "you" } | { kind: "anyone" } | { kind: "trainer"; trainerId: string };

let part: OpeningsPart = "usual";
let whose: WhoseTimes | null = null;

forgetOnSignOut(() => {
  part = "usual";
  whose = null;
});

export function rememberedOpeningsPart(): OpeningsPart {
  return part;
}

export function rememberOpeningsPart(next: OpeningsPart): void {
  part = next;
}

export function rememberedWhoseTimes(): WhoseTimes | null {
  return whose;
}

export function rememberWhoseTimes(next: WhoseTimes | null): void {
  whose = next;
}

/** A door's arrival: the part to show and, when it says, whose times. */
export function showOpenings(nextPart: OpeningsPart, nextWhose?: WhoseTimes): void {
  part = nextPart;
  if (nextWhose) whose = nextWhose;
}

/**
 * The trainer the chips narrow to (trainers/{id}), or null for anyone. A
 * remembered trainer who isn't among the chips any more reads as anyone; with
 * nothing chosen, a viewer with an agreed week here starts on their own.
 */
export function narrowedTo(
  choice: WhoseTimes | null,
  viewerTrainerId: string | null,
  choosable: readonly string[],
): string | null {
  const own = viewerTrainerId && choosable.includes(viewerTrainerId) ? viewerTrainerId : null;
  if (!choice) return own;
  if (choice.kind === "anyone") return null;
  if (choice.kind === "you") return viewerTrainerId;
  return choosable.includes(choice.trainerId) ? choice.trainerId : null;
}
