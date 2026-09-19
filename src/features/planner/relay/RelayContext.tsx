import { createContext, useContext, type ReactNode } from "react";
import type { Client, Machine, ScheduleEntry, Trainer, WorkoutSession } from "../../../types";
import type { ClientTaskAction } from "../../studio-tasks/types";
import type { NowContext } from "./now-context";
import type { CapturePreset } from "./capture";

/**
 * RELAY CONTEXT — what every Relay tab can reach without prop-threading.
 *
 * Round: Relay, Sep 2026; owned by the My Studio shell since the My Studio
 * round (features/my-studio/MyStudioView), so the Machines, Team and Studio
 * sections reach the same doors as the board. The shell owns the things that
 * are the same on every tab — who is signed in, where the iPad is, the schedule
 * and today's sessions from AppContent, the clock (NowContext, ticking once a
 * minute) — and the two doors any card can open: the Capture sheet and the
 * Context Panel. A lane deep inside the Floor can say "open Capture with this
 * machine preset" or "show this in the panel" without a prop reaching down
 * six levels to get there.
 */
export interface PanelContent {
  kicker?: string;
  title: string;
  body: ReactNode;
  foot?: ReactNode;
  /** Portrait: open at the tall detent (90%) rather than half. */
  tall?: boolean;
}

export interface RelayContextValue {
  studioId: string | null;
  studioName: string;
  authTrainer: Trainer | null;
  /** The Firebase Auth uid — what every rule pins to the signed-in person. */
  uid: string | null;
  trainers: Trainer[];
  clients: Client[];
  schedules: ScheduleEntry[];
  sessions: WorkoutSession[];
  machines: Machine[];
  now: NowContext;
  canLead: boolean;
  canNetwork: boolean;
  /** What the Context Panel is showing, so each section's frame can draw it. */
  panel: PanelContent | null;
  openCapture: (preset?: CapturePreset) => void;
  openPanel: (content: PanelContent) => void;
  closePanel: () => void;
  onOpenClientTask?: (clientId: string, action?: ClientTaskAction) => void;
}

const RelayCtx = createContext<RelayContextValue | null>(null);

export const RelayProvider = RelayCtx.Provider;

export function useRelay(): RelayContextValue {
  const v = useContext(RelayCtx);
  if (!v) throw new Error("useRelay must be used inside the Relay shell");
  return v;
}

/** The same, but null outside the shell — for pieces also mounted elsewhere. */
export function useRelayMaybe(): RelayContextValue | null {
  return useContext(RelayCtx);
}
