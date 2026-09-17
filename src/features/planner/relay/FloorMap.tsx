import { useMemo, useState } from "react";
import { Check, Flag, FlagOff, Sparkles, Droplets } from "lucide-react";
import { useActiveStudio } from "../../../contexts/ActiveStudioContext";
import { useToast } from "../../../contexts/ToastContext";
import { useStudioMachines } from "../../../hooks/useStudioMachines";
import { cn } from "../../../lib/utils";
import type { TaskRow } from "../../studio-tasks/types";
import type { TaskActions } from "../../studio-tasks/useTaskActions";
import { useRelay } from "./RelayContext";
import {
  DEFAULT_DEEP_CLEAN_DAYS,
  HEAT_WORD,
  deepSentence,
  groupFloor,
  wearOf,
  wipeSentence,
  type MachineCare,
  type MachineWear,
} from "./machine-care";
import { clearMachineFlag, flagMachine, recordCare, useMachineCare } from "./machine-care-store";

/**
 * THE FLOOR MAP — one tile per machine, grouped like the Catalog.
 *
 * Round: Relay, Sep 2026. Replaces "Wipe down machines 0 of 20" with the
 * actual floor. Each tile warms with touches since its last wipe (sessions
 * today, from the list AppContent already loads) and carries a thin bar
 * for days since its last deep clean. Tap a tile for the care sheet in the
 * Context Panel: Wiped, Deep cleaned, Flag — and today's cleaning rows for
 * that machine, so a wipe recorded here also ticks the shift strip.
 *
 * Grouping and accents follow the Catalog (movement pattern, --cat-accent-*),
 * per AJ's standing direction that machine surfaces match it.
 */
