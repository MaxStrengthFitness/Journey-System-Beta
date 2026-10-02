/**
 * WHICH STUDIO A NOTE WRITTEN IN A SESSION BELONGS TO (the Atlas answers, Oct
 * 2 2026): her HOME studio, never the studio the trainer is standing in. AJ:
 * "When someone gets approved for cross train, you'll be able to see all
 * their notes from the other studio."
 *
 * Until now a note written during a cross-train session (the Note for the
 * next trainer, the Wrap-up's Profile note, an unfinished draft, a machine
 * note, the routine adjustment at Start) was stamped with the visiting
 * studio, so her home studio's studio-scoped reads (the Operations lists, the
 * studio's note queues) never saw it. The journal's rules ask nothing of the
 * studio, so stamping her home studio is always allowed. The client's own
 * reads go by client and are unaffected.
 *
 * Pure.
 */
export function sessionNoteStudioId(
  client: { homeStudioId?: string | null; studioId?: string | null } | null | undefined,
  standingIn?: string | null,
): string {
  return client?.homeStudioId || client?.studioId || standingIn || "";
}
