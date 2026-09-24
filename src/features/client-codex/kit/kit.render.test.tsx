// @vitest-environment jsdom
/**
 * THE KIT MOUNTS — every primitive, in light and in dark, and the few that
 * hold state behave.
 *
 * Client codex, Sep 2026. A green typecheck and suite do not mean a screen
 * mounts (KNOWN-TRAPS → React, tests, dates and tooling); these do. They also
 * hold the one rule a stylesheet scan cannot see on its own: every control the
 * kit renders — button, input, select, textarea — matches a kit.css rule that
 * makes it at least 40px tall. The rule is found with the element's own
 * `matches()`, so a new control or a renamed class is checked the same way.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { StrictMode, act, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Home, Pencil } from "lucide-react";
import {
  BigNumber,
  Btn,
  Card,
  Chip,
  ChipButton,
  Chips,
  EmptyLine,
  Eyebrow,
  Fact,
  FactList,
  FordMark,
  Lede,
  LoudChip,
  Meta,
  NextCard,
  Page,
  Quote,
  Row,
  Rows,
  SectionHead,
  Slot,
  Source,
} from "./primitives";
import { ReadEdit } from "./ReadEdit";
import { MultiPicks, Picks, SelectInput, TextArea, TextInput } from "./fields";
import { SaveBar } from "./SaveBar";
import type { RecordAnchor, RecordPage } from "../../client-profile/profile-nav";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function mount(ui: ReactNode, wrapClass = "cx"): Promise<{ host: HTMLElement; root: Root }> {
  const host = document.createElement("div");
  host.className = wrapClass;
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<StrictMode>{ui}</StrictMode>);
  });
  return { host, root };
}

async function unmount({ host, root }: { host: HTMLElement; root: Root }) {
  await act(async () => root.unmount());
  host.remove();
}

async function click(el: Element | null | undefined) {
  if (!el) throw new Error("nothing to click");
  await act(async () => {
    (el as HTMLElement).click();
  });
}

const byText = (host: HTMLElement, selector: string, text: string) =>
  [...host.querySelectorAll(selector)].find((el) => el.textContent?.trim() === text) ?? null;

/* ------------------------------------------------------------------ */
/* The gallery: one of everything                                      */
/* ------------------------------------------------------------------ */

