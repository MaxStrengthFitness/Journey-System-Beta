/**
 * READ-ONLY diagnostic: what does Mindbody itself say about a site's
 * appointments, broken down by LocationId?
 *
 * This bypasses the app and Firestore entirely and calls Mindbody's API
 * directly, using the same token-issue + staffappointments flow as
 * getMindbodyToken() / the /api/mindbody/staff-appointments route in
 * server.ts. It also removes the app's own 2000-row pagination cap so it can
 * report the TRUE total, in case that cap is hiding data.
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
const start = flag("start") || "2018-01-01";
const end = flag("end") || "2026-10-01";

if (!apiKey || !sourceName || !sourcePassword) {
  console.error("Missing MINDBODY_API_KEY / MINDBODY_SOURCE_NAME / MINDBODY_SOURCE_PASSWORD in .env");
  process.exit(1);
}

async function main() {
  console.log("=".repeat(70));
  console.log(`Mindbody raw location diagnostic - site ${siteId}, ${start}..${end}`);
  console.log("=".repeat(70));

  const tokenRes = await fetch("https://api.mindbodyonline.com/public/v6/usertoken/issue", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Api-Key": apiKey,
      SiteId: String(siteId),
    },
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
          "Api-Key": apiKey,
          SiteId: String(siteId),
          Authorization: accessToken,
        },
      },
    );
    if (!res.ok) {
      console.error("staffappointments failed:", res.status, await res.text());
      break;
    }
    const data: any = await res.json();
    const page = data.Appointments || data.appointments || [];
    all.push(...page);
    if (totalResults === null) {
      totalResults = data.PaginationResponse?.TotalResults ?? page.length;
      console.log(`Mindbody reports TotalResults = ${totalResults}`);
    }
    offset += limit;
    if (page.length < limit || all.length >= (totalResults || 0) || offset > 12000) break;
  }

  console.log(`Fetched ${all.length} appointment records\n`);

  const counts = new Map<string, number>();
  for (const a of all) {
    const loc = a.Location?.Id ?? a.LocationId ?? null;
    const key = loc === null ? "(none)" : String(loc);
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  console.log("Appointments by raw Mindbody LocationId (whole site, this date range):");
  for (const [loc, count] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  LocationId=${loc}: ${count}`);
  }
  console.log("\n" + "=".repeat(70));
}

main().catch((e) => {
  console.error("FAILED:", e?.message || e);
  process.exit(1);
});
