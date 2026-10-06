import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';

/*
 * THE BUILD'S NAME (new-version round, Sep 26 2026). Every production build is
 * named by the moment it was made, plus the commit when Render says which one
 * it is building. The time makes every build's name unique: the same commit
 * rebuilt with different settings produces different files, and an open app
 * must see that as a new version. The commit is only there so a person reading
 * a bug report can find the code. Neither is a secret.
 *
 * The app carries the name (`__APP_BUILD__`, read by
 * src/features/new-version/build.ts), and the build writes it beside the app
 * as `version.json`, which server.ts sends uncached. An open app compares the
 * two to learn that a deploy has happened. Outside a build (the dev server,
 * the tests) the name is "dev", and nothing compares anything.
 */
function buildName(): string {
  const at = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const commit = (process.env.RENDER_GIT_COMMIT || '').trim().slice(0, 7);
  return commit ? `${at}-${commit}` : at;
}

function versionFile(build: string): Plugin {
  return {
    name: 'journey-version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: `${JSON.stringify({ build })}\n`,
      });
    },
  };
}

/*
 * THE PERF LAB'S BUILD CAN NEVER SHIP (harness/perf-lab, Oct 6 2026). With
 * VITE_PERF_LAB=1 the app talks only to Firebase emulators on 127.0.0.1
 * (src/perf-lab-hook.ts): deployed, every iPad would lose the app. So a lab
 * build is refused into dist/ (what server.ts serves) and on Render, and it
 * carries a marker file that server/served-files.ts refuses to serve
 * (PERF_LAB_MARKER there; the same name here).
 */
const PERF_LAB_MARKER = 'PERF-LAB-BUILD.txt';
function perfLabGuard(): Plugin {
  let lab = false;
  return {
    name: 'journey-perf-lab-guard',
    apply: 'build',
    configResolved(config) {
      lab = config.env.VITE_PERF_LAB === '1' || process.env.VITE_PERF_LAB === '1';
      if (!lab) return;
      const out = path.resolve(config.root, config.build.outDir);
      if (process.env.RENDER || out === path.resolve(config.root, 'dist')) {
        throw new Error('VITE_PERF_LAB=1 builds the perf lab app, which talks only to local emulators: never into dist/ and never on Render. Unset it.');
      }
    },
    generateBundle() {
      if (!lab) return;
      this.emitFile({
        type: 'asset',
        fileName: PERF_LAB_MARKER,
        source: 'A perf lab build (harness/perf-lab): it talks only to local Firebase emulators. Never deploy it.\n',
      });
    },
  };
}

