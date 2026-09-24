import { describe, expect, it, vi } from "vitest";
import { createLeaveGate, createUnsavedRegistry, leaveQuestion } from "./registry";

describe("leaveQuestion", () => {
  it("reads as AJ wrote it for one screen", () => {
    expect(leaveQuestion(["the progress report"])).toBe(
      "You have unsaved changes to the progress report. Leave without saving?",
    );
  });

  it("joins several the way a person would say them, each once", () => {
    expect(leaveQuestion(["Routine A", "Sam's profile", "Routine A"])).toBe(
      "You have unsaved changes to Routine A and Sam's profile. Leave without saving?",
    );
    expect(leaveQuestion(["a", "b", "c"])).toBe(
      "You have unsaved changes to a, b and c. Leave without saving?",
    );
  });

  it("still asks when no screen gave a label", () => {
    expect(leaveQuestion(["", "  "])).toBe(
      "You have unsaved changes. Leave without saving?",
    );
  });
});

describe("the registry", () => {
  it("lists only dirty screens, and only those a filter covers", () => {
    const r = createUnsavedRegistry();
    const record = r.register({ label: "the record", dirty: true, scopes: ["profile"] });
    r.register({ label: "clean", dirty: false, scopes: ["profile"] });
    const studio = r.register({ label: "the hours", dirty: true, scopes: ["my-studio"] });

    expect(r.dirty().map((e) => e.label)).toEqual(["the record", "the hours"]);
    expect(r.dirty({ scope: "profile" }).map((e) => e.id)).toEqual([record]);
    expect(r.dirty({ only: studio }).map((e) => e.id)).toEqual([studio]);
    expect(r.dirty({ scope: "nowhere" })).toEqual([]);
    expect(r.anyDirty()).toBe(true);
  });

  it("belongs to every scope around it, not just the nearest", () => {
    const r = createUnsavedRegistry();
    r.register({ label: "nested", dirty: true, scopes: ["outer", "inner"] });
    expect(r.dirty({ scope: "outer" })).toHaveLength(1);
    expect(r.dirty({ scope: "inner" })).toHaveLength(1);
  });

  it("forgets a screen that unmounts", () => {
    const r = createUnsavedRegistry();
    const id = r.register({ label: "gone", dirty: true, scopes: [] });
    r.unregister(id);
    expect(r.anyDirty()).toBe(false);
    // Updating a screen that has gone is a no-op, not a resurrection.
    r.update(id, { dirty: true });
    expect(r.anyDirty()).toBe(false);
  });

  it("tells listeners when dirtiness changes, and only then", () => {
    const r = createUnsavedRegistry();
    const heard = vi.fn();
    r.subscribe(heard);
    const id = r.register({ label: "x", dirty: false, scopes: [] });
    expect(heard).not.toHaveBeenCalled();
    r.update(id, { dirty: true });
    expect(heard).toHaveBeenCalledTimes(1);
    // A new label on every render must not wake anything.
    r.update(id, { label: "y" });
    r.update(id, { dirty: true });
    expect(heard).toHaveBeenCalledTimes(1);
    r.unregister(id);
    expect(heard).toHaveBeenCalledTimes(2);
  });
});

