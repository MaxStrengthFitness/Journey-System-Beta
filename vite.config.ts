import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    // No `define` for GEMINI_API_KEY. `define` is a build-time text
    // substitution into the CLIENT bundle: any component that referenced
    // process.env.GEMINI_API_KEY would have shipped the real key to every
    // browser in a public .js file. The key is server-only and server/gemini.ts
    // reads it from the real environment at runtime.
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
              {
                name: "vendor-ui",
                priority: 90,
                test: /node_modules[\\/](lucide-react|@base-ui|clsx|tailwind-merge|class-variance-authority|reselect|use-sync-external-store|react-is)[\\/]/,
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
              {
                name: "vendor-firebase",
                priority: 70,
                test: /node_modules[\\/](firebase|@firebase)[\\/]/,
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
      hmr: process.env.DISABLE_HMR !== 'true' ? true : { overlay: false },
    },
  };
});
