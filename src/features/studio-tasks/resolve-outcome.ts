/**
 * What happened when a request was resolved, and what to tell the trainer.
 *
 * PURE, and split from resolve-flow.ts for the same reason recurrence.ts is
 * split from mutations.ts: the wording is a decision worth testing, and it
 * should not need Firestore imported to assert on it.
 */

export type ResolveOutcome =
  | { kind: "resolved" }
  | { kind: "resolved-and-kept"; entryId: string }
  /** The resolve landed; only the bonus failed. Say so precisely. */
  | { kind: "resolved-playbook-failed"; error: unknown };

/**
 * Kept here so the wording cannot drift between callers.
 *
 * The third case is the one that matters. "Something went wrong" after a
 * partial success is how a trainer ends up resolving the same request twice,
 * so the message names which half worked and where their answer went.
 */
export function outcomeMessage(outcome: ResolveOutcome): {
  tone: "success" | "warning";
  text: string;
} {
  switch (outcome.kind) {
    case "resolved":
      return { tone: "success", text: "Resolved." };
    case "resolved-and-kept":
      return { tone: "success", text: "Resolved, and saved to the playbook." };
    case "resolved-playbook-failed":
      return {
        tone: "warning",
        text: "Resolved — but the playbook entry did not save. Your answer is on the request.",
      };
  }
}
