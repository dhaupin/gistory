import { Folder, Sun, Moon, Menu } from 'lucide-react'

interface HeaderProps {
  title: string
  darkMode: boolean
  onToggleDark: () => void
  searchQuery: string
  onSearchChange: (q: string) => void
  onProjectsClick: () => void
  onMenuClick?: () => void
}

export default function Header({
  title,
  darkMode,
  onToggleDark,
  searchQuery,
  onSearchChange,
  onProjectsClick,
  onMenuClick
}: HeaderProps) {
  return (
    <header className="header">
      <h1 className="logo">{title}</h1>
      <div className="header-actions">
        <button className="btn-project" onClick={onProjectsClick} title="Projects">
          <Folder size={16} /> Projects
        </button>
        <input
          className="search-input"
          placeholder="Search..."
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
        />
        <button className="btn-icon" onClick={onToggleDark} title="Toggle dark">
          {darkMode ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        {onMenuClick && (
          <button className="btn-burger" onClick={onMenuClick}><Menu size={16} /></button>
        )}
      </div>
    </header>
  )
}