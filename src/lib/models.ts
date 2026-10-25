// Core data models for Gistory

/** Working state of a thread. Absent means 'active' — threads saved before
 *  statuses existed must behave as active without a migration. */
export type ThreadStatus = 'draft' | 'active' | 'archived'

export interface PromptMetadata {
  // Categorization
  tags: string[]
  category?: 'productivity' | 'creative' | 'technical' | 'general'
  status?: ThreadStatus
  
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
  /** Uploaded images, METADATA ONLY. The bytes live in a device-local
   *  store (`src/lib/attachments.ts` over the IndexedDB `attachments`
   *  store) and never ride the sync payload: messages sync as FULL state,
   *  and replaying base64-able blobs on every push is the cost class that
   *  filled the chain budget before. `attachments` is optional and merged
   *  whole-item by LWW like every other field, so payloads saved before
   *  this field existed stay mergeable (the house rule).
   */
  attachments?: MessageAttachment[]
}

/** Metadata for one uploaded image on a message. BYTES NEVER RIDE HERE —
 *  sync payloads carry this record only; the pixels stay in the local
 *  byte store keyed by id. */
export interface MessageAttachment {
  id: string
  name: string
  mime: string
  /** Byte size of the stored image (informational + budget checks). */
  bytes: number
  width?: number
  height?: number
  addedAt: number
}

/** How many images a single message may carry. Deliberately small: the
 *  metadata rides every sync push, so a message's worst-case payload cost
 *  is (attachments × ~120 bytes) — capped here. */
export const MAX_ATTACHMENTS_PER_MESSAGE = 6

/** Upload cap for one image, bytes (pre-resize). UI must compress before
 *  calling the byte store; the store refuses anything larger. */
export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024

export type MessagesByThread = Record<string, Message[]>