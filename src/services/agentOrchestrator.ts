import type { PDFDocument, AgentTask, LLMProvider, HealthResult, ProviderStatus } from '../types'
import {

  parseRootTopic,
  parseBranchHeadings,
  assembleRecursiveMarkdown,
  callWithFallback,
} from './llmService'

import {
  buildExtractionPrompt,
  buildRootTopicPrompt,
  buildBranchConceptsPrompt,
  buildExpansionPrompt,
  buildMergePrompt,
} from './prompts.ts'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:3001/api'

export const PROVIDER_CHAIN: { provider: LLMProvider; model: string }[] = [
  { provider: 'google', model: 'gemini-2.5-flash' },
  { provider: 'openai', model: 'gpt-5.2' },
  { provider: 'anthropic', model: 'claude-sonnet-4.6' },
]

// ── Health check ────────────────────────────────────────────────────

export async function getAvailableProviders(): Promise<HealthResult> {
  try {
    const resp = await fetch(`${API_BASE}/health`)
    if (!resp.ok) return { status: 'unavailable', reason: `health returned ${resp.status}` }

    const data = await resp.json()
    const models = data?.models
    if (!models || typeof models !== 'object' || Array.isArray(models)) {
      return { status: 'unavailable', reason: 'invalid health response' }
    }
    return { status: 'ok', providers: models as Record<string, ProviderStatus> }
  } catch (e) {
    return { status: 'unavailable', reason: e instanceof Error ? e.message : String(e) }
  }
}

// ── Provider selection ──────────────────────────────────────────────

const isReachable = (p: string, providers: Record<string, ProviderStatus>) =>
  providers[p]?.configured && providers[p]?.reachable

function firstAvailableLabel(providers: Record<string, ProviderStatus>): string {
  for (const c of PROVIDER_CHAIN) {
    if (isReachable(c.provider, providers)) return `${c.provider}/${c.model}`
  }
  return 'unknown'
}

/**
 * Heuristics to pick an initial provider/model for a document.
 * callWithFallback handles failover at call time, so this is a best-effort hint.
 */
function selectModelForDocument(
  doc: PDFDocument,
  providers: Record<string, ProviderStatus>,
): { provider: string; model: string } {
  const textLength = doc.text.length
  const reachable = (p: string) => isReachable(p, providers)

  // Long docs benefit from Gemini's large context window
  if (textLength > 20000 && reachable('google')) {
    return { provider: 'google', model: 'gemini-2.5-flash' }
  }

  // Code-heavy docs
  const codeIndicators = ['function', 'class', 'import', 'def ', 'const ', 'let ', 'var ']
  const codeScore = codeIndicators.reduce((s, ind) => s + (doc.text.includes(ind) ? 1 : 0), 0)
  if (codeScore >= 3) {
    if (reachable('openai')) return { provider: 'openai', model: 'gpt-5.2' }
    if (reachable('google')) return { provider: 'google', model: 'gemini-2.5-flash' }
  }

  // Medium-length docs
  if (textLength > 5000 && reachable('anthropic')) {
    return { provider: 'anthropic', model: 'claude-sonnet-4.6' }
  }

  // Default: first reachable in chain
  for (const c of PROVIDER_CHAIN) {
    if (reachable(c.provider)) return { provider: c.provider, model: c.model }
  }
  throw new Error('No LLM provider is both configured and reachable.')
}

// ── Recursive extraction ────────────────────────────────────────────

export type ProgressCallback = (tasks: AgentTask[]) => void

