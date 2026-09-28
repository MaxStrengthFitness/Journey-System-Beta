/**
 * Which section of My Studio this iPad was last on — module memory, so a
 * plain open returns to where it was and a restart forgets it, by design.
 *
 * It lives in its own file (fix pile, Sep 2026) so a screen elsewhere can
 * send someone to a particular section without importing the view itself:
 * Operations → Renewals points at Studio, where the renewal settings live.
 * Set it, then switch the app's view to My Studio.
 *
 * A screen INSIDE My Studio (Team's line about the free slots, the Openings
 * round, Sep 27 2026) can't switch the app's view to where it already is, so
 * it asks the shell instead: `openMyStudioSection(next)` tells the mounted
 * My Studio, which moves there through its own leave scope (anything typed
 * in the section being left is asked about first, exactly as a tap on the
 * masthead's tab is) and records the section only once the move happens. A
 * "Keep editing" leaves both the screen and the memory where they were.
 * With no My Studio mounted, it only remembers. A door that also sets where
 * inside the section to land (Openings' part and chip) passes that as
 * `arrive`, which runs only when the move happens, just before the section
 * mounts (the final review: remembering it first let a "Keep editing"
 * change where the next plain open of Openings landed).
 */

import { forgetOnSignOut } from "../sign-out/memory";

export type MyStudioSection = "relay" | "openings" | "machines" | "team" | "studio";

let rememberedSection: MyStudioSection = "relay";

type SectionRequest = (next: MyStudioSection, arrive?: () => void) => void;
const requests = new Set<SectionRequest>();

// "This iPad" means this person on this iPad: a leader who left it on Team
// must not hand the next trainer a leader's section. Sign-out round, Sep 24 2026.
forgetOnSignOut(() => {
  rememberedSection = "relay";
});

export function rememberedMyStudioSection(): MyStudioSection {
  return rememberedSection;
}

export function rememberMyStudioSection(next: MyStudioSection): void {
  rememberedSection = next;
}

/**
 * Send someone to a section of the My Studio that is on screen (a door on
 * one section to another). The shell remembers the section once it has
 * moved there, after the leave question if there is one; remembering it
 * here first would make a "Keep editing" land the next plain open on the
 * section they chose not to go to (the section's review, Sep 27 2026). With
 * no My Studio mounted it only remembers, so the next open lands there.
 * `arrive` (what the door sets inside the section) runs with the move, or at
 * once with no My Studio mounted; never after a "Keep editing".
 */
export function openMyStudioSection(next: MyStudioSection, arrive?: () => void): void {
  if (requests.size === 0) {
    rememberedSection = next;
    arrive?.();
    return;
  }
  for (const request of [...requests]) request(next, arrive);
}

/** MyStudioView listens here while it is mounted; the return stops it. */
export function onMyStudioSectionRequest(request: SectionRequest): () => void {
  requests.add(request);
  return () => {
    requests.delete(request);
  };
}
