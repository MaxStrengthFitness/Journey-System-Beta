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
            return undefined;
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        'react': path.resolve(__dirname, 'node_modules/react'),
        'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true' ? true : { overlay: false },
    },
  };
});
