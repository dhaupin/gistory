// Debounce hook - delays value update
import { useState, useEffect } from 'react'

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