/**
 * THE OPERATIONS SCOPE, ON SCREEN.
 *
 * Operations round, Sep 2026. One control in the Operations shell — "Solon"
 * or "All my studios" — that every tab reads, instead of a studio picker per
 * tab that each listed a different set of studios (scope.ts has the why).
 *
 *   pickStudio(id)   switches the APP to that studio (setActiveStudioId —
 *                    the same thing the header's picker does), so the roster,
 *                    the schedule and today's sessions that the tabs read
 *                    follow. "This studio" and "the studio the app is in" are
 *                    the same studio, always.
 *   pickAll()        the reader's whole list. Tabs that can add studios up
 *                    (Hours, Staff & Roles, Clients, the Overview's network
 *                    view) do; tabs that read one studio at a time render
 *                    <PickOneStudio/> and say so.
 *
 * The scope is remembered for the session (module memory), so leaving
 * Operations and coming back does not reset an owner to one studio.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Building2 } from "lucide-react";
import type { FranchiseNetwork, Studio, Trainer } from "../../types";
import { useActiveStudio } from "../../contexts/ActiveStudioContext";
import { AdminButton, AdminEmpty, AdminSelect } from "./primitives";
import { operationsStudios, studiosInScope, type OperationsScope } from "./scope";
import { useLeaveGuard } from "../unsaved-changes";

export interface OperationsScopeValue {
  /** Every studio the reader may look at, by name. */
  readable: Studio[];
  /** The readable studios the app can be switched to (the header's list). */
  switchable: Studio[];
  scope: OperationsScope;
  /** The one studio in scope, or null for "all". */
  studioId: string | null;
  studio: Studio | null;
  /** The studios in scope, in reading order. */
  studios: Studio[];
  /** More than one to look at, so "All my studios" is on offer. */
  canSpan: boolean;
  pickStudio: (studioId: string) => void;
  pickAll: () => void;
}

const Ctx = createContext<OperationsScopeValue | null>(null);

/** Remembered across mounts of the Operations screen, per session. */
let rememberedSpan = false;

export function OperationsScopeProvider({
  authTrainer,
  studios,
  networks,
  isAdmin,
  activeStudioId,
  children,
}: {
  authTrainer: Trainer;
  studios: Studio[];
  networks: FranchiseNetwork[];
  isAdmin: boolean;
  activeStudioId: string | null;
  children: ReactNode;
}) {
  const { availableStudios, setActiveStudioId } = useActiveStudio();
  const readable = useMemo(
    () => operationsStudios(authTrainer, studios, networks, isAdmin, activeStudioId),
    [authTrainer, studios, networks, isAdmin, activeStudioId],
  );
  const switchable = useMemo(() => {
    const available = new Set(availableStudios.map((s) => s.id));
    return readable.filter((s) => available.has(s.id));
  }, [readable, availableStudios]);
  const canSpan = readable.length > 1;
  const [span, setSpan] = useState(() => rememberedSpan && canSpan);

  const active = useMemo(() => studios.find((s) => s.id === activeStudioId) ?? null, [studios, activeStudioId]);
  const scope: OperationsScope = useMemo(
    () => (span && canSpan ? { kind: "all" } : { kind: "studio", studioId: activeStudioId ?? "" }),
    [span, canSpan, activeStudioId],
  );

  /*
   * A new scope re-keys the open tab, and a new studio is a studio switch,
   * so either one asks first while a tab holds unsaved typing (unsaved
   * changes, Sep 24 2026). A pick that changes nothing never asks.
   */
  const guardLeave = useLeaveGuard();
  const pickStudio = useCallback(
    (studioId: string) => {
      const go = () => {
        rememberedSpan = false;
        setSpan(false);
        if (studioId && studioId !== activeStudioId) setActiveStudioId(studioId);
      };
      const changes = scope.kind === "all" || (!!studioId && studioId !== activeStudioId);
      if (changes) guardLeave(go);
      else go();
    },
    [activeStudioId, setActiveStudioId, scope.kind, guardLeave],
  );
  const pickAll = useCallback(() => {
    const go = () => {
      rememberedSpan = true;
      setSpan(true);
    };
    if (scope.kind !== "all") guardLeave(go);
    else go();
  }, [scope.kind, guardLeave]);

  const value = useMemo<OperationsScopeValue>(
    () => ({
      readable,
      switchable,
      scope,
      studioId: scope.kind === "studio" ? activeStudioId : null,
      studio: scope.kind === "studio" ? active : null,
      studios: studiosInScope(scope, readable, active),
      canSpan,
      pickStudio,
      pickAll,
    }),
    [readable, switchable, scope, activeStudioId, active, canSpan, pickStudio, pickAll],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * Outside the Operations shell — a tab mounted on its own, as the render
 * tests do — the scope is "the studio the tab was given": nothing to span,
 * nothing to switch. Tabs read their `activeStudioId` prop first for
 * exactly that reason.
 */
const STANDALONE: OperationsScopeValue = {
  readable: [],
  switchable: [],
  scope: { kind: "studio", studioId: "" },
  studioId: null,
  studio: null,
  studios: [],
  canSpan: false,
  pickStudio: () => {},
  pickAll: () => {},
};

export function useOperationsScope(): OperationsScopeValue {
  return useContext(Ctx) ?? STANDALONE;
}

/** A stable key for the scope, so a tab can remount when it changes. */
export function scopeKey(scope: OperationsScope): string {
  return scope.kind === "all" ? "all" : `studio:${scope.studioId}`;
}

/* ------------------------------------------------------------------ *
 * The control
 * ------------------------------------------------------------------ */

/**
 * Drawn once, in the shell, above every tab. Hidden when there is nothing
 * to choose: a leader of one studio is looking at that studio, full stop.
 */
export function ScopeBar() {
  const { switchable, scope, studio, canSpan, pickStudio, pickAll } = useOperationsScope();
  const options = studio && !switchable.some((s) => s.id === studio.id) ? [studio, ...switchable] : switchable;
  if (!canSpan && options.length <= 1) return null;
  return (
    <div className="adm-scope">
      <Building2 className="w-4 h-4 adm-scope__icon" />
      <label className="adm-scope__label" htmlFor="ops-scope">
        Looking at
      </label>
      <AdminSelect
        id="ops-scope"
        className="adm-scope__select"
        value={scope.kind === "all" ? "all" : scope.studioId}
        onChange={(e) => (e.target.value === "all" ? pickAll() : pickStudio(e.target.value))}
      >
        {options.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
        {canSpan && <option value="all">All my studios</option>}
      </AdminSelect>
    </div>
  );
}

/**
 * What a one-studio tab shows under "All my studios": the honest sentence,
 * and the studios as buttons so the reader is one tap from an answer.
 */
export function PickOneStudio({ what = "This tab" }: { what?: string }) {
  const { switchable, pickStudio } = useOperationsScope();
  return (
    <AdminEmpty title={`${what} reads one studio at a time`}>
      <span className="adm-scope__pick">
        {switchable.map((s) => (
          <AdminButton key={s.id} size="sm" variant="quiet" onClick={() => pickStudio(s.id)}>
            {s.name}
          </AdminButton>
        ))}
      </span>
    </AdminEmpty>
  );
}