export default defineConfig(({ command }) => {
  const appBuild = command === 'build' ? buildName() : 'dev';
  return {
    plugins: [react(), tailwindcss(), versionFile(appBuild), perfLabGuard()],
    // The ONLY `define`, and it is the build's name above: public on purpose.
    //
    // No `define` for GEMINI_API_KEY. `define` is a build-time text
    // substitution into the CLIENT bundle: any component that referenced
    // process.env.GEMINI_API_KEY would have shipped the real key to every
    // browser in a public .js file. The key is server-only and server/gemini.ts
    // reads it from the real environment at runtime.
    define: {
      __APP_BUILD__: JSON.stringify(appBuild),
    },
    build: {
      outDir: "dist",
      emptyOutDir: false,
      rollupOptions: {
        output: {
          codeSplitting: {
            groups: [
              // ORDER MATTERS. Higher priority wins a module, and the whole
              // point of this list is WHICH group the small shared utilities
              // land in -- see the note above `vendor-ui`.
              {
                name: "vendor-react",
                priority: 100,
                test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              },
              // The shared utility stack, pinned ABOVE charts on purpose.
              //
              // This is the whole fix. recharts is not reachable from
              // main.tsx -- every screen that charts is lazy -- but it shares
              // clsx/reselect/react-is/use-sync-external-store with the app
              // shell. Left unpinned those land in whichever group claims
              // them first, and when that was `vendor-charts` the entry ended
              // up with a live import edge into it: one binding dragging
              // recharts, d3, redux and immer onto the LOGIN SCREEN. 107 kB
              // gzipped that nobody signing in will ever execute.
              //
              // Pinning them into vendor-ui (which is eager anyway) cuts that
              // edge. Do not move this below the charts group.
              //
              // ONLY the pinned utilities (the speed round, Oct 5 2026, R13).
              // This group used to hold lucide-react and @base-ui as well, and
              // a group claims a package's modules wherever they are imported:
              // every icon and every Base UI widget used on ANY screen (226
              // icons, select, tabs, switch, menubar...) rode in this eager
              // file, though the first screen draws 72 icons and four widgets,
              // and adding an icon anywhere changed the file every iPad had
              // cached. Icons and Base UI now split with the screens that use
              // them. They share nothing with recharts, so the edge above
              // stays cut: index.html must never modulepreload vendor-charts
              // (scripts/check-bundle-budget.mjs refuses a build that does).
              {
                name: "vendor-ui",
                priority: 90,
                test: /node_modules[\\/](clsx|tailwind-merge|class-variance-authority|reselect|use-sync-external-store|react-is)[\\/]/,
              },
              // Drag and drop is only reachable from lazy screens, so it gets
              // its own file rather than riding along with the icons.
              {
                name: "vendor-dnd",
                priority: 85,
                test: /node_modules[\\/]@dnd-kit[\\/]/,
              },
              // Firestore is by far the largest part of the Firebase SDK and
              // it ships new versions often. Keeping it apart from app/auth
              // means a Firestore bump does not invalidate the auth chunk in
              // every returning browser's cache, and vice versa.
              //
              // Note: this does NOT shrink first paint on its own.
              // src/firebase.ts calls initializeFirestore at module scope, so
              // both chunks still load before anything renders. Deferring
              // that init behind a dynamic import is a separate change, and
              // the biggest one left: ~100 kB gzip.
              {
                name: "vendor-firebase-firestore",
                priority: 80,
                test: /node_modules[\\/](firebase[\\/]firestore|@firebase[\\/]firestore|@firebase[\\/]webchannel-wrapper)/,
              },
              // Not the Functions SDK (the speed round, Oct 5 2026, R13): its
              // one caller loads it on a button press (Admins -> System
              // tools), and a group claims a package wherever it is
              // imported, so leaving it in here put it on the first screen.
              {
                name: "vendor-firebase",
                priority: 70,
                test: /node_modules[\\/](firebase[\\/](?!functions[\\/])|@firebase[\\/](?!functions[\\/]))/,
              },
              {
                name: "vendor-motion",
                priority: 60,
                test: /node_modules[\\/](motion|framer-motion|motion-dom|motion-utils)[\\/]/,
              },
              // Charts, LAST among the named vendors. recharts pulls most of
              // d3 under it and several screens import it, so it earns its
              // own stable cacheable file -- it just must not get first claim
              // on anything the shell also uses.
              {
                name: "vendor-charts",
                priority: 50,
                test: /node_modules[\\/](recharts|victory-vendor|d3-|internmap|delaunator|robust-predicates)/,
              },
              // The first screen's own code, in ONE file (the speed round,
              // Oct 5 2026, R13). `$initial` is rolldown's tag for a module
              // the entry imports statically, directly or not: exactly what
              // index.html makes every iPad fetch before it can draw. Without
              // this group the bundler cut that code into dozens of small
              // files wherever a lazy screen shared a module with the shell
              // (68 modulepreloads after the bundle diet), each its own
              // request and its own gzip window. Lowest priority, so every
              // vendor group above keeps its own modules; a lazy screen's
              // code is never `$initial`, so nothing moves onto the first
              // screen. The eager stylesheets merge the same way; the theme
              // tokens resolve to the same values in light, dark and both
              // system modes (checked when this landed).
              {
                name: "app-shell",
                priority: 10,
                tags: ["$initial"],
                test: /[\\/]src[\\/]/,
              },
            ],
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, 'src'),
        'react': path.resolve(import.meta.dirname, 'node_modules/react'),
        'react-dom': path.resolve(import.meta.dirname, 'node_modules/react-dom'),
      },
    },
    server: {
      // Hot reload, with an escape hatch. Set DISABLE_HMR=true to keep the
      // socket but suppress the error overlay — useful when a tool is
      // rewriting files underneath the dev server and every save would
      // otherwise flash a full-screen error for a few hundred milliseconds.
      //
      // A second dev server (a preview given a free PORT because 3000 was
      // taken) must not share Vite's default socket, 24678: its page would
      // connect to the FIRST server's socket and reload forever. So off 3000
      // the socket takes the port after the app's own. On 3000 nothing changes.
      hmr: (() => {
        const overlay = process.env.DISABLE_HMR !== 'true';
        const appPort = Number(process.env.PORT || 3000);
        if (appPort !== 3000) return overlay ? { port: appPort + 1 } : { port: appPort + 1, overlay: false };
        return overlay ? true : { overlay: false };
      })(),
    },
  };
});
