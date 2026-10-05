// Adapters that turn a ChatGPT or Claude data export into Gistory's
// import format, so prompt people can bring their existing history instead of
// starting from zero. Detection and conversion are pure functions — the UI
// hands over the parsed JSON and gets back an ExportData (or null).
//
// Formats handled (both are what "Export data" actually ships):
//
//   ChatGPT: an array of conversations (or `{ conversations: [...] }`), each
//   with `title`, `create_time`/`update_time` (epoch seconds) and a `mapping`
//   tree of nodes whose `message` carries `author.role` and
//   `content.parts: string[]`.
//
//   Claude: an array of conversations (or `{ conversations: [...] }`), each
//   with `name`, `created_at`/`updated_at` (ISO strings) and
//   `chat_messages: [{ sender: 'human' | 'assistant', text, created_at }]`.
//
// Both keep the user's text verbatim; assistant turns are prefixed with
// "Assistant:" because Gistory messages have no roles and an unprefixed mix
// reads like one voice wrote everything.

import type { Thread, MessagesByThread } from './models'
import type { ExportData } from './store'

export type ImportFormat = 'gistory' | 'chatgpt' | 'claude'

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

/** Conversations live either as a bare array or under a `conversations` key. */
function conversationsOf(raw: unknown): Record<string, unknown>[] {
  const list = Array.isArray(raw) ? raw : isObj(raw) && Array.isArray(raw.conversations) ? raw.conversations : []
  return list.filter(isObj)
}

export function detectImportFormat(raw: unknown): ImportFormat | null {
  if (isObj(raw) && Array.isArray(raw.threads) && isObj(raw.messages)) return 'gistory'
  const first = conversationsOf(raw).find(c => c.mapping || c.chat_messages)
  if (!first) return null
  if (isObj(first.mapping)) return 'chatgpt'
  if (Array.isArray(first.chat_messages)) return 'claude'
  return null
}

const epochMs = (v: unknown): number | null =>
  typeof v === 'number' && v > 0 ? Math.round(v * 1000) : null

const isoMs = (v: unknown): number | null => {
  if (typeof v !== 'string') return null
  const t = Date.parse(v)
  return Number.isFinite(t) ? t : null
}

export function convertChatGptExport(raw: unknown): ExportData {
  const threads: Thread[] = []
  const messages: MessagesByThread = {}

  conversationsOf(raw).forEach((conv, idx) => {
    const mapping = isObj(conv.mapping) ? conv.mapping : {}
    const turns = Object.values(mapping)
      .filter(isObj)
      .map(node => node.message)
      .filter(isObj)
      .map(m => {
        const content = isObj(m.content) ? m.content : {}
        const parts = Array.isArray(content.parts) ? content.parts : []
        return {
          role: isObj(m.author) ? m.author.role : undefined,
          text: parts.filter((p): p is string => typeof p === 'string').join('\n').trim(),
          at: epochMs(m.create_time),
        }
      })
      .filter(t => t.text && (t.role === 'user' || t.role === 'assistant'))
      .sort((a, b) => (a.at ?? 0) - (b.at ?? 0))
    if (turns.length === 0) return

    const id = `gpt-${idx}-${typeof conv.conversation_id === 'string' ? conv.conversation_id.slice(0, 12) : 'x'}`
    const createdAt = epochMs(conv.create_time) ?? turns[0].at ?? Date.now()
    threads.push({
      id,
      name: typeof conv.title === 'string' && conv.title.trim() ? conv.title.trim() : `Imported chat ${idx + 1}`,
      projectIds: [],
      createdAt,
      updatedAt: epochMs(conv.update_time) ?? createdAt,
    })
    messages[id] = turns.map((t, i) => ({
      id: `${id}-m${i}`,
      threadId: id,
      content: t.role === 'assistant' ? `Assistant:\n${t.text}` : t.text,
      createdAt: t.at ?? createdAt + i,
    }))
  })

  return { version: 1, exportedAt: Date.now(), threads, messages, projects: [] }
}

export function convertClaudeExport(raw: unknown): ExportData {
  const threads: Thread[] = []
  const messages: MessagesByThread = {}

  conversationsOf(raw).forEach((conv, idx) => {
    const chatMessages = Array.isArray(conv.chat_messages) ? conv.chat_messages.filter(isObj) : []
    const turns = chatMessages
      .map(m => ({
        sender: typeof m.sender === 'string' ? m.sender : '',
        text: typeof m.text === 'string' ? m.text.trim() : '',
        at: isoMs(m.created_at),
      }))
      .filter(t => t.text && (t.sender === 'human' || t.sender === 'assistant'))
      .sort((a, b) => (a.at ?? 0) - (b.at ?? 0))
    if (turns.length === 0) return

    const id = `claude-${idx}-${typeof conv.uuid === 'string' ? conv.uuid.slice(0, 12) : 'x'}`
    const createdAt = isoMs(conv.created_at) ?? turns[0].at ?? Date.now()
    threads.push({
      id,
      name: typeof conv.name === 'string' && conv.name.trim() ? conv.name.trim() : `Imported chat ${idx + 1}`,
      projectIds: [],
      createdAt,
      updatedAt: isoMs(conv.updated_at) ?? createdAt,
    })
    messages[id] = turns.map((t, i) => ({
      id: `${id}-m${i}`,
      threadId: id,
      content: t.sender === 'assistant' ? `Assistant:\n${t.text}` : t.text,
      createdAt: t.at ?? createdAt + i,
    }))
  })

  return { version: 1, exportedAt: Date.now(), threads, messages, projects: [] }
}

/**
 * Parse an unknown JSON export into Gistory's format. Returns null when the
 * shape matches nothing we know — the caller reports that to the user rather
 * than importing garbage.
 */
export function convertImport(raw: unknown): { data: ExportData; format: ImportFormat } | null {
  const format = detectImportFormat(raw)
  if (!format) return null
  if (format === 'gistory') {
    return { data: raw as unknown as ExportData, format }
  }
  if (format === 'chatgpt') return { data: convertChatGptExport(raw), format }
  return { data: convertClaudeExport(raw), format }
}
