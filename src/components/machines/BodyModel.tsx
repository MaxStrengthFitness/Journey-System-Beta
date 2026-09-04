import React, { useMemo } from "react";
import Body, { type ExtendedBodyPart, type Slug } from "react-muscle-highlighter";
import { MuscleId, toBodySlugs } from "../../types/machines";

/**
 * BODY MODEL — the single render boundary for the anatomy figure.
 *
 * Round: Machine Creator & Studio Roster, Sep 2026.
 *
 * Replaces react-body-highlighter, which had no female figure at all — its
 * IModelProps exposed only { bodyColor, data, highlightedColors, onClick,
 * style, svgStyle, type }, where `type` was anterior|posterior. That is why
 * the Catalog's Type F toggle appeared broken: the state updated correctly
 * and had nowhere to go.
 *
 * react-muscle-highlighter ships anatomically distinct male and female
 * models and takes `gender` as a real prop, so the toggle now does what it
 * has always claimed to do.
 *
 * Every vocabulary translation happens here or in toBodySlugs(). No other
 * component should know the library's slug names.
 */

export interface BodyModelProps {
  /** Muscles worked hardest — rendered at full intensity. */
  primary?: MuscleId[];
  /** Assisting and stabilizing muscles — rendered at lower intensity. */
  secondary?: MuscleId[];

  gender: "male" | "female";
  view: "front" | "back";
  scale?: number;
  /** Called with the body model's region slug. */
  onRegionClick?: (slug: string) => void;
  /** [primary, secondary]. Defaults to the MAX Strength blues. */
  colors?: [string, string];
  /** Everything not targeted by this machine. */
  baseFill?: string;
  border?: string;
}

/**
 * Every region the model can draw.
 *
 * We paint ALL of them explicitly. The library bakes `color: "#3f3f3f"` into
 * its asset paths — and `#bebebe` into the male head — and its getColorToFill
 * checks `bodyPart.color` before falling back to `defaultFill`, so the
 * defaultFill prop never takes effect on these assets. Supplying `styles.fill`
 * per part is the only way to own the palette, and it also stops the male
 * figure rendering with a pale grey face while the female's is dark.
 */
const ALL_SLUGS: Slug[] = [
  "abs", "adductors", "ankles", "biceps", "calves", "chest", "deltoids",
  "feet", "forearm", "gluteal", "hamstring", "hands", "hair", "head",
  "knees", "lower-back", "neck", "obliques", "quadriceps", "tibialis",
  "trapezius", "triceps", "upper-back",
];

export function BodyModel({
  primary = [],
  secondary = [],
  gender,
  view,
  scale = 1,
  onRegionClick,
  colors = ["#0A548B", "#6FB4E4"],
  baseFill = "#4B555C",
  border = "none",
}: BodyModelProps) {
  const data = useMemo<ExtendedBodyPart[]>(() => {
    const primarySlugs = new Set(toBodySlugs(primary));
    // A region that is primary must not also render as secondary — the
    // library paints in order and the lighter pass would win.
    const secondarySlugs = new Set(
      toBodySlugs(secondary).filter((s) => !primarySlugs.has(s)),
    );

    return ALL_SLUGS.map((slug) => ({
      slug,
      styles: {
        fill: primarySlugs.has(slug)
          ? colors[0]
          : secondarySlugs.has(slug)
            ? colors[1]
            : baseFill,
      },
    }));
  }, [primary, secondary, colors, baseFill]);

  return (
    <Body
      data={data}
      side={view}
      gender={gender}
      scale={scale}
      colors={colors}
      border={border}
      onBodyPartPress={(part) => {
        if (part.slug && onRegionClick) onRegionClick(part.slug);
      }}
    />
  );
}
