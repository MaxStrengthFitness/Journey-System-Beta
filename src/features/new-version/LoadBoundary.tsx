/**
 * A SCREEN WHOSE FILE IS GONE (new-version round, Sep 26 2026).
 *
 * Each screen is fetched the first time it opens (React.lazy). After a deploy
 * the old files are gone, and until now the failure reached the whole-app
 * error screen ("Something went wrong") and took the header and the bottom
 * bar with it. The error screen's Reload was also the only way out, and a
 * Home Screen app reloaded offline opens to a blank screen.
 *
 * This boundary catches ONLY that failure (chunk-error.ts). Any other error
 * is thrown on, to the boundary above, exactly as before.
 *
 *   kind="screen"  Around the screens in AppContent's <main>. Only the screen
 *                  is replaced; the header and the bottom bar keep working.
 *                  It asks the app (ScreenRecoveryProvider, from
 *                  useNewVersion) to recover: reload by itself when nothing
 *                  is at risk and come back to the same screen and client, or
 *                  say in one sentence why not. `resetKey` (the screen) clears
 *                  it, so going to another screen shows that screen.
 *   kind="panel"   Around a panel inside the Active Session (Pulse). It never
 *                  reloads anything: it says the panel will open after this
 *                  session, and marks this page as wanting a reload, which the
 *                  Hub gives it once the session is over.
 */
import { Component, createContext, useContext, useEffect, useState, type ErrorInfo, type ReactNode } from "react";
import { isChunkLoadError } from "./chunk-error";
import { useNewVersionLive } from "./useNewVersion";
import { versionStore } from "./version-store";
import { brokenPanelWords, brokenScreenWords, type BrokenScreenState } from "./words";

export interface ScreenRecovery {
  /** A screen could not open: reload by itself when nothing is at risk. */
  recover: (sessionScreen: boolean) => Promise<BrokenScreenState>;
  /** Load the new version, or Try again. */
  tap: () => Promise<BrokenScreenState>;
  /** This trainer's own open session's client, or null. */
  ownSessionClientName: string | null;
}

const RecoveryContext = createContext<ScreenRecovery | null>(null);

export function ScreenRecoveryProvider({ value, children }: { value: ScreenRecovery; children: ReactNode }) {
  return <RecoveryContext.Provider value={value}>{children}</RecoveryContext.Provider>;
}

type Props =
  | { kind: "screen"; resetKey?: unknown; sessionScreen?: boolean; children: ReactNode }
  | { kind: "panel"; panel: string; children: ReactNode };

interface State {
  error: unknown;
}

export class LoadBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error };
  }

  componentDidUpdate(prev: Props) {
    if (
      this.state.error !== null &&
      this.props.kind === "screen" &&
      prev.kind === "screen" &&
      prev.resetKey !== this.props.resetKey
    ) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    // Anything else is reported by the boundary it is thrown on to.
    if (!isChunkLoadError(error)) return;
    try {
      const message = error instanceof Error ? error.message : String(error);
      fetch("/api/log-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          type: "chunk_load_error",
          stack: error instanceof Error ? error.stack : undefined,
          componentStack: info.componentStack,
        }),
      }).catch(() => {});
    } catch {
      /* never let telemetry break the screen it is reporting on */
    }
  }

  render() {
    const { error } = this.state;
    if (error === null) return this.props.children;
    if (!isChunkLoadError(error)) throw error;
    return this.props.kind === "panel" ? (
      <BrokenPanel panel={this.props.panel} />
    ) : (
      <BrokenScreen sessionScreen={!!this.props.sessionScreen} />
    );
  }
}

function BrokenScreen({ sessionScreen }: { sessionScreen: boolean }) {
  const recovery = useContext(RecoveryContext);
  const [state, setState] = useState<BrokenScreenState>(
    recovery ? { phase: "checking" } : { phase: "wait", cause: "not-loaded", reason: "offline" },
  );

  useEffect(() => {
    if (!recovery) {
      versionStore.markBroken();
      return;
    }
    let alive = true;
    void recovery.recover(sessionScreen).then((next) => {
      if (alive) setState(next);
    });
    return () => {
      alive = false;
    };
    // Once per failure: the boundary remounts this for the next one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Waiting for the trainer's session, and the session has closed (finished
  // on another iPad, say): ask again rather than keep a sentence that is no
  // longer true. It loads now if nothing else is in the way.
  const sessionOpen = recovery ? recovery.ownSessionClientName !== null : false;
  useEffect(() => {
    if (!recovery || sessionOpen) return;
    if (state.phase !== "wait" || state.reason !== "own-session") return;
    let alive = true;
    setState({ phase: "checking" });
    void recovery.recover(sessionScreen).then((next) => {
      if (alive) setState(next);
    });
    return () => {
      alive = false;
    };
    // Only when the session closes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionOpen]);

  const words = brokenScreenWords(state, recovery?.ownSessionClientName ?? null);
  const act = () => {
    if (!recovery) return;
    setState({ phase: "checking" });
    void recovery.tap().then(setState);
  };

  return (
    <div className="flex h-full min-h-0 flex-1 items-center justify-center p-6" data-testid="broken-screen">
      <div className="w-full max-w-md text-center" role="status" aria-live="polite">
        <p className="m-0 text-base leading-relaxed text-foreground">{words.text}</p>
        {words.action && recovery && (
          <button
            type="button"
            onClick={act}
            className="mt-6 min-h-12 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {words.action === "load" ? "Load the new version" : "Try again"}
          </button>
        )}
      </div>
    </div>
  );
}

function BrokenPanel({ panel }: { panel: string }) {
  const live = useNewVersionLive();
  useEffect(() => {
    versionStore.markBroken();
    void versionStore.check({ maxAgeMs: 0 });
  }, []);
  return (
    <div className="p-6 text-center" role="status" aria-live="polite" data-testid="broken-panel">
      <p className="m-0 text-base leading-relaxed text-muted-foreground">{brokenPanelWords(panel, live)}</p>
    </div>
  );
}
