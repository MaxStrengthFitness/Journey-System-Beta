import { createContext, useContext } from "react";
import type { OpeningsData } from "./useOpeningsData";

/**
 * The section's data, for what it draws outside its own tree of props: the
 * time's sheet is drawn in the Context Panel, beside the grid, and reads the
 * summary, the marks and the weeks live from here (a mark that arrives while
 * the sheet is open shows at once).
 */
export const OpeningsContext = createContext<OpeningsData | null>(null);

export function useOpenings(): OpeningsData {
  const data = useContext(OpeningsContext);
  if (!data) throw new Error("useOpenings must be used inside My Studio → Openings");
  return data;
}
