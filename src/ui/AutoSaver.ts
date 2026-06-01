// AutoSaver - saves input to localStorage with debounce
import { useState, useEffect, useCallback } from 'react'

interface AutoSaverOptions {
  key: string         // localStorage key
  debounceMs?: number  // delay before save (default 1000)
}

export function useAutoSave(options: AutoSaverOptions) {
  const { key, debounceMs = 1000 } = options
  const [value, setValueState] = useState('')
  const [savedValue, setSavedValue] = useState('')
  const [isDirty, setIsDirty] = useState(false)

  // Load from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(key)
    if (stored) {
      setValueState(stored)
      setSavedValue(stored)
    }
  }, [key])

  // Set value + mark dirty
  const setValue = useCallback((newValue: string) => {
    setValueState(newValue)
    setIsDirty(newValue !== savedValue)
  }, [savedValue])

  // Debounced save
  useEffect(() => {
    if (!isDirty || !value) return
    const timer = setTimeout(() => {
      localStorage.setItem(key, value)
      setSavedValue(value)
      setIsDirty(false)
    }, debounceMs)
    return () => clearTimeout(timer)
  }, [value, isDirty, key, debounceMs])

  // Clear function
  const clearValue = useCallback(() => {
    localStorage.removeItem(key)
    setValueState('')
    setSavedValue('')
    setIsDirty(false)
  }, [key])

  // Has unsaved changes?
  const hasUnsaved = isDirty

  return { value, setValue, clearValue, hasUnsaved }
}