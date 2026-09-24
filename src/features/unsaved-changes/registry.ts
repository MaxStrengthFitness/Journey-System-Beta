/**
 * "You have unsaved changes" — the pure half (Sep 24 2026).
 *
 * The app has no router. A screen leaves the tree because a piece of state
 * changed — `currentView` in AppContent, the profile's tab, My Studio's
 * section, a drawer's `open` — and when it leaves, whatever was typed into it
 * goes with it, silently. AJ: "At a minimum, we need to implement an 'unsaved
 * changes' warning modal when navigating away."
 *
 * Two pieces, both plain objects with no React in them so they can be tested
 * on their own:
 *
 *   - the REGISTRY: every screen holding typed-but-unsaved work says so, with
 *     a label for the question ("the progress report", "Routine A") and the
 *     leave scopes it sits inside;
 *   - the GATE: a navigation asks it first. Nothing dirty in the part of the
 *     app the navigation would tear down, and it runs at once; otherwise it is
 *     HELD and the question goes up. "Keep editing" drops it, "Leave" throws
 *     the typing away and runs it.
 *
 * Scopes are how a navigation says what it would unmount. The app's own
 * navigation (the bottom bar, a client change, a studio switch) asks about
 * everything; the profile's tab bar asks only about what is inside its tabs;
 * a drawer asks only about itself. A screen outside the scope is not asked
 * about, because it is not going anywhere.
 *
 * Nothing here ever blocks a SAVE. It only ever stands between a trainer and
 * a navigation that would lose their typing, and "Leave" is always one tap.
 */

export interface UnsavedEntry {
  id: number;
  /** Finishes "You have unsaved changes to …": "the progress report". */
  label: string;
  dirty: boolean;
  /** The leave scopes this screen sits inside, outermost first. */
  scopes: readonly string[];
  /**
   * Throws the typing away. Called on "Leave" for a screen that SURVIVES the
   * navigation — the client record stays mounted when the client changes,
   * and without this a half-typed edit would ride across onto the next
   * client. Harmless for a screen that is about to unmount anyway.
   */
  discard?: () => void;
}

/** Which registrations a navigation would lose. Empty means all of them. */
export interface LeaveFilter {
  /** Only screens inside this scope (a profile's tabs, a My Studio section). */
  scope?: string;
  /** Only this one registration (a drawer asking about itself). */
  only?: number;
}

export interface UnsavedRegistry {
  register(entry: Omit<UnsavedEntry, "id">): number;
  update(
    id: number,
    patch: Partial<Pick<UnsavedEntry, "label" | "dirty" | "discard">>,
  ): void;
  unregister(id: number): void;
  /** The dirty registrations the filter covers, in registration order. */
  dirty(filter?: LeaveFilter): UnsavedEntry[];
  anyDirty(): boolean;
  /** Called whenever anything becomes dirty or clean, or leaves. */
  subscribe(listener: () => void): () => void;
}

export function createUnsavedRegistry(): UnsavedRegistry {
  const entries = new Map<number, UnsavedEntry>();
  const listeners = new Set<() => void>();
  let nextId = 1;

  const notify = () => {
    for (const l of Array.from(listeners)) l();
  };

  const covers = (entry: UnsavedEntry, filter?: LeaveFilter) => {
    if (filter?.only !== undefined && entry.id !== filter.only) return false;
    if (filter?.scope !== undefined && !entry.scopes.includes(filter.scope)) {
      return false;
    }
    return true;
  };

  return {
    register(entry) {
      const id = nextId++;
      entries.set(id, { ...entry, id });
      if (entry.dirty) notify();
      return id;
    },
    update(id, patch) {
      const prev = entries.get(id);
      if (!prev) return;
      const next = { ...prev, ...patch };
      entries.set(id, next);
      // Only a change of DIRTINESS is news. A label or a discard callback
      // changes on every render of some screens, and waking the provider for
      // those would be a render loop waiting to happen.
      if (next.dirty !== prev.dirty) notify();
    },
    unregister(id) {
      const prev = entries.get(id);
      if (!prev) return;
      entries.delete(id);
      if (prev.dirty) notify();
    },
    dirty(filter) {
      return Array.from(entries.values()).filter(
        (e) => e.dirty && covers(e, filter),
      );
    },
    anyDirty() {
      for (const e of entries.values()) if (e.dirty) return true;
      return false;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/**
 * The question, in plain studio English. One label reads as AJ wrote it;
 * several are joined the way a person would say them, and a label that two
 * screens share is said once.
 */
export function leaveQuestion(labels: readonly string[]): string {
  const said: string[] = [];
  for (const raw of labels) {
    const label = raw.trim();
    if (label && !said.includes(label)) said.push(label);
  }
  if (said.length === 0) {
    return "You have unsaved changes. Leave without saving?";
  }
  const list =
    said.length === 1
      ? said[0]
      : `${said.slice(0, -1).join(", ")} and ${said[said.length - 1]}`;
  return `You have unsaved changes to ${list}. Leave without saving?`;
}

/** The navigation being held, and what it would lose. */
export interface PendingLeave {
  question: string;
  labels: string[];
}

export interface LeaveGate {
  /**
   * Run `proceed` now if nothing the filter covers is dirty; otherwise hold
   * it and ask. While a question is already up, a second request joins the
   * first rather than asking twice — AppContent changes the client AND the
   * view for one tap, and that is one question, answered once, for both.
   */
  request(proceed: () => void, filter?: LeaveFilter): void;
  /** The question on screen, or null. The same object until it changes. */
  pending(): PendingLeave | null;
  /** "Leave": discard what would be lost, then run everything held, in order. */
  leave(): void;
  /** "Keep editing": drop everything held. */
  stay(): void;
  subscribe(listener: () => void): () => void;
}

export function createLeaveGate(registry: UnsavedRegistry): LeaveGate {
  let held: Array<() => void> = [];
  // id -> label of every registration the question is about.
  let asked = new Map<number, string>();
  let current: PendingLeave | null = null;
  // While "Leave" is running the held navigation, a navigation it makes on
  // the way (menuNavigate -> setAppMode + setCurrentView) must not ask again.
  let leaving = 0;
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const l of Array.from(listeners)) l();
  };

  const run = (actions: Array<() => void>) => {
    leaving++;
    try {
      for (const action of actions) action();
    } finally {
      leaving--;
    }
  };

  return {
    request(proceed, filter) {
      if (leaving > 0) {
        proceed();
        return;
      }
      const lost = registry.dirty(filter);
      if (current === null && lost.length === 0) {
        proceed();
        return;
      }
      held.push(proceed);
      for (const e of lost) asked.set(e.id, e.label);
      const labels = Array.from(asked.values());
      const question = leaveQuestion(labels);
      if (current === null || current.question !== question) {
        current = { question, labels };
        notify();
      }
    },
    pending() {
      return current;
    },
    leave() {
      const actions = held;
      // Read the registrations as they are NOW: a screen's discard callback
      // may have been replaced by a render since the question went up, and
      // one that has since gone clean has nothing to throw away.
      const lost = registry.dirty().filter((e) => asked.has(e.id));
      held = [];
      asked = new Map();
      current = null;
      for (const e of lost) {
        e.discard?.();
        // Clean NOW, not at the screen's next render: the navigation below
        // runs in this same tick, and a second tap before React re-renders
        // must not ask the same question again. A screen that is still dirty
        // after its discard says so again at its next render.
        registry.update(e.id, { dirty: false });
      }
      notify();
      run(actions);
    },
    stay() {
      held = [];
      asked = new Map();
      current = null;
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
