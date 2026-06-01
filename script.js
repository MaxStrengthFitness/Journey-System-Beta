const fs = require("fs");
const file = "src/components/mindbody/SyncStatusBadge.tsx";
let code = fs.readFileSync(file, "utf8");

code = code.replace(
  /function deriveDisplay\(health: MindbodyHealth\): DisplayState \{[\s\S]*?return \{ visual, label \};\n\}/,
  `function deriveDisplay(health: MindbodyHealth): DisplayState {
  if (health.subscriptionError) {
    return { visual: "error", label: "Health sync error" };
  }

  if (health.status === "error") {
    return { visual: "degraded", label: "⚠️ Mindbody Sync Delayed" };
  }

  const visual = health.status;
  let label = "";

  if (visual === "healthy") {
    label = "";
  } else if (visual === "degraded") {
    if (!health.lastSuccessfulEventAt) {
      label = "Stale (never synced)";
    } else {
      const ms = Math.max(
        0,
        Date.now() - health.lastSuccessfulEventAt.getTime(),
      );
      const s = Math.floor(ms / 1000);
      const m = Math.floor(s / 60);
      const h = Math.floor(m / 60);

      if (s < 60) label = \`Stale ${s}s\`;
      else if (m < 60) label = \`Stale ${m}m\`;
      else if (h < 24) label = \`Stale ${h}h\`;
      else label = \`Stale 1d+\`;
    }
  } else if (visual === "offline") {
    label = "Offline";
  }

  return { visual, label };
}`
);

fs.writeFileSync(file, code);
