import { useMemo } from "react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { auth, db } from "../../../firebase";
import { useToast } from "../../../contexts/ToastContext";
import { OperationType, handleFirestoreError } from "../../../lib/firestore-errors";
import type { MachineCatalogEntry, MachineDefinition } from "../../../types/machines";
import type { CatalogSubmissionDoc } from "../../my-studio/floor";
import { MachineEditor } from "../machines/editor/MachineEditor";
import { definitionOf } from "../machines/definition-defaults";
import { AdminNotice } from "../primitives";
import { describeFields } from "../../../lib/machine-template";
import { correctedFields, reviewSubmission } from "./review";

/**
 * READING A SUBMISSION — the machine itself, before it becomes the standard.
 *
 * Round: the catalog gate, Sep 2026.
 *
 * Publish used to be a tap on a row that showed a name, a studio, a submitter
 * and a note. What it actually did was adopt a studio leader's wording of the
 * method — the cadence, both turnarounds, the cues — as Max Strength's, on
 * every floor, live-inherited. Nobody had read it.
 *
 * So this is the same editor the catalog uses, at `scope="catalog"`, opened
 * on what the studio sent. One implementation, another door — the pattern
 * `StudioInventoryManager` already follows across three. An admin reads all
 * eight sections in the Academy's order, flips to "Read it as a trainer" to
 * see what the floor would see, and rewrites anything that is not house
 * language.
 *
 * SAVING HERE IS NOT PUBLISHING. It writes `reviewedDefinition` back onto the
 * submission, so the correction survives the admin closing the tab, a second
 * admin can pick the review up, and the queue has both versions to compare.
 * Publishing stays one deliberate tap on the queue, on the reviewed text.
 *
 * The submission is never edited in place: `definition` is what the studio
 * sent and stays that way, which is what makes `correctedFields` — and the
 * sentence the studio reads on its own floor — true.
 */
export function SubmissionReview({
  submission,
  catalog,
  onBack,
}: {
  submission: CatalogSubmissionDoc & { id: string };
  catalog: MachineCatalogEntry[];
  onBack: () => void;
}) {
  const { success: toastSuccess } = useToast();

  // What is on screen: corporate's corrections if this has been reviewed
  // before, otherwise what arrived. `definitionOf` normalises a stored
  // document that predates a field, the same way the catalog editor does.
  const value = useMemo(
    () =>
      definitionOf(
        (submission.reviewedDefinition ?? submission.definition) as MachineDefinition,
      ),
    [submission.reviewedDefinition, submission.definition],
  );

  const submitted = useMemo(
    () => definitionOf(submission.definition as MachineDefinition),
    [submission.definition],
  );

  const review = useMemo(
    () => reviewSubmission(submission, value, catalog),
    [submission, value, catalog],
  );

  const corrections = useMemo(
    () => correctedFields(submitted, value),
    [submitted, value],
  );

  const save = async (_patch: Partial<MachineDefinition>, draft: MachineDefinition) => {
    // The DRAFT, not the patch. A review is the whole machine as corporate
    // would publish it; a patch is only this sitting's edits, and saving that
    // would drop every correction made in an earlier one.
    try {
      await updateDoc(doc(db, "catalogSubmissions", submission.id), {
        reviewedDefinition: draft,
        reviewedBy: auth.currentUser?.uid ?? null,
        reviewedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, "catalogSubmissions");
      throw new Error("Could not save the review. Catalog decisions are administrators'.");
    }
    toastSuccess(
      "Review saved. Nothing is published yet — the queue's Publish is what puts it in the catalog.",
    );
  };

  return (
    <MachineEditor
      value={value}
      scope="catalog"
      whose={`Offered by ${submission.studioName}`}
      backLabel="Catalog"
      onBack={onBack}
      onSave={save}
      notice={
        <>
          <AdminNotice tone={review.verdict === "incomplete" ? "warn" : "info"}>
            <strong>{review.headline}</strong>
            <br />
            You are reading {submission.studioName}&apos;s machine, not a catalog
            entry. Nothing here is live: saving keeps your corrections on the
            offer, and Publish back on the Catalog is what puts it in front of
            every studio.
            {submission.note && (
              <>
                <br />
                <em>{submission.submittedByName} wrote: &ldquo;{submission.note}&rdquo;</em>
              </>
            )}
          </AdminNotice>

          {review.blocking.length > 0 && (
            <AdminNotice tone="alert">
              <strong>It cannot be published yet.</strong> Every location
              inherits a catalog machine, so these are the fields the floor
              would read wrong without:
              <ul className="adm-me__warnlist">
                {review.blocking.map((g) => (
                  <li key={g.id}>{g.what}</li>
                ))}
              </ul>
            </AdminNotice>
          )}

          {review.authored.length > 0 && (
            <AdminNotice tone="info">
              <strong>Publishing adopts {submission.studioName}&apos;s words</strong>{" "}
              for {describeFields(review.authored.map((a) => a.field))}. Those
              are the sections Max Strength owns everywhere else — read them as
              the standard they would become, and rewrite anything that is not
              how we say it.
            </AdminNotice>
          )}

          {corrections.length > 0 && (
            <AdminNotice tone="ok">
              Corporate has already rewritten {describeFields(corrections)} on
              this offer. {submission.studioName} is told so when it publishes.
            </AdminNotice>
          )}
        </>
      }
    />
  );
}
