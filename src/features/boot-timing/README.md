# Boot timing

How long an open of Journey took (the speed round, Oct 5 2026, R30, the code
half). `boot-timing.ts` is the whole of it.

- **Three marks** on the browser's timeline, once a page load:
  `journey:auth-ready` (Firebase said who is signed in, `useAuthInitialization`),
  `journey:trainer-ready` (the app opened on the trainer record) and
  `journey:hub-data` (the Hub's day first answered, AppContent). Safari's Web
  Inspector shows them on a cabled iPad.
- **One report on a cold open.** No `journey_boot_seen` in this tab's
  sessionStorage means the tab had not opened Journey before: a first open, or
  an iPad that evicted the tab or killed the Home Screen app. Then ONE report
  goes through the client error reporter (`lib/client-error-report.ts`,
  `sendClientReport`: the same endpoint and cap, kept out of the feedback
  drawer's recent errors) as `type`/`kind` `"boot"`: the marks in ms since the
  page started, cold or warm, Safari tab or Home Screen app, the user agent and
  the build. Nothing about the person.
- It goes when the Hub's data lands, or after a minute with whatever marks
  there are. Never awaited, never blocking, never offline, never twice, under
  2 KB (the server caps the endpoint at 16 KB and about 60 a minute per
  address).

What to read from the server log (`CLIENT ERROR: { type: 'boot', ... }`): the
Home Screen app's user agent (whether it pays Auth's iframe, R14), how many cold
opens an iPad has in a floor day, and auth-ready / trainer-ready / hub-data in
the field.
