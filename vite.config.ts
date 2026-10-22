import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

/**
 * SSR-only interop for react-router-dom's CommonJS build (v7).
 *
 * Prestruct's prerender engine `ssrLoadModule`s AppLayout, whose
 * `import { Routes, Route, useLocation } from 'react-router-dom'` dies in the
 * SSR module runner ("Named export not found ... is a CommonJS module") —
 * the same trap the web lander hit pre-engine. The resolveId hook below maps
 * the bare specifier to prerender/rr-shim.mjs, which re-exports the CJS
 * package's real surface.
 *
 * Scoped to this.environment.name === 'ssr' deliberately: the app's own
 * browser build (client environment) must never resolve the shim, so the
 * shim can never re-enter the bundle and render nothing. Never set
 * resolve.alias instead — an unconditional alias is the vendored-era trap.
 */
function rrdSsrInterop(): import('vite').Plugin {
  return {
    name: 'rrd-ssr-cjs-interop',
    resolveId: {
      order: 'pre',
      handler(source) {
        if (process.env.RRD_DEBUG === '1') {
          process.stderr.write(`[rrd-debug] env=${this.environment?.name ?? 'none'} src=${source}\n`)
        }
        if (this.environment?.name !== 'ssr') return null
        if (source === 'react-router-dom' || source.startsWith('react-router-dom')) {
          return resolve(__dirname, 'prerender/rr-shim.mjs')
        }
        return null
      },
    },
  }
}

export default defineConfig({
  plugins: [react(), rrdSsrInterop()],
  build: {
    target: 'esnext',
  },
  // The SSR graph must not externalize react-router-dom: Node's own resolver
  // (externals default) never consults resolveId hooks, so the shim would
  // never be reached and the runner would import RRD's CJS build directly
  // (the original "Named export not found" failure). noExternal routes RRD
  // back through Vite's module pipeline — where the env-gated shim applies.
  // The app's own client build has no SSR module graph, so this is inert
  // outside prerendering.
  environments: {
    ssr: {
      resolve: {
        noExternal: ['react-router-dom', 'react-router'],
      },
    },
  },
})
