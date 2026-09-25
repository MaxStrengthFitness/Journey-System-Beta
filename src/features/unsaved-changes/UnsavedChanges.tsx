/**
 * "You have unsaved changes" — the React half (Sep 24 2026).
 *
 * The pure registry and gate are in registry.ts; read that header first.
 * This file is the plumbing a screen touches:
 *
 *   useUnsavedChanges(isDirty, label, { onDiscard })
 *       A screen holding typed-but-unsaved work says so. That is ALL most
 *       screens need: the app's own navigation, the profile's tabs and the
 *       sections of My Studio, Operations and Admin already ask the gate
 *       before they tear anything down. The handle it returns has `guard`,
 *       for a drawer asking about itself before it closes, and `release`,
 *       for a screen whose own "done" button saves AND leaves in one tap.
 *
 *   useLeaveScope() + <UnsavedChangesScope scope={…}>
 *       For a component that switches between children (a tab bar, a
 *       section switch). Wrap the children in the scope and call
 *       `scope.guard(() => switchTo(x))`: only work INSIDE the scope is asked
 *       about, because only that is about to unmount.
 *
 *   useLeaveGuard()
 *       Ask about everything — AppContent's navigation, a studio switch,
 *       sign-out. useGuardedState (beside this file) wraps a piece of state
 *       in it.
 *
 * Without a provider every hook is a no-op that proceeds at once, so a
 * component mounted alone in a render test behaves exactly as it did.
 *
 * The question itself is LeaveConfirmDialog: an in-app dialog, never the
 * browser's confirm(). The browser's own prompt appears only for a reload or
 * a closed tab, through `beforeunload`, and only while something is dirty.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  createLeaveGate,
  createUnsavedRegistry,
  type LeaveGate,
  type UnsavedRegistry,
} from "./registry";
import { LeaveConfirmDialog } from "./LeaveConfirmDialog";

interface Store {
  registry: UnsavedRegistry;
  gate: LeaveGate;
}

const StoreContext = createContext<Store | null>(null);
const NO_SCOPES: readonly string[] = [];
const ScopeContext = createContext<readonly string[]>(NO_SCOPES);

/** Mounted once, above AppContent (App.tsx). */
export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const [store] = useState<Store>(() => {
    const registry = createUnsavedRegistry();
    return { registry, gate: createLeaveGate(registry) };
  });
  const pending = useSyncExternalStore(
    store.gate.subscribe,
    store.gate.pending,
    store.gate.pending,
  );

  /*
   * A reload or a closed tab cannot be answered by an in-app dialog, so for
   * those the browser asks. Attached only while something is dirty: a page
   * that always has a beforeunload listener is kept out of the back-forward
   * cache, and most of the time nothing here is dirty at all.
   */
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Older Safari only shows its prompt when returnValue is set.
      event.returnValue = "";
    };
    let attached = false;
    const sync = () => {
      const want = store.registry.anyDirty();
      if (want && !attached) {
        window.addEventListener("beforeunload", onBeforeUnload);
        attached = true;
      } else if (!want && attached) {
        window.removeEventListener("beforeunload", onBeforeUnload);
        attached = false;
      }
    };
    sync();
    const unsubscribe = store.registry.subscribe(sync);
    return () => {
      unsubscribe();
      if (attached) window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [store]);

  return (
    <StoreContext.Provider value={store}>
      {children}
      {pending && (
        <LeaveConfirmDialog
          question={pending.question}
          onStay={store.gate.stay}
          onLeave={store.gate.leave}
        />
      )}
    </StoreContext.Provider>
  );
}

export interface UnsavedHandle {
  /**
   * Ask about THIS screen only, then run `proceed` — a drawer's own close
   * button, or an editor's own Back.
   */
  guard: (proceed: () => void) => void;
  /**
   * Mark this screen clean right now. For a button that saves and leaves in
   * the same tap (the post-session screen files its note on the way out):
   * without it the navigation would ask about the very note it is filing,
   * because React has not re-rendered the screen clean yet.
   */
  release: () => void;
}

