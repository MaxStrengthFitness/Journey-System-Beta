/**
 * "My renewals" — on a trainer's own profile: clients they have coached in
 * the last 60 days whose renewal is coming up (proposal §4.4).
 *
 * One query, scoped to the trainer's home studio (the rules need the studio
 * in the query to allow it): clients whose nightly snapshot lists this
 * trainer among their coaches. Styled with the trainer profile's own card
 * classes (trainer-profile.css).
 */

import { useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { collection, limit, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import type { Client, Trainer } from "../../types";
import { studioTodayKey } from "../../lib/studio-time";
import { daysBetween } from "../client-history/model";
import { chipText } from "./sentences";
import { renewalPromptDue } from "./conversation";

/** "Coming up" on a trainer's own list: ends within this many days. */
const SOON_DAYS = 60;

export function MyRenewals({
  trainer,
  onSelectClient,
}: {
  trainer: Pick<Trainer, "id" | "primaryHomeStudioId">;
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
        <div className="tp-rows">
          {rows.map((c) => (
            <button key={c.id} type="button" className="tp-row" onClick={() => onSelectClient(c.id!)}>
              <span className="tp-row__main">
                <span className="tp-row__name">
                  {c.firstName} {c.lastName}
                </span>
                <span className="tp-row__sub">{chipText(c.renewal, today)}</span>
              </span>
              <ChevronRight size={16} aria-hidden style={{ opacity: 0.5, flex: "0 0 auto" }} />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
