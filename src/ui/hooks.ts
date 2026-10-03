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

export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}

// Heartbeat hook - runs callback at interval
export function useHeartbeat(callback: () => void, interval: number, enabled = true) {
  useEffect(() => {
    if (!enabled || interval <= 0) return
    const id = setInterval(callback, interval)
    return () => clearInterval(id)
  }, [callback, interval, enabled])
}