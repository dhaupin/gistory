// Sortable — pointer-driven drag reordering that works with mouse *and* touch,
// plus a keyboard path (arrow keys on the handle) so reordering is never
// pointer-only.
//
// Why hand-rolled instead of HTML5 drag-and-drop: the native API does not work
// on touch devices at all, and this app is used at mobile widths. Pointer
// events cover mouse, touch, and pen with one code path.
//
// Geometry model: on pointerdown we snapshot the row rectangles once. During
// the drag we track where the dragged row's centre is and walk outwards from
// its original index to find the row it would now follow. That keeps the
// calculation stable (no live layout reads per move) and the drop index exact.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react'
import { GripVertical } from 'lucide-react'

interface SortableApi {
  ids: string[]
  containerRef: React.RefObject<HTMLDivElement | null>
  draggingId: string | null
  overIndex: number | null
  beginDrag: (id: string, event: ReactPointerEvent) => void
  nudge: (id: string, delta: number) => void
}

const SortableContext = createContext<SortableApi | null>(null)
const RowContext = createContext<string | null>(null)

function useSortable(): SortableApi {
  const ctx = useContext(SortableContext)
  if (!ctx) throw new Error('Sortable components must be used inside <SortableProvider>')
  return ctx
}

/** Drop index for a dragged row whose centre now sits at `center`. */
function targetFromCenter(rects: DOMRect[], index: number, center: number): number {
  const ownMid = rects[index].top + rects[index].height / 2
  if (center > ownMid) {
    let target = index
    for (let i = index + 1; i < rects.length; i++) {
      const mid = rects[i].top + rects[i].height / 2
      if (center > mid) target = i
      else break
    }
    return target
  }
  let target = index
  for (let i = index - 1; i >= 0; i--) {
    const mid = rects[i].top + rects[i].height / 2
    if (center < mid) target = i
    else break
  }
  return target
}

/**
 * Wraps a list. `ids` must match the order the `SortableRow` children render
 * in; `onReorder` receives that list plus the from/to indices.
 */
export function SortableProvider({
  ids,
  allIds,
  onReorder,
  className,
  children,
}: {
  ids: string[]
  /** Unfiltered order, when `ids` is a filtered subset. */
  allIds?: string[]
  onReorder: (ids: string[], from: number, to: number, allIds?: string[]) => void
  className?: string
  children: ReactNode
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

  const drag = useRef<{ id: string; index: number; startY: number; rects: DOMRect[] } | null>(null)
  // Mirrors overIndex so the pointerup handler reads the latest value without
  // re-registering its listeners on every move.
  const overIndexRef = useRef<number | null>(null)
  overIndexRef.current = overIndex

  const finish = useCallback(
    (commit: boolean) => {
      const active = drag.current
      drag.current = null
      setDraggingId(null)
      setOverIndex(null)
      if (!commit || !active) return
      const target = overIndexRef.current
      if (target != null && target !== active.index) {
        onReorder(ids, active.index, target, allIds)
      }
    },
    [ids, allIds, onReorder],
  )

  useEffect(() => {
    if (!draggingId) return

    const onMove = (e: PointerEvent) => {
      const active = drag.current
      if (!active) return
      if (e.cancelable) e.preventDefault()
      const own = active.rects[active.index]
      const center = own.top + own.height / 2 + (e.clientY - active.startY)
      setOverIndex(targetFromCenter(active.rects, active.index, center))
    }
    const onUp = () => finish(true)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish(false)
    }

    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      window.removeEventListener('keydown', onKey)
    }
  }, [draggingId, finish])

  const beginDrag = useCallback((id: string, event: ReactPointerEvent) => {
    if (event.button != null && event.button !== 0) return
    const container = containerRef.current
    if (!container) return
    const rows = Array.from(container.querySelectorAll('[data-sortable-id]'))
    const index = rows.findIndex(row => row.getAttribute('data-sortable-id') === id)
    if (index < 0) return
    drag.current = {
      id,
      index,
      startY: event.clientY,
      rects: rows.map(row => row.getBoundingClientRect()),
    }
    setDraggingId(id)
    setOverIndex(index)
  }, [])

  const nudge = useCallback(
    (id: string, delta: number) => {
      const from = ids.indexOf(id)
      if (from < 0) return
      const to = from + delta
      if (to < 0 || to >= ids.length) return
      // Pass the CURRENT order plus from/to — the consumer performs the move.
      // Doing it here as well would apply the swap twice and cancel it out.
      onReorder(ids, from, to, allIds)
    },
    [ids, allIds, onReorder],
  )

  return (
    <SortableContext.Provider value={{ ids, containerRef, draggingId, overIndex, beginDrag, nudge }}>
      <div className={className} ref={containerRef} data-sortable="true">
        {children}
      </div>
    </SortableContext.Provider>
  )
}

/** One draggable row; renders a plain wrapper so existing CSS keeps working. */
export function SortableRow({
  id,
  className,
  children,
}: {
  id: string
  className?: string
  children: ReactNode
}) {
  const { draggingId, overIndex, ids } = useSortable()
  const index = ids.indexOf(id)
  return (
    <RowContext.Provider value={id}>
      <div
        className={className}
        data-sortable-id={id}
        data-dragging={draggingId === id ? 'true' : undefined}
        data-over={overIndex === index && draggingId !== id ? 'true' : undefined}
      >
        {children}
      </div>
    </RowContext.Provider>
  )
}

/**
 * The grip button. Drag with pointer/touch; with the keyboard, ArrowUp /
 * ArrowDown move the row one place — so reordering never depends on a mouse.
 * Must be rendered inside a `SortableRow`.
 */
export function SortableHandle({ label }: { label: string }) {
  const id = useContext(RowContext)
  const { beginDrag, nudge, ids, draggingId } = useSortable()

  if (!id) {
    throw new Error('<SortableHandle> must be rendered inside a <SortableRow>')
  }

  const disabled = ids.length < 2 || draggingId !== null

  return (
    <button
      className="drag-handle"
      type="button"
      draggable={false}
      disabled={disabled}
      aria-label={`Reorder ${label}. Drag, or use the up and down arrow keys.`}
      title={ids.length < 2 ? 'Nothing to reorder' : `Drag to reorder ${label}`}
      onPointerDown={(e) => {
        if (e.button != null && e.button !== 0) return
        e.preventDefault()
        beginDrag(id, e)
      }}
      onKeyDown={(e: ReactKeyboardEvent) => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault()
          nudge(id, e.key === 'ArrowUp' ? -1 : 1)
        }
      }}
    >
      <GripVertical size={14} aria-hidden="true" />
    </button>
  )
}