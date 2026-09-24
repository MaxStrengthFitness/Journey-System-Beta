import { describe, expect, it } from "vitest";
import type { Client } from "../types";
import type { JournalEntry } from "../types/journal";
import { getClientAlertState } from "./client-alerts";

const client = (over: Partial<Client> = {}) => ({ id: "c1", firstName: "Maria", lastName: "Kowalski", ...over }) as Client;

const critical = (body: string) =>
  ({ id: body, clientId: "c1", importance: "critical", body, threadId: null, isArchived: false, resolvedAt: null }) as unknown as JournalEntry;

describe("getClientAlertState — the priority triangle", () => {
  it("lights for a live Critical note and says it in whole sentences", () => {
    const state = getClientAlertState(client(), [critical("Left shoulder: no overhead pressing")]);
    expect(state.hasPriorityNote).toBe(true);
    expect(state.priorityLabel).toBe("Critical: Left shoulder: no overhead pressing");
  });

  it("stays dark with no Critical note and no legacy field — nothing is inferred", () => {
    const state = getClientAlertState(client());
    expect(state.hasPriorityNote).toBe(false);
    expect(state.priorityLabel).toBeNull();
    expect(getClientAlertState(client(), []).hasPriorityNote).toBe(false);
  });

  it("still reads a legacy priority note an imported record carries", () => {
    const state = getClientAlertState(client({ priorityNote: "Knee replacement, left" } as Partial<Client>));
    expect(state.hasPriorityNote).toBe(true);
    expect(state.priorityLabel).toBe("Knee replacement, left");
  });

  it("says both when both are there, the Critical note first", () => {
    const state = getClientAlertState(client({ priorityNote: "Knee replacement, left" } as Partial<Client>), [critical("No lunges")]);
    expect(state.priorityLabel).toBe("Critical: No lunges · Knee replacement, left");
  });

  it("does not add the bare words 'Priority note' beside a Critical note that already speaks", () => {
    const state = getClientAlertState(client({ hasPriorityNote: true } as Partial<Client>), [critical("No lunges")]);
    expect(state.priorityLabel).toBe("Critical: No lunges");
    expect(getClientAlertState(client({ hasPriorityNote: true } as Partial<Client>)).priorityLabel).toBe("Priority note");
  });

  it("says nothing for a booking with no client", () => {
    expect(getClientAlertState(null, [critical("No lunges")]).hasPriorityNote).toBe(false);
  });
});
