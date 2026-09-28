import { useMemo, useState } from "react";
import { chips } from "../present";
import { narrowedTo, rememberWhoseTimes, rememberedWhoseTimes, type WhoseTimes } from "./part-memory";
import type { OpeningsData } from "./useOpeningsData";
import "../openings.css";

/**
 * WHOSE TIMES: the narrowing chips on Next 7 days and A new regular time
 * (Openings round, phase 5). "With you", "Anyone", then one chip per trainer
 * with an agreed week here, in name order (present.ts `chips`: AJ's relaxed
 * answer gives everyone the trainers' chips). No count beside a name, ever.
 *
 * The choice is remembered on this iPad (part-memory.ts) and shared by both
 * parts; with nothing chosen, a trainer with an agreed week here starts on
 * their own times, and everyone else on Anyone.
 */
export function useWhoseTimes(data: Pick<OpeningsData, "team" | "names" | "viewer">) {
  const choosable = useMemo(() => data.team.filter((r) => r.doc?.final).map((r) => r.trainerId), [data.team]);
  const [choice, setChoice] = useState<WhoseTimes | null>(rememberedWhoseTimes);
  const narrowed = narrowedTo(choice, data.viewer.trainerId, choosable);
  const list = useMemo(() => chips(choosable, data.names, data.viewer), [choosable, data.names, data.viewer]);
  const choose = (trainerId: string | null) => {
    const next: WhoseTimes =
      trainerId === null ? { kind: "anyone" } : trainerId === data.viewer.trainerId ? { kind: "you" } : { kind: "trainer", trainerId };
    rememberWhoseTimes(next);
    setChoice(next);
  };
  return { narrowed, chips: list, choose };
}

export function WhoseChips({ whose }: { whose: ReturnType<typeof useWhoseTimes> }) {
  return (
    <div className="op-chips" role="group" aria-label="Whose times">
      {whose.chips.map((c) => (
        <button
          key={c.trainerId ?? "anyone"}
          type="button"
          className="op-chip"
          aria-pressed={whose.narrowed === c.trainerId}
          onClick={() => whose.choose(c.trainerId)}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}
