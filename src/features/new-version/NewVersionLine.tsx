/**
 * The one line under the header while a new version of Journey waits
 * (new-version round, Sep 26 2026). Quiet on purpose: a sentence and, where
 * pressing it can work, Load now. Never on the Active Session, never red (red
 * on the floor is the rep-quality mark), never a pop-up or a sound, and
 * nothing that reaches outside the app. The button is 44px, like the other
 * one-handed buttons on the floor.
 */
import { RefreshCw } from "lucide-react";
import type { LineWords } from "./words";

export function NewVersionLine({
  line,
  busy,
  onLoad,
}: {
  line: LineWords | null;
  busy: boolean;
  onLoad: () => void;
}) {
  if (!line) return null;
  return (
    <div
      className="flex-none flex items-center gap-3 border-b border-border bg-muted px-4 py-1.5 text-sm text-foreground"
      role="status"
      aria-live="polite"
      data-testid="new-version-line"
    >
      <RefreshCw className="size-4 flex-none text-muted-foreground" strokeWidth={2.4} aria-hidden="true" />
      <p className="m-0 min-w-0 flex-1 leading-snug">{line.text}</p>
      {line.offerLoad && (
        <button
          type="button"
          onClick={onLoad}
          disabled={busy}
          className="min-h-11 flex-none rounded-xl bg-(--raised) border border-input shadow-(--raised-lift) active:translate-y-px active:shadow-(--press) px-4 text-sm font-bold text-foreground transition-colors hover:bg-muted disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {busy ? "Loading…" : "Load now"}
        </button>
      )}
    </div>
  );
}
