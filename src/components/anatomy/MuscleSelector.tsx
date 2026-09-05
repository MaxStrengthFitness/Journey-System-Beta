import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { BodyModel } from "./BodyModel";
import {
  isMuscleVisibleOn,
  musclesForBodySlug,
  type MuscleId,
} from "../../types/machines";

/**
 * EDIT the muscle mapping on the same figure a trainer READS it on.
 *
 * Round: Catalog Redesign, Sep 2026.
 *
 * The Machine Creator already had a chip picker, and chips are the right
 * control for the regions the model collapses — 'deltoids' is one region
 * covering delts-front and delts-rear, so only a chip can say which you meant.
 * What chips cannot do is show you the RESULT. Every muscle-mapping bug this
 * round fixed was invisible in a list of nineteen toggles and obvious the
 * moment the figure was rendered:
 *
 *   Hip Abduction  primary on the far side of the body from the chosen view,
 *                  so the figure lit up the client's core.
 *   Seated Dip     the same, undetected until an audit page existed.
 *   Pullover       likewise.
 *
 * So this renders live beside the chips, and says so out loud when the primary
 * muscles are not drawn on the selected view. That check is the authoring-time
 * form of the test in features/catalog/anatomy.test.ts: catch it while someone
 * is writing the mapping, not after a trainer reports a lit-up core.
 *
 * Clicking a region cycles it none -> primary -> secondary -> none. Where a
 * region covers several muscles the first is used as its representative; the
 * chips remain the way to say "the REAR delt, specifically".
 */
export interface MuscleSelectorProps {
  primary: MuscleId[];
  secondary: MuscleId[];
  view: "front" | "back";
  gender?: "male" | "female";
  onChange: (next: { primary: MuscleId[]; secondary: MuscleId[] }) => void;
  /** Offered when the primary muscles are not visible on `view`. */
  onSuggestView?: (view: "front" | "back") => void;
}

export function MuscleSelector({
  primary,
  secondary,
  view,
  gender = "male",
  onChange,
  onSuggestView,
}: MuscleSelectorProps) {
  const [previewView, setPreviewView] = useState<"front" | "back">(view);
  const shown = previewView;

  const invisiblePrimary = useMemo(
    () => primary.length > 0 && !primary.some((m) => isMuscleVisibleOn(m, view)),
    [primary, view],
  );

  const suggested: "front" | "back" = view === "front" ? "back" : "front";

  const handleRegionClick = (slug: string) => {
    const ids = musclesForBodySlug(slug);
    if (ids.length === 0) return;
    const rep = ids[0];

    const inPrimary = ids.some((m) => primary.includes(m));
    const inSecondary = ids.some((m) => secondary.includes(m));

    const strip = (list: MuscleId[]) => list.filter((m) => !ids.includes(m));

    if (!inPrimary && !inSecondary) {
      onChange({ primary: [...primary, rep], secondary: strip(secondary) });
    } else if (inPrimary) {
      onChange({ primary: strip(primary), secondary: [...strip(secondary), rep] });
    } else {
      onChange({ primary: strip(primary), secondary: strip(secondary) });
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-4">
        <div className="h-44 w-28 shrink-0">
          <BodyModel
            primary={primary}
            secondary={secondary}
            gender={gender}
            view={shown}
            onRegionClick={handleRegionClick}
          />
        </div>

        <div className="flex flex-col gap-2 text-[11px] text-muted-foreground">
          <div className="inline-flex rounded-md border border-border p-0.5">
            {(["front", "back"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setPreviewView(v)}
                aria-pressed={shown === v}
                className={`rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${
                  shown === v
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground"
                }`}
              >
                {v === "front" ? "Anterior" : "Posterior"}
              </button>
            ))}
          </div>
          <p className="max-w-56 leading-relaxed">
            Tap a region to cycle it{" "}
            <span className="whitespace-nowrap">none → primary → secondary</span>
            . Use the chips below where one region covers two muscles.
          </p>
        </div>
      </div>

      {invisiblePrimary && (
        <p className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-600 dark:text-amber-400">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            None of the primary muscles are drawn on the{" "}
            {view === "front" ? "anterior" : "posterior"} view, so trainers will
            see a figure lit only by its synergists.{" "}
            {onSuggestView && (
              <button
                type="button"
                className="font-bold underline"
                onClick={() => onSuggestView(suggested)}
              >
                Use the {suggested === "front" ? "anterior" : "posterior"} view
              </button>
            )}
          </span>
        </p>
      )}
    </div>
  );
}
