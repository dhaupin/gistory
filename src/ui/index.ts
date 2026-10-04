// UI - Shared UI components
//
// This barrel exists for one consumer: `components/Settings.tsx` imports
// `Badge` and `Button` from here. Everything else that used to be re-exported
// (ActionMenu, Tooltip, Loading, EmptyState, useAutoSave, useDebounce,
// useHeartbeat, and ~20 lucide icons) had no importer and was dead weight —
// dead weight in a barrel is worse than dead weight in a file, because the
// re-export looks like a live dependency to anyone grepping for it.
//
// New code should import the component directly (`../ui/sortable`,
// `../components/Header`) rather than widening this file. Add to it only when
// a real second consumer exists.

export { Badge, Button } from './Badge'
export { type LucideIcon } from 'lucide-react'