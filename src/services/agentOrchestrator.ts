// [EduMap fix] 2026-04-22 (post-merge cleanup):
// Shaun's PR #6 ("Add recursive LLM extraction") and Yana's Round F work
// ("two-stage harvest → organize pipeline") both landed via `git merge
// --strategy-option=ours … --no-ff` + accept-both, which left this file
// with duplicated imports, two half-merged `processDocumentsWithAgents`
// implementations, and references to names that no longer exist
// (`available`, `GOOGLE_MODEL`, `pickFallbackProvider`). This rewrite
// keeps BOTH pipelines:
//
//   • Default (recursive=false): per-document harvest → organize
//     (our semantic-reorganization path).
//   • Opt-in (recursive=true): Shaun's three-pass root → branches →
//     expand-each-branch path. Useful for longer papers where one LLM
//     call is too lossy.
//
// Both pipelines feed the same final merge step, which builds a unified
// multi-document map via `buildMergePrompt`.

import type {
  PDFDocument,
  AgentTask,
  LLMProvider,
  HealthResult,
  ProviderStatus,
} from '../types'
import {
  PROVIDER_CHAIN,
  callLLM,
  callWithFallback,
  buildHarvestPrompt,
  buildOrganizePrompt,
  parseRootTopic,
  parseBranchHeadings,
  assembleRecursiveMarkdown,
} from './llmService'
import {
  buildExtractionPrompt,
  buildRootTopicPrompt,
  buildBranchConceptsPrompt,
  buildExpansionPrompt,
  buildMergePrompt,
} from './prompts'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:3001/api'

// Re-export for callers that used to import PROVIDER_CHAIN from this
// module. Canonical source now lives in llmService.ts.
export { PROVIDER_CHAIN }

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
  Boolean(providers[p]?.configured && providers[p]?.reachable)

function firstAvailableLabel(providers: Record<string, ProviderStatus>): string {
  for (const c of PROVIDER_CHAIN) {
    if (isReachable(c.provider, providers)) return `${c.provider}/${c.model}`
  }
  return 'unknown'
}

/**
 * Heuristics to pick an initial provider/model for a document.
 * `callWithFallback` handles failover at call time, so this is a best-effort hint.
 *
 * [EduMap multimodal] 2026-04-21: Dropped the hardcoded `gpt-codex-5.3`
 * code-path route — that model id is not real and caused 500s for any
 * paper whose token mix tripped the code heuristic. Code-heavy docs now
 * route to plain OpenAI (`gpt-5.2`); the backend's OPENAI_MODEL env still
 * wins if set.
 */
