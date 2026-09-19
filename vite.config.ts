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
          // Big third-party libraries get their own files ("chunks").
          // They rarely change between releases, so returning browsers
          // reuse the cached copy instead of re-downloading them.
          manualChunks(id) {
            if (!id.includes("node_modules")) return undefined;
            if (
              id.includes("node_modules/react/") ||
              id.includes("node_modules/react-dom/") ||
              id.includes("node_modules/scheduler/")
            )
              return "vendor-react";
            // Firestore is by far the largest part of the Firebase SDK and it
            // ships new versions often. Keeping it apart from app/auth means a
            // Firestore bump does not invalidate the auth chunk in every
            // returning browser's cache, and vice versa.
            //
            // Note: this does NOT shrink first paint on its own. src/firebase.ts
            // calls initializeFirestore at module scope, so both chunks still
            // load before anything renders. Deferring that init behind a dynamic
            // import is a separate change.
            if (
              id.includes("node_modules/firebase/firestore") ||
              id.includes("node_modules/@firebase/firestore") ||
              id.includes("node_modules/@firebase/webchannel-wrapper")
            )
              return "vendor-firebase-firestore";
            if (
              id.includes("node_modules/firebase/") ||
              id.includes("node_modules/@firebase/")
            )
              return "vendor-firebase";
            if (
              id.includes("node_modules/motion/") ||
              id.includes("node_modules/framer-motion/") ||
              id.includes("node_modules/motion-dom/") ||
              id.includes("node_modules/motion-utils/")
            )
              return "vendor-motion";
            // Charts. Recharts pulls in most of d3 underneath it, and several
            // screens import it, so before this rule Rollup lumped all of it
            // into whichever shared chunk it hit first - a 444 kB file named
            // after a small hook (useLiveRenewal) that happened to be at the
            // top of it. Every app change re-downloaded the whole chart
            // library. Now it is one stable, cacheable file.
            if (
              id.includes("node_modules/recharts/") ||
              id.includes("node_modules/victory-vendor/") ||
              id.includes("node_modules/d3-") ||
              id.includes("node_modules/internmap/") ||
              id.includes("node_modules/delaunator/") ||
              id.includes("node_modules/robust-predicates/")
            )
              return "vendor-charts";
            // Icons and headless UI primitives - imported by nearly every
            // screen, change only when we bump the package.
            if (
              id.includes("node_modules/lucide-react/") ||
              id.includes("node_modules/@base-ui/") ||
              id.includes("node_modules/@dnd-kit/")
            )
              return "vendor-ui";
            return undefined;
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
