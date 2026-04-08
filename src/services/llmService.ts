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

// ── Heading-level guards ────────────────────────────────────────────

/**
 * Returns the heading depth of a markdown line (1 for #, 2 for ##, etc.)
 * or 0 if the line is not a heading.
 */
function headingDepth(line: string): number {
  const match = line.match(/^(#{1,6})\s/)
  return match ? match[1].length : 0
}

/**
 * Shifts all headings in a block so the shallowest heading sits at `targetMin`.
 *
 * Example: if the LLM returns ## and ### but we need ### and ####,
 * the shallowest is 2, target is 3, so every heading shifts +1.
 */
function shiftHeadings(markdown: string, targetMin: number): string {
  const lines = markdown.split('\n')
  let shallowest = Infinity

  for (const line of lines) {
    const depth = headingDepth(line)
    if (depth > 0 && depth < shallowest) shallowest = depth
  }

  if (shallowest === Infinity || shallowest === targetMin) return markdown

  const delta = targetMin - shallowest

  return lines
    .map((line) => {
      const depth = headingDepth(line)
      if (depth === 0) return line
      const newDepth = Math.min(depth + delta, 6) // cap at h6
      return '#'.repeat(newDepth) + line.slice(depth)
    })
    .join('\n')
}

/**
 * Sanitize Pass 2 (branch concepts) output:
 * - Keep only ## headings and their one-line bullet descriptions
 * - Strip any ###/#### lines the LLM may have added
 */
export function sanitizeBranchOutput(markdown: string): string {
  const lines = markdown.split('\n')
  const cleaned: string[] = []

  for (const line of lines) {
    const depth = headingDepth(line)

    // Keep ## headings (depth === 2)
    if (depth === 2) {
      cleaned.push(line)
      continue
    }

    // Keep non-heading lines (bullet descriptions, blank lines)
    // but only if they follow a ## heading
    if (depth === 0 && cleaned.length > 0) {
      cleaned.push(line)
      continue
    }

    // Drop anything else (###, ####, or headings at wrong level)
    // Log it so you can see when the LLM misbehaves
    if (depth > 0) {
      console.warn(`[sanitizeBranchOutput] Stripped unexpected heading: "${line}"`)
    }
  }

  return cleaned.join('\n')
}

/**
 * Sanitize Pass 3 (expansion) output:
 * - Shift headings so the shallowest level is ### (depth 3)
 * - Cap at #### (depth 4)
 */
export function sanitizeExpansionOutput(markdown: string): string {
  return shiftHeadings(markdown, 3)
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
  // Guard 1: strip unexpected headings from branch output
  const cleanBranches = sanitizeBranchOutput(branchMarkdown)

  // Guard 2: shift expansion headings to ### minimum
  const cleanExpansions = new Map<string, string>()
  for (const [key, value] of expansions) {
    cleanExpansions.set(key, sanitizeExpansionOutput(value))
  }

  const assembled: string[] = [`# ${rootTopic}`, '']

  for (const line of cleanBranches.split('\n')) {
    assembled.push(line)
    if (/^## /.test(line) && !/^### /.test(line)) {
      const heading = line.replace(/^## /, '').trim()
      const expansion = cleanExpansions.get(heading)
      if (expansion) {
        assembled.push(expansion.trim(), '')
      }
    }
  }
  return assembled.join('\n')
}