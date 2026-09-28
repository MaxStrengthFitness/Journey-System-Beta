/**
 * HOME'S MARKS ON A SCREEN — read once with Home's other reads, and kept in
 * step with what this iPad writes (a mark set, a mark cleared) without
 * reading again. A read that failed is "failed": Home then shows every item,
 * says it couldn't read the marks, and still lets a person mark one.
 */
import { useCallback, useEffect, useState } from "react";
import type { HomeMark } from "./home-marks";
import { fetchHomeMarks } from "./home-marks-store";
import type { ReadState } from "./useHomeSignals";

export interface HomeMarks {
  state: ReadState;
  marks: Record<string, HomeMark>;
  /** A mark this iPad just wrote. */
  put: (mark: HomeMark) => void;
  /** Marks this iPad just removed. */
  drop: (keys: readonly string[]) => void;
}

export function useHomeMarks(refreshKey: unknown): HomeMarks {
  const [read, setRead] = useState<{ state: ReadState; marks: Record<string, HomeMark> }>({ state: "loading", marks: {} });

  useEffect(() => {
    let cancelled = false;
    setRead((r) => ({ state: "loading", marks: r.marks }));
    fetchHomeMarks().then(
      (marks) => !cancelled && setRead({ state: "ok", marks }),
      () => !cancelled && setRead({ state: "failed", marks: {} }),
    );
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const put = useCallback((mark: HomeMark) => setRead((r) => ({ ...r, marks: { ...r.marks, [mark.key]: mark } })), []);
  const drop = useCallback(
    (keys: readonly string[]) =>
      setRead((r) => {
        const marks = { ...r.marks };
        for (const k of keys) delete marks[k];
        return { ...r, marks };
      }),
    [],
  );

  return { ...read, put, drop };
}
