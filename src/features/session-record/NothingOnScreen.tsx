/**
 * The Active Session's screen when it has nothing to draw (session record,
 * Sep 26 2026). The app header stays, so the menu, the studio and sign-out are
 * where they always are, then one sentence and the way on. Buttons are 48px:
 * this is tapped with the iPad in one hand.
 */
import type { ReactNode } from "react";
import { AppHeader } from "../../components/AppHeader";
import { useTheme } from "../../components/ThemeProvider";
import { nothingWords, type NothingKind } from "./nothing-on-screen";

export function NothingOnScreen({
  kind,
  trainerInitials,
  onRetry,
  onFindClient,
  onHub,
  rightControls,
  trainerDropdown,
  onStudioClick,
}: {
  kind: NothingKind;
  trainerInitials?: string;
  onRetry?: () => void;
  onFindClient: () => void;
  onHub: () => void;
  rightControls?: ReactNode;
  trainerDropdown?: ReactNode;
  onStudioClick?: () => void;
}) {
  const { theme } = useTheme();
  const words = nothingWords(kind);
  const primary =
    words.primary === "retry" && onRetry
      ? { label: "Try again", onClick: onRetry }
      : words.primary === "find-client"
        ? { label: "Find a client", onClick: onFindClient }
        : null;

  return (
    <div className="h-full min-h-0 flex flex-col bg-background" data-testid="nothing-on-screen" data-kind={kind}>
      <AppHeader
        variant={theme === "light" ? "light" : "dark"}
        trainerInitials={trainerInitials}
        rightControls={rightControls}
        trainerDropdown={trainerDropdown}
        onStudioClick={onStudioClick}
      />
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md text-center" role="status" aria-live="polite">
          <h2 className="text-xl font-bold text-foreground">{words.title}</h2>
          <p className="mt-2 text-base leading-relaxed text-muted-foreground">{words.body}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {primary && (
              <button
                type="button"
                onClick={primary.onClick}
                className="min-h-12 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {primary.label}
              </button>
            )}
            <button
              type="button"
              onClick={onHub}
              className="min-h-12 rounded-xl border border-border bg-background px-5 text-sm font-bold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Back to the Hub
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
