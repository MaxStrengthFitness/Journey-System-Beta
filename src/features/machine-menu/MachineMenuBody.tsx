/**
 * THE MACHINE MENU — the body: the header and the blocks, in the door's order.
 *
 * The same body in the dialog (MachineMenu, both doors) and inline on
 * Programming → All Machines, where it is the detail pane beside the
 * machine list. doors.ts decides the order: safety, then the settings (the
 * primary use, AJ), and the Notes block the ONLY thing that moves — right
 * under the settings in a session, after the chart on the profile. In
 * landscape, from 1000px, the chart takes a column of its own.
 *
 * The blocks are the earlier phases' (DialTiles, MenuNotes, MachineTimeline,
 * SettingChanges); this file places them and wires them to each other:
 *
 *   - "Last changed …" selects that change's session on the chart;
 *   - the chart's Open note opens the note's thread in Notes;
 *   - "Add a Health note" after a pain save opens the note box;
 *   - a note about the machine itself, once added, reads the studio's notes
 *     on the unit again, so the safety strip shows it;
 *   - the header's pill shows while the safety strip is scrolled away, and
 *     brings it back.
 *
 * ONE TREE IN EVERY LAYOUT. The blocks always sit in the same two columns
 * (`.mm-cols` → lead and trail); in portrait and on a phone the trail is
 * empty and the columns stack. So turning the iPad moves only the chart,
 * which holds no typing: the settings and the notes keep their place, and
 * their unsaved drafts with it. (It used to swap a one-column tree for a
 * two-column one, which remounted both blocks and dropped their drafts
 * without the leave question.) `blockOrder` keeps the trail empty outside
 * landscape.
 *
 * Inline on Programming → All Machines the header sticks to the app's page
 * scroller, under the Programming sub-toggle (`useScrollerPad`,
 * `--psub-stuck-h`), and the pill is decided from the two elements
 * themselves (`stripScrolledAway`), whichever box scrolls.
 *
 * Everything it reads comes through useMachineMenuData.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ElementType } from "react";
import { noMachineHistoryBody, noMachineHistoryLine } from "../../lib/history-claims";
import type { MachineCatalogEntry } from "../../types/machines";
import { SetupGuide } from "../equipment/SetupGuide";
import { useScrollerPad } from "../client-profile/use-scroller-pad";
import { usePhone } from "../phone/device";
import { DialTiles, type HeldTarget } from "./DialTiles";
import { blockOrder, menuLayoutFor, type BlockId, type MenuLayout } from "./doors";
import { MachineTimeline } from "./MachineTimeline";
import { MenuHeader } from "./MenuHeader";
import { MenuNotes } from "./MenuNotes";
import { stripScrolledAway } from "./safety";
import { SafetyStrip } from "./SafetyStrip";
import { placeRows, type SettingRow } from "./setting-history";
import { SettingChanges } from "./SettingChanges";
import type { LaneNote } from "./timeline-model";
import { useMachineMenuData, type MachineMenuHost } from "./useMachineMenuData";
import "./machine-menu.css";

export interface MachineMenuBodyProps {
  host: MachineMenuHost;
  machineId: string | null;
  catalogById: Readonly<Record<string, MachineCatalogEntry>>;
  /** Close the dialog, through the unsaved gate. Absent inline. */
  onClose?: () => void;
  /** Inline, one pane at a time: back to the machine list. */
  onBack?: () => void;
  /** The heading's element: the dialog's DialogTitle, or an h2 inline. */
  titleAs?: ElementType;
  /** Inline: one column in the pane beside the machine list. The chart measures the width it is given, in both. */
  inline?: boolean;
  /** A layout to use instead of the viewport's (tests, the inline pane). */
  layout?: MenuLayout;
  /** Quick set-up (the Now Bar's Set up): the first empty dial's editor open at once. */
  focusDial?: boolean;
}

/** The viewport's size, kept up to date through a turn of the iPad. */
function useViewport(): { width: number; height: number } {
  const read = () =>
    typeof window === "undefined" ? { width: 820, height: 1180 } : { width: window.innerWidth || 820, height: window.innerHeight || 1180 };
  const [size, setSize] = useState(read);
  useEffect(() => {
    if (typeof window === "undefined") return;
    let frame = 0;
    const onResize = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        setSize((prev) => {
          const next = read();
          return prev.width === next.width && prev.height === next.height ? prev : next;
        });
      });
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);
  return size;
}

