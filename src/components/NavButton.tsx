/**
 * One button of the app's bottom navigation bar.
 *
 * Moved out of AppContent.tsx, unchanged, in the beta-prep trim (Sep 17 2026).
 *
 * It sits on the frame, the logo's navy in both themes (the Navy Frame, Oct 4
 * 2026), so every colour here is one of the frame's own tokens (--chrome-*),
 * never a theme ink or a Tailwind palette:
 *
 *   the tab you're on   a SOLID box in the frame's blue with a navy icon, its
 *                       label in that blue (6.5:1), and the line under it.
 *                       The clearest "where you are" at arm's length. The
 *                       light-theme icon was 2.5:1 on sky-500 and the dark
 *                       label 2.5:1 before this.
 *   idle                the frame's quiet ink (8.6:1), its bright ink on hover
 *   attention           a running session's way back: the logo orange
 *                       (--chrome-go), on a faint orange box, with a pulsing
 *                       dot ringed in the frame's navy so it is cut out of
 *                       the box on either theme.
 *
 * A host may pass its own active colours (AppBottomBar's orange tabs);
 * they are frame tokens too.
 *
 * The label (type and depth, Oct 4 2026; AJ's answer 1A): Geist 12/600 in
 * ordinary capitalisation, the tab you're on 700; 11 on a phone, where five
 * tabs share the bar. It was 900 capitals at 9px on a phone and 11 elsewhere,
 * squeezed with tracking-tighter and cut short with `truncate`. A label too
 * long for its share now WRAPS (names are never truncated, and the session's
 * tab carries the client's first name). Only colour and the active tab's
 * scale transition; the weight changes at once.
 */
import React from "react";

export function NavButton({
  active,
  onClick,
  icon,
  label,
  activeColor = "text-chrome-here",
  activeBg = "bg-chrome-here text-chrome",
  activeIndicator = "bg-chrome-here",
  attention = false,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  activeColor?: string;
  activeBg?: string;
  activeIndicator?: string;
  /** A live session is running and this tab is the way back to it:
      the tab stays orange even when not active, with a pulsing dot. */
  attention?: boolean;
}) {
  const tone = active
    ? `${activeColor} scale-105`
    : attention
      ? "text-chrome-go"
      : "text-chrome-ink-2 hover:text-chrome-ink";
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 min-w-0 flex-col items-center gap-0.5 transition-[color,transform] duration-300 relative ${tone}`}
    >
      <div
        className={`relative p-1 sm:p-1.5 rounded-lg transition-colors ${active ? activeBg : attention ? "bg-chrome-go-fill" : "bg-transparent"}`}
      >
        {icon}
        {attention && !active && (
          <span
            aria-hidden
            className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-chrome-go ring-2 ring-chrome motion-safe:animate-attention"
          />
        )}
      </div>
      <span className={`w-full text-center text-[11px] sm:text-[12px] leading-tight [overflow-wrap:anywhere] ${active ? "font-bold" : "font-semibold"}`}>
        {label}
      </span>
      {active && (
        // The tab you're on is underlined. Drawn with CSS since the speed
        // round (Oct 5 2026, R13): it slid from tab to tab with the motion
        // library, whose whole runtime the bar put on the first screen. It
        // now grows in where it lands, and stays still under "reduce motion".
        <div
          className={`absolute -bottom-1 left-0 right-0 h-0.5 rounded-full motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-50 duration-300 ease-out ${activeIndicator}`}
        />
      )}
    </button>
  );
}
