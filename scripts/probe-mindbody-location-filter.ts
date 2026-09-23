/**
 * READ-ONLY — will Mindbody filter staff appointments by location for us?
 *
 * Round: schedule refresh speed (Sep 2026).
 *
 * WHY IT MATTERS
 * Site 29068 is shared by Westlake, Strongsville and Willoughby. A refresh at
 * any one of them asks Mindbody for the whole site — ~3,800 appointments over
 * a 30-day window — and the proxy then drops the other two studios'. The
 * dropping is already worth it (it saves the client lookups, the normalize
 * pass and the download), but the FETCH is still site-wide: eight pages of
 * 500, and the pages are most of the wait.
 *
 * If GET appointment/staffappointments honours a LocationIds parameter, the
 * fetch shrinks by the same factor and the pages go with it.
 *
 * Mindbody's published docs do not settle this, and guessing at an API
 * contract inside the live sync path is how you find out the hard way. So:
 * ask it, in a window small enough to be cheap, and read the answer.
 *
 * WHAT IT DOES — nothing but reads. About 3 Mindbody calls per location.
 *   For each studio with both a Site ID and a Location ID:
 *     1. Ask for a 7-day window with NO location filter. Count what comes
 *        back, and count how many of those are actually at this location.
 *     2. Ask the same window WITH LocationIds set.
 *     3. Compare.
 *
 * READING THE RESULT
 *   "HONOURED"    -> the filtered call returned only this location's
 *                    appointments. Worth wiring into the proxy.
 *   "IGNORED"     -> same count both ways; Mindbody accepted the parameter
 *                    and did nothing with it. Change nothing: sending it
 *                    would be a lie in the code.
 *   "REFUSED"     -> HTTP 400. Not a supported parameter. Change nothing.
 *   "INCONCLUSIVE"-> too few appointments in the window to tell the cases
 *                    apart. Re-run with --days 30.
 *
 * USAGE (PowerShell, from the project folder)
 *   npx tsx scripts/probe-mindbody-location-filter.ts
 *   npx tsx scripts/probe-mindbody-location-filter.ts --days 30
 */

import { connectFirestore, writeReport, flag } from "./lib/admin.ts";
import { mindbodyConfigured, mindbodyGet } from "../server/mindbody-client.ts";

const DAYS = Number(flag("days") ?? 7);

function dayKey(offsetDays: number): string {
  const d = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

const locationOf = (a: any) =>
  String(a?.Location?.Id ?? a?.LocationId ?? "").trim();

interface Probe {
  studio: string;
  siteId: string;
  locationId: string;
  unfilteredTotal: number | null;
  atThisLocation: number | null;
  filteredTotal: number | null;
  filteredStatus: number | null;
  filteredForeign: number | null;
  verdict: string;
}

async function main() {
  if (!mindbodyConfigured()) {
    console.error(
      "MINDBODY_API_KEY / MINDBODY_SOURCE_NAME / MINDBODY_SOURCE_PASSWORD are missing from .env.",
    );
    process.exit(1);
  }
  const db = connectFirestore();

  const start = dayKey(0);
  const end = dayKey(DAYS);
  console.log(`Window: ${start} .. ${end} (${DAYS} days). Read-only.`);
  console.log("");

  const studios = await db.collection("studios").get();
  const targets = studios.docs
    .map((d) => ({
      name: String(d.get("name") ?? d.id),
      siteId: d.get("mindbodySiteId") ? String(d.get("mindbodySiteId")).trim() : "",
      locationId: d.get("mindbodyLocationId")
        ? String(d.get("mindbodyLocationId")).trim()
        : "",
    }))
    .filter((s) => s.siteId && s.locationId);

  if (targets.length === 0) {
    console.log("No studio has both a Mindbody Site ID and a Location ID. Nothing to probe.");
    return;
  }

  const base = {
    StartDate: `${start}T00:00:00`,
    EndDate: `${end}T23:59:59`,
    Limit: 500,
    Offset: 0,
  };

  const probes: Probe[] = [];

  for (const t of targets) {
    const probe: Probe = {
      studio: t.name,
      siteId: t.siteId,
      locationId: t.locationId,
      unfilteredTotal: null,
      atThisLocation: null,
      filteredTotal: null,
      filteredStatus: null,
      filteredForeign: null,
      verdict: "INCONCLUSIVE",
    };

    const plain = await mindbodyGet(t.siteId, "appointment/staffappointments", base);
    if (!plain.ok) {
      probe.verdict = `UNFILTERED CALL FAILED (HTTP ${plain.status})`;
      probes.push(probe);
      console.log(`${t.name}: ${probe.verdict}`);
      continue;
    }
    const plainAppts: any[] = plain.data?.Appointments ?? plain.data?.appointments ?? [];
    probe.unfilteredTotal = plainAppts.length;
    probe.atThisLocation = plainAppts.filter((a) => locationOf(a) === t.locationId).length;

    const filtered = await mindbodyGet(t.siteId, "appointment/staffappointments", {
      ...base,
      LocationIds: [t.locationId],
    });
    probe.filteredStatus = filtered.status;

    if (!filtered.ok) {
      probe.verdict = filtered.status === 400 ? "REFUSED" : `FAILED (HTTP ${filtered.status})`;
    } else {
      const fa: any[] = filtered.data?.Appointments ?? filtered.data?.appointments ?? [];
      probe.filteredTotal = fa.length;
      probe.filteredForeign = fa.filter((a) => locationOf(a) !== t.locationId).length;

      if (probe.filteredForeign === 0 && probe.filteredTotal === probe.atThisLocation) {
        // Only decisive if the site actually held someone ELSE's appointments
        // in this window — otherwise "filtered" and "unfiltered" look alike.
        probe.verdict =
          probe.unfilteredTotal > probe.atThisLocation ? "HONOURED" : "INCONCLUSIVE";
      } else if (probe.filteredTotal === probe.unfilteredTotal && probe.filteredForeign > 0) {
        probe.verdict = "IGNORED";
      } else {
        probe.verdict = "UNEXPECTED — see the report";
      }
    }

    probes.push(probe);
    console.log(
      `${t.name} (site ${t.siteId}, loc ${t.locationId}): ` +
        `${probe.unfilteredTotal} site-wide, ${probe.atThisLocation} here, ` +
        `filtered call returned ${probe.filteredTotal ?? "-"} ` +
        `(${probe.filteredForeign ?? "-"} from elsewhere) -> ${probe.verdict}`,
    );
  }

  console.log("");
  const verdicts = new Set(probes.map((p) => p.verdict));
  if (verdicts.has("HONOURED")) {
    console.log("LocationIds is honoured. Worth sending from the proxy — send this to Claude.");
  } else if (verdicts.has("REFUSED")) {
    console.log("LocationIds is not a supported parameter. Nothing to change.");
  } else if (verdicts.has("IGNORED")) {
    console.log("Mindbody accepted LocationIds and ignored it. Nothing to change.");
  } else {
    console.log("Not decisive — try again with --days 30, ideally on a busy week.");
  }

  const file = writeReport("mindbody-location-filter-probe", {
    ranAt: new Date().toISOString(),
    window: { start, end, days: DAYS },
    probes,
  });
  console.log(`Full detail: ${file}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