function selectModelForDocument(
  doc: PDFDocument,
  providers: Record<string, ProviderStatus>,
): { provider: LLMProvider; model: string } {
  const textLength = doc.text.length
  const reachable = (p: string) => isReachable(p, providers)

  // Long docs benefit from Gemini's large context window
  if (textLength > 20000 && reachable('google')) {
    return { provider: 'google', model: 'gemini-2.5-flash' }
  }

  // Code-heavy docs: prefer OpenAI, then Google
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

// ── Progress callback type ──────────────────────────────────────────

export type ProgressCallback = (tasks: AgentTask[]) => void

// ── Recursive extraction (Shaun, PR #6) ─────────────────────────────

/**
 * Three-pass extraction: pick root → identify branches → expand each branch.
 *
 * Falls back to a single-shot `buildExtractionPrompt` if either of the
 * first two passes produces output we can't parse (no root, or fewer
 * than two branches). The fallback keeps the call count bounded even
 * when the LLM misbehaves on a short or unusual document.
 */
async function recursiveExtract(
  doc: PDFDocument,
  providers: Record<string, ProviderStatus>,
  userPrompt?: string,
  onStatus?: (msg: string) => void,
): Promise<string> {
  // Pass 1: root topic
  onStatus?.('Pass 1/3: Identifying root topic...')
  const rootResponse = await callWithFallback(
    providers,
    buildRootTopicPrompt(doc.text, doc.name, userPrompt),
  )
  const rootTopic = parseRootTopic(rootResponse.content)

  if (!rootTopic) {
    onStatus?.('Root topic parse failed, falling back to single-pass...')
    return (
      await callWithFallback(providers, buildExtractionPrompt(doc.text, doc.name, userPrompt))
    ).content
  }
  onStatus?.(`Root topic: ${rootTopic}`)

  // Pass 2: branch concepts
  onStatus?.('Pass 2/3: Identifying branch concepts...')
  const branchResponse = await callWithFallback(
    providers,
    buildBranchConceptsPrompt(doc.text, rootTopic, doc.name, userPrompt),
  )
  const branches = parseBranchHeadings(branchResponse.content)

  if (branches.length < 2) {
    onStatus?.('Too few branches, falling back to single-pass...')
    return (
      await callWithFallback(providers, buildExtractionPrompt(doc.text, doc.name, userPrompt))
    ).content
  }
  onStatus?.(`Found ${branches.length} branches: ${branches.join(', ')}`)

  // Pass 3: expand each branch (sequential — keeps rate-limiting sane)
  const expansions = new Map<string, string>()
  for (let i = 0; i < branches.length; i++) {
    const heading = branches[i]
    onStatus?.(`Pass 3/3: Expanding ${i + 1}/${branches.length}: ${heading}`)
    try {
      const res = await callWithFallback(
        providers,
        buildExpansionPrompt(doc.text, heading, doc.name, userPrompt),
      )
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

/**
 * Run the document → markdown pipeline for every uploaded PDF, then merge.
 *
 * `options.recursive` toggles between:
 *   - false (default): per-doc harvest → organize (semantic clustering,
 *     one task PAIR per document in the progress UI).
 *   - true:            per-doc 3-pass recursive extraction (one `extract`
 *     task per document, streaming sub-step progress via `task.output`).
 *
 * Whichever pipeline ran, the successful per-doc markdowns are collected
 * and fed to `buildMergePrompt` if there's more than one document.
 */
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

  const extractionTasks: AgentTask[] = []
  let extractionResults: PromiseSettledResult<string>[]

  if (recursive) {
    // ── Recursive path: one 'extract' task per document ───────────────
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
    extractionTasks.push(...tasks)
    onProgress?.([...extractionTasks])

    extractionResults = await Promise.allSettled(
      tasks.map(async (task, idx) => {
        const doc = documents[idx]
        task.status = 'running'
        onProgress?.([...extractionTasks])
        try {
          const content = await recursiveExtract(doc, providers, userPrompt, (msg) => {
            task.output = msg
            onProgress?.([...extractionTasks])
          })
          task.status = 'done'
          task.output = content
          onProgress?.([...extractionTasks])
          return content
        } catch (err) {
          task.status = 'error'
          task.output = String(err)
          onProgress?.([...extractionTasks])
          throw err
        }
      }),
    )
  } else {
    // ── Default path: per-doc harvest → organize ──────────────────────
    // [EduMap fix] 2026-04-22: Two tasks per document — harvest and
    // organize. They run sequentially for the same document (organize
    // needs harvest's output) but the per-document pipelines still run
    // in parallel with each other, so multi-doc throughput is unchanged.
    const perDocTasks = documents.map((doc) => {
      const { provider, model } = selectModelForDocument(doc, providers)
      const modelStr = `${provider}/${model}`
      const harvest: AgentTask = {
        id: `harvest-${doc.id}`,
        type: 'harvest',
        documentId: doc.id,
        model: modelStr,
        status: 'pending',
        input: doc.text,
      }
      const organize: AgentTask = {
        id: `organize-${doc.id}`,
        type: 'organize',
        documentId: doc.id,
        model: modelStr,
        status: 'pending',
        input: '', // filled in once harvest completes
      }
      return { harvest, organize, provider, model }
    })

    for (const { harvest, organize } of perDocTasks) {
      extractionTasks.push(harvest, organize)
    }
    onProgress?.([...extractionTasks])

    extractionResults = await Promise.allSettled(
      perDocTasks.map(async ({ harvest, organize, provider, model }, idx) => {
        const doc = documents[idx]

        // ── Stage 1: harvest ───────────────────────────────────────
        harvest.status = 'running'
        onProgress?.([...extractionTasks])
        let atoms: string
        try {
          const harvestMessages = buildHarvestPrompt(doc.text, doc.name, userPrompt)
          const harvestResponse = await callLLM({
            provider,
            model,
            messages: harvestMessages,
          })
          atoms = harvestResponse.content.trim()
          harvest.status = 'done'
          harvest.output = atoms
          onProgress?.([...extractionTasks])
        } catch (err) {
          harvest.status = 'error'
          harvest.output = String(err)
          // Cascade: organize cannot run without atoms.
          organize.status = 'error'
          organize.output = 'Skipped — harvest step failed.'
          onProgress?.([...extractionTasks])
          throw err
        }

        // Defensive: an empty atom list would produce an empty organize
        // call. Treat it as a soft failure so the user isn't staring
        // at an empty mindmap.
        if (!atoms) {
          organize.status = 'error'
          organize.output = 'Skipped — harvest returned no atoms.'
          onProgress?.([...extractionTasks])
          throw new Error(`Harvest for "${doc.name}" returned no atoms.`)
        }

        // ── Stage 2: organize ──────────────────────────────────────
        organize.input = atoms
        organize.status = 'running'
        onProgress?.([...extractionTasks])
        try {
          const organizeMessages = buildOrganizePrompt(atoms, doc.name, userPrompt)
          const organizeResponse = await callLLM({
            provider,
            model,
            messages: organizeMessages,
          })
          organize.status = 'done'
          organize.output = organizeResponse.content
          onProgress?.([...extractionTasks])
          return organizeResponse.content
        } catch (err) {
          organize.status = 'error'
          organize.output = String(err)
          onProgress?.([...extractionTasks])
          throw err
        }
      }),
    )
  }

  // ── Collect successful per-document markdowns ─────────────────────
  const markdowns: string[] = []
  const docNames: string[] = []
  extractionResults.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      markdowns.push(r.value)
      docNames.push(documents[i].name)
    }
  })

  if (markdowns.length === 0) {
    // [EduMap multimodal] 2026-04-21: surface the first agent error so
    // users see *why* extraction failed (bad model id vs auth vs down
    // backend), not just a generic "all agents failed".
    //
    // [EduMap fix] 2026-04-22: with the two-stage pipeline, prefer the
    // earliest error — harvest failures explain organize failures.
    const firstError = extractionTasks.find((t) => t.status === 'error')?.output
    const detail = firstError ? `\n${firstError}` : ''
    throw new Error(`All document extraction agents failed.${detail}`)
  }

  // Single document — no merge needed.
  if (markdowns.length === 1) {
    return { markdown: markdowns[0], tasks: [...extractionTasks] }
  }

  // ── Merge ─────────────────────────────────────────────────────────
  const mergeTask: AgentTask = {
    id: 'merge-coordinator',
    type: 'merge',
    model: firstAvailableLabel(providers),
    status: 'running',
    input: markdowns.join('\n---\n'),
  }
  const allTasks = [...extractionTasks, mergeTask]
  onProgress?.([...allTasks])

  try {
    const mergeResponse = await callWithFallback(
      providers,
      buildMergePrompt(markdowns, docNames, userPrompt),
    )
    mergeTask.status = 'done'
    mergeTask.output = mergeResponse.content
    onProgress?.([...allTasks])
    return { markdown: mergeResponse.content, tasks: allTasks }
  } catch (err) {
    mergeTask.status = 'error'
    mergeTask.output = String(err)
    onProgress?.([...allTasks])
    // Graceful fallback: present each doc's map under its own root.
    return {
      markdown: markdowns.map((md, i) => `# ${docNames[i]}\n\n${md}`).join('\n\n'),
      tasks: allTasks,
    }
  }
}
