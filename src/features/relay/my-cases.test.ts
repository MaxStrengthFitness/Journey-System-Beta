import { describe, expect, it } from "vitest";
import type { StoredCase } from "../admin/journey/case-store";
import { caseDue, caseFirstName, caseStepWords, caseWhenWords, myCaseRows } from "./my-cases";

const TODAY = "2026-09-28"; // a Monday

const stored = (clientId: string, over: Partial<StoredCase> = {}): StoredCase => ({
  clientId,
  clientName: clientId,
  owner: { id: "u-ioreth", name: "Ioreth Healer" },
  nextStep: "",
  dueOn: null,
  outcome: "open",
  reason: null,
  openedAt: null,
  updatedAt: null,
  updatedBy: null,
  ...over,
});

describe("a trainer's own cases on the Tracker", () => {
  it("says how pressing the due day is, like a job's", () => {
    expect(caseDue("2026-09-27", TODAY)).toBe("overdue");
    expect(caseDue(TODAY, TODAY)).toBe("today");
    expect(caseDue("2026-10-01", TODAY)).toBe("soon");
    expect(caseDue("2026-10-02", TODAY)).toBe("later");
    expect(caseDue(null, TODAY)).toBe("none");
  });

  it("says the day in plain words", () => {
    expect(caseWhenWords("2026-09-27", TODAY)).toBe("Overdue — was due yesterday");
    expect(caseWhenWords(TODAY, TODAY)).toBe("Due today");
    expect(caseWhenWords("2026-10-01", TODAY)).toBe("Due Thursday");
    expect(caseWhenWords("2026-10-20", TODAY)).toBe("Due Oct 20");
    expect(caseWhenWords(null, TODAY)).toBe("No day yet");
  });

  it("asks for a next step when there is none", () => {
    expect(caseStepWords({ nextStep: "  Call after her Thursday session " })).toBe("Call after her Thursday session");
    expect(caseStepWords({ nextStep: "   " })).toBe("No next step yet — add one");
  });

  it("orders overdue, today, by day, then no day, by name inside each, and leaves closed cases out", () => {
    const rows = myCaseRows(
      [
        stored("Zoe", { dueOn: null }),
        stored("Hugo", { dueOn: "2026-10-01" }),
        stored("Bella", { dueOn: null }),
        stored("Odo", { dueOn: TODAY }),
        stored("Pip", { dueOn: "2026-09-20" }),
        stored("Merry", { dueOn: "2026-09-29" }),
        stored("Lost", { dueOn: "2026-09-01", outcome: "lost" }),
        stored("Paused", { outcome: "paused" }),
      ],
      TODAY,
    );
    expect(rows.map((r) => [r.case.clientName, r.due])).toEqual([
      ["Pip", "overdue"],
      ["Odo", "today"],
      ["Merry", "soon"],
      ["Hugo", "soon"],
      ["Bella", "none"],
      ["Zoe", "none"],
    ]);
    expect(rows[0].key).toBe("case:Pip");
    expect(rows[0].when).toBe("Overdue — was due Sep 20");
  });

  it("takes the first name for a sentence", () => {
    expect(caseFirstName({ clientName: "Hugo Bracegirdle" })).toBe("Hugo");
    expect(caseFirstName({ clientName: "  " })).toBe("this client");
  });
});
