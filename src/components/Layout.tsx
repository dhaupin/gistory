// Layout - wrapper with Header + Footer

import type { ReactNode } from 'react'
import Header from './Header'
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
}

export default function Layout({
  children,
  title,
  darkMode,
  onToggleDark,
  searchQuery,
  onSearchChange,
  onProjectsClick,
  onMenuClick
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