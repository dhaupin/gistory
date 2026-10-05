// Flat ESLint config.
//
// ESLint (plus typescript-eslint, react-hooks, react-refresh, globals) sat in
// devDependencies for a long time with NO config and NO script — installed but
// never wired. This file and the `lint` script are the wiring. The rules are
// deliberately the high-value subset, not a style regime:
//
//   • js.configs.recommended + typescript-eslint recommended — catches real
//     mistakes (unused vars, unreachable code, bad comparisons) with zero
//     type-aware cost, so `bun run lint` stays fast enough to run anywhere.
//   • react-hooks — the plugin that would have flagged the conditional-hook
//     bug found in ProjectDetail during the arrangement pass, and the
//     ensureQos-in-render shape that caused the silent first-push drop.
//   • react-refresh — only warns when a module exports both components and
//     non-components, which breaks fast refresh.
//
// Deliberately NOT configured here: formatting (Prettier-free repo — tsc and
// review own it), type-checked lint rules (tsc already runs strict three
// times; duplicating that in ESLint doubles the run for little gain).

import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', '.wrangler/**', '.ui-audit/**', 'labs/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': 'warn',
      // `_`-prefixed params are the convention for deliberately unused args.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['functions/**/*.ts'],
    languageOptions: {
      globals: { ...globals.worker },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // `readJson` returns the request body as parsed JSON whose shape the
      // relay deliberately does not know; every accessor validates. That seam
      // is the one honest `any` in the relay.
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    files: ['tests/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      // The smoke test builds fakes and fixtures; `any` at the D1 seam is the
      // point of the shim, and fixtures intentionally repeat shapes.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // prestruct's build-time prerender/inject scripts arrive as .js (they are
    // copied verbatim from the prestruct repo); they are Node scripts too.
    files: ['scripts/**/*.mjs', 'scripts/*.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    // The browser harness runs in Node but its page.evaluate callbacks execute
    // in the page, where window/document/localStorage ARE defined. Without
    // this, every harness file drowns in no-undef false positives.
    //
    // prestruct's engine files are copied verbatim and touch browser globals
    // deliberately: prerender/inject run in Node (console/process), while
    // islands.js and usePageMeta run in the page after hydration
    // (IntersectionObserver, document) with SSR guards around them.
    files: [
      'tests/**/*.mjs',
      'scripts/**/*.mjs',
      'scripts/*.js',
      'tests/**/*.ts',
      // The rr-shim is loaded only by the prerender (Node) via the inline
      // alias, but its browser-guarded fallback branch references browser
      // globals — give it both sets like the other dual-context files.
      'prerender/*.mjs',
      'src/ui/prestruct-islands.js',
      'src/hooks/usePageMeta.js',
    ],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
)
