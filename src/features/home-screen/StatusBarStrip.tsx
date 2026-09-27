import { cn } from "@/lib/utils";

/**
 * The strip under the iPad status bar, at the top of the app shell.
 *
 * In the Home Screen app the page runs up under the status bar (index.html:
 * `viewport-fit=cover`, `black-translucent`), so the shell's first child is
 * this box, exactly as tall as the status bar (`h-safe-top`; 0px in a Safari
 * tab). It is coloured like whatever sits directly under it, so the top of
 * the screen reads as one surface running up behind the clock:
 *
 *   header   the AppHeader (every view but the Active Session)
 *   session  the Active Session, whose top is <main>'s own ground
 *   demo     the Demo Mode banner, which sits above either of those
 *
 * In the light theme every one of those surfaces is white or near white, and
 * the status bar's text is always white in this style, so the strip is the
 * dark neutral instead. The fixed `.status-band` in index.html paints the same
 * colour over it anyway; this is the belt to that brace.
 */
export type StatusBarStripTone = "header" | "session" | "demo";

const TONE: Record<StatusBarStripTone, string> = {
  header: "bg-slate-900 dark:bg-bg-dark-2",
  session: "bg-slate-900 dark:bg-slate-950",
  demo: "bg-slate-900 dark:bg-slate-900",
};

export function StatusBarStrip({ tone }: { tone: StatusBarStripTone }) {
  return <div aria-hidden data-status-bar-strip={tone} className={cn("h-safe-top shrink-0", TONE[tone])} />;
}