export function FloorMap({ rows, actions }: { rows: TaskRow[]; actions: TaskActions }) {
  const relay = useRelay();
  const { activeStudio } = useActiveStudio();
  const { machines, loading: machinesLoading } = useStudioMachines(relay.studioId, { bridgeWhenRosterEmpty: true });
  const care = useMachineCare(relay.studioId);
  const deepDays = activeStudio?.deepCleanIntervalDays ?? DEFAULT_DEEP_CLEAN_DAYS;

  const tiles = useMemo(() => {
    const list = machines.length
      ? machines.map((m) => ({ id: m.machineId, name: m.name, movementPattern: m.movementPattern ?? null }))
      : relay.machines.filter((m) => m.id).map((m) => ({ id: m.id!, name: m.name, movementPattern: null }));
    return groupFloor(list);
  }, [machines, relay.machines]);

  const now = Date.now();
  const wear = useMemo(() => {
    const out: Record<string, MachineWear> = {};
    for (const g of tiles) for (const m of g.machines) out[m.id] = wearOf(m.id, { sessions: relay.sessions, care: care.byMachineId[m.id], now, deepCleanDays: deepDays });
    return out;
  }, [tiles, relay.sessions, care.byMachineId, now, deepDays]);

  const rowsFor = (machineId: string) => rows.filter((r) => r.machineId === machineId && r.kind === "machine");

  const open = (m: { id: string; name: string }) => {
    relay.openPanel({
      kicker: "Machine",
      title: m.name,
      body: <CareSheet machineId={m.id} machineName={m.name} rows={rowsFor(m.id)} actions={actions} deepDays={deepDays} />,
      tall: true,
    });
  };

  const flagged = Object.values(care.byMachineId).filter((c) => c.flag).length;
  const hot = Object.values(wear).filter((w) => w.heat >= 2).length;

  return (
    <section className="fm" aria-label="The floor">
      <header className="rl-h">
        <h2 className="rl-h__title">The floor</h2>
        <span className="rl-h__sub">
          {care.error ? care.error : hot || flagged ? [hot ? `${hot} running hot` : null, flagged ? `${flagged} flagged` : null].filter(Boolean).join(" · ") : "Warm tiles want a wipe"}
        </span>
      </header>
      {machinesLoading && tiles.length === 0 ? (
        <p className="sh__loading">Loading the floor…</p>
      ) : tiles.length === 0 ? (
        <p className="pk-hint">No equipment is set up for this studio yet.</p>
      ) : (
        tiles.map((g) => (
          <div key={g.key} className="fm__group">
            <h3 className="fm__group-title">{g.label}</h3>
            <div className="fm__grid">
              {g.machines.map((m) => {
                const w = wear[m.id];
                return (
                  <button
                    key={m.id}
                    type="button"
                    className={cn("fm__tile", `fm__tile--heat${w.heat}`, w.flag && "fm__tile--flagged", w.deepDue && "fm__tile--deep")}
                    onClick={() => open(m)}
                    aria-label={`${m.name}: ${HEAT_WORD[w.heat].toLowerCase()}, ${w.touches} since the last wipe${w.flag ? ", flagged" : ""}`}
                  >
                    <span className="fm__name">{m.name}</span>
                    <span className="fm__facts">
                      <span className="fm__touches">{w.touches}</span>
                      {w.flag && <Flag size={12} aria-hidden className="fm__flag" />}
                    </span>
                    <span className="fm__deep" aria-hidden>
                      <span className="fm__deep-fill" style={{ width: `${Math.round(w.deepFraction * 100)}%` }} />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))
      )}
    </section>
  );
}

function CareSheet({ machineId, machineName, rows, actions, deepDays }: { machineId: string; machineName: string; rows: TaskRow[]; actions: TaskActions; deepDays: number }) {
  const relay = useRelay();
  const { activeStudio } = useActiveStudio();
  const { success: toastSuccess, error: toastError } = useToast();
  const care = useMachineCare(relay.studioId);
  const record: MachineCare | undefined = care.byMachineId[machineId];
  const w = wearOf(machineId, { sessions: relay.sessions, care: record, now: Date.now(), deepCleanDays: deepDays });
  const [flagging, setFlagging] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const author = relay.uid ? { id: relay.uid, name: relay.authTrainer?.fullName ?? "A trainer" } : null;

  const doCare = async (kind: "wipe" | "deep-clean") => {
    if (!relay.studioId || !author) return;
    setBusy(true);
    try {
      await recordCare({ studioId: relay.studioId, machineId, kind, author });
      // A wipe recorded here also ticks today's cleaning row for the machine.
      const open = rows.filter((r) => r.status === "open" && r.template.category === "cleaning");
      if (open.length) await actions.completeMany(open);
      toastSuccess(kind === "wipe" ? `${machineName} wiped — the tile cools.` : `${machineName} deep cleaned.`);
    } catch (err) {
      console.warn("[relay] care failed:", err);
      toastError("Could not record that. Check your connection.");
    } finally {
      setBusy(false);
    }
  };

  const doFlag = async () => {
    if (!relay.studioId || !author) return;
    setBusy(true);
    try {
      await flagMachine({ studioId: relay.studioId, machineId, machineName, note, author, leaderId: activeStudio?.headTrainerId ?? null });
      setFlagging(false);
      setNote("");
      toastSuccess("Flagged — it's on the Team tab's open loops.");
    } catch (err) {
      console.warn("[relay] flag failed:", err);
      toastError("Could not flag that. Check your connection.");
    } finally {
      setBusy(false);
    }
  };

  const doClear = async () => {
    if (!relay.studioId) return;
    setBusy(true);
    try {
      await clearMachineFlag({ studioId: relay.studioId, machineId });
      toastSuccess("Flag cleared.");
    } catch (err) {
      console.warn("[relay] clear flag failed:", err);
      toastError("Could not clear that.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fm__sheet">
      <p className={cn("fm__heat", `fm__heat--${w.heat}`)}>
        <Droplets size={14} aria-hidden /> {HEAT_WORD[w.heat]} · {w.touches} {w.touches === 1 ? "session" : "sessions"} since the last wipe
      </p>
      <p className="fm__line">{wipeSentence(w, record)}</p>
      <p className={cn("fm__line", w.deepDue && "fm__line--due")}>{deepSentence(w, deepDays)}</p>

      {w.flag && (
        <div className="fm__flagbox">
          <Flag size={14} aria-hidden />
          <div>
            <strong>{w.flag.by.name.split(" ")[0]} flagged it</strong>
            <p>{w.flag.note}</p>
          </div>
          <button type="button" className="pl__btn" disabled={busy} onClick={() => void doClear()}>
            <FlagOff size={13} aria-hidden /> Clear
          </button>
        </div>
      )}

      <div className="fm__actions">
        <button type="button" className="pl__btn pl__btn--primary" disabled={busy || !author} onClick={() => void doCare("wipe")}>
          <Check size={14} aria-hidden /> Wiped
        </button>
        <button type="button" className="pl__btn" disabled={busy || !author} onClick={() => void doCare("deep-clean")}>
          <Sparkles size={14} aria-hidden /> Deep cleaned
        </button>
        {!w.flag && (
          <button type="button" className="pl__btn" disabled={busy || !author} onClick={() => setFlagging((v) => !v)} aria-expanded={flagging}>
            <Flag size={14} aria-hidden /> Flag
          </button>
        )}
      </div>

      {flagging && (
        <div className="fm__flagform">
          <textarea className="pk-textarea" rows={2} value={note} maxLength={500} placeholder="What's wrong? A torn pad, a squeak, a loose cable…" onChange={(e) => setNote(e.target.value)} />
          <button type="button" className="pl__btn pl__btn--danger" disabled={busy || !note.trim()} onClick={() => void doFlag()}>
            <Flag size={14} aria-hidden /> Flag the {machineName}
          </button>
        </div>
      )}

      {rows.length > 0 && (
        <div className="fm__rows">
          <h4 className="rl-h__title">Today on this machine</h4>
          <ul className="nu__rows">
            {rows.map((r) => {
              const on = r.status !== "open";
              return (
                <li key={r.id}>
                  <button type="button" className={cn("nu__rowtick", on && "nu__rowtick--on")} aria-pressed={on} disabled={actions.busyIds.has(r.id)} onClick={() => void (on ? actions.reopen(r) : actions.complete(r))}>
                    <span className="nu__tick" aria-hidden>{on && <Check size={12} />}</span>
                    <span>{r.title}</span>
                    {r.instance?.completedBy && <span className="nu__who">{r.instance.completedBy.name.split(" ")[0]}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
