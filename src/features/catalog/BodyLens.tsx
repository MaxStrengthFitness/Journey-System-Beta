import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { BodyModel } from "../../components/anatomy";
import { useWikiPageGuard } from "../wiki/page-guard";
import {
  BODY_REGIONS,
  REGION_GROUP_LABEL,
  mainCounts,
  regionById,
  regionForSlug,
  regionOnFloor,
  type RegionGroup,
} from "./body-lens";
import { FloorRow } from "./FloorRow";
import type { FloorState, Preset } from "./floor-index";
import type { CatalogMachine } from "./types";

/**
 * THE BODY — the Catalog's second way in (Machine Catalog round, Catalog R3).
 *
 * The app's own anatomy model (BodyModel), as AJ asked, with every part it
 * can light ALSO as a list beside it: a finger on a small patch (the neck, the
 * forearm) should never be the only way in, and nothing here is found only by
 * hovering. Pick a part and the panel says what trains it on this floor —
 * main movers first, then the machines that help — and which MSF movements
 * would, that this floor does not have.
 *
 * The rules are in ./body-lens.ts. The figure is painted with Learning's
 * figure tokens (--wk-muscle-*), as the machine page's is.
 */

const MUSCLE_COLOURS: [string, string] = ["var(--wk-muscle-primary)", "var(--wk-muscle-secondary)"];
const BODY_COLOUR = "var(--wk-muscle-base)";
const GROUPS: RegionGroup[] = ["upper", "trunk", "lower"];

export interface BodyLensProps {
  /** The floor, in walking order — empty unless it is `ready`. */
  floor: CatalogMachine[];
  floorState: FloorState;
  studioName: string;
  /** The part picked, by the model's name for it; null for none yet. */
  regionId: string | null;
  onRegion: (id: string) => void;
  presetFor: (machine: CatalogMachine) => Preset;
  /** Relay's flags; null while unknown. */
  flaggedIds: ReadonlySet<string> | null;
  onOpenMachine: (id: string) => void;
  /** An MSF movement this floor does not have: its page in All MSF. */
  onOpenMovement: (movementId: string) => void;
}

export function BodyLens({
  floor,
  floorState,
  studioName,
  regionId,
  onRegion,
  presetFor,
  flaggedIds,
  onOpenMachine,
  onOpenMovement,
}: BodyLensProps) {
  const guard = useWikiPageGuard();
  const region = regionById(regionId);
  const [view, setView] = useState<"front" | "back">(region?.view ?? "front");
  // Turn the figure to the side the part is drawn on whenever the part changes.
  useEffect(() => {
    if (region) setView(region.view);
  }, [region]);

  const ready = floorState === "ready";
  const counts = ready ? mainCounts(floor) : null;
  const onFloor = region ? regionOnFloor(region, floor) : null;

  const row = (m: CatalogMachine) => (
    <FloorRow
      key={m.id}
      walk={floor.indexOf(m) + 1}
      machine={m}
      preset={presetFor(m)}
      flagged={Boolean(flaggedIds?.has(m.id))}
      onOpen={() => onOpenMachine(m.id)}
    />
  );

  return (
    <section className="mcat-body" aria-label="What trains what">
      <div className="mcat-body__pick">
        <div className="mcat-body__regions" role="group" aria-label="Parts of the body">
          {GROUPS.map((g) => (
            <div key={g} className="mcat-body__group">
              <p className="mcat-body__group-label">{REGION_GROUP_LABEL[g]}</p>
              <div className="mcat-body__chips">
                {BODY_REGIONS.filter((r) => r.group === g).map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className="mcat-body__chip"
                    aria-pressed={r.id === regionId}
                    onClick={() => onRegion(r.id)}
                  >
                    <span>{r.label}</span>
                    {counts && counts[r.id] > 0 && (
                      <span className="mcat-body__count" aria-label={`${counts[r.id]} on ${studioName}'s floor`}>
                        {counts[r.id]}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mcat-body__figure">
          <div className="wk__figure">
            <BodyModel
              primary={region?.muscles ?? []}
              gender="male"
              view={view}
              colors={MUSCLE_COLOURS}
              baseFill={BODY_COLOUR}
              onRegionClick={(slug) => {
                const hit = regionForSlug(slug);
                if (hit) onRegion(hit.id);
              }}
            />
          </div>
          <div className="wk__figure-controls">
            <div className="wk__seg" role="group" aria-label="Figure view">
              <button type="button" className="wk__seg-btn" aria-pressed={view === "front"} onClick={() => setView("front")}>
                Front
              </button>
              <button type="button" className="wk__seg-btn" aria-pressed={view === "back"} onClick={() => setView("back")}>
                Back
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mcat-body__panel">
        {!region || !onFloor ? (
          <p className="wk__empty">Pick a part of the body, on the figure or in the list, to see what trains it.</p>
        ) : (
          <>
            <h2 className="mcat-body__title">{region.label}</h2>

            {floorState === "loading" && <p className="wk__empty">Reading {studioName}'s floor…</p>}
            {floorState === "unreadable" && <p className="wk__empty">Can't read {studioName}'s floor right now.</p>}
            {floorState === "empty" && <p className="wk__empty">No machines on {studioName}'s floor yet.</p>}

            {ready && (
              <>
                <h3 className="mcat-body__heading">Trains it most</h3>
                {onFloor.main.length > 0 ? (
                  <ol className="mcat-floor">{onFloor.main.map(row)}</ol>
                ) : (
                  <p className="wk__empty">Nothing on {studioName}'s floor trains it most.</p>
                )}
                {onFloor.helps.length > 0 && (
                  <>
                    <h3 className="mcat-body__heading">Helps</h3>
                    <ol className="mcat-floor">{onFloor.helps.map(row)}</ol>
                  </>
                )}
              </>
            )}

            {onFloor.notHere.length > 0 && floorState !== "loading" && (
              <>
                {/* An unreadable floor cannot say what is not on it. */}
                <h3 className="mcat-body__heading">
                  {floorState === "unreadable" ? "MSF machines that train it most" : `Not on ${studioName}'s floor`}
                </h3>
                <ul className="mcat-body__others">
                  {onFloor.notHere.map((mv) => (
                    <li key={mv.id}>
                      <button type="button" className="mcat-body__other" onClick={() => guard(() => onOpenMovement(mv.id))}>
                        <span className="mcat-body__other-name">{mv.name}</span>
                        {mv.code && <span className="wk__row-code">{mv.code}</span>}
                        <ChevronRight size={16} className="mcat-body__other-chev" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}
