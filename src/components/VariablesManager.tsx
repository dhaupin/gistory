// VariablesManager - read + write saved `{{variable}}` values in one place.
//
// Opened from the burger menu (which manages global vars and every thread
// pool) and from a thread page (where the add form defaults to that thread's
// own pool). Rows are listed per pool: "Global" first, then one section per
// thread that has variables. Editing/deleting is inline and immediate — each
// row is independent, and the sync merge is per key, so nothing about this
// modal can clobber a concurrent edit to a different variable.
//
// Values are stored plain and ride the same encrypted sync as everything
// else; the relay sees only ciphertext, as always.

import { useEffect, useMemo, useState } from 'react'
import { Edit, Plus, Trash2, X, Check } from 'lucide-react'
import ConfirmDialog from './ConfirmDialog'
import { useSubmitLock } from '../ui/hooks'
import { GLOBAL_SCOPE, groupVariables, liveVariables, type Variables } from '../lib/variables'
import type { Thread } from '../lib/models'

interface VariablesManagerProps {
  open: boolean
  onClose: () => void
  variables: Variables
  threads: Thread[]
  /** When set (opened from a thread page), the add form defaults to this pool. */
  defaultScope?: string
  onSave: (scope: string, name: string, value: string) => void
  onDelete: (key: string) => void
}

export default function VariablesManager({
  open,
  onClose,
  variables,
  threads,
  defaultScope,
  onSave,
  onDelete,
}: VariablesManagerProps) {
  const [newName, setNewName] = useState('')
  const [newValue, setNewValue] = useState('')
  const [scope, setScope] = useState(defaultScope || GLOBAL_SCOPE)
  const [editing, setEditing] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const tryCreate = useSubmitLock(false)

  // Every open starts fresh, and a re-open from a different thread retunes
  // the default pool.
  useEffect(() => {
    if (!open) return
    setScope(defaultScope || GLOBAL_SCOPE)
    setNewName(''); setNewValue(''); setEditing(null)
  }, [open, defaultScope])

  // Only alive entries; groups sorted Global first, then pool name for stable
  // sections. Unassigned threads are still threads here (the map has the names).
  const threadName = useMemo(() => {
    const map = new Map<string, string>()
    for (const t of threads) map.set(t.id, t.name)
    return map
  }, [threads])
  const groups = useMemo(() => {
    const list = groupVariables(liveVariables(variables))
    return list.sort((a, b) => (a.scope === GLOBAL_SCOPE ? -1 : b.scope === GLOBAL_SCOPE ? 1 : 0))
  }, [variables])

  if (!open) return null

  const handleAdd = () => {
    if (!newName.trim() || !tryCreate()) return
    onSave(scope, newName, newValue)
    setNewName(''); setNewValue('')
  }

  const handleRenameSave = (key: string, entry: { name: string }) => {
    onSave(key.slice(0, key.indexOf(':')), entry.name, editValue)
    setEditing(null)
  }

  const labelOf = (scopeId: string) =>
    scopeId === GLOBAL_SCOPE ? 'Global' : threadName.get(scopeId) || 'Deleted thread'

  return (
    <div
      className="modal-overlay variables-overlay"
      onClick={onClose}
      onKeyDown={e => { if (e.key === 'Escape') onClose() }}
    >
      <div className="modal variables-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Variables</h3>
          <button className="close-btn" onClick={onClose} aria-label="Close variables">
            <X size={18} />
          </button>
        </div>

        <div className="variables-explainer">
          <p>
            <code>{'{{placeholders}}'}</code> in prompts turn into a fill-in form when
            you copy. Save their values here and every copy pre-fills — global ones
            apply to all prompts, thread ones only to that thread.
          </p>
        </div>

        <div className="variables-list">
          {groups.length === 0 && (
            <p className="empty-text">No saved variables yet.</p>
          )}
          {groups.map(group => (
            <div key={group.scope} className="variables-group">
              <h4 className="variables-group-name">
                {labelOf(group.scope)}
                {group.scope !== GLOBAL_SCOPE && <span className="dim"> · thread pool</span>}
              </h4>
              {group.keys.map((key, i) => {
                const entry = group.entries[i]
                const isEditing = editing === key
                return (
                  <div key={key} className="variable-row">
                    <code className="variable-key">{`{{${entry.name}}}`}</code>
                    {isEditing ? (
                      <div className="form-inline">
                        <input
                          className="input-name"
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleRenameSave(key, entry)
                            if (e.key === 'Escape') setEditing(null)
                          }}
                          autoFocus
                        />
                        <button
                          className="btn btn-primary btn-small"
                          onClick={() => handleRenameSave(key, entry)}
                        >
                          <Check size={14} /> Save
                        </button>
                        <button
                          className="btn btn-secondary btn-small"
                          onClick={() => setEditing(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="variable-value">{entry.value || <em>empty</em>}</span>
                        <span className="variable-row-actions">
                          <button
                            className="btn-icon"
                            onClick={() => { setEditing(key); setEditValue(entry.value) }}
                            aria-label={`Edit ${entry.name}`}
                            title={`Edit ${entry.name}`}
                          >
                            <Edit size={14} />
                          </button>
                          <button
                            className="btn-icon"
                            onClick={() => setDeleteConfirm(key)}
                            aria-label={`Delete ${entry.name}`}
                            title={`Delete ${entry.name}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </span>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        <div className="variables-add">
          <div className="form-inline">
            <input
              className="input-name"
              placeholder="Variable name"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
              aria-label="Variable name"
            />
            <select
              className="sort-select"
              value={scope}
              onChange={e => setScope(e.target.value)}
              aria-label="Variable scope"
            >
              <option value={GLOBAL_SCOPE}>Global</option>
              {threads.map(t => (
                <option key={t.id} value={t.id}>Thread: {t.name}</option>
              ))}
            </select>
          </div>
          <div className="form-inline">
            <input
              className="input-name"
              placeholder="Value"
              value={newValue}
              onChange={e => setNewValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
              aria-label="Variable value"
            />
            <button className="btn btn-primary btn-small" onClick={handleAdd}>
              <Plus size={14} /> Add
            </button>
          </div>
        </div>

        {deleteConfirm && <VariableDeleteConfirm
          name={variables[deleteConfirm]?.name || ''}
          onConfirm={() => { onDelete(deleteConfirm); setDeleteConfirm(null) }}
          onCancel={() => setDeleteConfirm(null)}
        />}
      </div>
    </div>
  )
}

function VariableDeleteConfirm({ name, onConfirm, onCancel }: { name: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <ConfirmDialog
      open
      title={`Delete {{${name}}}?`}
      message="The variable is removed here and on every device in your sync chain. Prompts using it keep the {{name}} placeholder read-only."
      confirmLabel="Delete"
      destructive
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}
