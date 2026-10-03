// Core data models for Gistory

export interface PromptMetadata {
  // Categorization
  tags: string[]
  category?: 'productivity' | 'creative' | 'technical' | 'general'
  status?: 'draft' | 'active' | 'archived'
  
  // Quality signals
  rating?: number        // 1-5 quality score
  usageCount?: number   // times used
  
  // AI-specific hints
  modelHints?: string[] // 'claude', 'gpt-4', 'gemini' - models that work well
  language?: string  // 'en', 'ja', 'zh', etc
  tokenEstimate?: number // approximate tokens
  
  // Lineage
  parentId?: string     // if forked from another prompt
  version?: number    // version number
  
  // Annotations
  notes?: string     // freeform notes
  domain?: string   // 'legal', 'medical', 'coding', etc
}

export interface Thread {
  id: string
  name: string
  projectIds: string[]
  createdAt: number
  updatedAt?: number
  /** Pinned threads sort above unpinned ones on every thread board. */
  pinned?: boolean
  /** When the thread was pinned (unpinned threads clear it). */
  pinnedAt?: number
  metadata?: PromptMetadata
}

export interface Project {
  id: string
  name: string
  createdAt: number
  updatedAt?: number
  archivedAt?: number
  /** Pinned projects sort above unpinned ones. */
  pinned?: boolean
  /** When the project was pinned (unpinned projects clear it). */
  pinnedAt?: number
}

export interface Message {
  id: string
  threadId: string
  content: string
  createdAt: number
  /** Set when the content is edited or the pin is toggled, so merges pick
   *  the newest copy. */
  updatedAt?: number
  /** Pinned messages sort above unpinned ones within their thread. */
  pinned?: boolean
  /** When the message was pinned (unpinned messages clear it). */
  pinnedAt?: number
}

export type MessagesByThread = Record<string, Message[]>