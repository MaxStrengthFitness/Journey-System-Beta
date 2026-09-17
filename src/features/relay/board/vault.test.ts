import { describe, expect, it } from "vitest";
import { blankVaultDraft, sortVault, vaultFields, vaultFromDoc, vaultProblem, type VaultEntry } from "./vault";

const entry = (over: Partial<VaultEntry>): VaultEntry => ({
  id: "x",
  studioId: "s1",
  kind: "incident",
  title: "t",
  body: "",
  onDate: null,
  people: "",
  status: "open",
  createdBy: { id: "u", name: "U" },
  ...over,
});

describe("the vault", () => {
  it("needs a title and a real date", () => {
    expect(vaultProblem(blankVaultDraft("incident", "2026-09-16"))).toMatch(/what happened/);
    expect(vaultProblem(blankVaultDraft("partner", "2026-09-16"))).toMatch(/Name the business/);
    expect(vaultProblem({ ...blankVaultDraft("incident", "2026-09-16"), title: "Slip", onDate: "yesterday" })).toMatch(/isn't a date/);
    expect(vaultProblem({ ...blankVaultDraft("incident", "2026-09-16"), title: "Slip" })).toBeNull();
  });
  it("writes a partner with no date and an incident with one", () => {
    expect(vaultFields({ kind: "partner", title: " Joe's Café ", body: "10% for members", onDate: "2026-09-16", people: "Joe 555-0100" }, "s1", { id: "u", name: "U" })).toMatchObject({ kind: "partner", title: "Joe's Café", onDate: null, status: "open" });
    expect(vaultFields({ kind: "incident", title: "Slip", body: "", onDate: "2026-09-16", people: "" }, "s1", { id: "u", name: "U" }).onDate).toBe("2026-09-16");
  });
  it("reads a document defensively", () => {
    expect(vaultFromDoc("a", { kind: "nope", title: 5, status: "closed" })).toMatchObject({ kind: "incident", title: "Untitled", status: "closed", createdBy: { id: "", name: "" } });
  });
  it("sorts incidents first, open first, newest first; partners by name", () => {
    const list = sortVault([
      entry({ id: "p2", kind: "partner", title: "Zed's" }),
      entry({ id: "i-old", onDate: "2026-08-01", status: "closed" }),
      entry({ id: "p1", kind: "partner", title: "Amy's" }),
      entry({ id: "i-new", onDate: "2026-09-10" }),
      entry({ id: "i-mid", onDate: "2026-09-01" }),
    ]);
    expect(list.map((e) => e.id)).toEqual(["i-new", "i-mid", "i-old", "p1", "p2"]);
  });
});
