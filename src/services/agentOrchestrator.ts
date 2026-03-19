import type { PDFDocument, AgentTask } from '../types'
import {
  callLLM,
  buildExtractionPrompt,
  buildMergePrompt,
  buildExpansionPrompt,
  buildConnectionPrompt,
} from './llmService'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:3001/api'

/**
 * Checks which LLM providers are actually available by querying the backend health endpoint.
 * Falls back to openai-only if the health check fails.
 */
async function getAvailableProviders(): Promise<Record<string, boolean>> {
  try {
    const resp = await fetch(`${API_BASE}/health`)
    if (!resp.ok) return { openai: true }
    const data = await resp.json()
    return data.models ?? { openai: true }
  } catch {
    return { openai: true }
  }
}

/**
 * Model routing strategy:
 * - Gemini 3.1 Pro: large documents (long context window)
 * - Claude Sonnet 4.6: fast extraction for shorter docs
 * - Claude Opus 4.6: complex relationship reasoning
 * - GPT 5.2: coordination and merging (primary)
 * - GPT Codex 5.3: code-related documents
 *
 * Falls back to the OpenAI/Azure OpenAI provider when others are unavailable.
 */
function selectModelForDocument(
  doc: PDFDocument,
  available: Record<string, boolean>
): { provider: string; model: string } {
  const fallback = { provider: 'openai', model: 'gpt-5.2' }
  const textLength = doc.text.length

  // Large documents → Gemini (large context)
  if (textLength > 20000 && available.google) {
    return { provider: 'google', model: 'gemini-3.1-pro' }
  }

  // Code-heavy documents → Codex
  const codeIndicators = ['function', 'class', 'import', 'def ', 'const ', 'let ', 'var ']
  const codeScore = codeIndicators.reduce(
    (score, ind) => score + (doc.text.includes(ind) ? 1 : 0),
    0
  )
  if (codeScore >= 3 && available.openai) {
    return { provider: 'openai-codex', model: 'gpt-codex-5.3' }
  }

  // Medium docs → Claude Sonnet (fast)
  if (textLength > 5000 && available.anthropic) {
    return { provider: 'anthropic', model: 'claude-sonnet-4.6' }
  }

  // Short docs → Claude Sonnet (fast)
  if (available.anthropic) {
    return { provider: 'anthropic', model: 'claude-sonnet-4.6' }
  }

  // Fallback: use whatever OpenAI provider is configured (works with Azure too)
  return fallback
}

export type ProgressCallback = (tasks: AgentTask[]) => void

/**
 * Process multiple documents with parallel agents.
 * Each document gets its own agent, then a coordinator merges the results.
 */
export async function processDocumentsWithAgents(
  documents: PDFDocument[],
  onProgress?: ProgressCallback
): Promise<{ markdown: string; tasks: AgentTask[] }> {
  // Check which providers are actually available
  const available = await getAvailableProviders()

  // Create extraction tasks — one per document
  const extractionTasks: AgentTask[] = documents.map((doc) => {
    const { provider, model } = selectModelForDocument(doc, available)
    return {
      id: `extract-${doc.id}`,
      type: 'extract' as const,
      documentId: doc.id,
      model: `${provider}/${model}`,
      status: 'pending' as const,
      input: doc.text,
    }
  })

  onProgress?.([...extractionTasks])

  // Run extraction agents in parallel
  const extractionResults = await Promise.allSettled(
    extractionTasks.map(async (task, idx) => {
      task.status = 'running'
      onProgress?.([...extractionTasks])

      try {
        const [provider, model] = task.model.split('/')
        const messages = buildExtractionPrompt(task.input, documents[idx].name)
        const response = await callLLM({
          provider: provider as any,
          model,
          messages,
        })
        task.status = 'done'
        task.output = response.content
        onProgress?.([...extractionTasks])
        return response.content
      } catch (err) {
        task.status = 'error'
        task.output = String(err)
        onProgress?.([...extractionTasks])
        throw err
      }
    })
  )

  // Collect successful extractions
  const markdowns: string[] = []
  const docNames: string[] = []
  extractionResults.forEach((result, idx) => {
    if (result.status === 'fulfilled') {
      markdowns.push(result.value)
      docNames.push(documents[idx].name)
    }
  })

  if (markdowns.length === 0) {
    throw new Error('All document extraction agents failed')
  }

  // Single document — no merge needed
  if (markdowns.length === 1) {
    return { markdown: markdowns[0], tasks: extractionTasks }
  }

  // Multiple documents — coordinator agent merges
  const mergeTask: AgentTask = {
    id: 'merge-coordinator',
    type: 'merge',
    model: 'openai/gpt-5.2',
    status: 'running',
    input: markdowns.join('\n---\n'),
  }

  const allTasks = [...extractionTasks, mergeTask]
  onProgress?.(allTasks)

  try {
    const mergeMessages = buildMergePrompt(markdowns, docNames)
    const mergeResponse = await callLLM({
      provider: 'openai',
      model: 'gpt-5.2',
      messages: mergeMessages,
    })
    mergeTask.status = 'done'
    mergeTask.output = mergeResponse.content
    onProgress?.(allTasks)
    return { markdown: mergeResponse.content, tasks: allTasks }
  } catch (err) {
    mergeTask.status = 'error'
    mergeTask.output = String(err)
    onProgress?.(allTasks)
    // Fallback: concatenate individual results
    const fallback = markdowns
      .map((md, i) => `# ${docNames[i]}\n\n${md}`)
      .join('\n\n')
    return { markdown: fallback, tasks: allTasks }
  }
}

/**
 * Expand a node by generating new sub-concepts.
 * Prefers Claude Opus for reasoning but falls back to OpenAI/Azure.
 */
export async function expandNode(
  nodeLabel: string,
  nodeContext: string,
  existingMarkdown: string
): Promise<string> {
  const available = await getAvailableProviders()
  const provider = available.anthropic ? 'anthropic' : 'openai'
  const model = available.anthropic ? 'claude-opus-4.6' : 'gpt-5.2'

  const messages = buildExpansionPrompt(nodeLabel, nodeContext, existingMarkdown)
  const response = await callLLM({
    provider: provider as any,
    model,
    messages,
  })
  return response.content
}

/**
 * Find or create connections between two disjoint nodes.
 * Prefers Claude Opus for reasoning but falls back to OpenAI/Azure.
 */
export async function findConnections(
  nodeA: string,
  nodeB: string,
  existingMarkdown: string
): Promise<{ relation: string; bridge: string; newConcepts: string }> {
  const available = await getAvailableProviders()
  const provider = available.anthropic ? 'anthropic' : 'openai'
  const model = available.anthropic ? 'claude-opus-4.6' : 'gpt-5.2'

  const messages = buildConnectionPrompt(nodeA, nodeB, existingMarkdown)
  const response = await callLLM({
    provider: provider as any,
    model,
    messages,
  })

  const lines = response.content.split('\n')
  const relation = lines.find((l) => l.startsWith('RELATION:'))?.replace('RELATION:', '').trim() ?? ''
  const bridge = lines.find((l) => l.startsWith('BRIDGE:'))?.replace('BRIDGE:', '').trim() ?? 'none'
  const conceptStart = lines.findIndex((l) => l.startsWith('NEW_CONCEPTS:'))
  const newConcepts =
    conceptStart >= 0
      ? lines
          .slice(conceptStart)
          .join('\n')
          .replace('NEW_CONCEPTS:', '')
          .trim()
      : ''

  return { relation, bridge, newConcepts }
}
