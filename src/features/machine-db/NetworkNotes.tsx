import { Building2, Check, Globe } from "lucide-react";
import { WikiBlocks, WikiSection } from "../wiki";
import { whenLabel } from "../wiki/studio-wiki";
import { useNetworkNotes } from "./hooks";
import { networkItems, studiosLine, type NetworkItem } from "./network";
import "./machine-db.css";

/**
 * FROM OTHER MSF STUDIOS — on every machine page, in both scopes.
 *
 * Round: Learning + Planner, Sep 2026. AJ: "studios can also grab
 * information submitted by other studios about the machine". Their notes on
 * the machine and their playbook tips about it, each shared by that studio's
 * own switch, attributed to the studio and dated.
 *
 * Rendered only when there is something to read — an empty "from other
 * studios" is a standing reproach, the same call the playbook section makes.
 * A failed read says so in one quiet line rather than looking empty.
 */
export function NetworkNotes({
  lineageKey,
  ownStudioId,
  machineName,
}: {
  lineageKey: string | null;
  ownStudioId: string | null;
  machineName: string;
}) {
  const { items, loading, error } = useNetworkNotes(lineageKey);
  const shown = networkItems(items, ownStudioId);

  if (loading) return null;
  if (error) {
    return <p className="mdb-net__error">{error}</p>;
  }
  if (shown.length === 0) return null;

  return (
    <WikiSection
      id="from-other-studios"
      title="From other MSF studios"
      icon={<Globe size={13} aria-hidden />}
      note={`${studiosLine(shown)}. Shared by their trainers about the ${machineName} — their setup may differ from yours.`}
    >
      <ul className="mdb-net">
        {shown.map((item) => (
          <li key={`${item.kind}:${item.studioId}:${item.id}`} className="mdb-net__item">
            <NetworkCard item={item} />
          </li>
        ))}
      </ul>
    </WikiSection>
  );
}

function NetworkCard({ item }: { item: NetworkItem }) {
  const when = whenLabel(item.updatedAt);
  return (
    <article className="mdb-net__card">
      <p className="mdb-net__head">
        <Building2 size={12} aria-hidden />
        <span className="mdb-net__studio">{item.studioName}</span>
        <span className="mdb-net__kind">{item.kind === "note" ? "Note on this machine" : "Playbook tip"}</span>
      </p>

      {item.kind === "note" ? (
        <WikiBlocks blocks={item.blocks} />
      ) : (
        <>
          <p className="mdb-net__title">{item.title}</p>
          <dl className="mdb-net__tip">
            {item.situation && (
              <>
                <dt>Situation</dt>
                <dd>{item.situation}</dd>
              </>
            )}
            {item.tried && (
              <>
                <dt>Tried</dt>
                <dd>{item.tried}</dd>
              </>
            )}
            <dt>What worked</dt>
            <dd>{item.worked}</dd>
          </dl>
          {item.confirmations > 0 && (
            <p className="mdb-net__confirms">
              <Check size={11} strokeWidth={3} aria-hidden />
              Worked for {item.confirmations} trainer{item.confirmations === 1 ? "" : "s"} there
            </p>
          )}
        </>
      )}

      {(item.authorName || when) && (
        <p className="mdb-net__by">
          {item.authorName ? `${item.authorName}, ${item.studioName}` : item.studioName}
          {when ? ` · ${when}` : ""}
        </p>
      )}
    </article>
  );
}
