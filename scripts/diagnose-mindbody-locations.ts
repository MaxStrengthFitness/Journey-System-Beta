/**
 * READ-ONLY diagnostic: what does Mindbody itself say about a site's
 * appointments, broken down by LocationId?
 *
 * This bypasses the app and Firestore entirely and calls Mindbody's API
 * directly, using the same token-issue + staffappointments flow as
 * getMindbodyToken() / the /api/mindbody/staff-appointments route in
 * server.ts. It walks the date range one month at a time -- a single
 * multi-year request in one shot reliably gets a 500 TimeoutException back
 * from Mindbody's own API, this is not specific to any one location.
 *
 * AUTH: reads MINDBODY_API_KEY / MINDBODY_SOURCE_NAME / MINDBODY_SOURCE_PASSWORD
 * straight from .env in this folder. Writes nothing, anywhere.
 *
 * USAGE (PowerShell, from the project folder)
 *   npx tsx scripts/diagnose-mindbody-locations.ts
 *   npx tsx scripts/diagnose-mindbody-locations.ts --start 2018-01-01 --end 2026-10-01 --site 29068
 */

import fs from "fs";
import path from "path";
import dns from "dns";

dns.setDefaultResultOrder("ipv4first");

const argv = process.argv.slice(2);
const flag = (n: string) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const envPath = path.resolve(process.cwd(), ".env");
const envText = fs.readFileSync(envPath, "utf-8");
const env: Record<string, string> = {};
for (const rawLine of envText.split("\n")) {
  const line = rawLine.trim();
  if (!line || line.startsWith("#") || !line.includes("=")) continue;
  const idx = line.indexOf("=");
  const k = line.slice(0, idx).trim();
  let v = line.slice(idx + 1).trim();
  if (v.length >= 2 && v[0] === v[v.length - 1] && (v[0] === '"' || v[0] === "'")) {
    v = v.slice(1, -1);
  }
  env[k] = v;
}

const apiKey = env.MINDBODY_API_KEY;
const sourceName = env.MINDBODY_SOURCE_NAME;
const sourcePassword = env.MINDBODY_SOURCE_PASSWORD;
const siteId = flag("site") || "29068";
const rangeStart = flag("start") || "2018-01-01";
const rangeEnd = flag("end") || "2026-10-01";

if (!apiKey || !sourceName || !sourcePassword) {
  console.error("Missing MINDBODY_API_KEY / MINDBODY_SOURCE_NAME / MINDBODY_SOURCE_PASSWORD in .env");
  process.exit(1);
}

function monthChunks(startStr: string, endStr: string): { start: string; end: string }[] {
  const chunks: { start: string; end: string }[] = [];
  let cur = new Date(startStr + "T00:00:00Z");
  const end = new Date(endStr + "T00:00:00Z");
  while (cur < end) {
    const chunkStart = new Date(cur);
    const chunkEnd = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
    const clampedEnd = chunkEnd < end ? chunkEnd : end;
    chunks.push({
      start: chunkStart.toISOString().split("T")[0],
      end: clampedEnd.toISOString().split("T")[0],
    });
    cur = chunkEnd;
  }
  return chunks;
}

async function fetchWindow(accessToken: string, start: string, end: string): Promise<any[]> {
  let offset = 0;
  const limit = 500;
  let totalResults: number | null = null;
  const all: any[] = [];
  while (true) {
    const params = new URLSearchParams({
      StartDate: `${start}T00:00:00`,
      EndDate: `${end}T23:59:59`,
      Limit: String(limit),
      Offset: String(offset),
    });
    const res = await fetch(
      `https://api.mindbodyonline.com/public/v6/appointment/staffappointments?${params.toString()}`,
      {
        headers: {
          "Content-Type": "application/json",
          "Api-Key": apiKey!,
          SiteId: String(siteId),
          Authorization: accessToken,
        },
      },
    );
    if (!res.ok) {
      throw new Error(`${res.status} ${await res.text()}`);
    }
    const data: any = await res.json();
    const page = data.Appointments || data.appointments || [];
    all.push(...page);
    if (totalResults === null) totalResults = data.PaginationResponse?.TotalResults ?? page.length;
    offset += limit;
    if (page.length < limit || all.length >= (totalResults || 0)) break;
  }
  return all;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log("=".repeat(70));
  console.log(`Mindbody raw location diagnostic - site ${siteId}, ${rangeStart}..${rangeEnd}`);
  console.log("(walking one month at a time; a single giant request times out on Mindbody's side)");
  console.log("=".repeat(70));

  const tokenRes = await fetch("https://api.mindbodyonline.com/public/v6/usertoken/issue", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Api-Key": apiKey!, SiteId: String(siteId) },
    body: JSON.stringify({ Username: `_${sourceName}`, Password: sourcePassword }),
  });
  if (!tokenRes.ok) {
    console.error("Token issue failed:", tokenRes.status, await tokenRes.text());
    process.exit(1);
  }
  const tokenData: any = await tokenRes.json();
  const accessToken = tokenData.AccessToken;
  if (!accessToken) {
    console.error("No AccessToken in response:", JSON.stringify(tokenData));
    process.exit(1);
  }
  console.log("Token issued OK\n");

  const counts = new Map<string, number>();
  const skipped: string[] = [];
  let totalFetched = 0;
  const chunks = monthChunks(rangeStart, rangeEnd);

  for (const { start, end } of chunks) {
    let appts: any[] | null = null;
    for (let attempt = 1; attempt <= 2 && appts === null; attempt++) {
      try {
        appts = await fetchWindow(accessToken, start, end);
      } catch (e: any) {
        if (attempt === 2) {
          console.warn(`  ${start}..${end}: FAILED after retry - ${e?.message || e}`);
          skipped.push(`${start}..${end}`);
        } else {
          await sleep(1000);
        }
      }
    }
    if (appts) {
      totalFetched += appts.length;
      if (appts.length > 0) console.log(`  ${start}..${end}: ${appts.length} appointments`);
      for (const a of appts) {
        const loc = a.Location?.Id ?? a.LocationId ?? null;
        const key = loc === null ? "(none)" : String(loc);
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
  }

  console.log(`\nFetched ${totalFetched} appointment records total`);
  if (skipped.length > 0) {
    console.log(`Skipped ${skipped.length} window(s) after repeated failure: ${skipped.join(", ")}`);
  }

  console.log("\nAppointments by raw Mindbody LocationId (whole site, this date range):");
  for (const [loc, count] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  LocationId=${loc}: ${count}`);
  }
  console.log("\n" + "=".repeat(70));
}

main().catch((e) => {
  console.error("FAILED:", e?.message || e);
  process.exit(1);
});
