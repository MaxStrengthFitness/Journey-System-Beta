import fs from "fs";
import express from "express";
import compression from "compression";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ quiet: true }); // quiet: dotenv 17 otherwise prints a sponsored "tip" line on every boot

import {
  processLegacyChart,
  extractMachineSettingsFromImage,
} from "./server/gemini.ts";
import {
  getMindbodyToken,
  mindbodyGet,
  pullClientCommercial,
  pullClientMaster,
} from "./server/mindbody-client.ts";
import {
  demographicsFromApi,
  joinAddress,
  pickRequestedClient,
} from "./src/lib/mindbody-demographics-map.ts";
import { requireStaff } from "./server/auth.ts";

// Error Handling: Prevent process crash on unhandled rejections
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});
process.on("uncaughtException", (err) => {
  // After an uncaught exception the process is in an undefined state: keeping
  // it alive leaves a half-broken server that still answers requests. Exit and
  // let the host start a clean one. /healthz lets it notice a wedged process.
  console.error("Uncaught Exception:", err);
  process.exit(1);
});

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || "3000", 10);

  // gzip every response big enough to be worth it. Without this, express.static
  // ships raw bytes: the main JS chunk goes out at ~404 kB instead of ~124 kB.
  // Mounted first so it wraps every route and the static handler below.
  app.use(compression());

  // Only the two Gemini image endpoints send big payloads. Applying their 50mb
  // ceiling to every route meant any POST could allocate 50mb, and Render runs
  // this as a single process (WEB_CONCURRENCY=1) on a small instance: a few
  // concurrent large bodies were enough to exhaust its memory.
  const IMAGE_UPLOAD_PATHS = new Set([
    "/api/gemini/processChart",
    "/api/gemini/extractSettings",
  ]);
  const largeJson = express.json({ limit: "50mb" });
  const standardJson = express.json({ limit: "1mb" });

  app.use((req, res, next) =>
    IMAGE_UPLOAD_PATHS.has(req.path)
      ? largeJson(req, res, next)
      : standardJson(req, res, next),
  );

  // Without this, an over-limit body falls to Express's default handler and
  // comes back as an HTML error page, which the client cannot parse.
  app.use(
    (
      err: any,
      req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      if (err?.type === "entity.too.large") {
        console.warn("Rejected oversized body on", req.path);
        return res.status(413).json({ error: "Request body too large" });
      }
      return next(err);
    },
  );

  // Health check for the host's monitor. Deliberately does no I/O: it answers
  // "is this process still able to serve requests", nothing more.
  app.get("/healthz", (_req, res) => {
    res.json({ ok: true, uptime: process.uptime() });
  });

  app.post("/api/gemini/processChart", async (req, res) => {
    try {
      const { images, expectedSessions, pageIndex, totalPages } = req.body;
      const data = await processLegacyChart(
        images,
        expectedSessions,
        pageIndex,
        totalPages,
      );
      res.json(data);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/gemini/extractSettings", async (req, res) => {
    try {
      const { images } = req.body;
      const data = await extractMachineSettingsFromImage(images);
      res.json(data);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/log-error", (req, res) => {
    // Always goes to stdout, which is what the hosting platform captures.
    console.log("CLIENT ERROR:", req.body);

    // The file copy is a local-development convenience only. It used to be a
    // bare appendFileSync: one unhandled throw (read-only or full disk) returned
    // a 500, and a client error storm — the Firestore assertion bug produced
    // 3,664 in one session — blocked the single Node thread on every write,
    // which stalls the whole server.
    if (process.env.NODE_ENV !== "production") {
      fs.appendFile(
        "client-errors.log",
        JSON.stringify(req.body) + "\n",
        (err) => {
          if (err) console.warn("Could not write client-errors.log:", err.message);
        },
      );
    }
    res.json({ ok: true });
  });

  // Background Task: Run Master Sync every 60 minutes
  /*
  const SYNC_INTERVAL = 60 * 60 * 1000;
  setInterval(async () => {
    try {
      // await masterSync();
    } catch (error: any) {
      if (error.code === 'resource-exhausted' || error.message?.toLowerCase().includes('quota')) {
        console.error('Scheduled Master Sync failed due to Quota Exceeded. Skipping until reset.');
      } else {
        console.error('Scheduled Master Sync failed:', error);
      }
    }
  }, SYNC_INTERVAL);

  // Initial sync on startup (optional but recommended)
  // masterSync().catch(err => {
    if (err.code === 'resource-exhausted' || err.message?.toLowerCase().includes('quota')) {
      console.error('Initial Master Sync skipped: Quota Limit Exceeded.');
    } else {
      console.error('Initial Master Sync failed:', err);
    }
  });
  */

  // API Route for Triggering Master Sync Manually
  app.post("/api/trigger-master-sync", async (req, res) => {
    try {
      const { trainerId, hardReset } = req.body;
      // Feature deprecated on server-side. Call handled by frontend.
      res.json({
        success: true,
        message: hardReset
          ? "Master Schedule Hard Reset & Resync triggered successfully"
          : `${trainerId ? "Trainer" : "Master Schedule"} Sync triggered successfully`,
      });
    } catch (error: any) {
      console.error("Manual Sync failed:", error);
      res.status(500).json({ error: error.message || "Sync failed" });
    }
  });

  // Removed diagnostic endpoint that depended on backend sync-logic.ts

  // Every Mindbody route needs a signed-in staff member at a studio on the
  // site it names (Renewals round, Sep 2026). The two testing tools are for
  // system administrators only. See server/auth.ts.
  const staffOnly = requireStaff();
  const adminOnly = requireStaff({ requireSuper: true });
  // Compared the way Express matches routes — ignoring case and a trailing
  // slash — so "/Test-Webhook/" can't slip past as a staff-only path.
  const ADMIN_ONLY_MINDBODY_PATHS = new Set(["/issueusertoken", "/test-webhook"]);
  app.use("/api/mindbody", (req, res, next) =>
    ADMIN_ONLY_MINDBODY_PATHS.has(req.path.replace(/\/+$/, "").toLowerCase())
      ? adminOnly(req, res, next)
      : staffOnly(req, res, next),
  );

  // Mindbody Sandbox Testing Endpoint — issue user token
  app.post("/api/mindbody/issueUserToken", async (req, res) => {
    try {
      const mindbodyApiKey = process.env.MINDBODY_API_KEY;
      if (!mindbodyApiKey) {
        return res.status(500).json({
          error:
            "MINDBODY_API_KEY environment variable is not set. Please add it to the Secrets in Settings.",
        });
      }

      const { siteId, username, password } = req.body || {};

      if (!siteId || !username || !password) {
        return res.status(400).json({
          error: "siteId, username, and password are required.",
        });
      }

      const requestBody = {
        Username: username,
        Password: password,
      };

      const response = await fetch(
        "https://api.mindbodyonline.com/public/v6/usertoken/issue",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Api-Key": mindbodyApiKey,
            SiteId: String(siteId),
          },
          body: JSON.stringify(requestBody),
        },
      );

      if (!response.ok) {
        const errorData = await response.text();
        console.error("Mindbody API Error:", response.status, errorData);
        let parsedError = errorData;
        try {
          const jsonErr = JSON.parse(errorData);
          if (jsonErr?.Error?.Message) {
            parsedError = jsonErr.Error.Message;
          }
        } catch (_) {}
        return res
          .status(response.status)
          .json({ error: `Mindbody API Error: ${parsedError}` });
      }

      const data = await response.json();
      res.json(data);
    } catch (e: any) {
      console.error(e);
      res
        .status(500)
        .json({ error: e.message || "An unexpected error occurred" });
    }
  });

  app.post("/api/mindbody/staff", async (req, res) => {
    try {
      const mindbodyApiKey = process.env.MINDBODY_API_KEY;
      if (!mindbodyApiKey) {
        return res
          .status(500)
          .json({ error: "MINDBODY_API_KEY environment variable is not set." });
      }

      const siteId = req.body?.siteId;

      if (!siteId) {
        return res.status(400).json({ error: "siteId is required" });
      }

      // Get User Token for authenticated access
      let userToken: string | undefined;
      try {
        userToken = await getMindbodyToken(String(siteId));
      } catch (tokenErr: any) {
        console.warn(
          "Could not get Mindbody token for staff, proceeding without:",
          tokenErr.message,
        );
      }

      const staffHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        "Api-Key": mindbodyApiKey,
        SiteId: String(siteId),
      };
      if (userToken) {
        staffHeaders["Authorization"] = userToken;
      }

      const apiResponse = await fetch(
        `https://api.mindbodyonline.com/public/v6/staff/staff?Limit=200`,
        {
          method: "GET",
          headers: staffHeaders,
        },
      );

      if (!apiResponse.ok) {
        const errorText = await apiResponse.text();
        console.error(
          "Mindbody Fetch Staff Error:",
          apiResponse.status,
          errorText,
        );
        let parsedError = errorText;
        try {
          const jsonErr = JSON.parse(errorText);
          if (jsonErr?.Error?.Message) {
            parsedError = jsonErr.Error.Message;
          }
        } catch (_) {}
        return res
          .status(apiResponse.status)
          .json({ error: `Mindbody API Error: ${parsedError}` });
      }

      const data = await apiResponse.json();
      const staffList = data.StaffMembers || data.Staff || data.staff || [];

      const normalized = staffList.map((s: any) => ({
        id: String(s.Id),
        firstName: s.FirstName || "",
        lastName: s.LastName || "",
        fullName: `${s.FirstName || ""} ${s.LastName || ""}`.trim(),
        email: s.Email || "",
        displayName:
          s.DisplayName || `${s.FirstName || ""} ${s.LastName || ""}`.trim(),
        imageUrl: s.ImageUrl || null,
      }));

      res.json({ staff: normalized });
    } catch (e: any) {
      console.error("Fetch staff error:", e);
      res
        .status(500)
        .json({ error: e.message || "Failed to fetch staff list" });
    }
  });

  /**
   * One staff member's photo, from GET /staff/{staffId}/imageurl.
   *
   * Deliberately NOT how photos normally arrive. /api/mindbody/staff above
   * already returns ImageUrl for the whole roster in a single call, and that
   * is what the trainer pickers use. This endpoint is one round trip per
   * person, so it exists only for a deliberate "refresh this photo" press --
   * the Public API is metered and the bulk call is free.
   */
  app.post("/api/mindbody/staff-image", async (req, res) => {
    try {
      const mindbodyApiKey = process.env.MINDBODY_API_KEY;
      if (!mindbodyApiKey) {
        return res
          .status(500)
          .json({ error: "MINDBODY_API_KEY environment variable is not set." });
      }

      const siteId = req.body?.siteId;
      const staffId = req.body?.staffId;
      if (!siteId) return res.status(400).json({ error: "siteId is required" });
      if (!staffId) return res.status(400).json({ error: "staffId is required" });

      let userToken: string | undefined;
      try {
        userToken = await getMindbodyToken(String(siteId));
      } catch (tokenErr: any) {
        console.warn(
          "Could not get Mindbody token for staff image, proceeding without:",
          tokenErr.message,
        );
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Api-Key": mindbodyApiKey,
        SiteId: String(siteId),
      };
      if (userToken) headers["Authorization"] = userToken;

      const apiResponse = await fetch(
        `https://api.mindbodyonline.com/public/v6/staff/${encodeURIComponent(String(staffId))}/imageurl`,
        { method: "GET", headers },
      );

      // A staff member with no photo is the NORMAL answer here, not an error.
      if (apiResponse.status === 404) {
        return res.json({ imageUrl: null });
      }

      if (!apiResponse.ok) {
        const errorText = await apiResponse.text();
        console.error(
          "Mindbody Staff Image Error:",
          apiResponse.status,
          errorText,
        );
        return res
          .status(apiResponse.status)
          .json({ error: `Mindbody API Error: ${errorText.slice(0, 200)}` });
      }

      const data: any = await apiResponse.json().catch(() => null);
      const raw =
        (typeof data === "string" ? data : undefined) ??
        data?.ImageUrl ??
        data?.imageUrl ??
        data?.Staff?.ImageUrl ??
        null;

      // Only https survives. Anything else would be stored and then render as
      // a broken avatar until somebody noticed.
      const imageUrl =
        typeof raw === "string" && /^https:\/\/\S+$/i.test(raw.trim())
          ? raw.trim()
          : null;

      res.json({ imageUrl });
    } catch (e: any) {
      console.error("Fetch staff image error:", e);
      res.status(500).json({ error: e.message || "Failed to fetch staff image" });
    }
  });

  app.post("/api/mindbody/locations", async (req, res) => {
    try {
      const mindbodyApiKey = process.env.MINDBODY_API_KEY;
      if (!mindbodyApiKey) {
        return res
          .status(500)
          .json({ error: "MINDBODY_API_KEY environment variable is not set." });
      }

      const siteId = req.body?.siteId;
      if (!siteId) {
        return res.status(400).json({ error: "siteId is required" });
      }

      let userToken: string | undefined;
      try {
        userToken = await getMindbodyToken(String(siteId));
      } catch (tokenErr: any) {
        console.warn(
          "Could not get Mindbody token for locations, proceeding without token:",
          tokenErr.message,
        );
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Api-Key": mindbodyApiKey,
        SiteId: String(siteId),
      };
      if (userToken) {
        headers["Authorization"] = userToken;
      }

      const apiResponse = await fetch(
        "https://api.mindbodyonline.com/public/v6/site/locations",
        {
          method: "GET",
          headers,
        },
      );

      if (apiResponse.ok) {
        const data = await apiResponse.json();
        const locationsList = data.Locations || data.locations || [];
        const normalized = locationsList.map((loc: any) => ({
          id: String(loc.Id),
          name: loc.Name || `Location ${loc.Id}`,
          address: loc.Address || "",
          city: loc.City || "",
          state: loc.State || "",
        }));
        return res.json({ locations: normalized });
      }

      const siteLocationsStatus = apiResponse.status;
      const siteLocationsError = await apiResponse.text().catch(() => "");
      console.warn(
        `Mindbody /site/locations returned status ${siteLocationsStatus} (${siteLocationsError}), falling back to appointments scan...`,
      );

      // Fallback strategy: Query recent staff appointments to extract active LocationId and Location names
      if (userToken) {
        try {
          const now = new Date();
          const start = now.toISOString().split("T")[0];
          const end = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0];

          const apptParams = new URLSearchParams({
            StartDate: `${start}T00:00:00`,
            EndDate: `${end}T23:59:59`,
            Limit: "100",
          });

          const apptResponse = await fetch(
            `https://api.mindbodyonline.com/public/v6/appointment/staffappointments?${apptParams.toString()}`,
            {
              method: "GET",
              headers,
            },
          );

          if (apptResponse.ok) {
            const apptData = await apptResponse.json();
            const appts = apptData.Appointments || apptData.appointments || [];
            const locMap = new Map<string, string>();

            appts.forEach((a: any) => {
              if (a.LocationId !== undefined && a.LocationId !== null) {
                const locId = String(a.LocationId);
                const locName = a.LocationName || a.Location?.Name || `Location ${locId}`;
                if (!locMap.has(locId)) {
                  locMap.set(locId, locName);
                }
              }
            });

            if (locMap.size > 0) {
              const fallbackLocs = Array.from(locMap.entries()).map(([id, name]) => ({
                id,
                name,
              }));
              return res.json({ locations: fallbackLocs });
            }
          } else {
            const apptErrText = await apptResponse.text().catch(() => "");
            console.warn(`Fallback staffappointments also failed with status ${apptResponse.status}: ${apptErrText}`);
          }
        } catch (fbErr: any) {
          console.warn("Fallback scan error:", fbErr.message);
        }
      }

      // Surface Mindbody's own message rather than the raw JSON envelope so the
      // client has something short enough to show in the form.
      let parsedMessage = siteLocationsError;
      let mindbodyCode: string | undefined;
      try {
        const jsonErr = JSON.parse(siteLocationsError);
        if (jsonErr?.Error?.Message) parsedMessage = jsonErr.Error.Message;
        if (jsonErr?.Error?.Code) mindbodyCode = String(jsonErr.Error.Code);
      } catch (_) {}

      return res.status(siteLocationsStatus).json({
        error: parsedMessage || "Endpoint not found/authorized",
        code: mindbodyCode,
      });
    } catch (e: any) {
      console.error("Fetch locations error:", e);
      res
        .status(500)
        .json({ error: e.message || "Failed to fetch location list" });
    }
  });

  app.post("/api/mindbody/staff-appointments", async (req, res) => {
    try {
      const mindbodyApiKey = process.env.MINDBODY_API_KEY;
      if (!mindbodyApiKey) {
        return res
          .status(500)
          .json({ error: "MINDBODY_API_KEY environment variable is not set." });
      }

      const { siteId, startDate, endDate, staffIds, locationId, keepLocationIds } =
        req.body || {};

      if (!siteId) {
        return res.status(400).json({ error: "siteId is required" });
      }

      const now = new Date();
      const start = startDate || now.toISOString().split("T")[0];
      const end =
        endDate ||
        new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0];

      /*
       * THE PAGES, FETCHED TOGETHER RATHER THAN ONE AFTER ANOTHER.
       *
       * Mindbody's own PaginationResponse.TotalResults is still what decides
       * how many pages there are. What changed (Sep 2026) is that the pages
       * after the first no longer wait for each other. This site alone runs
       * ~3,800+ appointments per 30-day window across its shared studios --
       * eight sequential round trips to Mindbody before the browser is shown
       * anything, which is most of the 30-100 seconds a trainer spends
       * watching the Refresh spinner.
       *
       * Page 1 reports the total, so every remaining offset is known up front
       * and they go out at once.
       *
       * They go through mindbodyGet now rather than a bare fetch, so the
       * token bucket, the Retry-After handling and the per-site breaker cover
       * them. Firing seven pages at once WITHOUT that would be an excellent
       * way to earn a 429 with nothing to catch it.
       *
       * MAX_PAGES is a safety valve and nothing more. The old cap of 2000
       * results silently truncated the answer before every studio's
       * appointments had been fetched -- whichever studio Mindbody happened
       * to return last got cut off entirely, with no error to show for it.
       * See `complete` below for why a short answer is now said out loud.
       */
      const limit = 500;
      const MAX_PAGES = 200;
      const pageParams = (offset: number) => {
        const p: Record<string, string | number | Array<string | number>> = {
          StartDate: `${start}T00:00:00`,
          EndDate: `${end}T23:59:59`,
          Limit: limit,
          Offset: offset,
        };
        if (staffIds && Array.isArray(staffIds) && staffIds.length > 0) {
          p.StaffIds = staffIds.map((id: string | number) => String(id));
        }
        return p;
      };
      const apptsOf = (d: any) => d?.Appointments || d?.appointments || [];

      const tFetch = Date.now();
      const first = await mindbodyGet(
        String(siteId),
        "appointment/staffappointments",
        pageParams(0),
      );

      if (!first.ok) {
        console.error(
          "Mindbody Staff Appointments Error:",
          first.status,
          first.error,
        );
        return res
          .status(first.status || 502)
          .json({ error: `Mindbody API Error: ${first.error}` });
      }

      const allAppointments: any[] = [...apptsOf(first.data)];
      const siteTotal = first.data?.PaginationResponse?.TotalResults || 0;
      let pages = 1;

      /*
       * `complete` answers one question for the browser: is this every
       * appointment Mindbody holds for the window, or only some of them?
       *
       * It matters far more than it looks. The sync marks a booking Cancelled
       * when it is inside the window and absent from this answer. So a short
       * answer does not mean "a bit less data" -- it means real bookings get
       * cancelled in Journey because a page 404'd. That is the Aug 30 storm's
       * second cause repeating: "a transient read failure turned into
       * permanent data loss." A failed read means UNKNOWN, never EMPTY.
       *
       * The sequential loop this replaced had the same hole and simply
       * `break`-ed, handing back a short list that looked whole.
       */
      let complete = true;

      if (allAppointments.length === limit && siteTotal > limit) {
        const offsets: number[] = [];
        for (let o = limit; o < siteTotal; o += limit) offsets.push(o);
        if (offsets.length > MAX_PAGES) {
          offsets.length = MAX_PAGES;
          complete = false;
          console.warn(
            `[staff-appointments] site ${siteId}: ${siteTotal} results exceeds the ${MAX_PAGES}-page valve.`,
          );
        }
        pages += offsets.length;
        const rest = await Promise.all(
          offsets.map((o) =>
            mindbodyGet(
              String(siteId),
              "appointment/staffappointments",
              pageParams(o),
            ),
          ),
        );
        for (const r of rest) {
          if (r.ok) allAppointments.push(...apptsOf(r.data));
          else complete = false;
        }
      }
      const fetchMs = Date.now() - tFetch;

      /*
       * Drop the SIBLING studios' appointments before looking any clients up.
       *
       * The browser has always filtered by location itself and still does --
       * this does not replace that. But doing it only there means a refresh
       * at Willoughby downloads all three Site 29068 studios' appointments,
       * looks up all three studios' clients from Mindbody, and then throws
       * two thirds of the work away. Dropping them here makes the client
       * lookups below, the normalize pass and the JSON the iPad downloads
       * roughly three times smaller on a shared site.
       *
       * WHAT THIS MUST NOT DO is filter down to `locationId` alone. Before
       * the browser narrows to its own location it walks the whole answer and
       * parks every appointment at a location NO studio claims into the Limbo
       * queue -- that queue is the only way a location that came online
       * before anyone mapped it is ever seen. A plain `=== locationId` filter
       * here would starve it silently, which is the exact failure the parking
       * step was built to fix.
       *
       * So: keep mine, keep anything unclaimed, keep anything with no
       * location at all. Drop only what another studio on this site has
       * already claimed -- which is the bulk of it, and the only part nobody
       * downstream looks at.
       *
       * Optional on purpose. A caller that sends no keepLocationIds (an older
       * build, or a studio that owns its whole site) filters nothing here and
       * gets exactly what it did before.
       */
      const wantLocation =
        locationId !== undefined && locationId !== null && String(locationId).trim() !== ""
          ? String(locationId).trim()
          : null;
      const claimedElsewhere = new Set(
        (Array.isArray(keepLocationIds) ? keepLocationIds : [])
          .map((v: string | number) => String(v).trim())
          .filter((v: string) => v !== "" && v !== wantLocation),
      );
      const appointments =
        wantLocation && claimedElsewhere.size > 0
          ? allAppointments.filter((a: any) => {
              const loc = String(a?.Location?.Id ?? a?.LocationId ?? "").trim();
              if (loc === wantLocation) return true;
              if (loc === "") return true;
              return !claimedElsewhere.has(loc);
            })
          : allAppointments;

      const uniqueClientIds = [
        ...new Set(
          appointments
            .map((a: any) => a.Client?.Id || a.ClientId)
            .filter((id: any) => id != null)
            .map((id: any) => String(id)),
        ),
      ];

      const clientNameMap: Record<
        string,
        {
          firstName: string;
          lastName: string;
          email: string;
          phone: string;
          dateOfBirth: string;
          gender: string;
          address: string;
          photoUrl: string;
          emergencyContactName: string;
          emergencyContactPhone: string;
        }
      > = {};

      /*
       * 20 is Mindbody's hard ceiling for client/clients, not a tuning knob.
       * Asking for 21 is refused outright with HTTP 400 "ClientIds should not
       * be more than 20" -- confirmed against site 29068, Sep 22 2026.
       *
       * These also go through mindbodyGet now. They are the likeliest place
       * in the whole app to meet a 429: on a busy 30-day window this fires
       * thirty-odd lookups simultaneously, and before the floor existed
       * nothing would have retried a single one of them. A lookup that fails
       * costs only the fallback name fields, never a booking, so unlike the
       * pages above it does not touch `complete`.
       */
      const BATCH_SIZE = 20;
      const batchPromises = [];

      const tClients = Date.now();
      for (let i = 0; i < uniqueClientIds.length; i += BATCH_SIZE) {
        const batch = uniqueClientIds.slice(i, i + BATCH_SIZE);
        batchPromises.push(
          mindbodyGet(String(siteId), "client/clients", {
            ClientIds: batch as string[],
            Limit: BATCH_SIZE,
          }).then((r) => (r.ok ? r.data?.Clients || [] : [])),
        );
      }

      const clientResults = await Promise.all(batchPromises);
      const clientsMs = Date.now() - tClients;
      clientResults.flat().forEach((c: any) => {
        if (c && c.Id != null) {
          const cId = String(c.Id);
          clientNameMap[cId] = {
            firstName: c.FirstName || "",
            lastName: c.LastName || "",
            email: c.Email || "",
            phone: c.MobilePhone || c.HomePhone || c.WorkPhone || "",
            dateOfBirth: c.BirthDate ? c.BirthDate.split("T")[0] : "",
            gender: c.Gender || "",
            address: c.AddressLine1 || "",
            photoUrl: c.PhotoUrl || "",
            emergencyContactName: c.EmergencyContactInfoName || "",
            emergencyContactPhone: c.EmergencyContactInfoPhone || "",
          };
        }
      });

      const normalized = appointments.map((appt: any) => {
        const clientId = String(appt.Client?.Id || appt.ClientId || "");
        const clientInfo = clientNameMap[clientId];

        return {
          Id: appt.Id,
          StaffId: appt.Staff?.Id || appt.StaffId,
          StaffFirstName: appt.Staff?.FirstName || appt.StaffFirstName || "",
          StaffLastName: appt.Staff?.LastName || appt.StaffLastName || "",
          ClientId: clientId || null,
          ClientFirstName:
            appt.Client?.FirstName || clientInfo?.firstName || "",
          ClientLastName: appt.Client?.LastName || clientInfo?.lastName || "",
          ClientEmail: appt.Client?.Email || clientInfo?.email || "",
          ClientPhone: appt.Client?.MobilePhone || appt.Client?.HomePhone || clientInfo?.phone || "",
          ClientDOB: clientInfo?.dateOfBirth || "",
          ClientGender: clientInfo?.gender || "",
          ClientAddress: clientInfo?.address || "",
          ClientPhotoUrl: appt.Client?.PhotoUrl || clientInfo?.photoUrl || "",
          ClientEmergencyName: clientInfo?.emergencyContactName || "",
          ClientEmergencyPhone: clientInfo?.emergencyContactPhone || "",
          StartDateTime: appt.StartDateTime,
          EndDateTime: appt.EndDateTime,
          Status: appt.Status,
          SessionTypeName:
            appt.SessionType?.Name ||
            appt.SessionTypeName ||
            "Training Session",
          LocationId: appt.Location?.Id || appt.LocationId || null,

          // Pass / waitlist / visit-count passthrough. This normalizer is a
          // whitelist — anything not listed here is dropped before the app ever
          // sees it, which is why these have to be named explicitly.
          //
          // Mindbody's published appointment schema does not document these
          // (they appear on CLASS bookings), so they may simply be absent. Read
          // from several shapes and pass null through; the client-side
          // extractor ignores nulls, so an absent field writes nothing.
          ClientPassId:
            appt.ClientPassId ?? appt.ClientPass?.Id ?? null,
          ClientPassSessionsTotal:
            appt.ClientPassSessionsTotal ?? appt.ClientPass?.SessionsTotal ?? null,
          ClientPassSessionsDeducted:
            appt.ClientPassSessionsDeducted ??
            appt.ClientPass?.SessionsDeducted ??
            null,
          ClientPassSessionsRemaining:
            appt.ClientPassSessionsRemaining ??
            appt.ClientPass?.SessionsRemaining ??
            null,
          ClientPassActivationDateTime:
            appt.ClientPassActivationDateTime ??
            appt.ClientPass?.ActivationDateTime ??
            null,
          ClientPassExpirationDateTime:
            appt.ClientPassExpirationDateTime ??
            appt.ClientPass?.ExpirationDateTime ??
            null,
          BookingOriginatedFromWaitlist:
            appt.BookingOriginatedFromWaitlist ?? null,
          ClientsNumberOfVisitsAtSite:
            appt.ClientsNumberOfVisitsAtSite ??
            appt.Client?.NumberOfVisitsAtSite ??
            null,
        };
      });

      console.log(
        `[staff-appointments] site ${siteId}` +
          (wantLocation ? ` loc ${wantLocation}` : "") +
          ` ${start}..${end}: ${pages} page(s) ${fetchMs}ms, ` +
          `${allAppointments.length}/${siteTotal} appts` +
          (appointments.length !== allAppointments.length
            ? ` -> ${appointments.length} after dropping siblings`
            : "") +
          `, ${batchPromises.length} client lookup(s) ${clientsMs}ms` +
          (complete ? "" : " -- INCOMPLETE, sweep suppressed"),
      );

      res.json({
        appointments: normalized,
        total: normalized.length,
        /* See `complete` above: the browser must not run its cancellation
         * sweep against a short answer. */
        complete,
        siteTotal,
      });
    } catch (e: any) {
      console.error("Staff appointments error:", e);
      res
        .status(500)
        .json({ error: e.message || "Failed to fetch staff appointments" });
    }
  });

  /**
   * One client's person-facts from Mindbody, looked up BY ID ONLY.
   *
   * Master Sync round (Sep 2026): the name search this route used to fall
   * back to is gone. A name can match someone else, and the answer was
   * written onto the profile — CLAUDE.md: no name matching, ever. A client
   * with no Mindbody id gets found:false and a sentence, never a guess.
   * New code should call /api/mindbody/client-master-sync instead; this
   * route stays for the older profile sheet.
   */
  app.post("/api/mindbody/client-demographics", async (req, res) => {
    try {
      if (!process.env.MINDBODY_API_KEY) {
        return res
          .status(500)
          .json({ error: "MINDBODY_API_KEY environment variable is not set." });
      }

      const { siteId, mindbodyClientId } = req.body || {};
      if (!siteId) {
        return res.status(400).json({ error: "siteId is required" });
      }
      const id = String(mindbodyClientId ?? "").trim();
      if (!id) {
        return res.status(400).json({
          found: false,
          error:
            "This client has no Mindbody ID yet, so Journey can't look them up. (Journey never matches clients by name.)",
        });
      }

      // Only the caller's own site. Retrying against the sandbox (-99) used to
      // return demo records that were then written onto real client profiles.
      const site = String(siteId);
      const lookup = await mindbodyGet(site, "client/clients", {
        ClientIds: [id],
        IncludeInactive: true,
        Limit: 10,
      });
      if (!lookup.ok) {
        return res
          .status(502)
          .json({ error: `MindBody API Response: ${lookup.error.slice(0, 300)}` });
      }
      const raw = pickRequestedClient(lookup.data?.Clients, id);
      if (!raw) {
        // Non-2xx so an older caller shows the sentence instead of writing nothing silently.
        return res.status(404).json({
          found: false,
          error: `MindBody has no client with ID ${id} on site ${site}.`,
        });
      }

      const d = demographicsFromApi(raw);
      return res.json({
        found: true,
        mindbodyClientId: d.mindbodyClientId || id,
        firstName: d.firstName ?? "",
        lastName: d.lastName ?? "",
        email: d.email ?? "",
        phone: d.phone ?? "",
        dateOfBirth: d.dateOfBirth ?? "",
        gender: d.gender ?? "",
        address: joinAddress(d.addressLine1, d.addressLine2) ?? "",
        city: d.city ?? "",
        state: d.state ?? "",
        postalCode: d.postalCode ?? "",
        country: d.country ?? "",
        photoUrl: d.photoUrl ?? "",
        emergencyContactName: d.emergencyContactName ?? "",
        emergencyContactPhone: d.emergencyContactPhone ?? "",
        // Mindbody's account notes. Kept separate from the app's trainer-authored
        // `notes` field -- the caller writes this to `mindbodyNotes`.
        notes: d.notes ?? "",
      });
    } catch (error: any) {
      console.error("Error fetching MindBody client demographics:", error);
      return res.status(500).json({ error: error.message || "Server error" });
    }
  });

  /**
   * MASTER SYNC (Sep 2026) — one tap, everything Mindbody knows about one
   * client: person-facts, address, status, waiver, "client since", first
   * visit, lifetime visits, contracts, pricing options and memberships.
   *
   * Looked up by Mindbody id only (never by name), on the site the request
   * names — server/auth.ts has already checked the caller may ask about it.
   * Nothing is written here: the web service has no database key, so the
   * browser writes the result (src/lib/mindbody-master-sync.ts).
   *
   *   200 { found: false, … }           Mindbody has no such client.
   *   200 { found: true, demographics, commercial, visits, partial, failed }
   *       A part that couldn't be read is null and named in `failed`
   *       (unknown, never "none"); `visits` is best-effort.
   *   502                               The lookup itself failed — unknown.
   *
   * Cost: five Mindbody calls for a found client, one for a missing one.
   */
  app.post("/api/mindbody/client-master-sync", async (req, res) => {
    try {
      if (!process.env.MINDBODY_API_KEY) {
        return res
          .status(500)
          .json({ error: "MINDBODY_API_KEY environment variable is not set." });
      }
      const { siteId, mindbodyClientId } = req.body || {};
      if (!siteId) return res.status(400).json({ error: "siteId is required" });
      const id = String(mindbodyClientId ?? "").trim();
      if (!id) {
        return res.status(400).json({ error: "mindbodyClientId is required" });
      }

      const pull = await pullClientMaster(String(siteId).trim(), id);
      if (!pull.response) {
        return res.status(502).json({
          error: `MindBody didn't answer the client lookup (HTTP ${pull.status}): ${pull.error.slice(0, 300)}`,
        });
      }
      return res.json(pull.response);
    } catch (error: any) {
      console.error("Error running MindBody master sync:", error);
      return res.status(500).json({ error: error.message || "Server error" });
    }
  });

  /**
   * Pulls a client's contracts, pricing options and active memberships from
   * Mindbody (server/mindbody-client.ts does the calling).
   *
   * The `clientContract.*` / `clientMembershipAssignment.*` webhooks only fire
   * on future changes and only reach the live project, so this is how existing
   * clients (and any non-live environment) get populated. The response is
   * shaped to match the webhook's Firestore records so both writers agree.
   *
   * `services` (pricing options, with each one's remaining sessions) and each
   * contract's `upcomingAutopayEvents` were added in the Renewals round. A
   * list that failed to load comes back as null — unknown, not empty.
   */
  app.post("/api/mindbody/client-commercial", async (req, res) => {
    try {
      if (!process.env.MINDBODY_API_KEY) {
        return res
          .status(500)
          .json({ error: "MINDBODY_API_KEY environment variable is not set." });
      }

      const { siteId, mindbodyClientId } = req.body || {};
      if (!siteId) return res.status(400).json({ error: "siteId is required" });
      if (!mindbodyClientId) {
        return res.status(400).json({ error: "mindbodyClientId is required" });
      }

      const pull = await pullClientCommercial(
        String(siteId).trim(),
        String(mindbodyClientId).trim(),
      );

      if (!pull.contracts && !pull.memberships && !pull.services) {
        return res.status(502).json({ error: `MindBody API Response: ${pull.error}` });
      }

      return res.json({
        contracts: pull.contracts ?? [],
        memberships: pull.memberships ?? [],
        services: pull.services,
        partial: !pull.contracts || !pull.memberships || !pull.services,
      });
    } catch (error: any) {
      console.error("Error fetching MindBody client commercial data:", error);
      return res.status(500).json({ error: error.message || "Server error" });
    }
  });

  app.post("/api/mindbody/test-webhook", async (req, res) => {
    // Off unless asked for (Sep 24 2026). It posts a fake client,
    // "test-client-001", to the LIVE webhook — which is how that record got
    // into production in August. Practice data belongs in Demo Mode; set
    // ALLOW_WEBHOOK_TEST=1 on a server that is not production to use this.
    if (process.env.ALLOW_WEBHOOK_TEST !== "1") {
      return res.status(403).json({
        error: "The webhook test is switched off: it writes a fake client into the live database. Use Demo Mode for practice.",
      });
    }
    try {
      const webhookSecret = process.env.MINDBODY_WEBHOOK_SECRET;
      const configPath = path.resolve(
        process.cwd(),
        "firebase-applet-config.json",
      );
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      const projectId = config.projectId;
      const webhookUrl =
        req.body?.webhookUrl ||
        `https://us-central1-${projectId}.cloudfunctions.net/mindbodyWebhook`;

      const testPayload = JSON.stringify({
        messageId: `test-${Date.now()}`,
        eventId: "clientUpdated",
        eventName: "clientUpdated",
        eventData: {
          clientId: "test-client-001",
          firstName: "Test",
          lastName: "Client",
          membershipStatus: "Active",
          siteId: req.body?.siteId,
        },
      });

      // Signed exactly as Mindbody signs (functions/src/mindbody/
      // verifySignature.ts): HMAC-SHA-256 keyed with the secret as a UTF-8
      // string, sent as `sha256={base64}`. There is no unsigned fallback any
      // more: the webhook no longer accepts the old "test-signature" header.
      if (!webhookSecret) {
        return res.status(400).json({
          error: "MINDBODY_WEBHOOK_SECRET is not set on this server, so a test event cannot be signed.",
        });
      }
      const crypto = await import("crypto");
      const signatureHeader =
        "sha256=" +
        crypto
          .createHmac("sha256", Buffer.from(webhookSecret, "utf8"))
          .update(testPayload, "utf8")
          .digest("base64");

      const webhookResponse = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-mindbody-signature": signatureHeader,
        },
        body: testPayload,
      });
      const responseText = await webhookResponse.text();

      res.json({
        success: webhookResponse.ok,
        statusCode: webhookResponse.status,
        response: responseText,
        webhookUrl,
      });
    } catch (e: any) {
      console.error("Test webhook error:", e);
      res.status(500).json({ error: e.message || "Webhook test failed" });
    }
  });

  // Any /api path that reached this point matched no route above. Answer with
  // JSON, not the SPA shell: the catch-all further down would hand back
  // index.html, so a typo'd endpoint looks like a successful HTML response to
  // fetch() and fails later with a confusing JSON parse error.
  app.use("/api", (req, res) => {
    res.status(404).json({ error: "Not found", path: req.originalUrl });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    // Imported here rather than at the top of the file so production never
    // pulls Vite (and its Rollup/esbuild dependency graph) into memory at boot.
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");

    // Vite stamps a content hash into every asset filename
    // (index-BycyQ8Hk.js), so the bytes behind a given URL can never change.
    // That makes them safe to cache for a year, which removes ~20 revalidation
    // round-trips from every page load.
    app.use(
      "/assets",
      express.static(path.join(distPath, "assets"), {
        maxAge: "1y",
        immutable: true,
      }),
    );

    // Anything else in dist has no hash in its name, so keep it short-lived.
    // index: false leaves "/" to the catch-all below.
    app.use(express.static(distPath, { index: false, maxAge: "1h" }));

    // A missing chunk must 404. Falling through to index.html returns
    // "200 OK" with HTML in it, and the browser then tries to parse that HTML
    // as JavaScript: "Uncaught SyntaxError: Unexpected token '<'".
    app.use("/assets", (req, res) => {
      res.status(404).type("text/plain").send("Not found");
    });

    // index.html is the file that names the hashed assets above. A cached copy
    // pins the browser to a previous deploy's filenames, so it must always be
    // revalidated.
    app.get("*", (req, res) => {
      res.set("Cache-Control", "no-cache");
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
