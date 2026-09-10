/**
 * Resolving a request, and optionally keeping the answer.
 *
 * A tiny module for one reason: THE ORDER OF THE TWO WRITES IS LOAD-BEARING,
 * and putting it in a component would make it a detail of a dialog rather
 * than a rule of the feature.
 *
 * The resolve is what the trainer asked for. The playbook entry is a bonus
 * they agreed to. So the resolve goes FIRST and its failure is fatal; the
 * playbook write goes second and its failure must not undo the resolve or
 * make the trainer think their answer was lost.
 *
 * The alternative — one batch, both or neither — is worse here. A rules
 * rejection on the playbook entry (say a future field the rule refuses) would
 * silently roll back a resolve that was perfectly legal, and the trainer would
 * see their answer vanish with no explanation.
 */
import { resolveRequest } from "./requests";
import { savePlaybookEntry } from "./playbook-mutations";
import type { PlaybookDraft } from "./playbook";
// TaskAuthor lives in ./mutations; ./requests imports it without re-exporting.
import type { TaskAuthor } from "./mutations";
import type { ResolveOutcome } from "./resolve-outcome";

export type { ResolveOutcome } from "./resolve-outcome";
export { outcomeMessage } from "./resolve-outcome";

export async function resolveAndMaybeKeep(args: {
  studioId: string;
  request: { id: string };
  author: TaskAuthor | null;
  resolution: string;
  playbook: PlaybookDraft | null;
}): Promise<ResolveOutcome> {
  const { studioId, request, author, resolution, playbook } = args;

  // 1. The thing they asked for. Not caught: if this fails the caller must
  //    surface it, because nothing happened.
  await resolveRequest({
    studioId,
    requestId: request.id,
    author,
    resolution,
  });

  if (!playbook) return { kind: "resolved" };

  // 2. The bonus. Caught, because the request IS resolved by now and telling
  //    someone "that failed" without saying which half failed is how people
  //    resolve the same request twice.
  try {
    const entryId = await savePlaybookEntry(studioId, playbook, {
      id: author?.id ?? "",
      name: author?.name ?? "A trainer",
    });
    return { kind: "resolved-and-kept", entryId };
  } catch (error) {
    return { kind: "resolved-playbook-failed", error };
  }
}
