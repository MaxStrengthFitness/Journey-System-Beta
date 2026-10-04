import { cn } from "@/lib/utils";

/**
 * The strip under the iPad status bar, at the top of the app shell.
 *
 * The shell's first child is this box, exactly as tall as the top inset
 * (`h-safe-top`). Since Sep 27 2026 the status bar is the `default` style,
 * which iPadOS draws ABOVE the page, so the inset is 0 and the strip is 0px
 * in the Home Screen app as it is in a Safari tab (index.html says why).
 * It stays so that `black-translucent`, where the page runs up under the
 * status bar, is one line away. Under that style it is coloured like
 * whatever sits directly under it, so the top of the screen reads as one
 * surface running up behind the clock:
 *
 *   header   the AppHeader (every view but the Active Session)
 *   session  the Active Session, whose top is <main>'s own ground
 *   demo     the Demo Mode banner, which sits above either of those
 *
 * The header is the frame, the logo's navy (--chrome) in both themes since
 * the Navy Frame (Oct 4 2026), so under it the strip is the frame too. In the
 * light theme the session's ground and the demo banner are light, and the
 * status bar's text is always white in this style, so the strip is the
 * frame's navy there as well. The fixed `.status-band` in index.html paints
 * the same --chrome over it in the light theme anyway; this is the belt to
 * that brace.
 */
export type StatusBarStripTone = "header" | "session" | "demo";

const TONE: Record<StatusBarStripTone, string> = {
  header: "bg-chrome",
  session: "bg-chrome dark:bg-slate-950",
  demo: "bg-chrome dark:bg-slate-900",
};

export function StatusBarStrip({ tone }: { tone: StatusBarStripTone }) {
  return <div aria-hidden data-status-bar-strip={tone} className={cn("h-safe-top shrink-0", TONE[tone])} />;
}
