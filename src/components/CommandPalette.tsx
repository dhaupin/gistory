// CommandPalette - Cmd/Ctrl+K quick jump + actions.
//
// One input, one flat list: matching threads and projects first, actions last.
// Arrow keys move, Enter runs, Escape closes. Threads carry tags and drafts in
// their hints; archived threads are hidden (they live in the archive section).

import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, Folder, MessageSquarePlus, FolderPlus, Settings, Trash2, CornerDownLeft } from 'lucide-react'
import type { Thread, Project } from '../lib/models'

interface PaletteProps {
  open: boolean
  onClose: () => void
  threads: Thread[]
  projects: Project[]
  onSelectThread: (id: string) => void
  onOpenProject: (id: string) => void
  onCreateThread: (name: string) => void
  onCreateProject: (name: string) => void
  onOpenProjects: () => void
  onOpenSettings: () => void
  onOpenTrash: () => void
}

interface Item {
  key: string
  label: string
  hint: string
  run: () => void
}

const recency = (t: Thread) => t.updatedAt ?? t.createdAt

export default function CommandPalette(props: PaletteProps) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Every open starts a fresh search with the input focused.
  useEffect(() => {
    if (props.open) {
      setQuery('')
      setActive(0)
      // Focus after mount (the overlay renders in the same commit).
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [props.open])

  const items = useMemo<Item[]>(() => {
    const q = query.trim().toLowerCase()
    const out: Item[] = []

    const threads = props.threads
      .filter(t => t.metadata?.status !== 'archived')
      .filter(t =>
        !q ||
        t.name.toLowerCase().includes(q) ||
        (t.metadata?.tags ?? []).some(tag => tag.toLowerCase().includes(q)),
      )
      .sort((a, b) => recency(b) - recency(a))
      .slice(0, 6)
    for (const t of threads) {
      const hints = [
        t.metadata?.status === 'draft' ? 'draft' : null,
        ...(t.metadata?.tags ?? []),
      ].filter(Boolean)
      out.push({
        key: `t:${t.id}`,
        label: t.name,
        hint: hints.length ? hints.join(' · ') : 'Thread',
        run: () => props.onSelectThread(t.id),
      })
    }

    for (const p of props.projects
      .filter(p => !q || p.name.toLowerCase().includes(q))
      .slice(0, 3)) {
      out.push({ key: `p:${p.id}`, label: p.name, hint: 'Project', run: () => props.onOpenProject(p.id) })
    }

    if (q) {
      out.push({
        key: 'new-thread',
        label: `New prompt: “${query.trim()}”`,
        hint: 'Create',
        run: () => props.onCreateThread(query.trim()),
      })
      out.push({
        key: 'new-project',
        label: `New project: “${query.trim()}”`,
        hint: 'Create',
        run: () => props.onCreateProject(query.trim()),
      })
    }
    out.push({ key: 'nav-projects', label: 'Open projects', hint: 'Go', run: props.onOpenProjects })
    out.push({ key: 'nav-settings', label: 'Open settings', hint: 'Go', run: props.onOpenSettings })
    out.push({ key: 'nav-trash', label: 'Recently deleted', hint: 'Go', run: props.onOpenTrash })
    return out
    // props.* callbacks are stable App callbacks; listing them all adds noise.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, props.threads, props.projects, props.open])

  // Keep the highlight inside the list as it shrinks and grows.
  useEffect(() => {
    if (active >= items.length) setActive(Math.max(0, items.length - 1))
  }, [items.length, active])

  if (!props.open) return null

  const runItem = (item: Item | undefined) => {
    if (!item) return
    props.onClose()
    item.run()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      props.onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive(i => Math.min(i + 1, items.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      runItem(items[active])
    }
  }

  // Keep the highlighted row in view for keyboard users.
  if (listRef.current) {
    listRef.current.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }

  return (
    <div className="modal-overlay palette-overlay" onClick={props.onClose}>
      <div
        className="modal palette"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <div className="palette-input-row">
          <Search size={15} className="palette-search-icon" />
          <input
            ref={inputRef}
            className="palette-input"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search prompts, projects, or run a command…"
            aria-label="Command palette search"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
          />
        </div>
        <div className="palette-list" id="palette-list" role="listbox" ref={listRef}>
          {items.length === 0 && <p className="empty-text">Nothing matches “{query.trim()}”.</p>}
          {items.map((item, i) => (
            <button
              key={item.key}
              role="option"
              aria-selected={i === active}
              className={`palette-item${i === active ? ' active' : ''}`}
              onClick={() => runItem(item)}
              onMouseEnter={() => setActive(i)}
            >
              {item.key.startsWith('t:') && <MessageSquarePlus size={13} className="palette-item-icon" aria-hidden="true" />}
              {item.key.startsWith('p:') && <Folder size={13} className="palette-item-icon" aria-hidden="true" />}
              {item.key.startsWith('new-thread') && <MessageSquarePlus size={13} className="palette-item-icon" aria-hidden="true" />}
              {item.key.startsWith('new-project') && <FolderPlus size={13} className="palette-item-icon" aria-hidden="true" />}
              {item.key.startsWith('nav-settings') && <Settings size={13} className="palette-item-icon" aria-hidden="true" />}
              {item.key.startsWith('nav-trash') && <Trash2 size={13} className="palette-item-icon" aria-hidden="true" />}
              <span className="palette-item-label">{item.label}</span>
              <span className="palette-item-hint">{item.hint}</span>
              {i === active && <CornerDownLeft size={12} className="palette-enter" aria-hidden="true" />}
            </button>
          ))}
        </div>
        <div className="palette-footer">
          <span>↑↓ navigate</span>
          <span>Enter open</span>
          <span>Esc close</span>
        </div>
      </div>
    </div>
  )
}
