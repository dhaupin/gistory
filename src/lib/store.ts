// localStorage + state management

import type { Project, Thread, MessagesByThread } from './models'

const THREADS_KEY = 'gistory_threads'
const MESSAGES_KEY = 'gistory_messages'
const PROJECTS_KEY = 'gistory_projects'
const DRAFT_KEY_PREFIX = 'gistory_draft_'

export function loadData(): {
  threads: Thread[]
  messages: MessagesByThread
  projects: Project[]
} {
  try {
    return {
      threads: JSON.parse(localStorage.getItem(THREADS_KEY) || '[]'),
      messages: JSON.parse(localStorage.getItem(MESSAGES_KEY) || '{}'),
      projects: JSON.parse(localStorage.getItem(PROJECTS_KEY) || '[]')
    }
  } catch {
    return { threads: [], messages: {}, projects: [] }
  }
}

export function saveThreads(threads: Thread[]) {
  localStorage.setItem(THREADS_KEY, JSON.stringify(threads))
}

export function saveMessages(messages: MessagesByThread) {
  localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages))
}

export function saveProjects(projects: Project[]) {
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects))
}

let idCounter = Date.now()
export function generateId(prefix = ''): string {
  return `${prefix}${++idCounter}-${Math.random().toString(36).slice(2, 9)}`
}

// Draft (auto-save) functions
export function loadDraft(threadId: string): string {
  try {
    return localStorage.getItem(DRAFT_KEY_PREFIX + threadId) || ''
  } catch {
    return ''
  }
}

export function saveDraft(threadId: string, content: string) {
  if (content) {
    localStorage.setItem(DRAFT_KEY_PREFIX + threadId, content)
  } else {
    localStorage.removeItem(DRAFT_KEY_PREFIX + threadId)
  }
}

export function clearDraft(threadId: string) {
  localStorage.removeItem(DRAFT_KEY_PREFIX + threadId)
}