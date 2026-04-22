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
  userPrompt?: string
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
// [EduMap multimodal] 2026-04-21: Extended with a block that teaches the LLM how
// to consume the tagged multimodal context produced by Yana pipeline v2
// ([TEXT], [FIGURE], [FORMULA], [TABLE]). When the document is plain text (no
// tags), those instructions are harmless and the model behaves as before.
const EXTRACTION_SYSTEM = [
  'You are an expert at reading academic papers and building concept maps for students.',
  '',
  'Identify the core IDEAS in the document and organize them by logical dependency, not by document structure.',
  '',
  'What counts as a concept:',
  '- A technique, method, or algorithm',
  '- A problem or challenge being addressed',
  '- A theoretical principle or finding',
  '- A key empirical finding from a figure or table',
  '- A mathematical relationship from an equation',
  '',
  'What does NOT count:',
  '- Paper sections ("Related Work", "Evaluation", "Future Work")',
  '- The paper title or topic as a root node',
  '- Vague grouping categories that exist only to hold children',
  '',
  // ── Multimodal handling (added 2026-04-21) ─────────────────────────
  'Multimodal input format:',
  '- The document text may contain tagged blocks: [TEXT p{N} c{N}], [FIGURE id=... p{N}], [FORMULA id=... p{N} kind=...], [TABLE p{N}].',
  '- [FIGURE] blocks include a caption, a short vision-model description, and OCR text. Use the description (not the OCR) as the source of truth when deciding whether the figure deserves its own node.',
  '- [FORMULA] blocks include a latex_guess and a short context. Promote an equation to its own node only when it expresses a core relationship, not when it is a routine identity.',
  '- [TABLE] blocks include a header and a sample of rows. Extract the relationship the table is demonstrating, not the raw numbers.',
  '- When a concept was derived primarily from a figure, formula, or table, append the tag [Visual], [Formula], or [Table] at the end of the node text (in addition to [Hard]/[Important]/[Low Priority]).',
  '',
  'Strict formatting rules:',
  '- Your response must begin with # and contain NOTHING else. No preamble, no commentary.',
  '- Do NOT use bold (**), italic (*), or any inline formatting. Plain text only.',
  '- Exactly 3 heading levels: one `# ROOT`, then `## L2` sections, then `### L3` sections.',
  '- Do NOT use `####` or deeper. Do NOT use bullet points.',
  '- REQUIRED structure (hard constraint — the mind-map UI depends on it):',
  '    • Exactly ONE `#` root node, named after the paper\'s core topic.',
  '    • 3 to 5 `##` second-level nodes directly under the root.',
  '    • Each `##` node MUST have 3 to 5 `###` third-level children. Not 2, not 6.',
  '- If you have more than 5 candidate sub-concepts, merge or drop; if fewer than 3, split or add a closely-related sibling. Never leave a `##` with 0–2 children.',
  '- Node descriptions: 10 words max. Most nodes need no description at all.',
  '- Tags: [Hard] for mathematically dense, [Important] for foundational, [Low Priority] for tangential, [Visual]/[Formula]/[Table] for multimodal-derived nodes.',
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
export function buildExtractionPrompt(documentText: string, documentName: string, userPrompt?: string): LLMMessage[] {
  const clipped = documentText.slice(0, MAX_EXTRACT_CHARS)

  // Extra instructions by the user
  const extraInstruction = userPrompt
    ? `\n\nAdditional instructions from the user: ${userPrompt}`
    : ''
  return [
    { role: 'system', content: EXTRACTION_SYSTEM + extraInstruction },
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
export function buildMergePrompt(markdowns: string[], docNames: string[], userPrompt?: string): LLMMessage[] {
  const docs = markdowns
    .map((md, i) => `--- Document: ${docNames[i]} ---\n${md}`)
    .join('\n\n')

  const extraInstruction = userPrompt
    ? `\n\nAdditional instructions from the user: ${userPrompt}`
    : ''

  return [
    { role: 'system', content: MERGE_SYSTEM + extraInstruction },
    {
      role: 'user',
      content: `Merge these document mind maps into a unified mind map:\n\n${docs}`,
    },
  ]
}
