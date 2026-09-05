import { useCallback, useState } from "react";

/**
 * Which detail sections a trainer keeps open.
 *
 * Round: Catalog Redesign, Sep 2026.
 *
 * Stored PER SECTION, not per machine. A trainer who always wants Execution
 * open wants it open on every machine; keying by machine would make them
 * re-open it twenty times a shift and would grow without bound as studios add
 * their own equipment.
 *
 * localStorage is wrapped in try/catch at every touch. It throws outright in
 * some contexts (Safari private browsing, site data blocked), and this is a
 * convenience — a machine's setup notes must never fail to render because a
 * preference could not be read.
 */
const STORAGE_KEY = "journey.catalog.sections.v1";

function read(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function write(value: Record<string, boolean>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* preference only — never block the UI on it */
  }
}

export interface SectionState {
  isOpen: (id: string, fallback: boolean) => boolean;
  setOpen: (id: string, open: boolean) => void;
}

export function useSectionState(): SectionState {
  const [state, setState] = useState<Record<string, boolean>>(read);

  const isOpen = useCallback(
    (id: string, fallback: boolean) => state[id] ?? fallback,
    [state],
  );

  const setOpen = useCallback((id: string, open: boolean) => {
    setState((prev) => {
      if (prev[id] === open) return prev;
      const next = { ...prev, [id]: open };
      write(next);
      return next;
    });
  }, []);

  return { isOpen, setOpen };
}
