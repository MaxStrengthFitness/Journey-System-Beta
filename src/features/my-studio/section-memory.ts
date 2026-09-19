/**
 * Which section of My Studio this iPad was last on — module memory, so a
 * plain open returns to where it was and a restart forgets it, by design.
 *
 * It lives in its own file (fix pile, Sep 2026) so a screen elsewhere can
 * send someone to a particular section without importing the view itself:
 * Operations → Renewals points at Studio, where the renewal settings live.
 * Set it, then switch the app's view to My Studio.
 */

export type MyStudioSection = "relay" | "machines" | "team" | "studio";

let rememberedSection: MyStudioSection = "relay";

export function rememberedMyStudioSection(): MyStudioSection {
  return rememberedSection;
}

export function rememberMyStudioSection(next: MyStudioSection): void {
  rememberedSection = next;
}
