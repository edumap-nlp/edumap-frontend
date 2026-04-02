import type { LLMProvider } from '../types'

// ── Config ──────────────────────────────────────────────────────────
/** Base URL for `/health` and `/llm/chat` (Express). Override with VITE_API_BASE. */
const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:3001/api'

/** Max characters of PDF text sent into a single extraction request. */
const MAX_EXTRACT_CHARS = 200_000



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
  'You are an expert at reading academic papers and building concept maps for students.',
  '',
  'Identify the core IDEAS in the document and organize them by logical dependency, not by document structure.',
  '',
  'What counts as a concept:',
  '- A technique, method, or algorithm',
  '- A problem or challenge being addressed',
  '- A theoretical principle or finding',
  '',
  'What does NOT count:',
  '- Paper sections ("Related Work", "Evaluation", "Future Work")',
  '- The paper title or topic as a root node',
  '- Vague grouping categories that exist only to hold children',
  '',
  'Strict formatting rules:',
  '- Your response must begin with # and contain NOTHING else. No preamble, no commentary.',
  '- Do NOT use bold (**), italic (*), or any inline formatting. Plain text only.',
  '- Produce 5-7 top-level concepts with 2-4 sub-concepts each. Maximum 3 levels deep.',
  '- Do NOT exceed 25 total nodes. Be selective, not exhaustive.',
  '- Node descriptions: 10 words max. Most nodes need no description at all.',
  '- Tags: [Hard] for mathematically dense, [Important] for foundational, [Low Priority] for tangential.',
  '',
  'Relationships should reflect logical dependency:',
  '- "A requires B" (prerequisite)',
  '- "A is built using B" (construction)',
  '- "A is a type of B" (specialization)',
  '',
  'Do NOT mirror the paper\'s section order or headings.',
  '',
  'Output valid markdown using headings (# ## ###) and bullet points.',
].join('\n')

const MERGE_SYSTEM = [
  'You are an expert at synthesizing knowledge from multiple academic documents into a unified concept map.',
  '',
  'Given individual concept maps from several documents, merge them into a single coherent map.',
  '',
  'Rules:',
  '- Find the 3-5 highest-level themes that span the documents. These become your top-level nodes.',
  '- When two documents cover the same concept (e.g., both discuss regularization), merge them into one node, not two separate ones.',
  '- Preserve concepts that are unique to a single document but place them under the most relevant shared theme.',
  '- Tag nodes that connect ideas from multiple documents with [Cross-Doc].',
  '- Do NOT organize by document. Never create a branch called "From Document A."',
  '',
  'Output valid markdown using headings (# ## ###) and bullet points.',
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
