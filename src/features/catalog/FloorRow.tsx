import { ChevronRight } from "lucide-react";
import { WikiBadge, accentForPattern, accentStyle } from "../wiki";
import { useWikiPageGuard } from "../wiki/page-guard";
import { abbr as academyAbbr } from "../routine-builder/academy";
import { presetLine, type Preset } from "./floor-index";
import { modelName, type MachineModel } from "./models";
import { floorNameHidesMovement, movementOf } from "./names";
import { outOfServiceShort } from "./out-of-service";
import type { CatalogMachine } from "./types";
import "./catalog.css";

/**
 * ONE UNIT ON THE FLOOR, AS A TRAINER WALKS UP TO IT.
 *
 * Round: the Machine Catalog, Sep 28 2026 (Catalog R2 "Our floor"). The row
 * is the top of the machine's page, so it often answers the question without
 * opening it: which unit (its walking number and floor name), which Academy
 * movement and code, where its dials sit (the preset), its switches, and
 * whether it is out of service or flagged.
 *
 * AJ asked for less text, so a row says each thing once: the Academy's name
 * appears only when the floor name leaves it unsaid (LUMBAR is the Lumbar
 * Extension; LEG PRESS needs nothing more), and a unit with no numbers says
 * so in one short line. Nothing is cut: every line wraps.
 *
 * Colours keep the app's meanings: Out of service and Flagged are cautions
 * (plum); "Never to failure" is the Academy's safety rule and reads in the
 * critical crimson, as it does on My Studio; a handoff is plain information.
 */
export interface FloorRowProps {
  /** Its place in the leader's walking order, from 1. */
  walk: number;
  machine: CatalogMachine;
  preset: Preset;
  /** Relay's care record flags it. False while flags are unknown. */
  flagged: boolean;
  /**
   * Which maker's model the unit is (wave 2, Catalog R4): only the record its
   * roster entry names, read. Null or absent says nothing, never a guess.
   */
  model?: MachineModel | null;
  onOpen: () => void;
}

export function FloorRow({ walk, machine, preset, flagged, model, onOpen }: FloorRowProps) {
  // A row leaves the index for a page, so it asks about typing there first.
  const guard = useWikiPageGuard();
  const movement = movementOf(machine);
  const code = movement?.code ?? academyAbbr(machine.id);
  const movementLine = movement
    ? floorNameHidesMovement(machine.name, movement.name)
      ? movement.name
      : null
    : machine.isStudioCustom
      ? "The studio's own machine"
      : null;
  const outOfService = machine.rosterStatus === "maintenance";
  const quiet = preset.state === "none" || preset.state === "no-dials";

  return (
    <li className="mcat-floor__item">
      <button
        type="button"
        className="mcat-row"
        style={accentStyle(accentForPattern(machine.movementPattern))}
        onClick={() => guard(onOpen)}
      >
        <span className="mcat-row__walk" aria-label={`Number ${walk} on the walk`}>
          {walk}
        </span>
        <span className="mcat-row__main">
          <span className="mcat-row__top">
            <span className="mcat-row__name">{machine.name}</span>
            {code && (
              <span className="wk__row-code" aria-hidden>
                {code}
              </span>
            )}
          </span>
          {model && <span className="mcat-row__model">{modelName(model)}</span>}
          {movementLine && <span className="mcat-row__movement">{movementLine}</span>}
          <span className={`mcat-row__preset${quiet ? " mcat-row__preset--none" : ""}`}>{presetLine(preset)}</span>
          {(outOfService || flagged || machine.neverToFailure || machine.requiresHandoff) && (
            <span className="mcat-row__tags">
              {outOfService && <WikiBadge tone="warn">Out of service</WikiBadge>}
              {flagged && <WikiBadge tone="warn">Flagged</WikiBadge>}
              {machine.neverToFailure && <WikiBadge tone="alert">Never to failure</WikiBadge>}
              {machine.requiresHandoff && <WikiBadge tone="neutral">Handoff</WikiBadge>}
            </span>
          )}
          {/* Why, and who said so (wave 2, Sep 28 2026). An entry set out of
              service before reasons existed says only the badge above. */}
          {outOfService && machine.outOfService && (
            <span className="mcat-row__why">{outOfServiceShort(machine.outOfService)}</span>
          )}
        </span>
        <ChevronRight size={16} className="mcat-row__chev" aria-hidden />
      </button>
    </li>
  );
}
