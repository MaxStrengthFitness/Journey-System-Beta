import { useState } from "react";
import { Check, Search, X } from "lucide-react";
import type { Client, Trainer } from "../../types";
import { useClientSearch } from "./notes/hooks";
import { NAME_SEARCH_PROPS } from "../../lib/name-search-input";

/**
 * PICK CLIENTS — today's roster first, then a name search at this studio.
 *
 * Round: Planner rework, Sep 2026. The same two directory queries the Notes
 * linker runs (useClientSearch: same indexes, same tenancy), as a multi-pick
 * for a team job ("client outreach for MIA clients" is a list of people).
 */

const fullName = (c: Pick<Client, "firstName" | "lastName">) => `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim();

export interface PickedClient {
  id: string;
  name: string;
}

export function ClientPicker({
  roster,
  picked,
  onChange,
  authTrainer,
  activeStudioId,
  max = 60,
}: {
  roster: Client[];
  picked: PickedClient[];
  onChange: (next: PickedClient[]) => void;
  authTrainer: Trainer | null;
  activeStudioId: string | null;
  max?: number;
}) {
  const [term, setTerm] = useState("");
  const { results, searching, failed } = useClientSearch(term, authTrainer, activeStudioId);
  const words = term.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const pickedIds = new Set(picked.map((p) => p.id));

  const fromRoster = roster.filter((c) => {
    const name = fullName(c).toLowerCase();
    return c.id && name && words.every((w) => name.includes(w));
  });
  const merged = new Map<string, Client>();
  for (const c of [...fromRoster, ...results]) if (c.id) merged.set(c.id, c);
  const options = [...merged.values()].sort((a, b) => fullName(a).localeCompare(fullName(b))).slice(0, 24);

  const toggle = (c: Client) => {
    if (!c.id) return;
    if (pickedIds.has(c.id)) onChange(picked.filter((p) => p.id !== c.id));
    else if (picked.length < max) onChange([...picked, { id: c.id, name: fullName(c) }]);
  };

  return (
    <div className="pk-field">
      {picked.length > 0 && (
        <div className="pk-chips" aria-label="Chosen clients">
          {picked.map((p) => (
            <button
              key={p.id}
              type="button"
              className="pk-chip"
              aria-pressed
              onClick={() => onChange(picked.filter((x) => x.id !== p.id))}
              aria-label={`Remove ${p.name}`}
            >
              {p.name}
              <X size={14} aria-hidden />
            </button>
          ))}
        </div>
      )}
      <label className="pk-search">
        <Search size={15} aria-hidden />
        <input
          className="pk-input"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search clients by name"
          aria-label="Search clients by name"
          {...NAME_SEARCH_PROPS}
        />
      </label>
      <p className="pk-hint">
        {words.length === 0
          ? "On today's schedule — or type a name to search your studio."
          : searching
            ? "Searching…"
            : failed
              ? "Couldn't search the studio just now — check the connection and try again."
              : options.length === 0
                ? "No client by that name at this studio."
                : ""}
      </p>
      {options.length > 0 && (
        <div className="pk-chips pk-chips--scroll" role="group" aria-label="Clients">
          {options.map((c) => (
            <button
              key={c.id}
              type="button"
              className="pk-chip"
              aria-pressed={pickedIds.has(c.id!)}
              disabled={!pickedIds.has(c.id!) && picked.length >= max}
              onClick={() => toggle(c)}
            >
              {fullName(c)}
              {pickedIds.has(c.id!) && <Check size={14} aria-hidden />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