/**
 * Say "this screen holds typing that is not saved".
 *
 * `label` finishes the sentence "You have unsaved changes to …", so it reads
 * as a noun phrase: "the progress report", "Routine A", "Sam's profile".
 * `onDiscard` throws the typing away; give it whenever the screen can SURVIVE
 * a navigation (a client change on a screen that is not keyed by client),
 * so "Leave" cannot carry one client's typing onto the next.
 */
export function useUnsavedChanges(
  isDirty: boolean,
  label: string,
  options?: { onDiscard?: () => void },
): UnsavedHandle {
  const store = useContext(StoreContext);
  const scopes = useContext(ScopeContext);
  const idRef = useRef<number | null>(null);
  const discardRef = useRef(options?.onDiscard);

  // Registered in a LAYOUT effect so a navigation tapped straight after the
  // first keystroke already sees it. Registered clean; the effect below says
  // how things really are, and runs straight after this one.
  useLayoutEffect(() => {
    if (!store) return;
    const id = store.registry.register({
      label: "",
      dirty: false,
      scopes,
      discard: () => discardRef.current?.(),
    });
    idRef.current = id;
    return () => {
      store.registry.unregister(id);
      if (idRef.current === id) idRef.current = null;
    };
  }, [store, scopes]);

  // Every commit, no dependency list on purpose: after `release` or a
  // "Leave" marked this clean, a screen that is STILL dirty must say so again
  // at its next render, whether or not `isDirty` itself changed.
  useLayoutEffect(() => {
    discardRef.current = options?.onDiscard;
    if (store && idRef.current !== null) {
      store.registry.update(idRef.current, { dirty: isDirty, label });
    }
  });

  const guard = useCallback(
    (proceed: () => void) => {
      if (!store || idRef.current === null) {
        proceed();
        return;
      }
      store.gate.request(proceed, { only: idRef.current });
    },
    [store],
  );
  const release = useCallback(() => {
    if (store && idRef.current !== null) {
      store.registry.update(idRef.current, { dirty: false });
    }
  }, [store]);

  return useMemo(() => ({ guard, release }), [guard, release]);
}

/** Ask about everything that is dirty anywhere, then run `proceed`. */
export function useLeaveGuard(): (proceed: () => void) => void {
  const store = useContext(StoreContext);
  return useCallback(
    (proceed: () => void) => {
      if (!store) {
        proceed();
        return;
      }
      store.gate.request(proceed);
    },
    [store],
  );
}

export interface LeaveScope {
  id: string;
  /** Ask about work inside this scope only, then run `proceed`. */
  guard: (proceed: () => void) => void;
}

/**
 * A scope for a component that switches between its children. Create it in
 * the switching component, wrap the children in <UnsavedChangesScope>, and
 * route every switch through `guard`.
 */
export function useLeaveScope(): LeaveScope {
  const store = useContext(StoreContext);
  const id = useId();
  const guard = useCallback(
    (proceed: () => void) => {
      if (!store) {
        proceed();
        return;
      }
      store.gate.request(proceed, { scope: id });
    },
    [store, id],
  );
  return useMemo(() => ({ id, guard }), [id, guard]);
}

/** Everything registered inside belongs to `scope`, and to every scope around it. */
export function UnsavedChangesScope({
  scope,
  children,
}: {
  scope: LeaveScope;
  children: ReactNode;
}) {
  const parent = useContext(ScopeContext);
  const value = useMemo(() => [...parent, scope.id], [parent, scope.id]);
  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}

/**
 * Take a child OUT of one scope it sits in: for a child the switch keeps
 * mounted, whose typing that switch therefore never loses (landing, Sep 24
 * 2026). The client codex is the case: the profile keeps Notes & Profile
 * mounted after its first visit, and its form outlives a trip to another
 * tab by design (the Save bar says where each edit is), so the profile's
 * tab bar must not ask about it — and a "Leave" there would throw away
 * edits the tab change was never going to lose. The whole app's navigation
 * still asks about it, because leaving the profile does unmount it.
 */
export function ExemptFromLeaveScope({
  scope,
  children,
}: {
  scope: LeaveScope;
  children: ReactNode;
}) {
  const parent = useContext(ScopeContext);
  const value = useMemo(() => parent.filter((id) => id !== scope.id), [parent, scope.id]);
  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}
