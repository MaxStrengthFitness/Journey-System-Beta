import { describe, expect, it } from "vitest";
import {
  EMPTY_FILTER,
  KIND_LABEL,
  STATUS_LABEL,
  countReports,
  describeUserAgent,
  filterReports,
  orderReports,
  reportAsText,
  toReportView,
  type RawReport,
  type ReportView,
} from "./reportView";

const IPAD =
  "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const WIN_CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

/** A document in the shape features/feedback writes today. */
function modern(over: Partial<RawReport> = {}): RawReport {
  return {
    id: "r1",
    kind: "bug",
    issueType: "Bug",
    description: "Timer froze when I ended the session",
    userId: "u1",
    userEmail: "sam@example.com",
    userName: "Sam Reed",
    studioId: "s1",
    status: "open",
    createdAt: { toMillis: () => 1_000 },
    context: {
      view: "workout",
      studioName: "Powell",
      clientName: "Karen D.",
      sessionId: "sess-9",
      viewport: "1024x1366",
      orientation: "portrait",
      theme: "dark",
      devicePixelRatio: 2,
      appVersion: "2026.09.03",
      url: "https://app.example.com/workout",
      userAgent: IPAD,
      platform: "MacIntel",
      recentErrors: [
        { message: "Cannot read properties of undefined", type: "error", at: 900 },
      ],
    },
    ...over,
  };
}

/** A document from before Sep 2026, when these lived at the top level. */
function legacy(over: Partial<RawReport> = {}): RawReport {
  return {
    id: "old1",
    issueType: "UI Problem",
    description: "Buttons too small",
    userEmail: "old@example.com",
    studioId: "s2",
    platform: "Win32",
    browser: "Chrome",
    os: "Windows",
    studioName: "Dublin",
    userAgent: WIN_CHROME,
    createdAt: { toDate: () => new Date(500) },
    ...over,
  };
}

describe("describeUserAgent", () => {
  it("names the iPad, which is the answer that matters here", () => {
    expect(describeUserAgent(IPAD)).toBe("Safari on iPad");
  });

  it("names a desktop browser", () => {
    expect(describeUserAgent(WIN_CHROME)).toBe("Chrome on Windows");
  });

  it("does not call Edge or Opera 'Chrome' just because they say so", () => {
    expect(
      describeUserAgent("Mozilla/5.0 (Windows NT 10.0) Chrome/128 Safari/537 Edg/128"),
    ).toBe("Edge on Windows");
    expect(
      describeUserAgent("Mozilla/5.0 (Windows NT 10.0) Chrome/128 Safari/537 OPR/114"),
    ).toBe("Opera on Windows");
  });

  it("does not call Chrome 'Safari' - every Chrome UA claims Safari too", () => {
    expect(describeUserAgent(WIN_CHROME)).not.toContain("Safari");
  });

  it("gives what it has when it only recognises one half", () => {
    expect(describeUserAgent("Mozilla/5.0 (X11; CrOS x86_64)")).toBe(null);
    expect(describeUserAgent("Firefox/1.0")).toBe("Firefox");
  });

  it("is null rather than guessing when there is nothing to read", () => {
    expect(describeUserAgent(undefined)).toBe(null);
    expect(describeUserAgent("")).toBe(null);
  });
});