describe("the gate", () => {
  it("lets a navigation straight through when nothing would be lost", () => {
    const r = createUnsavedRegistry();
    r.register({ label: "clean", dirty: false, scopes: [] });
    const gate = createLeaveGate(r);
    const go = vi.fn();
    gate.request(go);
    expect(go).toHaveBeenCalledTimes(1);
    expect(gate.pending()).toBeNull();
  });

  it("holds a navigation that would lose typing, and asks", () => {
    const r = createUnsavedRegistry();
    r.register({ label: "the progress report", dirty: true, scopes: [] });
    const gate = createLeaveGate(r);
    const go = vi.fn();
    gate.request(go);
    expect(go).not.toHaveBeenCalled();
    expect(gate.pending()?.question).toBe(
      "You have unsaved changes to the progress report. Leave without saving?",
    );
  });

  it("Keep editing drops the navigation and keeps the typing", () => {
    const r = createUnsavedRegistry();
    const discard = vi.fn();
    r.register({ label: "x", dirty: true, scopes: [], discard });
    const gate = createLeaveGate(r);
    const go = vi.fn();
    gate.request(go);
    gate.stay();
    expect(go).not.toHaveBeenCalled();
    expect(discard).not.toHaveBeenCalled();
    expect(gate.pending()).toBeNull();
    expect(r.anyDirty()).toBe(true);
  });

  it("Leave throws the typing away, then runs the navigation", () => {
    const r = createUnsavedRegistry();
    const order: string[] = [];
    r.register({
      label: "Sam's profile",
      dirty: true,
      scopes: [],
      discard: () => order.push("discard"),
    });
    const gate = createLeaveGate(r);
    gate.request(() => order.push("navigate"));
    gate.leave();
    expect(order).toEqual(["discard", "navigate"]);
    // Clean at once, so a second tap before React re-renders does not ask again.
    expect(r.anyDirty()).toBe(false);
    const again = vi.fn();
    gate.request(again);
    expect(again).toHaveBeenCalledTimes(1);
  });

  it("asks ONCE for a tap that changes two things, and runs both in order", () => {
    // AppContent's "open this client": setSelectedClientId, then setCurrentView.
    const r = createUnsavedRegistry();
    r.register({ label: "the report", dirty: true, scopes: [] });
    const gate = createLeaveGate(r);
    const order: string[] = [];
    const heard = vi.fn();
    gate.subscribe(heard);
    gate.request(() => order.push("client"));
    gate.request(() => order.push("view"));
    expect(heard).toHaveBeenCalledTimes(1);
    gate.leave();
    expect(order).toEqual(["client", "view"]);
  });

  it("does not ask again for a navigation made while Leave is running", () => {
    const r = createUnsavedRegistry();
    r.register({ label: "x", dirty: true, scopes: [] });
    const gate = createLeaveGate(r);
    const inner = vi.fn();
    // menuNavigate(() => guard(() => { setAppMode(); setCurrentView() }))
    gate.request(() => gate.request(inner));
    gate.leave();
    expect(inner).toHaveBeenCalledTimes(1);
    expect(gate.pending()).toBeNull();
  });

  it("asks only about the scope a navigation would tear down", () => {
    const r = createUnsavedRegistry();
    r.register({ label: "the studio's hours", dirty: true, scopes: ["studio-section"] });
    const gate = createLeaveGate(r);
    const switchTab = vi.fn();
    // The profile's tab bar: nothing dirty inside ITS scope, so no question.
    gate.request(switchTab, { scope: "profile-tabs" });
    expect(switchTab).toHaveBeenCalledTimes(1);
    // My Studio's section switch: its own section is dirty.
    const switchSection = vi.fn();
    gate.request(switchSection, { scope: "studio-section" });
    expect(switchSection).not.toHaveBeenCalled();
    expect(gate.pending()?.labels).toEqual(["the studio's hours"]);
  });

  it("discards only what the question was about", () => {
    const r = createUnsavedRegistry();
    const drawer = vi.fn();
    const elsewhere = vi.fn();
    const id = r.register({ label: "Routine A", dirty: true, scopes: [], discard: drawer });
    r.register({ label: "the record", dirty: true, scopes: [], discard: elsewhere });
    const gate = createLeaveGate(r);
    gate.request(() => {}, { only: id });
    expect(gate.pending()?.labels).toEqual(["Routine A"]);
    gate.leave();
    expect(drawer).toHaveBeenCalledTimes(1);
    expect(elsewhere).not.toHaveBeenCalled();
    expect(r.dirty().map((e) => e.label)).toEqual(["the record"]);
  });

  it("uses the discard a screen has NOW, not the one it had when asked", () => {
    const r = createUnsavedRegistry();
    const first = vi.fn();
    const second = vi.fn();
    const id = r.register({ label: "x", dirty: true, scopes: [], discard: first });
    const gate = createLeaveGate(r);
    gate.request(() => {});
    r.update(id, { discard: second });
    gate.leave();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
