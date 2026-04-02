import type { LLMProvider } from '../types'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:3001/api'

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

/**
 * Calls the LLM API through the backend proxy.
 * The backend handles API keys and routing to the correct provider.
 */
export async function callLLM(options: LLMCallOptions): Promise<LLMResponse> {
  const {
    provider = 'openai',
    model = 'gpt-5.2',
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

/* ── Prompt templates ── */

export function buildExtractionPrompt(documentText: string, documentName: string): LLMMessage[] {
  return [
    {
      role: 'system',
      content: `You are an expert at extracting structured knowledge from documents. 
Given a document, extract the key concepts, their hierarchical relationships, and semantic connections.
Output ONLY valid markdown in a mind-map hierarchy using headings (# ## ### etc.) and bullet points.
Include tags like [Hard], [Important], or [Low Priority] where appropriate.
Add brief descriptions as sub-bullets where they add value.
Group related concepts under common parent headings.
Identify cross-cutting themes that connect different sections.`,
    },
    {
      role: 'user',
      content: `Extract a structured mind map from this document "${documentName}":\n\n${documentText.slice(0, 30000)}`,
    },
  ]
}

export function buildMergePrompt(markdowns: string[], docNames: string[]): LLMMessage[] {
  const docs = markdowns
    .map((md, i) => `--- Document: ${docNames[i]} ---\n${md}`)
    .join('\n\n')

  return [
    {
      role: 'system',
      content: `You are an expert at synthesizing knowledge from multiple documents into a unified mind map.
Given multiple document mind maps, merge them into a single coherent mind map that:
1. Identifies common themes and groups them together
2. Preserves unique concepts from each document
3. Creates cross-document connections where concepts relate
4. Uses a clear hierarchy with the main topic as the root
5. Adds [Cross-Doc] tag to nodes that connect multiple documents
Output ONLY valid markdown in mind-map hierarchy format.`,
    },
    {
      role: 'user',
      content: `Merge these document mind maps into a unified mind map:\n\n${docs}`,
    },
  ]
}

export function buildExpansionPrompt(
  nodeLabel: string,
  nodeContext: string,
  existingMarkdown: string
): LLMMessage[] {
  return [
    {
      role: 'system',
      content: `You are an expert at expanding concepts in a mind map.
Given a concept node and its context, generate 3-5 sub-concepts that elaborate on this idea.
Output ONLY the new sub-concepts as markdown bullet points (no heading for the parent).
Include tags like [Hard], [Important] where appropriate.
Be specific and insightful, not generic.`,
    },
    {
      role: 'user',
      content: `Expand the concept "${nodeLabel}" in the context of:\n${nodeContext}\n\nExisting mind map:\n${existingMarkdown.slice(0, 5000)}`,
    },
  ]
}

export function buildConnectionPrompt(
  nodeA: string,
  nodeB: string,
  existingMarkdown: string
): LLMMessage[] {
  return [
    {
      role: 'system',
      content: `You are an expert at finding semantic connections between concepts.
Given two concepts from a mind map, identify the relationship between them.
If they are related, describe the connection in one sentence.
If they are not directly related, suggest a bridging concept.
Output format:
RELATION: <brief relationship description>
BRIDGE: <bridging concept if needed, or "none">
NEW_CONCEPTS: <any new sub-concepts that emerge from this connection, as markdown bullets>`,
    },
    {
      role: 'user',
      content: `Find connections between "${nodeA}" and "${nodeB}" in this mind map:\n${existingMarkdown.slice(0, 5000)}`,
    },
  ]
}