describe("toReportView", () => {
  it("REGRESSION: pulls the diagnostics out of context, where they live", () => {
    const v = toReportView(modern());
    const labels = v.diagnostics.map((d) => d.label);
    // The old screen read report.browser / report.platform at the top level
    // and rendered nothing at all for a document written this way.
    expect(labels).toContain("Screen");
    expect(labels).toContain("Viewport");
    expect(labels).toContain("Device");
    expect(v.hasDiagnostics).toBe(true);
  });

  it("names the screen, studio, client and session", () => {
    const v = toReportView(modern());
    const byLabel = Object.fromEntries(
      v.diagnostics.map((d) => [d.label, d.value]),
    );
    expect(byLabel.Screen).toBe("workout");
    expect(byLabel.Studio).toBe("Powell");
    expect(byLabel.Client).toBe("Karen D.");
    expect(byLabel.Session).toBe("sess-9");
  });

  it("puts orientation with the viewport, where it means something", () => {
    const byLabel = Object.fromEntries(
      toReportView(modern()).diagnostics.map((d) => [d.label, d.value]),
    );
    expect(byLabel.Viewport).toBe("1024x1366 (portrait)");
  });

  it("surfaces the runtime errors, which the reporter could not have typed", () => {
    const v = toReportView(modern());
    expect(v.errors).toHaveLength(1);
    expect(v.errors[0].message).toContain("Cannot read properties");
  });

  it("still reads a pre-Sep-2026 document's top-level fields", () => {
    const v = toReportView(legacy());
    const byLabel = Object.fromEntries(
      v.diagnostics.map((d) => [d.label, d.value]),
    );
    expect(byLabel.Studio).toBe("Dublin");
    expect(byLabel.Platform).toBe("Win32");
    expect(byLabel.Device).toBe("Chrome on Windows");
    expect(v.createdAt).toBe(500);
  });

  it("keeps the old free-text issueType when there is no kind", () => {
    const v = toReportView(legacy());
    expect(v.kind).toBeNull();
    expect(v.kindLabel).toBe("UI Problem");
  });

  it("uses the new vocabulary when there is a kind", () => {
    expect(toReportView(modern({ kind: "ui" })).kindLabel).toBe(KIND_LABEL.ui);
  });

  it("treats an unknown kind as no kind rather than trusting it", () => {
    expect(toReportView(modern({ kind: "banana" })).kind).toBeNull();
  });

  it("defaults an unknown or missing status to open, never to fixed", () => {
    expect(toReportView(modern({ status: undefined })).status).toBe("open");
    expect(toReportView(modern({ status: "resolved-ish" })).status).toBe("open");
  });

  it("falls back through name, email, then Unknown", () => {
    expect(toReportView(modern()).reporter).toBe("Sam Reed");
    expect(toReportView(modern({ userName: "" })).reporter).toBe(
      "sam@example.com",
    );
    expect(
      toReportView(modern({ userName: "", userEmail: "" })).reporter,
    ).toBe("Unknown");
  });

  it("shows a placeholder rather than an empty card for a blank description", () => {
    expect(toReportView(modern({ description: "   " })).description).toBe(
      "(no description)",
    );
  });

  it("omits rows it has no value for instead of printing Unknown", () => {
    const v = toReportView({ id: "x", description: "hi" });
    expect(v.diagnostics).toEqual([]);
    expect(v.hasDiagnostics).toBe(false);
  });

  it("keeps a pixel ratio of 1 rather than dropping it as falsy", () => {
    const v = toReportView(
      modern({ context: { devicePixelRatio: 1 } as never }),
    );
    expect(v.diagnostics.find((d) => d.label === "Pixel ratio")?.value).toBe("1");
  });

  it("falls back to the studio id when there is no studio name", () => {
    const v = toReportView(
      modern({ studioName: undefined, context: { view: "x" } as never }),
    );
    expect(v.diagnostics.find((d) => d.label === "Studio")?.value).toBe("s1");
  });

  it("gives an unsaved document a stable key from its index", () => {
    expect(toReportView({ description: "x" }, 4).id).toBe("report-4");
  });
});

