import React from "react";
import { MaxStrengthLogo } from "./MaxStrengthLogo";
import { cn } from "@/lib/utils";

/**
 * The app's header: the top of the frame (the Navy Frame, Oct 4 2026; AJ's
 * answer 1A). It is the logo's navy (--chrome) with the frame's own inks in
 * BOTH themes, like the bottom bar and the iPad's status bar, so there is no
 * light or dark look to choose and no `variant` to pass. Until then it was
 * white in the light theme (the studio's name 2.56:1, its hairlines white on
 * white) and a host that guessed the theme wrong drew white on white.
 * `theme-color.ts` copies the same --chrome into the status bar.
 */
interface AppHeaderProps {
  trainerInitials?: string;
  /**
   * The studio the app is in. No default: a header that isn't told its studio
   * says "Choose a studio" (or nothing) rather than naming one. It defaulted
   * to "SOLON" until Sep 27 2026, and the session's screens never passed a
   * name, so the briefing and the Wrap-up said SOLON at every studio.
   */
  studioName?: string;
  onStudioClick?: () => void;
  /**
   * Inside Operations and the Admins dashboard the studio's name and the
   * logo take you back to the Hub, in trainer mode, rather than opening the
   * studio picker (the Atlas answers, Oct 2 2026): "if you tap the top left
   * like a studio name or icon it should just take you back to the hub".
   * 'Looking at' stays the only studio switch in there.
   */
  studioClickGoesHome?: boolean;
  /**
   * The header's icon cluster. Every screen passes the app shell's controls
   * (refresh, theme, feedback, notifications, settings), so there is no
   * fallback: a header with no controls should look empty rather than grow
   * three buttons that do nothing, which is what used to happen here.
   */
  rightControls?: React.ReactNode;
  trainerDropdown?: React.ReactNode;
  /**
   * Optional global search control. It sits in the flexible middle band of
   * the header so it can widen on tablet widths without pushing the icon
   * cluster around. Only the app shell passes this; nested headers (e.g. the
   * workout tracker) leave it out so a live session never shows a search box.
   */
  searchSlot?: React.ReactNode;
}

export function AppHeader({
  trainerInitials,
  studioName,
  onStudioClick,
  studioClickGoesHome = false,
  rightControls,
  trainerDropdown,
  searchSlot,
}: AppHeaderProps) {
  const name = studioName?.trim() ?? "";

  return (
    <header className="h-14 shrink-0 border-b flex items-center justify-between px-4 z-20 bg-chrome border-chrome-line">
      {/* min-w-0 is what lets this cluster shrink at all. Without it the flex
          item refuses to go below its content width, so a long studio name
          CLIPS instead of truncating — which is how the end of a name went
          missing with no ellipsis to say it had. */}
      <div className="flex items-center gap-3 min-w-0">
        {studioClickGoesHome && onStudioClick ? (
          <button
            type="button"
            onClick={onStudioClick}
            aria-label="Back to the Hub"
            className="shrink-0 min-h-10 min-w-10 grid place-items-center hover:opacity-75 cursor-pointer"
          >
            <MaxStrengthLogo size="md" showText={false} className="shrink-0 text-chrome-ink" />
          </button>
        ) : (
          <MaxStrengthLogo
            size="md"
            showText={false}
            className="shrink-0 text-chrome-ink"
          />
        )}
        <button
          onClick={onStudioClick}
          // This control SWITCHES STUDIOS. A half-rendered name is genuinely
          // ambiguous across a franchise with similar location names, so the
          // full one has to stay recoverable.
          title={name || undefined}
          aria-label={
            onStudioClick && studioClickGoesHome
              ? name ? `Studio: ${name}. Back to the Hub.` : "Back to the Hub"
              : onStudioClick
                ? name ? `Studio: ${name}. Change studio.` : "Choose a studio"
                : name ? `Studio: ${name}` : "Studio"
          }
          className={cn(
            // ch, not px: the cap scales with the font so it holds across the
            // whole text-xs -> sm:text-lg -> md:text-xl ramp instead of
            // clipping at only some sizes. max-w-37.5 (150px) was tuned for
            // one size and cut mid-word at the others.
            //
            // pe-[0.22em] + leading-tight (Sep 5): `truncate` is
            // overflow:hidden, and Saira Condensed ITALIC leans past its own
            // advance width — so the last glyph's right edge ("SOLON" lost
            // the leg of its N) and the tops of tall caps were shaved off
            // even when the name fit. The trailing padding gives the slant
            // room to land; the taller line box stops the vertical clip.
            // Names are never truncated (CLAUDE.md, Sep 29 2026): a long name
            // wraps onto a second line within the cap instead of ellipsising.
            "font-display italic text-xs sm:text-lg md:text-xl leading-tight uppercase justify-center transition-opacity text-left whitespace-normal [overflow-wrap:anywhere] min-h-10 pe-[0.22em] max-w-[14ch] sm:max-w-[20ch] lg:max-w-[28ch]",
            "text-chrome-ink",
            onStudioClick
              ? "hover:opacity-75 cursor-pointer"
              : "cursor-default",
          )}
        >
          {name || (onStudioClick ? "Choose a studio" : "")}
        </button>
      </div>

      {/* Flexible middle band: the search grows into whatever width is free. */}
      {searchSlot && (
        <div className="flex-1 min-w-0 flex items-center justify-end px-2 sm:px-4">
          {searchSlot}
        </div>
      )}

      <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
        {rightControls}

        <div className="w-px h-6 bg-chrome-line" />

        {trainerDropdown || (
          <button
            className="w-8 h-8 sm:w-11 sm:h-11 rounded-full font-display italic text-xs sm:text-sm flex items-center justify-center cursor-pointer shadow-sm mx-auto shrink-0 bg-chrome-here text-chrome"
          >
            {trainerInitials}
          </button>
        )}
      </div>
    </header>
  );
}
