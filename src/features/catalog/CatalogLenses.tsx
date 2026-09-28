import { Database, MapPin, PersonStanding } from "lucide-react";

/**
 * THE CATALOG'S THREE WAYS IN (Machine Catalog round, Sep 28 2026 — R3).
 *
 * AJ's pick: open on your floor, with the body and All MSF the other two ways
 * in. This replaces the two-way "At {studio} · All MSF machines" switch on the
 * Catalog (machine-db's ScopeSwitch, which stays for anything else that uses
 * it). Above the title on every lens, so the reader always sees which list
 * they are in: "Solon's floor" and "All MSF machines" are different claims.
 *
 * Every button is 44px, and the words stay beside the icons on every width;
 * they wrap rather than hide.
 */
/** machine-db's two scopes ("floor", "msf"), and the body between them. */
export type CatalogLens = "floor" | "body" | "msf";

export function CatalogLenses({
  lens,
  studioName,
  onChange,
}: {
  lens: CatalogLens;
  studioName: string;
  onChange: (lens: CatalogLens) => void;
}) {
  const options: { id: CatalogLens; label: string; icon: React.ReactNode }[] = [
    { id: "floor", label: `${studioName}'s floor`, icon: <MapPin size={14} aria-hidden /> },
    { id: "body", label: "The body", icon: <PersonStanding size={14} aria-hidden /> },
    { id: "msf", label: "All MSF machines", icon: <Database size={14} aria-hidden /> },
  ];
  return (
    <div className="mcat-lens" role="group" aria-label="Which machines">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className="mcat-lens__btn"
          aria-pressed={lens === o.id}
          onClick={() => onChange(o.id)}
        >
          {o.icon}
          <span className="mcat-lens__label">{o.label}</span>
        </button>
      ))}
    </div>
  );
}
