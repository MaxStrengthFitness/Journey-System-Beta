// @vitest-environment jsdom
/**
 * TYPING ON A LEARNING PAGE, MOUNTED (voice review follow-up, Sep 27 2026).
 *
 * A Catalog or Academy page is plain state: the trail, a related machine or a
 * "See also" card swapped it in place, and a half-written studio note or
 * comment went with it without a word. WikiShell now makes the page a leave
 * scope, the links inside it ask through useWikiPageGuard, and the page
 * editor and the comment box register what they hold. Mounted here inside
 * the real unsaved-changes provider.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../comments/hooks", () => ({
  useComments: () => ({ comments: [], loading: false, error: null }),
}));
const posted = vi.hoisted(() => ({ post: vi.fn(async () => {}) }));
vi.mock("../comments/mutations", () => ({
  postComment: posted.post,
  editComment: vi.fn(async () => {}),
  deleteComment: vi.fn(async () => {}),
}));

import { UnsavedChangesProvider, useLeaveGuard } from "../unsaved-changes";
import { CommentsPanel, CommentsProvider } from "../comments";
import { WikiShell } from "./WikiShell";
import { WikiEditor } from "./WikiEditor";
import { WikiChips, WikiLinkCard } from "./WikiLinks";
import { WikiRow } from "./WikiIndex";

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  posted.post.mockClear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

async function mount(ui: React.ReactNode) {
  await act(async () => {
    root.render(<UnsavedChangesProvider>{ui}</UnsavedChangesProvider>);
  });
}

function setValue(el: Element | null, value: string) {
  if (!el) throw new Error("field not found");
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}
const type = (el: Element | null, value: string) => act(async () => setValue(el, value));
const click = (el: Element | null | undefined) =>
  act(async () => {
    if (!el) throw new Error("element not found");
    (el as HTMLElement).click();
  });
const button = (label: string) =>
  [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === label);
const question = () => document.querySelector('[role="alertdialog"]');
const answer = (a: "keep-editing" | "leave") =>
  document.querySelector(`[data-testid="leave-confirm"] [data-action="${a}"]`);

/**
 * A page with a studio note being written, as StudioWikiPanel draws it, and
 * the three kinds of link a page carries.
 */
function Page({ went }: { went: (where: string) => void }) {
  const [editing, setEditing] = useState(true);
  return (
    <WikiShell crumbs={[{ label: "Academy", onClick: () => went("index") }, { label: "Turnarounds" }]}>
      {editing ? (
        <WikiEditor kind="overlay" fixedTitle="Turnarounds" onSave={() => {}} onCancel={() => setEditing(false)} />
      ) : (
        <p data-testid="closed">No note being written</p>
      )}
      <WikiLinkCard title="Quick reference card" onClick={() => went("card")} />
      <WikiChips items={[{ id: "lp", label: "Leg Press" }]} onPick={(id) => went(id)} />
      <WikiRow title="Glossary" onClick={() => went("glossary")} />
    </WikiShell>
  );
}

describe("a studio note being written on a page", () => {
  const note = () => host.querySelector("textarea.wk__textarea");

  it("lets every link go at once while nothing is typed", async () => {
    const went = vi.fn();
    await mount(<Page went={went} />);
    await click(button("Academy"));
    await click(button("Quick reference card"));
    await click(button("Leg Press"));
    await click(button("Glossary"));
    expect(question()).toBeNull();
    expect(went.mock.calls.map((c) => c[0])).toEqual(["index", "card", "lp", "glossary"]);
  });

  it("the trail asks first, and Keep editing keeps the note and the page", async () => {
    const went = vi.fn();
    await mount(<Page went={went} />);
    await type(note(), "Ours pauses a beat longer.");
    await click(button("Academy"));
    expect(question()!.textContent).toContain("You have unsaved changes to the note on Turnarounds.");
    await click(answer("keep-editing"));
    expect(went).not.toHaveBeenCalled();
    expect((note() as HTMLTextAreaElement).value).toBe("Ours pauses a beat longer.");
  });

  it("links inside the page ask too, and Leave closes the editor before it goes", async () => {
    for (const label of ["Quick reference card", "Leg Press", "Glossary"]) {
      const went = vi.fn();
      await mount(<Page went={went} />);
      await type(note(), "Half a thought");
      await click(button(label));
      expect(question(), label).not.toBeNull();
      expect(went).not.toHaveBeenCalled();
      await click(answer("leave"));
      expect(went).toHaveBeenCalledTimes(1);
      expect(host.querySelector('[data-testid="closed"]'), label).not.toBeNull();
      await act(async () => root.unmount());
      root = createRoot(host);
    }
  });

  it("Cancel asks before it throws the typing away", async () => {
    await mount(<Page went={() => {}} />);
    await type(note(), "Half a thought");
    await click(button("Cancel"));
    expect(question()!.textContent).toContain("the note on Turnarounds");
    await click(answer("keep-editing"));
    expect(host.querySelector('[data-testid="closed"]')).toBeNull();
    await click(button("Cancel"));
    await click(answer("leave"));
    expect(host.querySelector('[data-testid="closed"]')).not.toBeNull();
  });

  it("a new page is asked about by that name", async () => {
    await mount(
      <WikiEditor kind="page" onSave={() => {}} onCancel={() => {}} />,
    );
    await type(host.querySelector("textarea.wk__textarea"), "## When it applies");
    await click(button("Cancel"));
    expect(question()!.textContent).toContain("You have unsaved changes to the new page.");
  });
});

/** The app's own navigation, as the bottom bar asks it. */
function Away() {
  const leave = useLeaveGuard();
  const [left, setLeft] = useState(false);
  return (
    <button type="button" data-left={left ? "1" : "0"} onClick={() => leave(() => setLeft(true))}>
      Hub
    </button>
  );
}

describe("the comment box", () => {
  const ctx = {
    studioId: "solon",
    studioName: "Solon",
    author: { id: "uid-1", name: "Sara Kim" },
    people: [],
    isLeaderHere: false,
  };
  const box = () => host.querySelector('textarea[aria-label="Write a comment"]');
  const hub = () => button("Hub")!;

  it("lets the app go at once while nothing is typed", async () => {
    await mount(
      <CommentsProvider value={ctx}>
        <Away />
        <CommentsPanel target={{ kind: "machine", id: "cp" }} title="Chest Press" />
      </CommentsProvider>,
    );
    await click(hub());
    expect(question()).toBeNull();
    expect(hub().getAttribute("data-left")).toBe("1");
  });

  it("asks before the app takes an unposted comment away, and a posted one no longer asks", async () => {
    await mount(
      <CommentsProvider value={ctx}>
        <Away />
        <CommentsPanel target={{ kind: "machine", id: "cp" }} title="Chest Press" />
      </CommentsProvider>,
    );
    await type(box(), "The seat pin sticks.");
    await click(hub());
    expect(question()!.textContent).toContain("You have unsaved changes to the comment you are writing.");
    await click(answer("keep-editing"));
    expect(hub().getAttribute("data-left")).toBe("0");

    await click(button("Post"));
    expect(posted.post).toHaveBeenCalledTimes(1);
    expect((box() as HTMLTextAreaElement).value).toBe("");
    await click(hub());
    expect(question()).toBeNull();
    expect(hub().getAttribute("data-left")).toBe("1");
  });
});
