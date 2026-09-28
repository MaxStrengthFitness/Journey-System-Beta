import { Heart } from "lucide-react";
import { cn } from "../../../lib/utils";
import { minutesToClock, studioMinutesNow } from "./now-context";
import { usePulse, type PulseEvent } from "./pulse";
import { useRelayMaybe } from "./RelayContext";
import { hasKudosFrom, kudosCount, toggleKudos } from "./kudos";
import "./board.css";

/**
 * JUST NOW — what the team did today, as a still list with a heart on each
 * line (Relay room, Sep 28 2026, phase 1 of the redesign).
 *
 * It was a ticker on the Now Bar that swapped to a new teammate every six
 * seconds (the blueprint's pin 3: "movement pulls the eye off the work"), and
 * on an upright iPad it had to fight for a row of its own. The one header
 * took the Now Bar's time facts, and the teammates' lines folded into the
 * notices on the Board: newest first, nothing moves, nothing is cut short.
 *
 * It holds the app's only kudos button, so it is never hidden in any width
 * (my-studio/look.test.ts holds that). A heart is one tap of thanks on the
 * closed document (kudos.ts): recognition, never a count to compare. Your
 * own line shows the hearts you got, and only you see it as yours.
 *
 * The events are the ones the Board already listens to (pulse.ts); nothing
 * here reads anything.
 */
export function JustNow({ studioId, max = 4 }: { studioId: string | null; max?: number }) {
  const events = usePulse(studioId);
  const shown = events.slice(0, max);
  return (
    <section className="rjn" aria-label="Just now">
      <header className="rjn__head">
        <h2 className="rjn__title">Just now</h2>
        <span className="rjn__sub">what the team did today</span>
      </header>
      {shown.length === 0 ? (
        <p className="rjn__quiet">Quiet so far today.</p>
      ) : (
        <ul className="rjn__list">
          {shown.map((ev) => (
            <JustNowLine key={ev.id} ev={ev} studioId={studioId} />
          ))}
        </ul>
      )}
      {events.length > shown.length && (
        <p className="rjn__more">
          {events.length - shown.length === 1 ? "1 more earlier today." : `${events.length - shown.length} more earlier today.`}
        </p>
      )}
    </section>
  );
}

function JustNowLine({ ev, studioId }: { ev: PulseEvent; studioId: string | null }) {
  const relay = useRelayMaybe();
  const me = relay?.uid ? { id: relay.uid, name: relay.authTrainer?.fullName ?? "A trainer" } : null;
  const mine = Boolean(me && ev.whoId === me.id);
  const thanked = hasKudosFrom(ev.kudos, me?.id ?? null);
  const hearts = kudosCount(ev.kudos);
  const when = minutesToClock(studioMinutesNow(new Date(ev.at)));

  const thank = async () => {
    if (!ev.target || !me || !studioId) return;
    try {
      await toggleKudos({
        studioId,
        target: ev.target,
        from: me,
        to: ev.whoId ? { id: ev.whoId, name: ev.who } : null,
        on: !thanked,
        what: ev.what,
      });
    } catch (err) {
      console.warn("[relay] kudos failed:", err);
    }
  };

  return (
    <li className="rjn__item">
      <span className="rjn__line">
        <span className="rjn__who">{ev.who}</span> {ev.what}
        <span className="rjn__when"> · {when}</span>
      </span>
      {ev.target && me && !mine && (
        <button
          type="button"
          className={cn("rjn__kudos", thanked && "rjn__kudos--on")}
          aria-pressed={thanked}
          aria-label={thanked ? `Take back your kudos to ${ev.who}` : `Send kudos to ${ev.who}`}
          onClick={() => void thank()}
        >
          <Heart size={16} aria-hidden />
          {hearts > 0 && <span className="rjn__kudos-n">{hearts}</span>}
        </button>
      )}
      {ev.target && mine && hearts > 0 && (
        <span className="rjn__kudos rjn__kudos--mine" aria-label={`${hearts} kudos for you`}>
          <Heart size={16} aria-hidden /> <span className="rjn__kudos-n">{hearts}</span>
        </span>
      )}
    </li>
  );
}
