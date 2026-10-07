/**
 * "My renewals" — on a trainer's own profile: clients they have coached in
 * the last 60 days whose renewal is coming up (proposal §4.4).
 *
 * One query, scoped to the trainer's home studio (the rules need the studio
 * in the query to allow it): clients whose nightly snapshot lists this
 * trainer among their coaches. Styled with the trainer profile's own card
 * classes (trainer-profile.css).
 *
 * Since the renewals dashboard (Oct 7 2026) each client is the dashboard's
 * own row (RenewalRow.tsx), the one Operations → Clients → Renewals draws:
 * the package and its rate, when the commitment ends, sessions left part by
 * part, what will be left when it ends, who last talked to them, the
 * signals, and the renewal plan, which the trainer may set (anyone who
 * works at the studio may; permissions.ts canSetRenewalPlan). The cycles
 * are one chunked read for just these clients; the studio's renewal
 * settings one small listener.
 */

import { useEffect, useMemo, useState } from "react";
import { collection, limit, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import type { Client, Trainer } from "../../types";
import { studioTodayKey } from "../../lib/studio-time";
import { daysBetween } from "../client-history/model";
import { renewalPromptDue } from "./conversation";
import { nextStep } from "./pipeline";
import { canSetRenewalPlan } from "./permissions";
import { RenewalRow, RenewalRowList } from "./RenewalRow";
import { useCyclesRead } from "./usePipeline";
import { useRenewalSettings } from "./useRenewalSettings";

/** "Coming up" on a trainer's own list: ends within this many days. */
const SOON_DAYS = 60;

const NO_TRAINERS: Trainer[] = [];

export function MyRenewals({
  trainer,
  trainers = NO_TRAINERS,
  onSelectClient,
}: {
  trainer: Pick<
    Trainer,
    "id" | "fullName" | "role" | "primaryHomeStudioId" | "accessibleStudioIds" | "activeGuestStudioIds" | "ownedStudioIds"
  > &
    Partial<Pick<Trainer, "managedStudioIds">>;
  /** Everyone on staff the app holds: each row's primary trainer by name. */
  trainers?: Trainer[];
  onSelectClient: (clientId: string) => void;
}) {
  const [clients, setClients] = useState<Client[]>([]);
  const [error, setError] = useState(false);
  const studioId = trainer.primaryHomeStudioId;
  const trainerId = trainer.id;

  useEffect(() => {
    setClients([]);
    setError(false);
    if (!studioId || !trainerId) return;
    return onSnapshot(
      query(
        collection(db, "clients"),
        where("homeStudioId", "==", studioId),
        where("renewal.coachIds", "array-contains", trainerId),
        limit(100),
      ),
      (snap) => setClients(snap.docs.map((d) => ({ ...(d.data() as Client), id: d.id }))),
      (err) => {
        console.warn("[renewals] my renewals read failed:", err);
        setError(true);
      },
    );
  }, [studioId, trainerId]);

  const today = studioTodayKey();
  const rows = useMemo(
    () =>
      clients
        .filter((c) => {
          const s = c.renewal;
          if (!s || s.situation === "lapsed" || s.situation === "unknown" || s.situation === "away") return false;
          if (renewalPromptDue(s)) return true;
          return Boolean(s.focusDate && daysBetween(today, s.focusDate) <= SOON_DAYS);
        })
        .sort((a, b) => (a.renewal?.focusDate ?? "9999").localeCompare(b.renewal?.focusDate ?? "9999")),
    [clients, today],
  );

  const renewals = useRenewalSettings(studioId);
  const cycleKeys = useMemo(() => rows.map((c) => c.renewal?.cycleKey ?? "").filter(Boolean), [rows]);
  const { cycles, loading: cyclesLoading, failed: cyclesFailed } = useCyclesRead(studioId ?? null, cycleKeys);
  const trainerNames = useMemo(() => {
    const m = new Map(trainers.filter((t) => t.id).map((t) => [t.id as string, t.fullName ?? ""]));
    if (trainer.id && trainer.fullName) m.set(trainer.id, trainer.fullName);
    return m;
  }, [trainers, trainer.id, trainer.fullName]);
  // A plan names a package from the studio's own table: it waits for that
  // table, never the defaults shown after a failed read.
  const canPlan =
    canSetRenewalPlan(trainer, studioId) && !renewals.loading && !renewals.error && renewals.forStudioId === studioId;
  const authorName = trainer.fullName?.trim() || "A trainer";

  return (
    <section className="tp-card">
      <div className="tp-card__head">
        <h2 className="tp-card__title">My renewals</h2>
        <span className="tp-card__count">Coached in the last 60 days</span>
      </div>
      {error ? (
        <div className="tp-card__body">
          <p className="tp-empty">Couldn't load your renewals just now.</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="tp-card__body">
          <p className="tp-empty">None of your recent clients is coming up for renewal in the next {SOON_DAYS} days.</p>
        </div>
      ) : (
        <RenewalRowList label="My renewals">
          {rows.map((c) => {
            const s = c.renewal!;
            const cycle = s.cycleKey ? cycles[s.cycleKey] ?? null : null;
            const name = `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim();
            return (
              <RenewalRow
                key={c.id}
                studioId={studioId as string}
                clientId={c.id as string}
                name={name}
                snapshot={s}
                cycle={cycle}
                cyclesFailed={cyclesFailed}
                cyclesLoading={cyclesLoading}
                settings={renewals.settings}
                today={today}
                trainerName={s.primaryTrainerId ? trainerNames.get(s.primaryTrainerId) || null : null}
                nextStep={nextStep(s, cycle, renewals.settings, today)}
                onOpen={() => onSelectClient(c.id as string)}
                canPlan={canPlan}
                authorName={authorName}
              />
            );
          })}
        </RenewalRowList>
      )}
    </section>
  );
}
