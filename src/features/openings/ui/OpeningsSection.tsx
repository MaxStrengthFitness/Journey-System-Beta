import { useState } from "react";
import { CalendarDays } from "lucide-react";
import type { Studio, Trainer } from "../../../types";
import { ContextPanel } from "../../relay/board/ContextPanel";
import { useRelay } from "../../relay/board/RelayContext";
import { mayReadWeeks } from "../../standing-week/present";
import { UnsavedChangesScope, useLeaveScope } from "../../unsaved-changes";
import { OpeningsContext } from "./context";
import { rememberOpeningsPart, rememberedOpeningsPart, type OpeningsPart } from "./part-memory";
import { useOpeningsData } from "./useOpeningsData";
import { UsualWeekPart } from "./UsualWeekPart";
import "../../relay/planner.css";
import "../../relay/board/relay.css";
import "../openings.css";

/**
 * MY STUDIO → OPENINGS (Openings round, Sep 27 2026;
 * docs/rounds/2026-09-27-openings.md, "The screens").
 *
 * When the studio is usually busy, what opened up, and what to offer: in
 * sentences, from the bookings Journey already syncs. It books nothing,
 * holds nothing, asks Mindbody nothing and pings nobody (Mindbody charges
 * $2.50 a booking made through its API; every offer ends "Check it in
 * Mindbody before you promise it. Journey doesn't book.").
 *
 * Its parts are a light second level under My Studio's masthead (Relay's own
 * `.pl__subbar`: plain words, the chosen one underlined), not a second row of
 * tabs of equal weight. It opens on The usual week; each iPad remembers the
 * part it was on (ui/part-memory.ts, forgotten at sign-out). A part holding
 * typing (a mark's note, the marks phase) is asked about before another part
 * replaces it: the parts are a leave scope.
 *
 * WHO: everyone who works at the studio, and franchise owners and
 * administrators (`mayReadWeeks`, the rule for reading the standing weeks,
 * which Openings reads). AJ, Sep 27 2026: "keep it relaxed and we will
 * tighten up later", so everyone sees other trainers' names; client names
 * only after a tap, as a courtesy to the client standing at the iPad. The
 * menu is not the gate: this screen asks too.
 *
 * It draws its own frame, as Relay and Machines do: the part, and beside it
 * the Context Panel, where a time's sheet opens.
 */

export interface OpeningsSectionProps {
  studio: Studio;
  authTrainer: Trainer | null;
  trainers: readonly Trainer[];
}

const PARTS: { id: OpeningsPart; label: string; icon: typeof CalendarDays }[] = [{ id: "usual", label: "The usual week", icon: CalendarDays }];

export function OpeningsSection({ studio, authTrainer, trainers }: OpeningsSectionProps) {
  const allowed = mayReadWeeks(authTrainer, studio.id);
  if (!allowed) {
    return (
      <div className="op" role="tabpanel" id="ms-panel" aria-labelledby="ms-tab-openings">
        <div className="op__page">
          <p className="op__lead">Openings is for the people who work at {studio.name}.</p>
        </div>
      </div>
    );
  }
  return <Openings studio={studio} authTrainer={authTrainer} trainers={trainers} />;
}

function Openings({ studio, authTrainer, trainers }: OpeningsSectionProps) {
  const data = useOpeningsData({ studio, trainers, authTrainer });
  const { panel, closePanel } = useRelay();
  const remembered = rememberedOpeningsPart();
  const [part, setPart] = useState<OpeningsPart>(PARTS.some((p) => p.id === remembered) ? remembered : "usual");
  const partScope = useLeaveScope();

  const choose = (next: OpeningsPart) => {
    if (next === part) return;
    partScope.guard(() => {
      rememberOpeningsPart(next);
      setPart(next);
      closePanel();
    });
  };

  return (
    <OpeningsContext.Provider value={data}>
      <div className="op" role="tabpanel" id="ms-panel" aria-labelledby="ms-tab-openings" data-part={part}>
        <div className="pl__subbar op__subbar">
          <div className="pl__tabs" role="tablist" aria-label="Openings">
            {PARTS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`op-tab-${id}`}
                aria-selected={part === id}
                aria-controls="op-panel"
                className="pl__tab"
                onClick={() => choose(id)}
              >
                <Icon size={14} aria-hidden />
                <span className="op__tab-label">{label}</span>
              </button>
            ))}
          </div>
        </div>

        <UnsavedChangesScope scope={partScope}>
          <div className="pl__frame">
            <div className="pl__body" role="tabpanel" id="op-panel" aria-labelledby={`op-tab-${part}`}>
              <div className="op__page">{part === "usual" && <UsualWeekPart />}</div>
            </div>
            <ContextPanel content={panel} onClose={closePanel} />
          </div>
        </UnsavedChangesScope>
      </div>
    </OpeningsContext.Provider>
  );
}
