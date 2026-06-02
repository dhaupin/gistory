// Core data models for Gistory

export interface Thread {
  id: string
  name: string
  projectIds: string[]
  createdAt: number
  updatedAt?: number
}

export interface Project {
  id: string
  name: string
  createdAt: number
  updatedAt?: number
  archivedAt?: number
}

export interface Message {
  id: string
  threadId: string
  content: string
  createdAt: number
}

export type MessagesByThread = Record<string, Message[]>