function Gallery({ go = () => {} }: { go?: (page: RecordPage, anchor?: RecordAnchor) => void }) {
  const [text, setText] = useState("Dental hygienist");
  const [long, setLong] = useState("Retired in 2019.");
  const [pick, setPick] = useState("feet");
  const [picks, setPicks] = useState<string[]>(["golf"]);
  const [select, setSelect] = useState("novice");
  return (
    <Page id="ford" title="FORD" lede="Family, occupation, recreation, dreams." go={go} actions={<Btn variant="solid">Remember something</Btn>}>
      <Card eyebrow="Occupation" icon={Pencil} id="ford-occupation" meta="2 details" actions={<Btn variant="quiet">Add</Btn>} source="From her record">
        <Lede>Retired — was on her feet.</Lede>
        <Quote>Keep the knees behind the toes.</Quote>
        <Meta>AJ · Sep 20</Meta>
        <Eyebrow icon={Home}>Ask next</Eyebrow>
        <SectionHead aside="the work questions are skipped">Work</SectionHead>
        <BigNumber>461</BigNumber>
        <Chips>
          <Chip>Neutral</Chip>
          <Chip tone="alert">Absolute contraindication</Chip>
          <Chip tone="warn">Caution</Chip>
          <Chip tone="live">Modify</Chip>
          <Chip tone="ok">Reached</Chip>
          <Chip tone="new">New</Chip>
          <ChipButton pressed={false}>Filter</ChipButton>
          <LoudChip importance="standard" />
          <LoudChip importance="elevated" />
          <LoudChip importance="critical" />
        </Chips>
        <FordMark pillar="family" size={22} />
        <FordMark pillar="occupation" />
        <FordMark pillar="recreation" size={40} labelled />
        <FordMark pillar="dreams" />
        <FordMark pillar={null} />
        <FactList>
          <Fact label="Home studio" source="From Mindbody">Westlake</Fact>
          <Fact label="Also trains at">Solon</Fact>
        </FactList>
        <EmptyLine action={{ label: "Write one", onClick: () => {} }}>No line yet.</EmptyLine>
        <Source>From Mindbody · synced today</Source>
      </Card>
      <Card host>
        <span>A hosted component draws its own cards.</span>
      </Card>
      <Slot as="button" eyebrow="Body & Pulse" go={() => go("body")} footer="Pulse Sep 20">
        <span>5′0″, with a 59″ reach.</span>
      </Slot>
      <Slot eyebrow="Notes" open={<Btn variant="quiet">All 12 notes</Btn>} footer="3 open">
        <Rows>
          <Row label={<LoudChip importance="critical" />} meta="AJ · Sep 20" onClick={() => go("notes", "note-t1")}>
            Leg Press: stop at 90° at the bottom turn.
          </Row>
          <Row meta="Sep 2">A line with no label.</Row>
        </Rows>
      </Slot>
      <ReadEdit
        label="Build"
        canEdit
        dirty={false}
        revision={0}
        read={<p>5′0″</p>}
        edit={<TextInput label="Height" value="60" onChange={() => {}} />}
      />
      <TextInput label="Job title" value={text} onChange={setText} hint="Free text; the list only suggests." />
      <TextArea label="Medical history" value={long} onChange={setLong} />
      <SelectInput
        label="Experience"
        value={select}
        onChange={setSelect}
        options={[
          { value: "novice", label: "Novice" },
          { value: "veteran", label: "Protocol Veteran" },
        ]}
      />
      <Picks
        label="What the work does to the body"
        value={pick}
        onChange={setPick}
        options={[
          { value: "desk", label: "Seated / desk" },
          { value: "feet", label: "On their feet", hint: "Standing most of the day" },
        ]}
      />
      <MultiPicks
        label="Recreation"
        value={picks}
        onChange={setPicks}
        options={[
          { value: "golf", label: "Golf" },
          { value: "hiking", label: "Hiking" },
        ]}
      />
      <SaveBar
        count={1}
        where={[{ page: "ford", label: "Occupation", anchor: "ford-occupation" }]}
        saving={false}
        onShow={() => {}}
        onDiscard={() => {}}
        onSave={() => {}}
      />
    </Page>
  );
}

/* ------------------------------------------------------------------ */
/* kit.css, as rules jsdom can match                                   */
/* ------------------------------------------------------------------ */

