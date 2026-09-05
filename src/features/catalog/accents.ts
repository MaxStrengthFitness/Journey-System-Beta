/**
 * Movement pattern -> the accent stripe on a picker item.
 *
 * A token name, never a hex. The view this replaces hardcoded #F06C22 and
 * #38BDF8 in its portrait tree while using bg-cta / bg-cyan for the same thing
 * in the landscape tree, so the two rendered different colours for one machine.
 */
export function accentVar(movementPattern: string): string {
  const p = movementPattern.toLowerCase();
  if (p.includes("push")) return "var(--cat-accent-push)";
  if (p.includes("pull")) return "var(--cat-accent-pull)";
  if (p.includes("quad")) return "var(--cat-accent-quad)";
  if (p.includes("posterior")) return "var(--cat-accent-posterior)";
  if (p.includes("core")) return "var(--cat-accent-core)";
  if (p.includes("isolation")) return "var(--cat-accent-core)";
  return "var(--cat-accent-other)";
}
