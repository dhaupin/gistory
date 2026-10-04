// Debounce hook - delays value update
import { useState, useEffect, useCallback, useRef } from 'react'

/**
 * Guard a submit handler against double submission.
 *
 * A rapid double-click (or a triple-click, or Enter held down) fires several
 * events before React re-renders, so each one still sees the same non-empty
 * input and the same `open` form. Without a guard that creates three identical
 * threads/projects and the user has to delete two of them.
 *
 * The lock is a ref, not state, precisely because state updates do not apply
 * until the next render. `open` releases it, so re-opening the form to create
 * a second item with the same name still works.
 */
export function useSubmitLock(open: boolean) {
  const locked = useRef(false)
  useEffect(() => {
    if (!open) locked.current = false
  }, [open])
  return useCallback(() => {
    if (locked.current) return false
    locked.current = true
    return true
  }, [])
}

// `useDebounce` and `useHeartbeat` used to live here. Both were dead — nothing
// imported them, and they were not even re-exported by `src/ui/index.ts` after
// that barrel was pruned. They are removed rather than kept "just in case":
// an unused hook is a hook nobody has ever run, so it is not a safety net.
// Sync debouncing is real, but it is not a hook — it is `SyncQos` in
// `src/sync/qos.ts`, because coalescing a push and coalescing a value are not
// the same problem.