async function recursiveExtract(
  doc: PDFDocument,
  providers: Record<string, ProviderStatus>,
  userPrompt?: string,
  onStatus?: (msg: string) => void,
): Promise<string> {
  // Pass 1: root topic
  onStatus?.('Pass 1/3: Identifying root topic...')
  const rootResponse = await callWithFallback(providers, buildRootTopicPrompt(doc.text, doc.name, userPrompt))
  const rootTopic = parseRootTopic(rootResponse.content)

  if (!rootTopic) {
    onStatus?.('Root topic parse failed, falling back to single-pass...')
    return (await callWithFallback(providers, buildExtractionPrompt(doc.text, doc.name, userPrompt))).content
  }
  onStatus?.(`Root topic: ${rootTopic}`)

  // Pass 2: branch concepts
  onStatus?.('Pass 2/3: Identifying branch concepts...')
  const branchResponse = await callWithFallback(providers, buildBranchConceptsPrompt(doc.text, rootTopic, doc.name, userPrompt))
  const branches = parseBranchHeadings(branchResponse.content)

  if (branches.length < 2) {
    onStatus?.('Too few branches, falling back to single-pass...')
    return (await callWithFallback(providers, buildExtractionPrompt(doc.text, doc.name, userPrompt))).content
  }
  onStatus?.(`Found ${branches.length} branches: ${branches.join(', ')}`)

  // Pass 3: expand each branch
  const expansions = new Map<string, string>()
  for (let i = 0; i < branches.length; i++) {
    const heading = branches[i]
    onStatus?.(`Pass 3/3: Expanding ${i + 1}/${branches.length}: ${heading}`)
    try {
      const res = await callWithFallback(providers, buildExpansionPrompt(doc.text, heading, doc.name, userPrompt))
      expansions.set(heading, res.content)
    } catch (err) {
      console.error(`Expansion failed for "${heading}":`, err)
      onStatus?.(`Expansion failed for "${heading}", skipping...`)
    }
  }

  onStatus?.('Assembling final mind map...')
  return assembleRecursiveMarkdown(rootTopic, branchResponse.content, expansions)
}

// ── Main entry point ────────────────────────────────────────────────

export async function processDocumentsWithAgents(
  documents: PDFDocument[],
  onProgress?: ProgressCallback,
  userPrompt?: string,
  options?: { recursive?: boolean },
): Promise<{ markdown: string; tasks: AgentTask[] }> {
  const recursive = options?.recursive ?? false

  const health = await getAvailableProviders()
  if (health.status !== 'ok') throw new Error(`LLM unavailable: ${health.reason}`)
  const providers = health.providers

  // Extraction tasks
  const tasks: AgentTask[] = documents.map((doc) => {
    const { provider, model } = selectModelForDocument(doc, providers)
    return {
      id: `extract-${doc.id}`,
      type: 'extract' as const,
      documentId: doc.id,
      model: `${provider}/${model}`,
      status: 'pending' as const,
      input: doc.text,
    }
  })
  onProgress?.([...tasks])

  const results = await Promise.allSettled(
    tasks.map(async (task, idx) => {
      task.status = 'running'
      onProgress?.([...tasks])

      try {
        const doc = documents[idx]
        const content = recursive
          ? await recursiveExtract(doc, providers, userPrompt, (msg) => {
              task.output = msg
              onProgress?.([...tasks])
            })
          : (await callWithFallback(providers, buildExtractionPrompt(doc.text, doc.name, userPrompt))).content

        task.status = 'done'
        task.output = content
        onProgress?.([...tasks])
        return content
      } catch (err) {
        task.status = 'error'
        task.output = String(err)
        onProgress?.([...tasks])
        throw err
      }
    }),
  )

  // Collect successes
  const markdowns: string[] = []
  const docNames: string[] = []
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      markdowns.push(r.value)
      docNames.push(documents[i].name)
    }
  })

  if (markdowns.length === 0) throw new Error('All extraction agents failed')
  if (markdowns.length === 1) return { markdown: markdowns[0], tasks }

  // Merge
  const mergeTask: AgentTask = {
    id: 'merge-coordinator',
    type: 'merge',
    model: firstAvailableLabel(providers),
    status: 'running',
    input: markdowns.join('\n---\n'),
  }
  const allTasks = [...tasks, mergeTask]
  onProgress?.(allTasks)

  try {
    const mergeResponse = await callWithFallback(providers, buildMergePrompt(markdowns, docNames, userPrompt))
    mergeTask.status = 'done'
    mergeTask.output = mergeResponse.content
    onProgress?.(allTasks)
    return { markdown: mergeResponse.content, tasks: allTasks }
  } catch (err) {
    mergeTask.status = 'error'
    mergeTask.output = String(err)
    onProgress?.(allTasks)
    return {
      markdown: markdowns.map((md, i) => `# ${docNames[i]}\n\n${md}`).join('\n\n'),
      tasks: allTasks,
    }
  }
}