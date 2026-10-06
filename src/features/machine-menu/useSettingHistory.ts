/**
 * THE MACHINE MENU — the client's setting changes on one machine, read ONCE
 * when the card opens.
 *
 * One `getDocs` of `machines/{id}/settingHistory` for this client, replacing
 * the old Change history card's live listener (machine menu design §C, "The
 * two folded rows"). The host reads it once and shares the answer with the
 * three places that use it: the chart's set-up lane, the Settings heading's
 * "Last changed", and the Setting changes list (and settings-copy.ts, which
 * keeps the journal's copies of a save out of the notes).
 *
 * A read that failed is "failed", never an empty list: "No settings saved
 * yet" would be a confident wrong claim. A read only this iPad's cache could
 * answer (offline) is "cache-only": its rows are shown, and said to be so.
 * After a save the card calls `reload`, and the iPad's own write is in the
 * answer at once.
 *
 * The query is a single equality on a machine's settingHistory, which every
 * client on that machine shares, so it is served by the settingHistory
 * (clientId, timestamp) index (R1, Oct 5 2026; this database is the
 * Enterprise edition, which builds no index by itself).
 */
import { useCallback, useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import { parseSettingHistory, type SettingHistoryDoc, type SettingRow } from "./setting-history";

export type SettingHistoryState = "loading" | "ready" | "cache-only" | "failed";

export interface SettingHistoryRead {
  /** The parsed rows; null while the read is out and after it failed. */
  rows: SettingRow[] | null;
  state: SettingHistoryState;
  /** Read again (Try again, and after a save). */
  reload: () => void;
}

interface Answer {
  key: string;
  rows: SettingRow[] | null;
  state: Exclude<SettingHistoryState, "loading">;
}

export function useSettingHistory(machineId: string | null | undefined, clientId: string | null | undefined, enabled = true): SettingHistoryRead {
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [round, setRound] = useState(0);
  const key = `${machineId ?? ""}|${clientId ?? ""}|${round}`;

  useEffect(() => {
    if (!enabled || !machineId || !clientId) return;
    let live = true;
    getDocs(query(collection(db, "machines", machineId, "settingHistory"), where("clientId", "==", clientId))).then(
      (snap) => {
        if (!live) return;
        const docs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as SettingHistoryDoc) }));
        setAnswer({ key, rows: parseSettingHistory(docs, clientId), state: snap.metadata?.fromCache ? "cache-only" : "ready" });
      },
      (err) => {
        console.warn("[machine menu] setting changes not read", machineId, err);
        if (live) setAnswer({ key, rows: null, state: "failed" });
      },
    );
    return () => {
      live = false;
    };
  }, [enabled, machineId, clientId, key]);

  const reload = useCallback(() => setRound((r) => r + 1), []);
  // An answer for another machine, client or round is not this one's: loading
  // until this read answers. A reload keeps the rows already shown.
  if (!answer) return { rows: null, state: "loading", reload };
  if (answer.key !== key) {
    const same = answer.key.split("|").slice(0, 2).join("|") === key.split("|").slice(0, 2).join("|");
    return same ? { rows: answer.rows, state: answer.state, reload } : { rows: null, state: "loading", reload };
  }
  return { rows: answer.rows, state: answer.state, reload };
}
