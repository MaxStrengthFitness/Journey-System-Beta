/**
 * THE MACHINE MENU — a write the database refuses AFTER the card said
 * "saved on this iPad".
 *
 * `settleOrQueue` (session-record/finish-wait.ts) answers "queued" at once
 * offline, or online after three seconds, and from then on nobody hears the
 * write's own answer. So a refusal that comes later (a studio this person
 * can't write to, a sign-in that lapsed) reached no one, after the box had
 * cleared the words or the strip had said the setting was saved. Every
 * writer on the card attaches this to a write that was queued, the way the
 * tracker's `noteOrSay` does: while the card is open, it says so in place
 * (and puts the words back when the box is still empty); once the card has
 * closed, the app's toast says it, since the box that held them is gone.
 *
 * Nothing waits on it: the write is already on the iPad.
 */

/**
 * Call `refused` if the write is refused later: a rejection, or an answer
 * `isRefusal` says is one (a note writer that answers nothing).
 */
export function whenRefusedLater<T>(write: Promise<T>, refused: (err: unknown) => void, isRefusal: (value: T) => boolean = () => false): void {
  write.then(
    (value) => {
      if (isRefusal(value)) refused(null);
    },
    (err) => refused(err),
  );
}

/**
 * Say a late refusal once the card has closed: the app's toast, through the
 * hook ToastProvider puts on the window (lib/firestore-errors.ts says its
 * errors the same way). Silent where there is no provider (a test, or a
 * screen drawn before the shell). "info" says something that is not a
 * refusal once the card has closed (a save still only on this iPad, an
 * Undo with nothing left to take back).
 */
export function sayAfterClose(text: string, type: "error" | "info" = "error", ms = 8000): void {
  if (typeof window === "undefined") return;
  const show = (window as unknown as { __showToast?: (message: string, type?: string, duration?: number) => void }).__showToast;
  show?.(text, type, ms);
}

/**
 * Say a save that closed the card, with Undo beside it for `ms` (the Now
 * Bar's Set up, the open session round, Oct 9 2026: "Save closes the card,
 * with a 10-second Undo"). The app's toast, through the same window hook;
 * silent where there is no provider.
 */
export function sayWithUndo(text: string, onUndo: () => void, ms: number): void {
  if (typeof window === "undefined") return;
  const show = (
    window as unknown as {
      __showToast?: (message: string, type?: string, duration?: number, action?: { label: string; run: () => void }) => void;
    }
  ).__showToast;
  show?.(text, "success", ms, { label: "Undo", run: onUndo });
}
