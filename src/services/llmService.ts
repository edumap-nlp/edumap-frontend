import type { LLMProvider } from '../types'

// ── Config ──────────────────────────────────────────────────────────
/** Base URL for `/health` and `/llm/chat` (Express). Override with VITE_API_BASE. */
const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:3001/api'

/** Max characters of PDF text sent into a single extraction request. */
const MAX_EXTRACT_CHARS = 30_000



// ── Types (request/response for POST /api/llm/chat) ───────────────────
interface LLMMessage {
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



// ── API ───────────────────────────────────────────────────────────────
/**
 * Proxies a chat completion through the backend (keys stay on the server).
 * @throws If the HTTP response is not OK.
 */
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



// ── System prompts (string[] + join keeps sent text free of code-indent spaces) ──
const EXTRACTION_SYSTEM = [
  'You are an expert at extracting structured knowledge from documents.',
  'Given a document, extract the key concepts, their hierarchical relationships, and semantic connections.',
  'Output ONLY valid markdown in a mind-map hierarchy using headings (# ## ### etc.) and bullet points.',
  'Include tags like [Hard], [Important], or [Low Priority] where appropriate.',
  'Add brief descriptions as sub-bullets where they add value.',
  'Group related concepts under common parent headings.',
  'Identify cross-cutting themes that connect different sections.',
].join('\n')

const MERGE_SYSTEM = [
  'You are an expert at synthesizing knowledge from multiple documents into a unified mind map.',
  'Given multiple document mind maps, merge them into a single coherent mind map that:',
  '',
  '1. Identifies common themes and groups them together',
  '2. Preserves unique concepts from each document',
  '3. Creates cross-document connections where concepts relate',
  '4. Uses a clear hierarchy with the main topic as the root',
  '5. Adds [Cross-Doc] tag to nodes that connect multiple documents',
  '',
  'Output ONLY valid markdown in mind-map hierarchy format.',
].join('\n')



// ── Prompt builders (used by agentOrchestrator) ─────────────────────
/**
 * Messages for one PDF: system rules + user chunk of document text → markdown mind map.
 */
export function buildExtractionPrompt(documentText: string, documentName: string): LLMMessage[] {
  const clipped = documentText.slice(0, MAX_EXTRACT_CHARS)
  return [
    { role: 'system', content: EXTRACTION_SYSTEM },
    {
      role: 'user',
      content: `Extract a structured mind map from this document "${documentName}":\n\n${clipped}`,
    },
  ]
}

/**
 * Messages for merging several per-document mind maps into one markdown tree.
 * `markdowns` / `docNames` must align by index.
 */
export function buildMergePrompt(markdowns: string[], docNames: string[]): LLMMessage[] {
  const docs = markdowns
    .map((md, i) => `--- Document: ${docNames[i]} ---\n${md}`)
    .join('\n\n')

  return [
    { role: 'system', content: MERGE_SYSTEM },
    {
      role: 'user',
      content: `Merge these document mind maps into a unified mind map:\n\n${docs}`,
    },
  ]
}
