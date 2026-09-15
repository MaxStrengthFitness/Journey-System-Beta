import { describe, expect, it } from "vitest";
import { clientDisplayName, clientFirstName, clientInitials, clientLegalName, goesByNickname } from "./client-name";

const judith = { firstName: "Judith", lastName: "Daus" };
const judy = { ...judith, nickname: " Judy " };

describe("client names", () => {
  it("prefers the nickname in headers and keeps the legal name", () => {
    expect(clientFirstName(judy)).toBe("Judy");
    expect(clientDisplayName(judy)).toBe("Judy Daus");
    expect(clientLegalName(judy)).toBe("Judith Daus");
    expect(clientInitials(judy)).toBe("JD");
    expect(goesByNickname(judy)).toBe(true);
  });

  it("falls back to the legal first name", () => {
    expect(clientFirstName(judith)).toBe("Judith");
    expect(clientDisplayName({ ...judith, nickname: "  " })).toBe("Judith Daus");
    expect(goesByNickname({ ...judith, nickname: "judith" })).toBe(false);
  });

  it("never returns an empty header", () => {
    expect(clientDisplayName(null)).toBe("Client");
    expect(clientFirstName(undefined, "them")).toBe("them");
    expect(clientInitials({})).toBe("");
  });
});
