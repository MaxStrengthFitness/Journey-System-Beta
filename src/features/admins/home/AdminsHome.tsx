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
 *                    one condition that clears itself
 *   The network      one sentence: where each studio stands, how the pulls go
 *   The standard     one sentence: the standard set, what waits on corporate
 *
 * The second wave (Sep 28 2026, AJ "all yes"): each item's More opens Take
 * it, Snooze and Dismiss (home-marks.ts). Taken stays on Home with who took
 * it; snoozed and dismissed are set aside — a dismiss asks why — and come
 * back when the condition changes or the snooze's day comes. Right after a
 * snooze or a dismiss, Undo puts it back; later, Set aside lists them with
 * Bring it back. Nothing is hidden without a way back, and "Couldn't check"
 * is never marked.
 *
 * It reads nothing of its own: the dashboard hands it what it read once when
 * it opened (useHomeSignals, useStudioLeases, useHomeMarks), and "Check
 * again" reads those documents again. Nothing asks Mindbody anything.
 */
import { useState, type ReactNode } from "react";
import { Bug, CircleHelp, GitPullRequest, Inbox, Network, RefreshCw, Rocket, Settings2, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatStudioDate, formatStudioTime } from "../../../lib/studio-time";
import { AdminButton, AdminInput, AdminNotice, AdminPanel, AdminScreen } from "../../admin/primitives";
import { useUnsavedChanges } from "../../unsaved-changes";
import { MAX_NEEDS, needsHeadline, type NeedDoor, type NeedItem } from "./needs";
import { DISMISS_REASONS, REASON_MAX, isMarkable, markWords, snoozeUntil, sortNeeds, type HomeMark, type HomeMarkState, type MarkedNeed } from "./home-marks";
import type { ReadState } from "./useHomeSignals";
import { dayLabel } from "../studios/stages";
import "../admins.css";

const ICON: Record<string, ReactNode> = {
  "sync-failing": <RefreshCw aria-hidden="true" />,
  "mindbody-setup": <Settings2 aria-hidden="true" />,
  "launch-overdue": <Rocket aria-hidden="true" />,
  registry: <Network aria-hidden="true" />,
  limbo: <Inbox aria-hidden="true" />,
  offers: <GitPullRequest aria-hidden="true" />,
  bugs: <Bug aria-hidden="true" />,
  unknown: <CircleHelp aria-hidden="true" />,
};

export interface MarkInput {
  state: HomeMarkState;
  until?: string | null;
  reason?: string | null;
}

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
  /** Home's marks (Take it, Snooze, Dismiss), by item key; none while they couldn't be read. */
  marks?: Record<string, HomeMark>;
  marksState?: ReadState;
  /** The studio's today, yyyy-mm-dd: when a snooze ends. */
  today?: string;
  /** Mark an item; left out, Home offers no marks. */
  onMark?: (key: string, input: MarkInput) => Promise<void>;
  onClearMark?: (key: string) => Promise<void>;
}

type Tray = { key: string; mode: "menu" | "snooze" | "dismiss" } | null;

