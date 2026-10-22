// Shared sync-client configuration.
//
// Extraction of App.tsx's SYNC_BASE: the background-sync plumbing needs the
// same base URL the sync loop uses, and duplicating an env read across two
// modules is how they drift. Import from here everywhere.
//
// Production runs same-origin (Cloudflare Pages Functions at /sync); local
// dev points at `wrangler pages dev` via VITE_SYNC_URL.
export const SYNC_BASE: string = (import.meta.env.VITE_SYNC_URL as string | undefined) || ''
