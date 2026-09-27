import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { studioTodayKey } from "../../lib/studio-time";
import { myTrainerIds } from "../../lib/live-session";
import type { RosterStatus } from "../../hooks/useStudioRoster";
import type { Client, Trainer } from "../../types";
import { KaizenMark } from "./KaizenMark";
import {
  CANT_READ_CLIENTS,
  MY_CLIENTS_SHOWN,
  WHAT_MY_CLIENTS_COUNTS,
  myClientRows,
  myClientsCutoverLine,
  noClientsSentence,
  sessionsWithYouSentence,
  type MyClientRow,
} from "./my-clients";

/**
 * MY PROFILE → MY CLIENTS (Openings round, phase 12, Sep 27 2026).
 *
 * The clients you have trained most in Journey, at the studio the iPad is
 * in, right after the Kaizen Roster: coached lately first, then everyone
 * else you have trained, twelve before "Show all". Your own profile only —
 * AJ described it for "my off time". my-clients.ts is the rule; it reads
 * nothing new, only the studio's client list the app already streams.
 *
 * While that list is loading or its read has failed the card says so and
 * lists nobody: an empty list would read as "you have trained no one".
 */
export interface MyClientsProps {
  trainer: Pick<Trainer, "id" | "authUid" | "claimedFromId" | "kaizenRoster">;
  /** The signed-in person's Auth uid, when known. */
  uid: string | null;
  clients: readonly Client[];
  studioId: string;
  studioName: string;
  /** This studio's `journeyCutoverDate`. */
  cutover: string | null;
  /**
   * The studio client list's state, from `useStudioRoster`. Absent (AppContent
   * doesn't pass it yet — a handoff of the Openings round): the card lists
   * the rows it can work out, but never says "no clients have sessions with
   * you" — the list it holds may be a single client opened earlier, or booked
   * visitors read by id after the roster's read failed — so with no rows it
   * says it can't read.
   */
  rosterStatus?: RosterStatus;
  tz?: string;
  onSelectClient: (clientId: string) => void;
}

export function MyClients({
  trainer,
  uid,
  clients,
  studioId,
  studioName,
  cutover,
  rosterStatus,
  tz,
  onSelectClient,
}: MyClientsProps) {
  const [showAll, setShowAll] = useState(false);
  const today = studioTodayKey(new Date(), tz);
  // Rows are worked out from a list the caller says was read, or — when it
  // doesn't say — from whatever list it holds.
  const readable = rosterStatus === "ready" || (rosterStatus === undefined && clients.length > 0);

  const ids = useMemo(() => myTrainerIds(trainer, uid), [trainer, uid]);
  const rosterIds = useMemo(() => new Set((trainer.kaizenRoster ?? []).map((e) => e.clientId)), [trainer.kaizenRoster]);
  const rows = useMemo(
    () => (readable ? myClientRows(clients, { studioId, ids, rosterIds, cutover, today }) : []),
    [readable, clients, studioId, ids, rosterIds, cutover, today],
  );
  // "No clients have sessions with you" only off a list known to be read in
  // full: an unread, failed or unknown list with no rows says it can't read.
  const cantRead = !readable || (rows.length === 0 && rosterStatus !== "ready");

  const shown = showAll ? rows : rows.slice(0, MY_CLIENTS_SHOWN);
  const lately = shown.filter((r) => r.coachedLately);
  const others = shown.filter((r) => !r.coachedLately);
  const migrating = myClientsCutoverLine(studioName, cutover, today);

  return (
    <section className="tp-card tp-mc" aria-labelledby="my-clients-title" data-testid="my-clients">
      <div className="tp-card__head">
        <h2 className="tp-card__title" id="my-clients-title">
          My clients
        </h2>
        {!cantRead && rows.length > 0 && (
          <span className="tp-card__count">
            {rows.length} {rows.length === 1 ? "client" : "clients"}
          </span>
        )}
      </div>

      {cantRead ? (
        <div className="tp-card__body">
          <p className="tp-mc__state" role="status" data-testid="my-clients-state">
            {CANT_READ_CLIENTS}
          </p>
        </div>
      ) : rows.length === 0 ? (
        <div className="tp-card__body">
          <p className="tp-mc__state" data-testid="my-clients-state">
            {noClientsSentence(studioName)}
          </p>
        </div>
      ) : (
        <div className="tp-rows">
          {lately.length > 0 && <p className="tp-mc__group">Coached lately · the last 60 days</p>}
          {lately.map((row) => (
            <ClientRow key={row.clientId} row={row} onOpen={onSelectClient} />
          ))}
          {others.length > 0 && lately.length > 0 && <p className="tp-mc__group">Also trained with you</p>}
          {others.map((row) => (
            <ClientRow key={row.clientId} row={row} onOpen={onSelectClient} />
          ))}
        </div>
      )}

      <div className="tp-card__body tp-mc__foot">
        {!cantRead && rows.length > MY_CLIENTS_SHOWN && (
          <button type="button" className="tp-btn" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
            {showAll ? `Show the first ${MY_CLIENTS_SHOWN}` : `Show all ${rows.length}`}
          </button>
        )}
        {migrating && <p className="tp-mc__note">{migrating}</p>}
        <p className="tp-mc__note">{WHAT_MY_CLIENTS_COUNTS}</p>
      </div>
    </section>
  );
}

function ClientRow({ row, onOpen }: { row: MyClientRow; onOpen: (clientId: string) => void }) {
  const sub = [sessionsWithYouSentence(row.sessions), row.last].filter(Boolean).join(" · ");
  return (
    <button type="button" className="tp-row" onClick={() => onOpen(row.clientId)} data-testid="my-client-row">
      <span className="tp-mc__mark">{row.onRoster && <KaizenMark size={15} quiet title="On your Kaizen Roster" />}</span>
      <span className="tp-row__main">
        <span className="tp-row__name tp-mc__name">{row.name}</span>
        <span className="tp-row__sub tp-mc__sub">{sub}</span>
      </span>
      <ChevronRight size={16} aria-hidden style={{ opacity: 0.5, flex: "0 0 auto" }} />
    </button>
  );
}