export function AdminsHome({
  items,
  more,
  checkedAt,
  network,
  standard,
  onDoor,
  onCheckAgain,
  onOpenStudios,
  onOpenMachines,
  marks = {},
  marksState = "ok",
  today = "",
  onMark,
  onClearMark,
}: AdminsHomeProps) {
  const dateLine = formatStudioDate(new Date(), { weekday: "short", month: "short", day: "numeric" });
  const checking = checkedAt == null;
  const [tray, setTray] = useState<Tray>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ key: string; words: string } | null>(null);
  const [asideOpen, setAsideOpen] = useState(false);

  useUnsavedChanges(Boolean(tray?.mode === "dismiss" && reason.trim()), "the reason for a dismiss", {
    onDiscard: () => {
      setReason("");
      setTray(null);
    },
  });

  const { shown, setAside } = sortNeeds([...items, ...more], marks, today);
  const visible = shown.slice(0, MAX_NEEDS);
  const overflow = shown.slice(MAX_NEEDS);
  const markable = Boolean(onMark && onClearMark);

  const act = async (key: string, run: () => Promise<void>, after?: () => void) => {
    setBusy(key);
    setError(null);
    try {
      await run();
      setTray(null);
      setReason("");
      after?.();
    } catch (err) {
      setError(`Couldn't save that just now: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
    }
  };

  const snooze = (n: MarkedNeed, choice: "tomorrow" | "week") => {
    const until = snoozeUntil(today, choice);
    void act(n.key, () => onMark!(n.key, { state: "snoozed", until }), () => setUndo({ key: n.key, words: `Snoozed “${n.item.say}” until ${dayLabel(until)}.` }));
  };
  const dismiss = (n: MarkedNeed, why: string) => {
    void act(n.key, () => onMark!(n.key, { state: "dismissed", reason: why.slice(0, REASON_MAX) }), () =>
      setUndo({ key: n.key, words: `Dismissed “${n.item.say}”: ${why}.` }),
    );
  };

  const row = (n: MarkedNeed) => {
    const { item, key, mark } = n;
    const open = tray?.key === key;
    const canMark = markable && isMarkable(item);
    return (
      <article key={item.id} className="hq-need" aria-label={item.say}>
        <span className={cn("hq-need__icon", `hq-need__icon--${item.tone}`)}>{ICON[item.id] ?? <Inbox aria-hidden="true" />}</span>
        <div className="hq-need__body">
          <span className="hq-need__kind">
            {item.kind}
            {mark ? <span className="hq-need__taken"> · {markWords(mark)}</span> : null}
          </span>
          <p className="hq-need__say">{item.say}</p>
          <p className="hq-need__proof">{item.proof}</p>
          <p className="hq-need__clears">{item.clears}</p>
        </div>
        <div className="hq-need__door">
          <AdminButton variant="primary" size="sm" onClick={() => onDoor(item.door)}>
            {item.door.label}
          </AdminButton>
          {canMark ? (
            <AdminButton
              size="sm"
              variant="ghost"
              aria-expanded={open}
              aria-label={`More: take, snooze or dismiss “${item.say}”`}
              onClick={() => {
                setTray(open ? null : { key, mode: "menu" });
                setReason("");
              }}
            >
              More
            </AdminButton>
          ) : null}
        </div>
        {open && tray ? (
          <div className="hq-need__tray" role="group" aria-label={`What to do with: ${item.say}`}>
            {tray.mode === "menu" ? (
              <>
                {mark?.state === "taken" ? (
                  <AdminButton size="sm" busy={busy === key} onClick={() => void act(key, () => onClearMark!(key))}>
                    Let it go
                  </AdminButton>
                ) : (
                  <AdminButton size="sm" busy={busy === key} onClick={() => void act(key, () => onMark!(key, { state: "taken" }))}>
                    Take it
                  </AdminButton>
                )}
                <AdminButton size="sm" onClick={() => setTray({ key, mode: "snooze" })}>
                  Snooze…
                </AdminButton>
                <AdminButton size="sm" onClick={() => setTray({ key, mode: "dismiss" })}>
                  Dismiss…
                </AdminButton>
                <p className="hq-need__trayline">Taking it tells the other administrators it&apos;s yours. {item.clears}</p>
              </>
            ) : tray.mode === "snooze" ? (
              <>
                <p className="hq-need__trayline">Snooze it until when? It comes back sooner if it changes.</p>
                <AdminButton size="sm" busy={busy === key} onClick={() => snooze(n, "tomorrow")}>
                  Until tomorrow
                </AdminButton>
                <AdminButton size="sm" busy={busy === key} onClick={() => snooze(n, "week")}>
                  For a week
                </AdminButton>
                <AdminButton size="sm" variant="ghost" onClick={() => setTray({ key, mode: "menu" })}>
                  Cancel
                </AdminButton>
              </>
            ) : (
              <>
                <p className="hq-need__trayline">Why dismiss it? It comes back if it changes.</p>
                {DISMISS_REASONS.map((r) => (
                  <AdminButton key={r} size="sm" busy={busy === key} onClick={() => dismiss(n, r)}>
                    {r}
                  </AdminButton>
                ))}
                <div className="hq-need__why">
                  <label className="adm-label" htmlFor={`hq-why-${item.id}`}>
                    Or say why
                  </label>
                  <AdminInput
                    id={`hq-why-${item.id}`}
                    className="hq-need__whyinput"
                    value={reason}
                    maxLength={REASON_MAX}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <AdminButton size="sm" variant="primary" disabled={!reason.trim()} busy={busy === key} onClick={() => dismiss(n, reason.trim())}>
                    Dismiss
                  </AdminButton>
                </div>
                <AdminButton
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setTray({ key, mode: "menu" });
                    setReason("");
                  }}
                >
                  Cancel
                </AdminButton>
              </>
            )}
          </div>
        ) : null}
      </article>
    );
  };

  return (
    <AdminScreen>
      <header className="hq-home__head">
        <p className="hq-home__eyebrow">Home · {dateLine}</p>
        <h1 className="hq-home__headline">{checking ? "Checking every studio…" : needsHeadline(shown.length)}</h1>
        <p className="hq-home__fresh">
          <span>{checking ? "Reading what the studios have written." : `Checked at ${formatStudioTime(checkedAt)}.`}</span>
          <span>Each item clears itself when its condition ends.</span>
          {setAside.length > 0 ? <span>{setAside.length} set aside.</span> : null}
          <AdminButton size="sm" onClick={onCheckAgain}>
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" /> Check again
          </AdminButton>
        </p>
      </header>

      <div className="hq-home__grid">
        <AdminPanel title={`What needs you · ${shown.length}`} flush>
          {undo ? (
            <div className="hq-home__note">
              <AdminNotice tone="info">
                <span className="flex flex-wrap items-center gap-3">
                  <span>{undo.words}</span>
                  <AdminButton size="sm" busy={busy === undo.key} onClick={() => void act(undo.key, () => onClearMark!(undo.key), () => setUndo(null))}>
                    <Undo2 className="w-3.5 h-3.5" aria-hidden="true" /> Undo
                  </AdminButton>
                </span>
              </AdminNotice>
            </div>
          ) : null}
          {error ? (
            <div className="hq-home__note">
              <AdminNotice tone="alert">{error}</AdminNotice>
            </div>
          ) : null}
          {markable && marksState === "failed" ? (
            <p className="hq-home__more">Couldn&apos;t read who has taken, snoozed or dismissed what, so every item shows.</p>
          ) : null}
          {visible.length === 0 ? (
            <div className="hq-home__calm">
              {checking
                ? "Checking…"
                : setAside.length > 0
                  ? "Nothing else needs you right now. What is set aside is below."
                  : "Nothing needs you right now. Anything new lands here first."}
            </div>
          ) : (
            <div className="hq-needs">
              {visible.map(row)}
              {overflow.length ? (
                <p className="hq-home__more">
                  And {overflow.length} more: {overflow.map((m) => m.item.say).join(" ")}
                </p>
              ) : null}
            </div>
          )}
          {setAside.length > 0 ? (
            <div className="hq-home__aside">
              <button type="button" className="hq-home__asidebtn" aria-expanded={asideOpen} onClick={() => setAsideOpen((v) => !v)}>
                Set aside · {setAside.length}
              </button>
              {asideOpen ? (
                <ul className="hq-home__asidelist">
                  {setAside.map((n) => (
                    <li key={n.key} className="hq-home__asiderow">
                      <div className="hq-need__body">
                        <p className="hq-need__say">{n.item.say}</p>
                        <p className="hq-need__clears">{n.mark ? markWords(n.mark) : null}</p>
                      </div>
                      <AdminButton size="sm" busy={busy === n.key} onClick={() => void act(n.key, () => onClearMark!(n.key))}>
                        Bring it back
                      </AdminButton>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
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
