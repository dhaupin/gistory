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

// Export types
export interface ExportData {
  version: number
  exportedAt: number
  threads: Thread[]
  messages: MessagesByThread
  projects: Project[]
}

// Export all data
export function exportAll(): ExportData {
  const { threads, messages, projects } = loadData()
  return {
    version: 1,
    exportedAt: Date.now(),
    threads,
    messages,
    projects
  }
}

// Export single thread with its messages
export function exportThread(threadId: string): ExportData | null {
  const { threads, messages } = loadData()
  const thread = threads.find(t => t.id === threadId)
  if (!thread) return null
  
  const threadMessages = messages[threadId] || []
  return {
    version: 1,
    exportedAt: Date.now(),
    threads: [thread],
    messages: { [threadId]: threadMessages },
    projects: []
  }
}

// Export single project with its threads
export function exportProject(projectId: string): ExportData | null {
  const { threads, messages, projects } = loadData()
  const project = projects.find(p => p.id === projectId)
  if (!project) return null
  
  const projectThreads = threads.filter(t => t.projectIds.includes(projectId))
  const projectMessages: MessagesByThread = {}
  for (const thread of projectThreads) {
    projectMessages[thread.id] = messages[thread.id] || []
  }
  
  return {
    version: 1,
    exportedAt: Date.now(),
    threads: projectThreads,
    messages: projectMessages,
    projects: [project]
  }
}

// Import - returns merged data
export function importData(data: ExportData): { threads: Thread[], messages: MessagesByThread, projects: Project[] } {
  const existing = loadData()
  const importedThreads = data.threads || []
  const importedMessages = data.messages || {}
  const importedProjects = data.projects || []
  
  // Merge threads (by id - overwrite if same)
  const threadMap = new Map(existing.threads.map(t => [t.id, t]))
  for (const thread of importedThreads) {
    threadMap.set(thread.id, thread)
  }
  
  // Merge messages
  const messageMap = { ...existing.messages }
  for (const [threadId, msgs] of Object.entries(importedMessages)) {
    messageMap[threadId] = (messageMap[threadId] || []).concat(msgs)
  }
  
  // Merge projects  
  const projectMap = new Map(existing.projects.map(p => [p.id, p]))
  for (const project of importedProjects) {
    projectMap.set(project.id, project)
  }
  
  return {
    threads: Array.from(threadMap.values()),
    messages: messageMap,
    projects: Array.from(projectMap.values())
  }
}