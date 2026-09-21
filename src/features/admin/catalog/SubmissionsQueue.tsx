/**
 * SUBMITTED BY STUDIOS — the queue of machines studios offered the catalog.
 *
 * Operations round, Sep 2026. The other end of My Studio → Machines →
 * "Offer to the MSF catalog" (features/my-studio/floor.ts): a studio's
 * leader wrote catalogSubmissions/{id} and a marker on their roster entry;
 * corporate decides here. Administrators only (the rules let a studio read
 * its own submissions, but deciding is super-admin work).
 *
 *   Read it    opens the machine in the catalog editor (SubmissionReview).
 *              Corporate reads all eight sections and rewrites anything that
 *              is not house language; what they save is what publishes.
 *   Publish    creates the catalog document from the REVIEWED definition
 *              (standard-set.ts / publishPlan: active, outside the standard
 *              set, last in the order), marks the submission published with
 *              the new id, records which fields corporate changed, updates
 *              the studio's roster marker — and then shows the PC command
 *              that migrates the studio's own id onto the catalog id
 *              (scripts/migrate-machine-id.ts), which is what makes the
 *              studio's history follow the machine. AJ chose the script over
 *              a Cloud Function (Sep 18): the migration walks every document
 *              and belongs where a person can read its dry run first.
 *   Decline    marks it declined with a note the studio can read on its
 *              floor ("Corporate passed: …").
 *
 * THE CATALOG GATE (Sep 2026). This screen used to decide from a name, a
 * studio, a submitter and a note. A studio's own machine carries a whole
 * definition — including the method — so Publish was adopting a franchise
 * leader's wording of the cadence and the cues as Max Strength's, sight
 * unseen, on every floor. `review.ts` is what the panel says now, and
 * `publishPlan` refuses a machine the floor would read wrong.
 *
 * Nothing here contacts anyone; the studio sees the outcome on its floor.
 */
import { useEffect, useMemo, useState } from "react";
import { BookOpen, Check, Inbox, X } from "lucide-react";
import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from "firebase/firestore";
import { auth, db } from "../../../firebase";
import { useMachineCatalog } from "../../../hooks/useMachineCatalog";
import { useToast } from "../../../contexts/ToastContext";
import { OperationType, handleFirestoreError } from "../../../lib/firestore-errors";
import type { MachineCatalogEntry, MachineDefinition } from "../../../types/machines";
import type { CatalogSubmissionDoc, RosterSubmissionMarker } from "../../my-studio/floor";
import { describeFields } from "../../../lib/machine-template";
import { AdminBadge, AdminButton, AdminEmpty, AdminField, AdminInput, AdminNotice, AdminPanel, AdminTextarea } from "../primitives";
import { catalogIdFor, migrationCommand, publishPlan } from "./standard-set";
import { correctedFields, reviewSubmission } from "./review";

/** What corporate would publish: their corrections if any, else what arrived. */
export const definitionUnderReview = (s: Pick<CatalogSubmissionDoc, "definition" | "reviewedDefinition">): MachineDefinition =>
  (s.reviewedDefinition ?? s.definition) as MachineDefinition;

type Submission = CatalogSubmissionDoc & { id: string; submittedAt?: unknown };

const millis = (v: unknown): number => {
  const d = (v as { toDate?: () => Date })?.toDate?.() ?? (v instanceof Date ? v : null);
  return d ? d.getTime() : 0;
};

