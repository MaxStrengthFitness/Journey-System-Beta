/**
 * WHERE STUDIOS SET THEIR OWN — the quiet card at the top of Admins → The
 * MSF standard → Machines (AJ's q6, the Admins room, Sep 28 2026).
 *
 * One line per machine where two studios or more set their own value for
 * the same house default (studio-defaults.ts). No badge on any machine and
 * no mark on the catalog's rows (AJ, q8: "I don't want there to be five
 * markings on the document"): a card of sentences, and nothing at all to
 * look at while no default is set differently at two studios.
 *
 * The read: each real studio's floor (`studios/{s}/roster`), once, when
 * this page opens — a plain read of each studio's own list, one per studio,
 * the lists every floor screen already reads. No index, no listener. A
 * studio whose floor couldn't be read is named, never counted as agreeing.
 */
import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { Sparkles } from "lucide-react";
import { db } from "../../../firebase";
import type { Studio } from "../../../types";
import type { MachineCatalogEntry } from "../../../types/machines";
import { isDemoStudio } from "../../demo-mode/is-demo";
import { AdminPanel } from "../../admin/primitives";
import { defaultSignals, signalLine, MIN_STUDIOS, type RosterDocLike } from "./studio-defaults";
import "../admins.css";

type RosterRead = { state: "loading" } | { state: "ok"; entries: RosterDocLike[] } | { state: "failed" };

function useStudioRosters(studioIds: readonly string[]): Record<string, RosterRead> {
  const [reads, setReads] = useState<Record<string, RosterRead>>({});
  const key = [...studioIds].sort().join(",");
  useEffect(() => {
    let cancelled = false;
    const ids = key ? key.split(",") : [];
    setReads(Object.fromEntries(ids.map((id) => [id, { state: "loading" } as RosterRead])));
    Promise.all(
      ids.map((id) =>
        getDocs(collection(db, "studios", id, "roster"))
          .then((snap): [string, RosterRead] => [id, { state: "ok", entries: snap.docs.map((d) => ({ machineId: d.id, ...(d.data() as RosterDocLike) })) }])
          .catch((): [string, RosterRead] => [id, { state: "failed" }]),
      ),
    ).then((pairs) => {
      if (!cancelled) setReads(Object.fromEntries(pairs));
    });
    return () => {
      cancelled = true;
    };
  }, [key]);
  return reads;
}

export function StudioDefaultsCard({ studios, catalog }: { studios: Studio[]; catalog: MachineCatalogEntry[] }) {
  const real = useMemo(() => studios.filter((s) => s.id && !isDemoStudio(s)), [studios]);
  const ids = useMemo(() => real.map((s) => s.id!), [real]);
  const reads = useStudioRosters(ids);
  const nameOf = (id: string) => real.find((s) => s.id === id)?.name ?? id;

  const loading = ids.some((id) => !reads[id] || reads[id].state === "loading");
  const failed = ids.filter((id) => reads[id]?.state === "failed");
  const rosters: Record<string, RosterDocLike[]> = {};
  for (const id of ids) {
    const r = reads[id];
    if (r?.state === "ok") rosters[id] = r.entries;
  }
  const signals = loading ? [] : defaultSignals(rosters, nameOf, catalog, MIN_STUDIOS);

  // Quiet: nothing to show, nothing drawn — unless a floor couldn't be read.
  if (loading || (signals.length === 0 && failed.length === 0) || real.length < MIN_STUDIOS) return null;

  return (
    <AdminPanel
      title="Where studios set their own"
      icon={<Sparkles className="w-3.5 h-3.5" />}
      subtitle="House defaults — baseline positions, body-type set-ups, dial defaults, starting loads — that two studios or more changed on their own copy. When several do, the standard may be the thing to look at."
    >
      {signals.length > 0 ? (
        <ul className="hq-defaults">
          {signals.map((s) => (
            <li key={`${s.machineId}|${s.path}`} className="hq-defaults__line">
              {signalLine(s)}
            </li>
          ))}
        </ul>
      ) : null}
      {failed.length > 0 ? (
        <p className="hq-standing">
          {`Couldn't read ${failed.map(nameOf).join(", ")}'s floor just now, so ${failed.length === 1 ? "it is" : "they are"} not counted here.`}
        </p>
      ) : null}
    </AdminPanel>
  );
}
