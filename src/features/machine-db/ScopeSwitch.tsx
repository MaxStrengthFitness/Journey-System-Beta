import { Building2, Database } from "lucide-react";
import "./machine-db.css";

/**
 * The Catalog's two scopes: this studio's floor, and every MSF machine.
 *
 * Round: Learning + Planner, Sep 2026. Above the index title on both, so the
 * trainer always sees which list they are reading — "Machines at Solon" and
 * "All MSF machines" are different claims, and the page must not let one be
 * mistaken for the other.
 */
export type CatalogScope = "floor" | "msf";

export function ScopeSwitch({
  scope,
  studioName,
  onChange,
}: {
  scope: CatalogScope;
  studioName: string;
  onChange: (scope: CatalogScope) => void;
}) {
  return (
    <div className="mdb-scope" role="group" aria-label="Which machines">
      <button
        type="button"
        className="mdb-scope__btn"
        aria-pressed={scope === "floor"}
        onClick={() => onChange("floor")}
      >
        <Building2 size={14} aria-hidden />
        At {studioName}
      </button>
      <button
        type="button"
        className="mdb-scope__btn"
        aria-pressed={scope === "msf"}
        onClick={() => onChange("msf")}
      >
        <Database size={14} aria-hidden />
        All MSF machines
      </button>
    </div>
  );
}
