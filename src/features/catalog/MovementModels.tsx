import { modelName, type MachineModel } from "./models";

/**
 * A MOVEMENT'S MODELS — each maker's machine for it (wave 2 of the Machine
 * Catalog room, Catalog R4). On a movement's page in All MSF machines: the
 * model's name, its dials where head office recorded them, and its note.
 *
 * What it is, never where it is: no count of floors or studios (AJ, Sep 27
 * 2026, "trainers dont need to know that"). Draws nothing for none, and its
 * host draws nothing at all until the model records could be read.
 */
export function MovementModels({ models }: { models: readonly MachineModel[] }) {
  if (models.length === 0) return null;
  return (
    <ul className="mcat-models" aria-label="Models">
      {models.map((m) => (
        <li key={m.id} className="mcat-models__item">
          <span className="mcat-models__name">{modelName(m)}</span>
          {m.dials.length > 0 && <span className="mcat-models__dials">Dials: {m.dials.join(" · ")}</span>}
          {m.notes && <span className="mcat-models__note">{m.notes}</span>}
        </li>
      ))}
    </ul>
  );
}
