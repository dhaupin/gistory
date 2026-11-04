import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// SSR single-instance guard: the prerender engine must share ONE
// react-router-dom module instance with the app, or useLocation() sees a
// different Router context and every route fails (prestruct #68). The old
// env-gated resolveId shim (prerender/rr-shim.mjs) is gone -- the engine now
// redirects the CJS entry itself -- but the ssr `noExternal` line stays: it
// is load-bearing on vite 6 + react-router-dom 7 (tested, 6/6 routes fail
// without it), which the engine's in-engine seam fix does not cover.
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'esnext',
  },
  environments: {
    ssr: {
      resolve: {
        noExternal: ['react-router-dom', 'react-router'],
      },
    },
  },
})
