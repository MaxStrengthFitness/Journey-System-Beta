import { useState } from "react";
import { ShieldAlert } from "lucide-react";

/**
 * Clinical warnings. Deliberately NOT a <Section>.
 *
 * Everything else on this pane collapses; this does not. "Ensure the client's
 * hands are clear of the rocking thigh pads" behind a tap, mid-set, is a worse
 * failure than a longer page. It sits directly under the machine title, always
 * expanded.
 *
 * The one concession to length: past MAX_VISIBLE, the rest disclose behind a
 * count. The FIRST ones are never hidden, so the trade is "some warnings need a
 * tap" rather than "the warning section needs a tap".
 */
const MAX_VISIBLE = 4;

export function ClinicalWarnings({ warnings }: { warnings: string[] }) {
  const [expanded, setExpanded] = useState(false);
  if (warnings.length === 0) return null;

  const visible = expanded ? warnings : warnings.slice(0, MAX_VISIBLE);
  const hidden = warnings.length - visible.length;

  return (
    <section className="cat__warnings" aria-labelledby="cat-warnings-head">
      <h3 className="cat__warnings-head" id="cat-warnings-head">
        <ShieldAlert size={15} aria-hidden />
        Clinical warnings
      </h3>
      <ul className="cat__warnings-list">
        {visible.map((w, i) => (
          <li key={i}>
            <span>{w}</span>
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <button
          type="button"
          className="cat__warnings-more"
          onClick={() => setExpanded(true)}
        >
          Show {hidden} more
        </button>
      )}
      {expanded && warnings.length > MAX_VISIBLE && (
        <button
          type="button"
          className="cat__warnings-more"
          onClick={() => setExpanded(false)}
        >
          Show fewer
        </button>
      )}
    </section>
  );
}
