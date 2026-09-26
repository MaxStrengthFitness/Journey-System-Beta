import { describe, expect, it } from "vitest";
import { STILL_SENDING_AFTER_MS, sendStatus } from "./send-status";

describe("sendStatus", () => {
  it("says nothing while saves reach the database as they should", () => {
    expect(sendStatus({ online: true, unsentForMs: 0 })).toBeNull();
    expect(sendStatus({ online: true, unsentForMs: 1_500 })).toBeNull();
    expect(sendStatus({ online: true, unsentForMs: STILL_SENDING_AFTER_MS - 1 })).toBeNull();
  });

  it("says the iPad is offline and the sets are safe on it, whatever is waiting", () => {
    for (const unsentForMs of [0, 60_000]) {
      const s = sendStatus({ online: false, unsentForMs });
      expect(s?.kind).toBe("offline");
      expect(s?.text).toContain("saved on this iPad");
      expect(s?.text).toContain("sends when the connection is back");
    }
  });

  it("says saves are still going when the iPad thinks it is online but nothing has arrived", () => {
    const s = sendStatus({ online: true, unsentForMs: STILL_SENDING_AFTER_MS });
    expect(s?.kind).toBe("sending");
    expect(s?.text).toContain("Saved on this iPad");
  });

  it("never uses developer words", () => {
    const words = [sendStatus({ online: false, unsentForMs: 0 }), sendStatus({ online: true, unsentForMs: 60_000 })]
      .map((s) => s?.text ?? "")
      .join(" ");
    expect(words).not.toMatch(/firestore|firebase|sync|cache|pending|write/i);
  });
});
