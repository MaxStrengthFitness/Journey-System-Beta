/**
 * The directory's sort, as a pill and a panel of tiles (AJ, Oct 3 2026: the
 * native drop-down was "so basic and just an eye sore to open").
 *
 * The pill says the sort in words. The panel groups every sort by what it is
 * about; a tile picks that sort at its usual direction, the two buttons under
 * them flip it, and either closes the panel. The words are `SORTS`' own, split
 * at the colon, so the pill, the panel and the column headers never disagree.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ArrowDownUp, Check } from "lucide-react";
import { SORTS, type SortDir, type SortKey, type SortSpec } from "./buckets";

const GROUPS: ReadonlyArray<{ title: string; keys: SortKey[] }> = [
  { title: "Visits", keys: ["time", "lastIn", "next", "since"] },
  { title: "Sessions and package", keys: ["left", "renews", "total"] },
  { title: "The person", keys: ["name", "lastName", "age", "height"] },
];

/** The tile's name: the part of the words before the colon, except the two names. */
const TILE_WORDS: Partial<Record<SortKey, string>> = { name: "First name", lastName: "Last name", time: "Today’s time" };

export function tileWords(key: SortKey): string {
  return TILE_WORDS[key] ?? SORTS[key].words.asc.split(":")[0];
}

/** A direction in words, the part after the colon ("most recent first", "A–Z"). */
export function dirWords(key: SortKey, dir: SortDir): string {
  const after = SORTS[key].words[dir].split(":").slice(1).join(":").trim();
  return after.replace(/^(first|last) name /, "");
}

export function SortPicker({ sort, keys, onChange }: { sort: SortSpec; keys: ReadonlyArray<SortKey>; onChange: (next: SortSpec) => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const panel = useRef<HTMLDivElement>(null);
  // Anchored under the pill; slid back so it never runs off the right edge (16px gutter).
  const [shift, setShift] = useState(0);
  useLayoutEffect(() => {
    if (!open) {
      setShift(0);
      return;
    }
    const el = panel.current;
    if (!el || typeof window === "undefined") return;
    const r = el.getBoundingClientRect();
    const over = r.right - shift - (window.innerWidth - 16);
    setShift(over > 0 ? -over : 0);
    // Measured once per opening; `shift` is the result, not an input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const pick = (next: SortSpec) => {
    onChange(next);
    setOpen(false);
  };
  const otherDir: SortDir = sort.dir === "asc" ? "desc" : "asc";
  // The current direction first, in the order the words read best: the usual one on the left.
  const dirs: SortDir[] = SORTS[sort.key].defaultDir === "asc" ? ["asc", "desc"] : ["desc", "asc"];

  return (
    <div className="cd-sort" ref={wrap}>
      <button
        type="button"
        className="cd-sort-pill"
        aria-label={`Sort: ${SORTS[sort.key].words[sort.dir]}. Change the sort`}
        aria-expanded={open}
        aria-controls={panelId}
        data-sort={`${sort.key}:${sort.dir}`}
        onClick={() => setOpen((v) => !v)}
      >
        <ArrowDownUp size={16} aria-hidden="true" />
        <span className="cd-sort-key">{tileWords(sort.key)}</span>
        <span className="cd-sort-dir">{dirWords(sort.key, sort.dir)}</span>
      </button>
      {open && (
        <div className="cd-sort-panel" id={panelId} role="dialog" aria-label="Sort clients" ref={panel} style={shift ? { left: shift } : undefined}>
          {GROUPS.map((g) => {
            const here = g.keys.filter((k) => keys.includes(k));
            if (here.length === 0) return null;
            return (
              <div key={g.title} className="cd-sort-group">
                <p className="cd-sort-title">{g.title}</p>
                <div className="cd-sort-tiles">
                  {here.map((k) => {
                    const on = sort.key === k;
                    return (
                      <button
                        key={k}
                        type="button"
                        className="cd-sort-tile"
                        aria-pressed={on}
                        onClick={() => pick(on ? { key: k, dir: otherDir } : { key: k, dir: SORTS[k].defaultDir })}
                      >
                        <span>{tileWords(k)}</span>
                        {on && <Check size={16} aria-hidden="true" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <div className="cd-sort-group cd-sort-order">
            <p className="cd-sort-title">{`${tileWords(sort.key)}, in order`}</p>
            <div className="cd-sort-dirs" role="group" aria-label={`${tileWords(sort.key)}, which way`}>
              {dirs.map((d) => (
                <button key={d} type="button" className="cd-sort-dirbtn" aria-pressed={sort.dir === d} onClick={() => pick({ key: sort.key, dir: d })}>
                  {dirWords(sort.key, d)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
