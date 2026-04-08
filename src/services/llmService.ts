import type { LLMProvider, ProviderStatus } from '../types'
import { PROVIDER_CHAIN } from '../services/agentOrchestrator'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:3001/api'
const MAX_EXTRACT_CHARS = 200_000

// ── Types ───────────────────────────────────────────────────────────

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface LLMCallOptions {
  provider?: LLMProvider
  model?: string
  messages: LLMMessage[]
  temperature?: number
  maxTokens?: number
}

interface LLMResponse {
  content: string
  model: string
  usage?: { promptTokens: number; completionTokens: number }
}

// ── API ─────────────────────────────────────────────────────────────

export async function callLLM(options: LLMCallOptions): Promise<LLMResponse> {
  const {
    provider = 'google',
    model = 'gemini-2.5-flash',
    messages,
    temperature = 0.3,
    maxTokens = 4096,
  } = options

  const response = await fetch(`${API_BASE}/llm/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, model, messages, temperature, maxTokens }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`LLM API error (${response.status}): ${error}`)
  }
  return response.json()
}

export async function callWithFallback(
  providers: Record<string, ProviderStatus>,
  messages: LLMMessage[],
): Promise<{ content: string }> {
  for (const candidate of PROVIDER_CHAIN) {
    const status = providers[candidate.provider]
    if (!status?.configured || !status?.reachable) continue

    try {
      return await callLLM({ provider: candidate.provider, model: candidate.model, messages })
    } catch (err: any) {
      const code = err?.status ?? err?.httpCode
      const msg = err?.message ?? ''
      if (code === 429 || code === 503 || msg.includes('429') || msg.includes('503')) {
        console.warn(`${candidate.provider} failed, trying next provider`)
        continue
      }
      throw err
    }
  }
  throw new Error('All providers exhausted')
}

// ── Parsers ─────────────────────────────────────────────────────────

export function parseRootTopic(markdown: string): string | null {
  const line = markdown.split('\n').find((l) => /^# /.test(l) && !/^## /.test(l))
  return line ? line.replace(/^# /, '').trim() : null
}

export function parseBranchHeadings(markdown: string): string[] {
  return markdown
    .split('\n')
    .filter((l) => /^## /.test(l) && !/^### /.test(l))
    .map((l) => l.replace(/^## /, '').trim())
}

export function assembleRecursiveMarkdown(
  rootTopic: string,
  branchMarkdown: string,
  expansions: Map<string, string>,
): string {
  const assembled: string[] = [`# ${rootTopic}`, '']

  for (const line of branchMarkdown.split('\n')) {
    assembled.push(line)
    if (/^## /.test(line) && !/^### /.test(line)) {
      const expansion = expansions.get(line.replace(/^## /, '').trim())
      if (expansion) {
        assembled.push(expansion.trim(), '')
      }
    }
  }
  return assembled.join('\n')
}
