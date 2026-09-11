/**
 * The Hub's renewal lane: clients on this week's schedule with a renewal
 * conversation due — the proposal's "Clients waiting on us" renewal items.
 *
 * Built from the clients the Hub already has (this week's roster) and their
 * nightly snapshots, so it costs no extra reads per client. One small
 * listener adds "a leader was asked to follow up" from the studio's renewal
 * cycles. Styled with the Hub's own lane classes (studio-hub.css), and like
 * the client-task lane its big target opens the client.
 */

import { useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import type { Client } from "../../types";
import { studioTodayKey } from "../../lib/studio-time";
import { chipText } from "./sentences";
import { renewalPromptDue } from "./conversation";
import type { RenewalCycle } from "./types";

const SHOW = 8;

const ORDER: Record<string, number> = { ended: 0, "will-bank": 1, "will-run-out": 2, "on-track": 3 };

export function RenewalsLane({
  studioId,
  clients,
  onOpenClient,
}: {
  studioId: string | null;
  clients: Client[] | undefined;
  onOpenClient?: (clientId: string) => void;
}) {
  const [needsLeader, setNeedsLeader] = useState<Set<string>>(new Set());

  useEffect(() => {
    setNeedsLeader(new Set());
    if (!studioId) return;
    return onSnapshot(
      query(collection(db, "studios", studioId, "renewals"), where("needsLeader", "==", true)),
      // Keyed by client AND cycle: a flag left on a package that has since
      // been replaced must not keep the client here forever.
      (snap) => setNeedsLeader(new Set(snap.docs.map((d) => `${(d.data() as RenewalCycle).clientId}|${d.id}`))),
      () => setNeedsLeader(new Set()),
    );
  }, [studioId]);

  const today = studioTodayKey();
  const rows = useMemo(() => {
    const seen = new Set<string>();
    return (clients ?? [])
      .filter((c) => {
        if (!c.id || seen.has(c.id) || c.homeStudioId !== studioId) return false;
        seen.add(c.id);
        return renewalPromptDue(c.renewal) || needsLeader.has(`${c.id}|${c.renewal?.cycleKey ?? ""}`);
      })
      .sort(
        (a, b) =>
          (ORDER[a.renewal?.situation ?? ""] ?? 9) - (ORDER[b.renewal?.situation ?? ""] ?? 9) ||
          (a.renewal?.focusDate ?? "9999").localeCompare(b.renewal?.focusDate ?? "9999"),
      );
  }, [clients, studioId, needsLeader]);

  if (rows.length === 0) return null;

  return (
    <section className="sh__lane" aria-label="Renewal conversations">
      <header className="sh__lane-head sh__lane-head--static">
        <h2 className="sh__lane-title">Renewals to talk about</h2>
        <span className="sh__lane-count tabular">{rows.length}</span>
      </header>
      <ul className="sh__clients">
        {rows.slice(0, SHOW).map((c) => {
          const what = [
            c.renewal ? chipText(c.renewal, today) : null,
            needsLeader.has(`${c.id}|${c.renewal?.cycleKey ?? ""}`) ? "a leader was asked to follow up" : null,
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <li key={c.id} className="sh__client">
              {onOpenClient ? (
                <button type="button" className="sh__client-main" onClick={() => onOpenClient(c.id!)}>
                  <span className="sh__client-name">
                    {c.firstName} {c.lastName}
                  </span>
                  <span className="sh__client-what">{what}</span>
                  <ChevronRight size={15} className="sh__client-go" aria-hidden />
                </button>
              ) : (
                <span className="sh__client-main sh__client-main--flat">
                  <span className="sh__client-name">
                    {c.firstName} {c.lastName}
                  </span>
                  <span className="sh__client-what">{what}</span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {rows.length > SHOW && (
        <p className="sh__empty-body">
          And {rows.length - SHOW} more on this week's schedule — the full list is in Operations → Renewals.
        </p>
      )}
    </section>
  );
}
