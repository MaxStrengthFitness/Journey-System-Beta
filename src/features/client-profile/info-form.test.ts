import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Client } from "../../types";
import { clientFormSeed } from "./info-form";

const client = (over: Partial<Client> = {}): Client =>
  ({ id: "c1", firstName: "Judy", lastName: "Hart", height: "", isActive: true, ...over }) as Client;

describe("clientFormSeed", () => {
  it("shows a stored wingspan in the Wingspan box, beside height and weight", () => {
    const seed = clientFormSeed(client({ height: `5'6"`, wingspan: "66", weight: "140" }));
    expect(seed.wingspan).toBe("66");
    expect(seed.height).toBe(`5'6"`);
    expect(seed.weight).toBe("140");
  });

  it("opens an empty Wingspan box when none is stored", () => {
    expect(clientFormSeed(client()).wingspan).toBe("");
  });

  // The dossier's `val()` reads the form only, never the record, so a field
  // it shows that is missing here is a box that is always blank.
  it("seeds every field the dossier reads through val()", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/client-dossier/ClientDossier.tsx"),
      "utf8",
    );
    const read = [...source.matchAll(/\bval\("([A-Za-z_]+)"\)/g)].map((m) => m[1]);
    // Guard against passing vacuously if `val` is ever renamed.
    expect(read).toEqual(expect.arrayContaining(["height", "wingspan", "weight"]));

    const seeded = Object.keys(clientFormSeed(client()));
    expect(read.filter((k) => !seeded.includes(k))).toEqual([]);
  });
});
