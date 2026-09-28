/**
 * ADMINS → HOME — what needs you, the network and the standard.
 *
 * Round: the Admins room (Sep 28 2026), AJ's pick "Command Center". The
 * dashboard used to open on the list of every location, and offers, Limbo,
 * failing syncs and bug reports each hid in their own tab. Home answers the
 * question an admin has when the screen opens, in the house grammar the
 * Operations Overview uses: a sentence, its proof, and a door.
 *
 *   What needs you   needs.ts: at most seven items, one per kind, each with
 *                    one condition that clears itself — nothing is stored
 *                    about an item, so there is no Take it, Snooze or
 *                    Dismiss (each would need a stored record: AJ's OK)
 *   The network      one sentence: where each studio stands, how the pulls go
 *   The standard     one sentence: the standard set, what waits on corporate
 *
 * It reads nothing of its own: the dashboard hands it what it read once when
 * it opened (useHomeSignals, useStudioLeases), and "Check again" reads those
 * documents again. Nothing asks Mindbody anything.
 */
import type { ReactNode } from "react";
import { Bug, CircleHelp, GitPullRequest, Inbox, Network, RefreshCw, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatStudioDate, formatStudioTime } from "../../../lib/studio-time";
import { AdminButton, AdminPanel, AdminScreen } from "../../admin/primitives";
import { needsHeadline, type NeedDoor, type NeedItem } from "./needs";
import "../admins.css";

const ICON: Record<string, ReactNode> = {
  "sync-failing": <RefreshCw aria-hidden="true" />,
  "mindbody-setup": <Settings2 aria-hidden="true" />,
  registry: <Network aria-hidden="true" />,
  limbo: <Inbox aria-hidden="true" />,
  offers: <GitPullRequest aria-hidden="true" />,
  bugs: <Bug aria-hidden="true" />,
  unknown: <CircleHelp aria-hidden="true" />,
};

export interface AdminsHomeProps {
  items: NeedItem[];
  more: NeedItem[];
  checkedAt: number | null;
  network: string;
  standard: string;
  onDoor: (door: NeedDoor) => void;
  onCheckAgain: () => void;
  onOpenStudios: () => void;
  onOpenMachines: () => void;
}

function NeedRow({ item, onDoor }: { item: NeedItem; onDoor: (door: NeedDoor) => void }) {
  return (
    <article className="hq-need" aria-label={item.say}>
      <span className={cn("hq-need__icon", `hq-need__icon--${item.tone}`)}>{ICON[item.id] ?? <Inbox aria-hidden="true" />}</span>
      <div className="hq-need__body">
        <span className="hq-need__kind">{item.kind}</span>
        <p className="hq-need__say">{item.say}</p>
        <p className="hq-need__proof">{item.proof}</p>
        <p className="hq-need__clears">{item.clears}</p>
      </div>
      <div className="hq-need__door">
        <AdminButton variant="primary" size="sm" onClick={() => onDoor(item.door)}>
          {item.door.label}
        </AdminButton>
      </div>
    </article>
  );
}

export function AdminsHome({ items, more, checkedAt, network, standard, onDoor, onCheckAgain, onOpenStudios, onOpenMachines }: AdminsHomeProps) {
  const today = formatStudioDate(new Date(), { weekday: "short", month: "short", day: "numeric" });
  const checking = checkedAt == null;

  return (
    <AdminScreen>
      <header className="hq-home__head">
        <p className="hq-home__eyebrow">Home · {today}</p>
        <h1 className="hq-home__headline">{checking ? "Checking every studio…" : needsHeadline(items.length + more.length)}</h1>
        <p className="hq-home__fresh">
          <span>{checking ? "Reading what the studios have written." : `Checked at ${formatStudioTime(checkedAt)}.`}</span>
          <span>Each item clears itself when its condition ends.</span>
          <AdminButton size="sm" onClick={onCheckAgain}>
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" /> Check again
          </AdminButton>
        </p>
      </header>

      <div className="hq-home__grid">
        <AdminPanel title={`What needs you · ${items.length + more.length}`} flush>
          {items.length === 0 ? (
            <div className="hq-home__calm">
              {checking ? "Checking…" : "Nothing needs you right now. Anything new lands here first."}
            </div>
          ) : (
            <div className="hq-needs">
              {items.map((item) => (
                <NeedRow key={item.id} item={item} onDoor={onDoor} />
              ))}
              {more.length ? (
                <p className="hq-home__more">
                  And {more.length} more: {more.map((m) => m.say).join(" ")}
                </p>
              ) : null}
            </div>
          )}
        </AdminPanel>

        <div className="hq-home__stack">
          <AdminPanel
            title="The network"
            actions={
              <AdminButton size="sm" variant="ghost" onClick={onOpenStudios}>
                All studios
              </AdminButton>
            }
          >
            <p className="hq-standing">{network}</p>
          </AdminPanel>
          <AdminPanel
            title="The standard"
            actions={
              <AdminButton size="sm" variant="ghost" onClick={onOpenMachines}>
                Machines
              </AdminButton>
            }
          >
            <p className="hq-standing">{standard}</p>
          </AdminPanel>
        </div>
      </div>
    </AdminScreen>
  );
}
