import firebaseConfig from "../../../firebase-applet-config.json";

/**
 * THE PC BUILD'S MARK (Oct 10 2026).
 *
 * `npm run dev` on AJ's PC talks to PRODUCTION (CLAUDE.md, Environments: the
 * local .env points at the live project), so once trainers are on the app a
 * test on the PC, or on an iPad pointed at the PC, writes real client
 * records. This one line says so on every screen of the shell, the Active
 * Session included: "PC build · live data".
 *
 * Built to four rules:
 *
 *  - Never in a production build. `import.meta.env.DEV` is false there and
 *    Vite replaces it at build time, so the whole body below the first line
 *    is dead code and its words are not in the bundle (the perf lab's build
 *    is a production build too, so it never draws this either).
 *  - It covers nothing. It is a line in the shell's flow, a sibling of the
 *    Demo Mode strip under the status-bar strip, so the screen below it is
 *    simply one line shorter; it pays no inset (features/home-screen).
 *  - Nothing to tap. No button, no dismiss: a mark you can close is a mark
 *    you forget.
 *  - Plum, the caution colour (the Navy Frame): --eq-warn words on
 *    --eq-warn-fill, 4.8:1 light and 5.2:1 dark, 12px bold as written.
 *
 * The words follow the project the build talks to, so they stay true if
 * .env is ever pointed at a test project.
 */

/** The live Firebase project (CLAUDE.md, Environments). */
export const LIVE_PROJECT_ID = "gen-lang-client-0731527386";

/** The mark's words for a development build, or null for none. */
export function environmentWords(build: { perfLab: boolean; projectId: string | null | undefined }): string | null {
  if (build.perfLab) return null;
  return build.projectId === LIVE_PROJECT_ID ? "PC build · live data" : "PC build · test data";
}

export function EnvironmentMark({ projectId }: { projectId?: string | null } = {}) {
  if (!import.meta.env.DEV) return null;
  const words = environmentWords({
    perfLab: import.meta.env.VITE_PERF_LAB === "1",
    projectId: projectId === undefined ? firebaseConfig.projectId : projectId,
  });
  if (!words) return null;
  return (
    <p
      role="note"
      data-environment-mark
      className="flex-none flex items-center justify-center px-3 min-h-[22px] border-b border-(--eq-warn) bg-(--eq-warn-fill) text-(--eq-warn) text-[12px] font-bold select-none pointer-events-none"
    >
      {words}
    </p>
  );
}