describe("filterReports", () => {
  const reports: ReportView[] = [
    toReportView(modern({ id: "a", kind: "bug", status: "open", studioId: "s1" })),
    toReportView(
      modern({
        id: "b",
        kind: "ui",
        status: "fixed",
        studioId: "s2",
        description: "Colours are hard to read",
        userName: "Pat Lee",
        userEmail: "pat@example.com",
      }),
    ),
    toReportView(
      modern({
        id: "c",
        kind: "idea",
        status: "open",
        studioId: "s1",
        description: "Wish I could clone a routine",
      }),
    ),
  ];

  it("returns everything by default", () => {
    expect(filterReports(reports, EMPTY_FILTER)).toHaveLength(3);
  });

  it("filters by status", () => {
    expect(
      filterReports(reports, { ...EMPTY_FILTER, status: "open" }).map((r) => r.id),
    ).toEqual(["a", "c"]);
  });

  it("filters by kind", () => {
    expect(
      filterReports(reports, { ...EMPTY_FILTER, kind: "idea" }).map((r) => r.id),
    ).toEqual(["c"]);
  });

  it("filters by studio", () => {
    expect(
      filterReports(reports, { ...EMPTY_FILTER, studioId: "s2" }).map((r) => r.id),
    ).toEqual(["b"]);
  });

  it("searches the description, case-insensitively", () => {
    expect(
      filterReports(reports, { ...EMPTY_FILTER, search: "CLONE" }).map((r) => r.id),
    ).toEqual(["c"]);
  });

  it("searches the reporter's name and email too", () => {
    expect(
      filterReports(reports, { ...EMPTY_FILTER, search: "pat" }).map((r) => r.id),
    ).toEqual(["b"]);
    expect(
      filterReports(reports, { ...EMPTY_FILTER, search: "sam@" }).map((r) => r.id),
    ).toEqual(["a", "c"]);
  });

  it("ignores a search of only whitespace", () => {
    expect(filterReports(reports, { ...EMPTY_FILTER, search: "   " })).toHaveLength(
      3,
    );
  });

  it("combines filters", () => {
    expect(
      filterReports(reports, {
        ...EMPTY_FILTER,
        status: "open",
        studioId: "s1",
        search: "clone",
      }).map((r) => r.id),
    ).toEqual(["c"]);
  });
});

describe("orderReports", () => {
  const at = (id: string, status: string, createdAt: number) =>
    toReportView({ id, status, description: "x", createdAt });

  it("puts open work above closed work, whatever the dates say", () => {
    const out = orderReports([
      at("fixed-today", "fixed", 900),
      at("open-yesterday", "open", 100),
    ]);
    expect(out.map((r) => r.id)).toEqual(["open-yesterday", "fixed-today"]);
  });

  it("orders newest first inside a status", () => {
    const out = orderReports([
      at("old", "open", 100),
      at("new", "open", 900),
      at("mid", "open", 500),
    ]);
    expect(out.map((r) => r.id)).toEqual(["new", "mid", "old"]);
  });

  it("runs open, investigating, fixed, not doing", () => {
    const out = orderReports([
      at("d", "wont-fix", 1),
      at("c", "fixed", 1),
      at("b", "investigating", 1),
      at("a", "open", 1),
    ]);
    expect(out.map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("does not mutate its input", () => {
    const input = [at("b", "fixed", 1), at("a", "open", 1)];
    orderReports(input);
    expect(input.map((r) => r.id)).toEqual(["b", "a"]);
  });
});

describe("countReports", () => {
  it("counts what a triage header needs", () => {
    const reports = [
      toReportView(modern({ id: "a", status: "open" })),
      toReportView(modern({ id: "b", status: "investigating" })),
      toReportView(
        modern({ id: "c", status: "fixed", context: { view: "x" } as never }),
      ),
    ];
    expect(countReports(reports)).toEqual({
      total: 3,
      open: 1,
      investigating: 1,
      // a and b carry recentErrors; c's context was replaced without them.
      withErrors: 2,
    });
  });
});

describe("reportAsText", () => {
  const at = (ms: number) => `T+${ms}`;

  it("carries the description, the context and the errors", () => {
    const text = reportAsText(toReportView(modern()), at);
    expect(text).toContain("Timer froze");
    expect(text).toContain("Screen: workout");
    expect(text).toContain("Viewport: 1024x1366 (portrait)");
    expect(text).toContain("[error] Cannot read properties of undefined");
  });

  it("names the reporter and the status in the first two lines", () => {
    const lines = reportAsText(toReportView(modern()), at).split("\n");
    expect(lines[0]).toBe(`Broken - ${STATUS_LABEL.open}`);
    expect(lines[1]).toBe("Reported by Sam Reed <sam@example.com>");
  });

  it("says so rather than inventing a time when there is none", () => {
    const text = reportAsText(
      toReportView(modern({ createdAt: undefined })),
      at,
    );
    expect(text).toContain("At an unrecorded time");
  });

  it("omits the context and error sections when there are none", () => {
    const text = reportAsText(
      toReportView({ id: "x", description: "just this" }),
      at,
    );
    expect(text).not.toContain("Context:");
    expect(text).not.toContain("Recent errors");
  });
});