export function MachineMenuBody({
  host,
  machineId,
  catalogById,
  onClose,
  onBack,
  titleAs,
  inline = false,
  layout: forcedLayout,
  focusDial = false,
}: MachineMenuBodyProps) {
  // A new number reads the studio's notes on the unit again (a floor note was added here).
  const [floorRound, setFloorRound] = useState(0);
  const data = useMachineMenuData(host, machineId, catalogById, floorRound);
  const { equipment, model } = data;
  const isPhone = usePhone();
  const viewport = useViewport();
  const layout: MenuLayout = forcedLayout ?? (inline ? (isPhone ? "phone" : "portrait") : menuLayoutFor(viewport.width, viewport.height, isPhone));

  const [selected, setSelected] = useState<string | null>(null);
  const [healthNote, setHealthNote] = useState<{ changeWords: string; nonce: number } | null>(null);
  const [focusNote, setFocusNote] = useState<{ id: string; nonce: number } | null>(null);

  /* ---------------- the safety pill ---------------- */

  const cardRef = useRef<HTMLDivElement | null>(null);
  const safetyRef = useRef<HTMLElement | null>(null);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const [safetyAway, setSafetyAway] = useState(false);
  const hasSafety = data.safety.count > 0;
  const drawn = !!equipment && !!model;
  // Inline, the header sticks to the page's scroller: its padding, negated.
  useScrollerPad(cardRef, inline && drawn);
  // Away once the strip's bottom has gone up past the header's, measured on
  // every scroll of any box (rAF-throttled): the dialog's own scroller, or
  // the app's page inline, whose top is not the window's.
  useEffect(() => {
    const strip = safetyRef.current;
    const head = cardRef.current?.querySelector<HTMLElement>(".mm-head") ?? null;
    if (!hasSafety || !strip || !head || typeof window === "undefined") {
      setSafetyAway(false);
      return;
    }
    let frame = 0;
    const measure = () => {
      frame = 0;
      setSafetyAway(stripScrolledAway(strip.getBoundingClientRect().bottom, head.getBoundingClientRect().bottom));
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [hasSafety, inline, drawn]);
  const showSafety = useCallback(() => {
    const el = safetyRef.current;
    el?.scrollIntoView?.({ block: "start" });
    el?.focus?.({ preventScroll: true });
  }, []);

  /* ---------------- the blocks talking to each other ---------------- */

  const onLastChanged = useCallback(
    (row: SettingRow) => {
      if (!model || model.columns.length === 0) return;
      const [placed] = placeRows([row], model.columns);
      if (!placed) return;
      const col = model.columns[Math.min(placed.gap, model.columns.length - 1)];
      if (!col) return;
      setSelected(col.sessionId);
      chartRef.current?.scrollIntoView?.({ block: "nearest" });
    },
    [model],
  );
  const onOpenNote = useCallback((note: LaneNote) => {
    if (!note.journalEntryId) return;
    setFocusNote((f) => ({ id: note.journalEntryId as string, nonce: (f?.nonce ?? 0) + 1 }));
  }, []);
  const onAddHealthNote = useCallback((changeWords: string) => {
    setHealthNote((h) => ({ changeWords, nonce: (h?.nonce ?? 0) + 1 }));
  }, []);
  const onFloorNoteAdded = useCallback(() => setFloorRound((r) => r + 1), []);

  const order = useMemo(
    () => blockOrder(host.door, layout, { safety: data.safety.count > 0, firstTime: data.firstTime }),
    [host.door, layout, data.safety.count, data.firstTime],
  );

  /* An open session before its client is chosen (the open session round,
     Oct 9 2026; AJ's "3a"): the settings' Save keeps the values on the
     session, never on a client. `key` is where this iPad notes what is held
     for the toast's Undo, never a client's id. */
  const holdSetup = host.holdSetup ?? null;
  const equipmentId = equipment?.id ?? null;
  const hold = useMemo<HeldTarget | null>(
    () =>
      holdSetup && !host.clientId && equipmentId
        ? { key: `held:${holdSetup.sessionId}`, keep: (values, sources) => holdSetup.keep(equipmentId, values, sources) }
        : null,
    [holdSetup, host.clientId, equipmentId],
  );

  if (!equipment || !model) return null;

  const machineNameOf = (id: string) => host.machines.find((m) => m.id === id)?.name ?? null;
  // "First time" only once every session is read; with older ones unread the cautious words.
  const claimCoverage = model.everythingRead ? host.coverage : "unknown";

  const block = (id: BlockId) => {
    switch (id) {
      case "safety":
        return (
          <SafetyStrip
            key="safety"
            ref={safetyRef}
            critical={data.critical}
            watchOuts={data.watchOuts}
            floor={data.floor}
            floorStudioName={host.floorStudio.name}
            today={data.today}
          />
        );
      case "setupFirst":
        return (
          <section key="setupFirst" className="mm-blk mm-first" data-block="setupFirst" aria-label={noMachineHistoryLine(claimCoverage)}>
            <p className="mm-first__body">{noMachineHistoryBody(data.clientFirst, claimCoverage, !!equipment.guide)}</p>
            {equipment.guide ? <SetupGuide guide={equipment.guide} part="setup" defaultOpen /> : null}
          </section>
        );
      case "settings":
        return (
          <DialTiles
            key="settings"
            machineId={equipment.id}
            machineName={equipment.name}
            fields={data.fields}
            saved={equipment.settings}
            sources={equipment.sources ?? null}
            fitAcks={equipment.fitAcks ?? null}
            clientId={host.clientId}
            clientFirstName={data.clientFirst}
            homeStudioId={host.client?.homeStudioId ?? null}
            author={host.author}
            journal={data.journalContext}
            today={data.today}
            history={data.historyRows}
            historyState={data.history.state}
            snapshots={data.snapshots}
            fit={data.fit}
            fitTarget={data.fitTarget}
            clientHeight={host.client?.height ?? null}
            readOnly={data.readOnly}
            online={data.online}
            onSaved={data.history.reload}
            onLastChanged={onLastChanged}
            onAddHealthNote={onAddHealthNote}
            focusDial={focusDial}
            // Save closes the card from every door that has one (AJ's "1a",
            // Oct 10 2026), with Undo in the toast; inline there is none.
            onSaveClose={onClose}
            hold={hold}
            settingsUnsure={!!host.settingsUnsure}
          />
        );
      case "notes":
        return (
          <MenuNotes
            key="notes"
            door={host.door}
            machineId={equipment.id}
            machineName={equipment.name}
            machineNames={data.machineNames}
            machineNameOf={machineNameOf}
            clientId={host.clientId}
            clientFirstName={data.clientFirst}
            journal={host.journal}
            journalFailed={host.journalState === "failed"}
            legacyNotes={equipment.notes}
            history={data.historyRows}
            journalContext={data.journalContext}
            floorStudio={host.floorStudio}
            author={host.author}
            readOnly={data.readOnly}
            online={data.online}
            today={data.today}
            quotableNumbers={!!data.ctx.quotableNumbers}
            draft={host.door === "session" ? (host.noteDraft ?? null) : undefined}
            onDraftChange={host.door === "session" ? host.onNoteDraftChange : undefined}
            healthNote={healthNote}
            onOpenSession={host.door === "profile" ? host.onOpenSession : undefined}
            focusNote={focusNote}
            onFloorNoteAdded={onFloorNoteAdded}
          />
        );
      case "chart":
        return (
          <div key="chart" ref={chartRef} className="mm-chart-slot" data-block="chart">
            <MachineTimeline
              model={model}
              ctx={data.ctx}
              landscape={layout === "landscape"}
              progress={data.progress}
              knownElsewhere={data.knownElsewhere}
              sessionTotal={data.sessionTotal}
              older={data.older}
              onRetry={host.onRetryHistory}
              onOpenNote={onOpenNote}
              selectedSessionId={selected}
              onSelectedChange={setSelected}
            />
          </div>
        );
      case "guide":
        return equipment.guide ? (
          <div key="guide" data-block="guide">
            <SetupGuide guide={equipment.guide} part={data.firstTime ? "execution" : "all"} />
          </div>
        ) : null;
      case "changes":
        return (
          <div key="changes" data-block="changes">
            <SettingChanges rows={data.history.rows} state={data.history.state} onRetry={data.history.reload} today={data.today} />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div ref={cardRef} className="mm-card" data-door={host.door} data-layout={layout} data-inline={inline ? "true" : undefined}>
      <MenuHeader
        machineName={equipment.name}
        clientName={data.clientName}
        line={data.header}
        titleAs={titleAs}
        onClose={onClose}
        onBack={onBack}
        safety={data.safety}
        pillVisible={safetyAway}
        onPill={showSafety}
      />
      <div className="mm-scroll">
        {order.top.map(block)}
        {/* One tree in every layout (see the header): a turn moves only the chart. */}
        <div className="mm-cols">
          <div className="mm-col mm-col--lead">{order.leading.map(block)}</div>
          <div className="mm-col mm-col--trail">{order.trailing.map(block)}</div>
        </div>
      </div>
    </div>
  );
}