export function SubmissionsQueue({ onReview }: { onReview: (submission: Submission) => void }) {
  const { catalog } = useMachineCatalog();
  const { success: toastSuccess, error: toastError } = useToast();
  const [pending, setPending] = useState<Submission[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [published, setPublished] = useState<{ submission: Submission; id: string } | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "catalogSubmissions"), where("status", "==", "pending")),
      (snap) => {
        setPending(
          snap.docs
            .map((d) => ({ ...(d.data() as CatalogSubmissionDoc & { submittedAt?: unknown }), id: d.id }) as Submission)
            .sort((a, b) => millis(a.submittedAt) - millis(b.submittedAt)),
        );
        setFailed(false);
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, "catalogSubmissions");
        setFailed(true);
        setPending([]);
      },
    );
    return () => unsub();
  }, []);

  const count = pending?.length ?? 0;

  return (
    <AdminPanel
      title="Submitted by studios"
      icon={<Inbox className="w-4 h-4" />}
      subtitle={
        failed
          ? "The queue could not be read just now."
          : count === 0
            ? "Nothing waiting. A studio offers one of its own machines from My Studio → Machines."
            : `${count} machine${count === 1 ? "" : "s"} waiting on corporate. Publish makes it a catalog machine every studio can adopt; the studio that offered it keeps its history through the id migration.`
      }
      actions={count > 0 ? <AdminBadge tone="hero">{count} waiting</AdminBadge> : undefined}
      flush
    >
      {published && (
        <div className="p-3">
          <AdminNotice tone="ok">
            <strong>{definitionUnderReview(published.submission).name}</strong> is in the catalog as <code>{published.id}</code>. Now move {published.submission.studioName}
            's history onto it — from the project folder on the PC, dry run first:
            <pre className="adm-sub__cmd">{migrationCommand(published.submission, published.id)}</pre>
            then the same line with <code>--commit</code>. Until it runs, the studio's floor still shows its own copy.
          </AdminNotice>
        </div>
      )}
      {pending === null ? (
        <div className="p-4">
          <AdminEmpty title="Reading the queue…" />
        </div>
      ) : pending.length === 0 ? (
        <div className="p-4">
          <AdminEmpty title="Nothing waiting" />
        </div>
      ) : (
        <ul className="adm-sub__list">
          {pending.map((s) => (
            <li key={s.id} className="adm-sub__row">
              <button type="button" className="adm-sub__head" onClick={() => setOpen(open === s.id ? null : s.id)} aria-expanded={open === s.id}>
                <span className="adm-sub__name">{definitionUnderReview(s)?.name ?? "Unnamed machine"}</span>
                <span className="adm-sub__meta">
                  {s.studioName} · {s.submittedByName}
                  {s.basedOn ? ` · based on ${catalog.find((m) => m.id === s.basedOn)?.name ?? s.basedOn}` : ""}
                </span>
                {/* The verdict on the row, so a queue of six says which one
                    needs an hour and which one needs a tap — the same reason
                    CatalogList names what each machine is still missing. */}
                <Verdict submission={s} catalog={catalog} />
                {s.note && <span className="adm-sub__note">“{s.note}”</span>}
              </button>
              {open === s.id && (
                <Decide
                  submission={s}
                  catalog={catalog}
                  onReview={() => onReview(s)}
                  onDone={(result) => {
                    setOpen(null);
                    if (result.kind === "published") {
                      setPublished({ submission: s, id: result.id });
                      toastSuccess(`${definitionUnderReview(s).name} published as ${result.id}.`);
                    } else if (result.kind === "declined") {
                      toastSuccess(`${definitionUnderReview(s).name} declined. ${s.studioName} will see why on its floor.`);
                    } else {
                      toastError(result.message);
                    }
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </AdminPanel>
  );
}

type DecideResult = { kind: "published"; id: string } | { kind: "declined" } | { kind: "failed"; message: string };

/** The one-line verdict on a queue row. */
function Verdict({ submission, catalog }: { submission: Submission; catalog: MachineCatalogEntry[] }) {
  const review = useMemo(
    () => reviewSubmission(submission, definitionUnderReview(submission), catalog),
    [submission, catalog],
  );
  const tone = review.verdict === "incomplete" ? "warn" : review.verdict === "read-it" ? "hero" : "ok";
  const word = review.verdict === "incomplete" ? "Not ready" : review.verdict === "read-it" ? "Read the method" : "Ready";
  return (
    <span className="adm-sub__verdict">
      <AdminBadge tone={tone}>{word}</AdminBadge>
      <span className="adm-sub__headline">{review.headline}</span>
    </span>
  );
}

function Decide({
  submission,
  catalog,
  onReview,
  onDone,
}: {
  submission: Submission;
  catalog: MachineCatalogEntry[];
  onReview: () => void;
  onDone: (r: DecideResult) => void;
}) {
  // What would actually be published — corporate's corrections when they have
  // reviewed it, what the studio sent when they have not. Everything on this
  // panel reads from this, so the id, the gate and the row never describe a
  // different machine from the one the button writes.
  const definition = useMemo(() => definitionUnderReview(submission), [submission]);
  const [id, setId] = useState(() => catalogIdFor(definition?.name ?? "", catalog.map((m) => m.id)));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"publish" | "decline" | null>(null);
  const review = useMemo(() => reviewSubmission(submission, definition, catalog), [submission, definition, catalog]);
  const plan = useMemo(
    () => publishPlan({ ...submission, definition }, catalog, id.trim()),
    [submission, definition, catalog, id],
  );
  const corrections = useMemo(
    () => correctedFields(submission.definition as MachineDefinition, definition),
    [submission.definition, definition],
  );

  const stamp = () => ({ decidedBy: auth.currentUser?.uid ?? null, decidedAt: serverTimestamp(), updatedAt: serverTimestamp() });

  const publish = async () => {
    if (plan.ok === false) return;
    setBusy("publish");
    try {
      // The catalog document first (rules: administrators), then the
      // decision, then the studio's marker — the marker is a copy and its
      // failure only warns, as it does when the offer is made.
      await setDoc(doc(db, "machines", plan.plan.id), {
        ...plan.plan.doc,
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser?.uid ?? null,
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.uid ?? null,
      });
      await updateDoc(doc(db, "catalogSubmissions", submission.id), {
        status: "published",
        publishedAs: plan.plan.id,
        decisionNote: note.trim(),
        // Where a catalog sentence came from, kept on the offer: what arrived
        // stays in `definition`, what went in is `reviewedDefinition`, and
        // this names the difference without anyone having to diff them.
        correctedFields: corrections,
        ...stamp(),
      });
      try {
        const marker: RosterSubmissionMarker = {
          id: submission.id,
          status: "published",
          ...(corrections.length > 0 ? { corrected: describeFields(corrections) } : {}),
        };
        const batch = writeBatch(db);
        batch.set(doc(db, "studios", submission.studioId, "roster", submission.machineId), { submission: marker }, { merge: true });
        await batch.commit();
      } catch (err) {
        console.warn("[catalog] the roster marker could not be updated", err);
      }
      onDone({ kind: "published", id: plan.plan.id });
    } catch (err) {
      console.error(err);
      onDone({ kind: "failed", message: "Could not publish. Catalog writes are administrators'." });
    } finally {
      setBusy(null);
    }
  };

  const decline = async () => {
    setBusy("decline");
    try {
      await updateDoc(doc(db, "catalogSubmissions", submission.id), { status: "declined", decisionNote: note.trim(), ...stamp() });
      try {
        await setDoc(doc(db, "studios", submission.studioId, "roster", submission.machineId), { submission: { id: submission.id, status: "declined" } satisfies RosterSubmissionMarker }, { merge: true });
      } catch (err) {
        console.warn("[catalog] the roster marker could not be updated", err);
      }
      onDone({ kind: "declined" });
    } catch (err) {
      console.error(err);
      onDone({ kind: "failed", message: "Could not record the decision." });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="adm-sub__decide">
      {/* What the admin is actually deciding about. This panel used to show
          the id and a note box — the machine itself was invisible, and
          Publish adopted its method as the company's. */}
      <AdminNotice tone={review.verdict === "incomplete" ? "warn" : "info"}>
        {review.headline}
      </AdminNotice>

      {review.authored.length > 0 && (
        <p className="adm-sub__why">
          <strong>Publishing makes these Max Strength&apos;s words:</strong>{" "}
          {describeFields(review.authored.map((a) => a.field))}. Read them
          first — every location inherits them and a trainer is told to trust
          the screen.
        </p>
      )}

      {review.likeness && review.likeness.differs.length > 0 && (
        <p className="adm-sub__why">
          Against <strong>{review.likeness.standardName}</strong> it differs on{" "}
          {describeFields(review.likeness.differs)}
          {review.likeness.method.length === 0
            ? " — all hardware. A second catalog entry may be the wrong answer; the studio could override its copy instead."
            : `, ${describeFields(review.likeness.method)} among them.`}
        </p>
      )}

      {review.blocking.length > 0 && (
        <AdminNotice tone="alert">
          <strong>Not publishable yet.</strong> It still needs{" "}
          {review.blocking.map((g) => g.what).join(", ")}. Open it and fill
          them in — what you save there is what publishes.
        </AdminNotice>
      )}

      {review.remaining.length > 0 && review.blocking.length === 0 && (
        <p className="adm-sub__why">
          Thin but publishable — no {review.remaining.map((g) => g.what).join(", no ")}.
          A studio adopting it overrides those anyway; half the catalog has the
          same blanks.
        </p>
      )}

      {corrections.length > 0 && (
        <AdminNotice tone="ok">
          You have rewritten {describeFields(corrections)} on this offer.
          Publishing sends your version, and {submission.studioName} is told
          which parts changed.
        </AdminNotice>
      )}

      <div className="adm-sub__buttons">
        <AdminButton variant="quiet" onClick={onReview}>
          <BookOpen className="w-3.5 h-3.5" /> Read the machine
        </AdminButton>
      </div>

      <AdminField label="Catalog id" hint="m- and the name; every studio will see this id. Change it only if the suggestion reads wrong." htmlFor={`sub-id-${submission.id}`}>
        <AdminInput id={`sub-id-${submission.id}`} value={id} onChange={(e) => setId(e.target.value)} invalid={plan.ok === false} />
      </AdminField>
      {plan.ok === false && <p className="adm-sub__why">{plan.reason}</p>}
      <AdminField label="A note for the studio" hint="Why it was published or passed. Optional." htmlFor={`sub-note-${submission.id}`}>
        <AdminTextarea id={`sub-note-${submission.id}`} rows={2} value={note} onChange={(e) => setNote(e.target.value.slice(0, 500))} />
      </AdminField>
      <div className="adm-sub__buttons">
        <AdminButton variant="primary" busy={busy === "publish"} disabled={plan.ok === false || busy !== null} onClick={() => void publish()}>
          <Check className="w-3.5 h-3.5" /> Publish to the catalog
        </AdminButton>
        <AdminButton variant="quiet" busy={busy === "decline"} disabled={busy !== null} onClick={() => void decline()}>
          <X className="w-3.5 h-3.5" /> Pass
        </AdminButton>
      </div>
    </div>
  );
}
