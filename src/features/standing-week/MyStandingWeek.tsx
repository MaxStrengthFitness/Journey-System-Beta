import { useMemo, useState } from "react";
import { studioTodayKey } from "../../lib/studio-time";
import type { Client, Trainer } from "../../types";
import { useDirtyForm } from "../admin/useDirtyForm";
import { AwayEditor } from "./AwayEditor";
import { formOf, myWeekSentence, weekChanges, weekOfForm, type WeekForm } from "./present";
import { proposeWeek, setAway, type WeekOwner, type WeekSigner } from "./store";
import { useStandingWeek } from "./useStandingWeeks";
import { weekStatus } from "./week";
import { WeekEditor } from "./WeekEditor";
import "./standing-week.css";

/**
 * MY PROFILE → MY STANDING WEEK (voice-review round, Sep 27 2026).
 *
 * AJ: "Trainers should propose and set their own ideal week via my profile
 * while leaders review and finalize those standings with newly focused team
 * section." The trainer's own profile only, at the studio the iPad is in:
 * the hours they usually work here and their regulars. Saving PROPOSES it;
 * a studio leader agrees it on My Studio → Team. Nothing goes to Mindbody.
 *
 * Styled as one of the profile's own cards (trainer-profile.css); the editor
 * inside is the one Team uses too.
 *
 * Below it, Away (voice review follow-up): the days the trainer is away,
 * saved as each range is added or removed. It needs no agreement and no
 * proposal, and the week check leaves those days alone.
 */

export interface MyStandingWeekProps {
  /** The signed-in trainer's live document. */
  trainer: Pick<Trainer, "id" | "fullName">;
  /** The signed-in person's Auth uid: the document's id, and what the rules pin. */
  authUid: string;
  studioId: string;
  studioName: string;
  /** The studio's clients, for choosing a regular. */
  clients: Client[];
  tz?: string;
}

export function MyStandingWeek({ trainer, authUid, studioId, studioName, clients, tz }: MyStandingWeekProps) {
  const { doc, loading, error } = useStandingWeek(studioId, authUid);
  const status = weekStatus(doc);
  const today = studioTodayKey(new Date(), tz);
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

  const owner: WeekOwner = { studioId, trainerUid: authUid, trainerId: trainer.id, trainerName: trainer.fullName ?? "" };
  const signer: WeekSigner = { uid: authUid, name: trainer.fullName ?? "" };

  // The editor starts from the proposal when there is one, else the agreed week.
  const baseline = useMemo(() => formOf(doc?.proposed ?? doc?.final ?? null), [doc]);
  const form = useDirtyForm<WeekForm>(
    baseline,
    async (patch) => {
      await proposeWeek(owner, weekOfForm({ ...baseline, ...patch }), signer);
    },
    { label: "your standing week" },
  );

  const withdraw = async () => {
    setWithdrawing(true);
    setWithdrawError(null);
    try {
      await proposeWeek(owner, null, signer);
    } catch (err) {
      console.warn("[standing-week] withdraw failed:", err);
      setWithdrawError("Couldn't take it back just now. Check the connection and try again.");
    } finally {
      setWithdrawing(false);
    }
  };

  const saveLabel = status === "none" ? "Propose this week" : status === "agreed" ? "Propose the change" : "Update my proposal";
  const changes = status === "changed" && doc ? weekChanges(doc.final, doc.proposed) : [];

  return (
    <section className="tp-card" aria-labelledby="my-standing-week">
      <div className="tp-card__head">
        <h2 className="tp-card__title" id="my-standing-week">
          My standing week
        </h2>
        <span className="tp-card__count">{studioName}</span>
      </div>
      <div className="tp-card__body">
        {loading ? (
          <p className="stw-hint">Reading your week…</p>
        ) : error ? (
          <p className="stw-hint" role="status">
            {error}
          </p>
        ) : (
          <>
            <p className="stw-status" data-testid="my-week-status">
              {myWeekSentence(doc, tz)}
            </p>
            {changes.length > 0 && (
              <ul className="stw-changes" aria-label="Your change">
                {changes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            )}
            <p className="stw-lede">
              The hours you usually work at {studioName}, and your regulars — who you train, and when. Proposing it
              sends it to a studio leader to agree. Once agreed, each coming week's bookings are checked against it, so
              the studio sees an open slot in time to fill it. Nothing is sent to Mindbody: the front desk books your
              regulars there, as always.
            </p>
            <WeekEditor
              value={form.value}
              onChange={(next) => form.setFields(next)}
              clients={clients}
              noteLabel="Note for your studio leader (optional)"
              disabled={form.status === "saving"}
            />
            <div className="stw-actions">
              {form.status === "saved" && <p className="stw-actions__msg stw-actions__msg--ok">Proposed.</p>}
              {form.error && (
                <p className="stw-actions__msg stw-actions__msg--error" role="alert">
                  Couldn't propose it just now: {form.error}
                </p>
              )}
              {withdrawError && (
                <p className="stw-actions__msg stw-actions__msg--error" role="alert">
                  {withdrawError}
                </p>
              )}
              {!form.dirty && (status === "proposed" || status === "changed") && (
                <button type="button" className="tp-btn tp-btn--ghost" disabled={withdrawing} onClick={withdraw}>
                  {status === "changed" ? "Keep the agreed week" : "Take back my proposal"}
                </button>
              )}
              {form.dirty && (
                <button type="button" className="tp-btn tp-btn--ghost" disabled={form.status === "saving"} onClick={form.discard}>
                  Discard
                </button>
              )}
              <button
                type="button"
                className="tp-btn tp-btn--primary"
                disabled={!form.dirty || form.status === "saving"}
                onClick={() => void form.save()}
              >
                {form.status === "saving" ? "Proposing…" : saveLabel}
              </button>
            </div>
            <AwayEditor away={doc?.away} today={today} tz={tz} whose="your" onSave={(next) => setAway(owner, next, today)} />
          </>
        )}
      </div>
    </section>
  );
}
