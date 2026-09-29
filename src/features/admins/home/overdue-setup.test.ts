import { describe, expect, it } from "vitest";
import type { Studio, Trainer } from "../../../types";
import type { SetupItemDoc } from "../launches/checklist";
import type { SetupData } from "../launches/useSetupData";
import { NO_LAUNCHES, launchingIds, overdueSetup } from "./overdue-setup";

const tz = "America/New_York";
// Tuesday Sep 29 2026, 9:00 AM Eastern.
const now = new Date("2026-09-29T13:00:00Z");

const studios = [
  { id: "westlake", name: "Westlake", timezone: tz, mindbodySiteId: "29068", mindbodyLocationId: "3", journeyCutoverDate: "2026-09-14" },
  // Opens Nov 30: The studio's block was due Aug 10, Mindbody's Aug 31, the floor's Sep 21, People's Oct 19.
  { id: "mentor", name: "Mentor", timezone: tz, stage: "setting-up", openingDay: "2026-11-30", contactEmail: "m@x.com", phone: "1", address: "1 Main" },
  // Opens Feb 1 2027: nothing is due yet.
  { id: "rivendell", name: "Rivendell", timezone: tz, stage: "handed-over", openingDay: "2027-02-01" },
  { id: "demo-studio", name: "Demo Studio", timezone: tz, isDemo: true, stage: "setting-up", openingDay: "2026-10-01" },
] as unknown as Studio[];

const trainers = [
  { id: "t1", fullName: "Aragorn", role: "StudioLeader", primaryHomeStudioId: "mentor" },
  { id: "t2", fullName: "Boromir", role: "Trainer", primaryHomeStudioId: "mentor" },
] as unknown as Trainer[];

const ok = (docs: Record<string, SetupItemDoc> = {}): SetupData => ({ items: { state: "ok", docs }, roster: { state: "ok", onFloor: 6 } });

describe("which studios are opening", () => {
  it("are the ones setting up or handed over, soonest first, never the practice studio", () => {
    expect(launchingIds(studios)).toEqual(["mentor", "rivendell"]);
    expect(overdueSetup([studios[0]], trainers, {}, now)).toBe(NO_LAUNCHES);
  });
});

describe("what is overdue", () => {
  it("is each item past its due day still to do, oldest first, with the studio's leaders", () => {
    const read = overdueSetup(studios, trainers, { mentor: ok(), rivendell: ok() }, now);
    expect(read.state).toBe("ok");
    expect(read.unread).toEqual([]);
    expect(read.studios).toHaveLength(1);
    const [m] = read.studios;
    expect(m.name).toBe("Mentor");
    expect(m.leaders).toEqual(["Aragorn"]);
    // Details and contact tick themselves; the Mindbody link and the cutover are missing; the floor has machines but the names aren't checked.
    expect(m.items.map((i) => [i.id, i.dueOn])).toEqual([
      ["cutover", "2026-08-31"],
      ["mindbody-linked", "2026-08-31"],
      ["floor-names", "2026-09-21"],
    ]);
  });

  it("drops an item once it is ticked or skipped, and a studio with nothing overdue", () => {
    const docs = { "floor-names": { doneAt: new Date(), doneBy: { uid: "u", name: "Aragorn" } }, cutover: { skipReason: "Set on the day" } };
    const read = overdueSetup(studios, trainers, { mentor: ok(docs), rivendell: ok() }, now);
    expect(read.studios[0].items.map((i) => i.id)).toEqual(["mindbody-linked"]);
    const linked = { ...studios[1], mindbodySiteId: "29068", mindbodyLocationId: "9", mindbodyMode: "linked", journeyCutoverDate: "2026-11-30" } as Studio;
    const clear = overdueSetup([studios[0], linked, studios[2]], trainers, { mentor: ok(docs), rivendell: ok() }, now);
    expect(clear.studios).toEqual([]);
  });

  it("is still loading while any studio opening is being read, and names one whose checklist failed", () => {
    expect(overdueSetup(studios, trainers, { mentor: ok() }, now).state).toBe("loading");
    const read = overdueSetup(studios, trainers, { mentor: { items: { state: "failed" }, roster: { state: "ok", onFloor: 6 } }, rivendell: ok() }, now);
    expect(read.state).toBe("ok");
    expect(read.unread).toEqual(["Mentor"]);
    expect(read.studios).toEqual([]);
  });

  it("counts a floor that couldn't be read as overdue rather than done, the checklist's own rule", () => {
    const read = overdueSetup(studios, trainers, { mentor: { items: { state: "ok", docs: {} }, roster: { state: "failed" } }, rivendell: ok() }, now);
    expect(read.studios[0].items.map((i) => i.id)).toContain("floor-machines");
  });

  it("puts the studio with the oldest item first", () => {
    const late = { ...studios[2], openingDay: "2026-10-05" } as Studio; // The studio's block was due Jun 15.
    const read = overdueSetup([studios[1], late], trainers, { mentor: ok(), rivendell: ok() }, now);
    expect(read.studios.map((s) => s.name)).toEqual(["Rivendell", "Mentor"]);
    expect(read.studios[0].leaders).toEqual([]);
  });
});
