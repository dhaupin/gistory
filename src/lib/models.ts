// Core data models for Gistory

export interface Project {
  id: string
  name: string
  createdAt: number
  archivedAt?: number
}

export interface Thread {
  id: string
  name: string
  projectIds: string[]
  createdAt: number
}

export interface Message {
  id: string
  threadId: string
  content: string
  createdAt: number
}

export type MessagesByThread = Record<string, Message[]>