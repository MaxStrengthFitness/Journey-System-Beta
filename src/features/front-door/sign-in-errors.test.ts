import { describe, expect, it } from "vitest";
import { isCompanyMicrosoftEmail, signInErrorSentence, wrongMicrosoftAccountSentence } from "./sign-in-errors";

describe("signInErrorSentence", () => {
  it("says nothing when the person closed the window", () => {
    expect(signInErrorSentence({ code: "auth/popup-closed-by-user" })).toBeNull();
    expect(signInErrorSentence({ code: "auth/cancelled-popup-request" })).toBeNull();
  });

  it("says what to do for the common failures, without the developer's words", () => {
    expect(signInErrorSentence({ code: "auth/popup-blocked" })).toContain("Allow pop-ups");
    expect(signInErrorSentence({ code: "auth/network-request-failed" })).toContain("Wi-Fi");
    expect(signInErrorSentence({ code: "auth/user-disabled" })).toContain("switched off");
    for (const code of ["auth/popup-blocked", "auth/network-request-failed", "auth/too-many-requests"]) {
      expect(signInErrorSentence({ code, message: "Firebase: Error (x)." })).not.toContain("Firebase");
    }
  });

  it("puts a plain sentence before Microsoft's set-up codes, and keeps the code to pass on", () => {
    const s = signInErrorSentence({ code: "auth/internal-error", message: "AADSTS50011: redirect URI mismatch" })!;
    expect(s.startsWith("Microsoft sign-in isn't set up correctly")).toBe(true);
    expect(s).toContain("AADSTS50011");
  });

  it("falls back to a plain sentence, with the detail when there is one", () => {
    expect(signInErrorSentence({})).toBe("Sign-in didn't finish. Try again.");
    expect(signInErrorSentence({ code: "auth/x", message: "boom" })).toContain("boom");
  });
});

describe("the Microsoft door", () => {
  it("is the company's addresses only", () => {
    expect(isCompanyMicrosoftEmail("AJ@MaxStrengthFitness.com")).toBe(true);
    expect(isCompanyMicrosoftEmail("jordan@outlook.com")).toBe(false);
    expect(isCompanyMicrosoftEmail(null)).toBe(false);
  });

  it("names the account that was turned away, and the way in", () => {
    expect(wrongMicrosoftAccountSentence("jordan@outlook.com")).toContain("jordan@outlook.com isn't a Max Strength account");
    expect(wrongMicrosoftAccountSentence("")).toContain("no email address");
  });
});