const HERE = dirname(fileURLToPath(import.meta.url));
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const KIT_RULES = [...stripComments(readFileSync(join(HERE, "kit.css"), "utf8")).matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .filter((m) => !m[1].trim().startsWith("@"))
  .map((m) => ({ selectors: m[1].split(",").map((s) => s.trim()), body: m[2] }));
const TOKENS = Object.fromEntries(
  [...stripComments(readFileSync(join(HERE, "..", "codex.tokens.css"), "utf8")).matchAll(/(--cx-[\w-]+)\s*:\s*([^;]+);/g)].map(
    (m) => [m[1], m[2].trim()],
  ),
);

function px(value: string): number {
  const v = value.trim();
  const token = /^var\((--cx-[\w-]+)\)$/.exec(v);
  if (token) return px(TOKENS[token[1]] ?? "0");
  const n = /^(\d+(?:\.\d+)?)px$/.exec(v);
  return n ? Number(n[1]) : 0;
}

/** The tallest min-height any kit.css rule gives this element. */
function kitMinHeight(el: Element): number {
  let best = 0;
  for (const rule of KIT_RULES) {
    const m = /(?:^|;|\s)min-height\s*:\s*([^;]+)/.exec(rule.body);
    if (!m) continue;
    const applies = rule.selectors.some((s) => {
      try {
        return el.matches(s);
      } catch {
        return false; // a pseudo-element selector: never a control's own rule
      }
    });
    if (applies) best = Math.max(best, px(m[1]));
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe("the kit mounts", () => {
  for (const theme of ["light", "dark"] as const) {
    it(`in ${theme}`, async () => {
      const m = await mount(<Gallery />, theme === "dark" ? "cx dark" : "cx");
      expect(m.host.querySelector(".cx-page-title")?.textContent).toBe("FORD");
      expect(m.host.querySelectorAll(".cx-card").length).toBeGreaterThanOrEqual(3);
      await unmount(m);
    });
  }

  it("makes every control it renders at least 40px tall", async () => {
    const m = await mount(<Gallery />);
    const controls = [...m.host.querySelectorAll("button, input, select, textarea")];
    expect(controls.length).toBeGreaterThan(15);
    for (const el of controls) {
      expect(kitMinHeight(el), `${el.tagName.toLowerCase()}.${el.className} "${el.textContent?.trim()}"`).toBeGreaterThanOrEqual(40);
    }
    await unmount(m);
  });

  it("gives every control a type, so none submits a form by accident", async () => {
    const m = await mount(<Gallery />);
    for (const b of m.host.querySelectorAll("button")) expect(b.getAttribute("type")).toBe("button");
    await unmount(m);
  });

  it("marks an anchored card as a place a door can land", async () => {
    const m = await mount(<Gallery />);
    const card = m.host.querySelector("#ford-occupation");
    expect(card?.getAttribute("data-cx-anchor")).toBe("ford-occupation");
    expect(card?.classList.contains("cx-card")).toBe(true);
    await unmount(m);
  });

  it("frames a hosted component without a border of its own", async () => {
    const m = await mount(<Gallery />);
    expect(m.host.querySelectorAll(".cx-card[data-host]")).toHaveLength(1);
    await unmount(m);
  });
});

describe("LoudChip", () => {
  it("uses Loudness's words and colours", async () => {
    const m = await mount(
      <>
        <LoudChip importance="standard" />
        <LoudChip importance="elevated" />
        <LoudChip importance="critical" />
        <LoudChip importance={"shouting" as never} />
        <LoudChip importance={undefined} />
      </>,
    );
    const chips = [...m.host.querySelectorAll(".cx-loud")].map((c) => [c.textContent, c.getAttribute("data-tone")]);
    expect(chips).toEqual([
      ["Note", "quiet"],
      ["Heads up", "warn"],
      ["Critical", "alert"],
      ["Note", "quiet"],
      ["Note", "quiet"],
    ]);
    await unmount(m);
  });
});

describe("Quote", () => {
  it("quotes the words verbatim", async () => {
    const m = await mount(<Quote>Avoid end-range flexion under load.</Quote>);
    expect(m.host.textContent).toBe("“Avoid end-range flexion under load.”");
    await unmount(m);
  });
});

describe("Page, its neighbours and the Next card", () => {
  it("walks to the page before and after, and focuses nothing by itself", async () => {
    const go = vi.fn();
    const m = await mount(<Gallery go={go} />);
    const title = m.host.querySelector("h2.cx-page-title");
    expect(title?.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).not.toBe(title);
    await click(m.host.querySelector('[aria-label="Previous page: Notes"]'));
    await click(m.host.querySelector('[aria-label="Next page: Body & Pulse"]'));
    await click(m.host.querySelector(".cx-next"));
    expect(go.mock.calls).toEqual([["notes"], ["body"], ["body"]]);
    expect(m.host.querySelector(".cx-next")?.textContent).toContain("Next");
    await unmount(m);
  });

  it("walks Notes back to the Overview, and says Done on Account", async () => {
    const go = vi.fn();
    const m = await mount(
      <>
        <Page id="notes" title="Notes" lede="Every note is a thread." go={go} />
        <Page id="account" title="Account" lede="Contact details, then the membership." go={go} />
      </>,
    );
    const [notes, account] = [...m.host.querySelectorAll(".cx-page-body")];
    expect(notes.querySelector('[aria-label^="Previous page"]')?.textContent).toBe("Overview");
    expect(account.querySelector(".cx-next")?.textContent).toContain("Done");
    expect(account.querySelector(".cx-next__label")?.textContent).toBe("Overview");
    await click(account.querySelector(".cx-next"));
    expect(go).toHaveBeenLastCalledWith("overview");
    await unmount(m);
  });

  it("renders the NextCard alone", async () => {
    const go = vi.fn();
    const m = await mount(<NextCard to="story" done={false} go={go} />);
    expect(m.host.querySelector(".cx-next__label")?.textContent).toBe("Story");
    await unmount(m);
  });
});

describe("Slot", () => {
  it("as a button holds no other control", async () => {
    const go = vi.fn();
    const m = await mount(
      <Slot as="button" eyebrow="Goals & Focus" go={go} footer="1 focus running">
        <span>Working toward: a 90-second wall sit.</span>
      </Slot>,
    );
    const slot = m.host.querySelector("button.cx-slot");
    expect(slot).not.toBeNull();
    expect(slot!.querySelectorAll("button, a, input, select, textarea")).toHaveLength(0);
    await click(slot);
    expect(go).toHaveBeenCalledTimes(1);
    await unmount(m);
  });
});

describe("ReadEdit", () => {
  function Harness({ canEdit = true, dirty = false }: { canEdit?: boolean; dirty?: boolean }) {
    const [revision, setRevision] = useState(0);
    return (
      <>
        <ReadEdit
          label="Occupation"
          canEdit={canEdit}
          dirty={dirty}
          revision={revision}
          id="ford-occupation"
          read={<p className="probe-read">Retired</p>}
          edit={<p className="probe-edit">Editor</p>}
        />
        <button type="button" className="probe-save" onClick={() => setRevision((r) => r + 1)}>
          save
        </button>
      </>
    );
  }

  it("reads first, edits on demand, and closes on Done", async () => {
    const m = await mount(<Harness />);
    expect(m.host.querySelector(".probe-read")).not.toBeNull();
    expect(m.host.querySelector(".probe-edit")).toBeNull();
    await click(byText(m.host, "button", "Edit"));
    expect(m.host.querySelector(".probe-edit")).not.toBeNull();
    expect(m.host.querySelector(".probe-read")).toBeNull();
    expect(byText(m.host, "button", "Done")?.getAttribute("aria-expanded")).toBe("true");
    await click(byText(m.host, "button", "Done"));
    expect(m.host.querySelector(".probe-read")).not.toBeNull();
    await unmount(m);
  });

  it("closes the editor when the form saves or discards (the revision changes)", async () => {
    const m = await mount(<Harness />);
    await click(byText(m.host, "button", "Edit"));
    expect(m.host.querySelector(".probe-edit")).not.toBeNull();
    await click(m.host.querySelector(".probe-save"));
    expect(m.host.querySelector(".probe-edit")).toBeNull();
    expect(byText(m.host, "button", "Edit")).not.toBeNull();
    await unmount(m);
  });

  it("shows no Edit to a reader who may not edit", async () => {
    const m = await mount(<Harness canEdit={false} />);
    expect(byText(m.host, "button", "Edit")).toBeNull();
    expect(m.host.querySelector(".probe-read")).not.toBeNull();
    await unmount(m);
  });

  it("says Unsaved while an edit waits for the Save bar and the editor is closed", async () => {
    const m = await mount(<Harness dirty />);
    expect(m.host.textContent).toContain("Unsaved");
    await click(byText(m.host, "button", "Edit"));
    expect(m.host.textContent).not.toContain("Unsaved");
    await unmount(m);
  });
});

describe("SaveBar", () => {
  it("draws no bar while nothing is unsaved, but keeps its live region waiting", async () => {
    const m = await mount(
      <SaveBar count={0} where={[]} saving={false} onShow={() => {}} onDiscard={() => {}} onSave={() => {}} />,
    );
    expect(m.host.querySelector(".cx-savebar")).toBeNull();
    const live = m.host.querySelector('[aria-live="polite"]');
    expect(live).not.toBeNull();
    expect(live?.textContent).toBe("");
    await unmount(m);
  });

  it("announces the first change through the region that was already there", async () => {
    function Harness() {
      const [count, setCount] = useState(0);
      return (
        <>
          <SaveBar
            count={count}
            where={[{ page: "ford", label: "Occupation", anchor: "ford-occupation" }]}
            saving={false}
            onShow={() => {}}
            onDiscard={() => {}}
            onSave={() => {}}
          />
          <button type="button" className="probe-edit" onClick={() => setCount(1)}>
            edit
          </button>
        </>
      );
    }
    const m = await mount(<Harness />);
    const before = m.host.querySelector('[aria-live="polite"]');
    await click(m.host.querySelector(".probe-edit"));
    const after = m.host.querySelector('[aria-live="polite"]');
    expect(after).toBe(before);
    expect(after?.textContent).toBe("1 unsaved change · FORD · Occupation");
    // The region sits beside the bar, never around it: a sticky bar sticks
    // only within its parent.
    expect(after?.contains(m.host.querySelector(".cx-savebar"))).toBe(false);
    expect(m.host.querySelector(".cx-savebar")?.parentElement).toBe(after?.parentElement);
    await unmount(m);
  });

  it("says where the unsaved change is, and each button does its one thing", async () => {
    const onShow = vi.fn();
    const onDiscard = vi.fn();
    const onSave = vi.fn();
    const m = await mount(
      <SaveBar
        count={1}
        where={[{ page: "ford", label: "Occupation", anchor: "ford-occupation" }]}
        saving={false}
        onShow={onShow}
        onDiscard={onDiscard}
        onSave={onSave}
      />,
    );
    const bar = m.host.querySelector('.cx-savebar[role="region"]');
    expect(bar?.getAttribute("aria-label")).toBe("Unsaved changes");
    expect(bar?.querySelector(".cx-savebar__text")?.textContent).toBe("1 unsaved change · FORD · Occupation");
    expect(m.host.querySelector('[aria-live="polite"]')?.textContent).toBe("1 unsaved change · FORD · Occupation");
    await click(byText(m.host, "button", "Show"));
    await click(byText(m.host, "button", "Discard"));
    await click(byText(m.host, "button", "Save changes"));
    expect([onShow.mock.calls.length, onDiscard.mock.calls.length, onSave.mock.calls.length]).toEqual([1, 1, 1]);
    const solid = byText(m.host, "button", "Save changes");
    expect(solid?.getAttribute("data-variant")).toBe("solid");
    await unmount(m);
  });

  it("holds Save and Discard while saving", async () => {
    const m = await mount(
      <SaveBar count={2} where={[]} saving onShow={() => {}} onDiscard={() => {}} onSave={() => {}} />,
    );
    expect((byText(m.host, "button", "Saving…") as HTMLButtonElement | null)?.disabled).toBe(true);
    expect((byText(m.host, "button", "Discard") as HTMLButtonElement | null)?.disabled).toBe(true);
    expect((byText(m.host, "button", "Show") as HTMLButtonElement | null)?.disabled).toBe(true);
    await unmount(m);
  });

  it("survives a page with no scroller and no ResizeObserver", async () => {
    const saved = (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
    delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
    try {
      const m = await mount(
        <SaveBar count={1} where={[]} saving={false} onShow={() => {}} onDiscard={() => {}} onSave={() => {}} />,
      );
      const bar = m.host.querySelector<HTMLElement>(".cx-savebar");
      expect(bar?.style.getPropertyValue("--scroll-pad-bottom")).toBe("0px");
      await unmount(m);
    } finally {
      if (saved !== undefined) (globalThis as { ResizeObserver?: unknown }).ResizeObserver = saved;
    }
  });
});

describe("Picks", () => {
  function Single({ initial, allowClear = false }: { initial: string; allowClear?: boolean }) {
    const [value, setValue] = useState(initial);
    return (
      <>
        <Picks
          label="Status"
          value={value}
          onChange={setValue}
          allowClear={allowClear}
          options={[
            { value: "working", label: "Working" },
            { value: "retired", label: "Retired" },
          ]}
        />
        <output>{value || "(none)"}</output>
      </>
    );
  }

  const pressed = (host: HTMLElement) =>
    [...host.querySelectorAll('.cx-pick[aria-pressed="true"]')].map((b) => b.textContent);

  it("chooses one, and keeps it when it is tapped again", async () => {
    const m = await mount(<Single initial="working" />);
    expect(m.host.querySelector('[role="group"]')?.getAttribute("aria-labelledby")).toBeTruthy();
    await click(byText(m.host, "button", "Retired"));
    expect(pressed(m.host)).toEqual(["Retired"]);
    await click(byText(m.host, "button", "Retired"));
    expect(m.host.querySelector("output")?.textContent).toBe("retired");
    await unmount(m);
  });

  it("clears on a second tap when allowed", async () => {
    const m = await mount(<Single initial="working" allowClear />);
    await click(byText(m.host, "button", "Working"));
    expect(m.host.querySelector("output")?.textContent).toBe("(none)");
    await unmount(m);
  });

  it("shows a stored value the list no longer offers, instead of hiding it", async () => {
    const m = await mount(<Single initial="semi-retired" />);
    expect(pressed(m.host)).toEqual(["semi-retired"]);
    await unmount(m);
  });

  it("chooses several, in the pills' order, and never drops an old value", async () => {
    function Multi() {
      const [value, setValue] = useState<string[]>(["tennis (old)", "hiking"]);
      return (
        <>
          <MultiPicks
            label="Recreation"
            value={value}
            onChange={setValue}
            options={[
              { value: "golf", label: "Golf" },
              { value: "hiking", label: "Hiking" },
            ]}
          />
          <output>{value.join("|")}</output>
        </>
      );
    }
    const m = await mount(<Multi />);
    await click(byText(m.host, "button", "Golf"));
    expect(m.host.querySelector("output")?.textContent).toBe("golf|hiking|tennis (old)");
    await click(byText(m.host, "button", "Hiking"));
    expect(m.host.querySelector("output")?.textContent).toBe("golf|tennis (old)");
    await unmount(m);
  });
});

describe("the fields", () => {
  it("label their control and report the new value", async () => {
    const onChange = vi.fn();
    const m = await mount(<TextInput label="Nickname" value={null} onChange={onChange} hint="Shown in the header." />);
    const input = m.host.querySelector("input")!;
    const label = m.host.querySelector("label")!;
    expect(label.getAttribute("for")).toBe(input.id);
    // The label is the name alone; the hint is the description, not part of
    // the name, so a screen reader says each once.
    expect(label.textContent).toBe("Nickname");
    expect(label.contains(m.host.querySelector(".cx-field__hint"))).toBe(false);
    expect(input.value).toBe("");
    expect(input.getAttribute("aria-describedby")).toBe(m.host.querySelector(".cx-field__hint")?.id);
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "Liz");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith("Liz");
    await unmount(m);
  });

  it("keeps a stored select value the list no longer offers", async () => {
    const m = await mount(
      <SelectInput label="Experience" value="Beginner (old)" onChange={() => {}} options={[{ value: "novice", label: "Novice" }]} />,
    );
    const select = m.host.querySelector("select")!;
    expect(select.value).toBe("Beginner (old)");
    await unmount(m);
  });
});
