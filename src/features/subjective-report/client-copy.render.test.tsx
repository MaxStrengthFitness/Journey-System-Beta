// @vitest-environment jsdom
/**
 * The printed client copy of a Pulse, MOUNTED (Oct 2 2026).
 *
 * AJ: printed Pulse scores, "Sentences only". The 0-96 overall and the
 * eight coloured topic scores never print, even on an old Pulse whose
 * client-copy switch still says to include them; each topic that can be
 * compared says which way it moved, in words.
 */
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SubjectiveClientCopy, topicMoveSentence } from "./SubjectiveDashboard";
import { emptyAssessment } from "./scoring";
import { ALL_STATEMENT_IDS } from "./questions";
import type { StatementAnswer, SubjectiveAssessment } from "./types";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const all = (value: number): Record<string, StatementAnswer> =>
  Object.fromEntries(ALL_STATEMENT_IDS.map((id) => [id, { value }]));

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

function mount(node: React.ReactNode) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(node));
  return host;
}

describe("SubjectiveClientCopy", () => {
  it("prints sentences, never the 0-96 overall or the coloured topic scores", () => {
    const base = emptyAssessment();
    const prev: SubjectiveAssessment = { ...base, answers: all(8) };
    const cur: SubjectiveAssessment = {
      ...base,
      // An old Pulse whose switch still asks for the scores.
      clientCopy: { ...base.clientCopy, includeCategoryScores: true },
      answers: {
        ...all(8),
        strengthConfidence_1: { value: 10 },
        strengthConfidence_2: { value: 10 },
        strengthConfidence_3: { value: 10 },
      },
    };
    const el = mount(
      <SubjectiveClientCopy
        assessment={cur}
        previous={{ reportId: "r0", date: "2026-06-01", assessment: prev }}
        clientFirstName="Judy"
      />,
    );
    const text = el.textContent ?? "";
    expect(text).not.toMatch(/\/\s*96/);
    expect(text).not.toContain("Green 72");
    expect(text).not.toContain("Overall");
    expect(el.querySelector(".sr-ragrid")).toBeNull();
    expect(text).toContain("better than last time.");
    expect(text).toContain("about the same as last time.");
  });

  it("says a topic's move in words", () => {
    expect(topicMoveSentence("Sleep", 3)).toBe("Sleep: better than last time.");
    expect(topicMoveSentence("Sleep", -1)).toBe("Sleep: harder than last time.");
    expect(topicMoveSentence("Sleep", 0)).toBe("Sleep: about the same as last time.");
  });
});
