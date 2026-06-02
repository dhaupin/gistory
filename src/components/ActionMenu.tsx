// ActionMenu - dropdown menu component
import { MoreHorizontal, Folder, Check } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'

export interface ActionItem {
  label: string
  icon?: React.ReactNode
  onClick: () => void
  variant?: 'default' | 'danger'
  checked?: boolean
}

interface ActionMenuProps {
  items: ActionItem[]
  trigger?: React.ReactNode
}

export default function ActionMenu({ items, trigger }: ActionMenuProps) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  return (
    <div className="action-menu" ref={menuRef}>
      <button 
        className="action-menu-trigger" 
        onClick={() => setOpen(!open)}
        aria-label="Actions"
      >
        {trigger || <MoreHorizontal size={16} />}
      </button>
      
      {open && (
        <div className="action-menu-dropdown">
          {items.map((item, i) => (
            <button
              key={i}
              className={`action-menu-item ${item.variant || 'default'}`}
              onClick={() => {
                item.onClick()
                setOpen(false)
              }}
            >
              {item.checked !== undefined && (
                <span className="action-menu-check">
                  {item.checked ? <Check size={14} /> : <Folder size={14} />}
                </span>
              )}
              {item.icon && !item.checked && <span className="action-menu-icon">{item.icon}</span>}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}