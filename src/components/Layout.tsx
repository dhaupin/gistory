// Layout - wrapper with Header + Footer

import type { ReactNode } from 'react'
import Header, { type SyncChipState } from './Header'
import Footer from './Footer'

interface LayoutProps {
  children: ReactNode
  title: string
  darkMode: boolean
  onToggleDark: () => void
  searchQuery: string
  onSearchChange: (q: string) => void
  onProjectsClick: () => void
  onMenuClick?: () => void
  /** Compact sync state for the header chip. */
  sync?: SyncChipState
  onSyncClick?: () => void
}

export default function Layout({
  children,
  title,
  darkMode,
  onToggleDark,
  searchQuery,
  onSearchChange,
  onProjectsClick,
  onMenuClick,
  sync,
  onSyncClick
}: LayoutProps) {
  return (
    <div className="layout">
      <Header
        title={title}
        darkMode={darkMode}
        onToggleDark={onToggleDark}
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        onProjectsClick={onProjectsClick}
        onMenuClick={onMenuClick}
        sync={sync}
        onSyncClick={onSyncClick}
      />
      <main className="main-content">
        <div className="page-wrapper">
          {children}
        </div>
      </main>
      <Footer />
    </div>
  )
}