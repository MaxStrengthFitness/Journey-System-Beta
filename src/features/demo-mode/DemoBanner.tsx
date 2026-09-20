import { FlaskConical } from "lucide-react";
import { DEMO_STUDIO_NAME } from "./constants";

/**
 * THE DEMO STRIP.
 *
 * One line across the top of every screen while the app is inside Demo Mode,
 * including the Active Session — which is the whole reason it is a sibling of
 * the header rather than part of it. AppContent hides AppHeader on `workouts`
 * to give the floor its full height, and the floor is exactly where somebody
 * watching over a shoulder most needs to know that the client being logged is
 * not a person.
 *
 * Three rules it is built to:
 *
 *  - It cannot be dismissed. A demo you can forget you are in is the whole
 *    failure mode; the strip is the one thing standing between "practice" and
 *    a trainer believing they logged a real set.
 *  - It costs one line. The Active Session is the tightest screen in the app
 *    on an iPad in portrait, so this is ~26px and never wraps.
 *  - Dashed, like the card on the selection screen. Dashed means demo
 *    everywhere in this app, so the signal is learned once.
 *
 * The way out is on it, because the way out of Demo Mode is otherwise the
 * studio picker in a header this screen may not be showing.
 */
export function DemoBanner({ onLeave }: { onLeave?: () => void }) {
  return (
    <div
      role="status"
      className="flex-none flex items-center justify-center gap-2 px-3 h-[26px] border-b border-dashed border-slate-400 dark:border-slate-600 bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 select-none"
    >
      <FlaskConical className="w-3 h-3 shrink-0" aria-hidden="true" />
      <p className="text-[10px] font-black uppercase tracking-widest truncate">
        {DEMO_STUDIO_NAME}
        <span className="hidden sm:inline font-bold">
          {" "}
          — nobody here is real
        </span>
      </p>
      {onLeave && (
        <button
          type="button"
          onClick={onLeave}
          className="shrink-0 text-[10px] font-black uppercase tracking-widest underline underline-offset-2 hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer"
        >
          Leave
        </button>
      )}
    </div>
  );
}
