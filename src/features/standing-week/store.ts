/**
 * THE STANDING WEEK, READ AND WRITTEN (voice-review round, Sep 27 2026).
 *
 * studios/{studioId}/standingWeeks/{trainerUid} — one document per trainer at
 * a studio, keyed by the trainer's Auth uid, because the rules pin the
 * trainer's own writes to it (CLAUDE.md: "use the Auth uid"). `trainerId`
 * beside it is the trainers/{id} a booking carries; the two differ on older
 * accounts, which is why both are kept.
 *
 * Four writes, each through weekForWrite / awayForWrite (Firestore refuses
 * undefined):
 *
 *   proposeWeek  the trainer's own proposal, or null to take it back. The
 *                rules let a trainer write the proposal fields and nothing
 *                else, so a trainer can never agree their own week.
 *   agreeWeek    a leader agrees a week — the proposal as it stands, or
 *                changed first. The proposal is brought into line with it,
 *                so the trainer's next edit starts from the agreed week and
 *                the card says "agreed", not "changed since".
 *   setAway      the days a trainer is away (voice review follow-up): the
 *                trainer on My Profile, or a leader on Team. It needs no
 *                agreement and no proposal; past ranges drop off as it saves.
 *   removeWeek   a leader removes a trainer's week at the studio.
 *
 * Nothing here writes to Mindbody: the front desk books the regulars there,
 * exactly as before.
 */
import { deleteDoc, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { awayForWrite, weekForWrite, type AwayRange, type StandingWeek } from "./week";

/** Whose week it is. `trainerUid` is the Auth uid; `trainerId` the trainers/{id}. */
export interface WeekOwner {
  studioId: string;
  trainerUid: string;
  trainerId: string;
  trainerName: string;
}

/** Who is writing: the signed-in person's Auth uid and name. */
export interface WeekSigner {
  uid: string;
  name: string;
}

const NAME_MAX = 120;
const signed = (by: WeekSigner) => ({ id: by.uid, name: (by.name || "").trim().slice(0, NAME_MAX) });

export const standingWeekRef = (studioId: string, trainerUid: string) =>
  doc(db, "studios", studioId, "standingWeeks", trainerUid);

const ownerFields = (owner: WeekOwner) => ({
  studioId: owner.studioId,
  trainerUid: owner.trainerUid,
  trainerId: owner.trainerId,
  trainerName: (owner.trainerName || "").trim().slice(0, NAME_MAX),
});

/** The fields a proposal writes — and all a trainer may write. */
export function proposalWrite(owner: WeekOwner, week: StandingWeek | null, by: WeekSigner) {
  return {
    ...ownerFields(owner),
    proposed: week ? weekForWrite(week) : null,
    proposedAt: serverTimestamp(),
    proposedBy: signed(by),
  };
}

/** The fields an agreement writes. It never signs a proposal in the trainer's name. */
export function agreementWrite(owner: WeekOwner, week: StandingWeek, by: WeekSigner) {
  const agreed = weekForWrite(week);
  return {
    ...ownerFields(owner),
    proposed: agreed,
    final: agreed,
    finalAt: serverTimestamp(),
    finalBy: signed(by),
  };
}

/** The fields a change to the days away writes: whose week it is, and the list. */
export function awayWrite(owner: WeekOwner, away: readonly AwayRange[], today: string) {
  return {
    ...ownerFields(owner),
    away: awayForWrite(away, today),
  };
}

export async function proposeWeek(owner: WeekOwner, week: StandingWeek | null, by: WeekSigner): Promise<void> {
  await setDoc(standingWeekRef(owner.studioId, owner.trainerUid), proposalWrite(owner, week, by), { merge: true });
}

export async function agreeWeek(owner: WeekOwner, week: StandingWeek, by: WeekSigner): Promise<void> {
  await setDoc(standingWeekRef(owner.studioId, owner.trainerUid), agreementWrite(owner, week, by), { merge: true });
}

export async function setAway(owner: WeekOwner, away: readonly AwayRange[], today: string): Promise<void> {
  await setDoc(standingWeekRef(owner.studioId, owner.trainerUid), awayWrite(owner, away, today), { merge: true });
}

export async function removeWeek(studioId: string, trainerUid: string): Promise<void> {
  await deleteDoc(standingWeekRef(studioId, trainerUid));
}
