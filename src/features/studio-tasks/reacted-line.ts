import type { reactionSummary } from "./requests";

/**
 * WHO REPLIED TO AN ASK — the line under its quick replies.
 *
 * Voice review follow-up, Sep 27 2026. Who tapped "On it" or "Can't" was
 * only in a hover tooltip on each reply button, which an iPad cannot show
 * (CLAUDE.md: hover is never the only way to find something). Now the ask
 * says it under the buttons once anyone has: "On it: Sam Lee · Can't: Ann
 * Park, Jo Diaz". In the order the replies are offered, by name, never
 * counted against anyone.
 *
 * A reply whose person has no stored name still counts, so the line never
 * claims fewer people than the button's count: one is "someone"; more are
 * "2 people", or "2 others" after a name ("others" needs someone named
 * before it).
 */
export function reactedLine(summary: ReturnType<typeof reactionSummary>): string | null {
  const parts = summary
    .filter((r) => r.ids.length > 0)
    .map((r) => {
      const named = r.names.map((n) => n.trim()).filter(Boolean);
      const unnamed = r.ids.length - named.length;
      const rest = unnamed === 1 ? "someone" : named.length > 0 ? `${unnamed} others` : `${unnamed} people`;
      const who = [...named, ...(unnamed > 0 ? [rest] : [])];
      return `${r.label}: ${who.join(", ")}`;
    });
  return parts.length ? parts.join(" · ") : null;
}
