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
import type { PDFDocument, AgentTask, LLMProvider } from '../types'
// [EduMap fix] 2026-04-22: Swapped the single-shot `buildExtractionPrompt`
// for the two-stage `buildHarvestPrompt` + `buildOrganizePrompt` pair.
// See llmService.ts for why the job was split (short version: the old
// single-shot pass kept mirroring the paper's section order; splitting
// concept-harvesting from semantic-organization forces the cluster
// decision to happen with the full concept landscape in view).
import {
  callLLM,
  buildHarvestPrompt,
  buildOrganizePrompt,
  buildMergePrompt,
} from './llmService'

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
/**
 * Default extract/merge target when heuristics do not apply.
 *
 * [EduMap multimodal] 2026-04-21: Reordered OpenAI ahead of Google because the
 * team's primary deployment is Azure OpenAI (teammate) / standard OpenAI (Jun)
 * — with only OPENAI_API_KEY set, the previous Google-first order caused the
 * orchestrator to match nothing useful, fail, and fall back to raw PDF text
 * (which is exactly what Jun was seeing: "只有一个PDF文件, 没有思维导图").
 *
 * Model default: `gpt-4o`. Jun hit a 400 "temperature does not support 0.3"
 * after first routing to gpt-5 for the drug-use PDF — gpt-5 only accepts the
 * default temperature on the chat API. We default to gpt-4o (which accepts
 * arbitrary temperature and is on every paid account) and let the backend
 * OPENAI_MODEL env var override it. If someone wants to use gpt-5, the
 * backend strips temperature automatically (server/routes/llm.ts).
 */
function pickFallbackProvider(available: Record<string, boolean>): {
  provider: LLMProvider
  model: string
} {
  if (available.openai) return { provider: 'openai', model: 'gpt-4o' }
  if (available.anthropic) return { provider: 'anthropic', model: 'claude-sonnet-4.6' }
  if (available.google) return { provider: 'google', model: GOOGLE_MODEL }
  throw new Error(
    'No LLM provider is available. Ensure the API server is running and set OPENAI_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_API_KEY in .env.'
  )
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
  const codeScore = codeIndicators.reduce(
    (score, ind) => score + (doc.text.includes(ind) ? 1 : 0),
    0
  )
  // [EduMap multimodal] 2026-04-21: Dropped the hardcoded `gpt-codex-5.3`
  // model — that name isn't a real OpenAI model id and caused the
  // extraction to 500 out whenever an academic paper tripped the code
  // heuristic (most ML papers have enough `import`/`def`/`class` tokens
  // to hit score≥3). Route code-heavy docs to plain OpenAI with the
  // default model instead; OPENAI_MODEL env on the backend still wins.
  if (codeScore >= 3 && available.openai) {
    return { provider: 'openai', model: 'gpt-4o' }
  }
  if (codeScore >= 3 && available.google) {
    return { provider: 'google', model: GOOGLE_MODEL }
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
  // [EduMap fix] 2026-04-22: Two tasks per document — harvest and organize.
  // They run sequentially for the same document (organize needs harvest's
  // output) but the per-document pipelines still run in parallel with each
  // other, so multi-doc throughput is unchanged.
  const perDocTasks: { harvest: AgentTask; organize: AgentTask }[] = documents.map(
    (doc) => {
      const { provider, model } = selectModelForDocument(doc, available)
      const modelStr = `${provider}/${model}`
      return {
        harvest: {
          id: `harvest-${doc.id}`,
          type: 'harvest' as const,
          documentId: doc.id,
          model: modelStr,
          status: 'pending' as const,
          input: doc.text,
        },
        organize: {
          id: `organize-${doc.id}`,
          type: 'organize' as const,
          documentId: doc.id,
          model: modelStr,
          status: 'pending' as const,
          input: '', // filled in after harvest completes
        },
      }
    }
  )

  // Flat task list for the progress UI. The UI renders whatever is in
  // this array in order, so put harvest before organize per document.
  const extractionTasks: AgentTask[] = perDocTasks.flatMap((p) => [
    p.harvest,
    p.organize,
  ])
  onProgress?.([...extractionTasks])

  // Run the per-document pipelines in parallel. Each pipeline is
  // harvest → organize; failures in harvest skip organize for that doc.
  const extractionResults = await Promise.allSettled(
    perDocTasks.map(async ({ harvest, organize }, idx) => {
      const doc = documents[idx]
      const [provider, model] = harvest.model.split('/')

      // ── Stage 1: harvest ─────────────────────────────────────────
      harvest.status = 'running'
      onProgress?.([...extractionTasks])
      let atoms: string
      try {
        const harvestMessages = buildHarvestPrompt(doc.text, doc.name, userPrompt)
        const harvestResponse = await callLLM({
          provider: provider as LLMProvider,
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
        // Cascade: organize cannot run without atoms. Mark it errored so
        // the user sees why it was skipped.
        organize.status = 'error'
        organize.output = 'Skipped — harvest step failed.'
        onProgress?.([...extractionTasks])
        throw err
      }

      // Defensive: a completely empty atom list would produce an empty
      // organize call. Treat it as a soft failure and fall back to
      // showing the raw harvest output so the user isn't staring at an
      // empty mindmap.
      if (!atoms) {
        organize.status = 'error'
        organize.output = 'Skipped — harvest returned no atoms.'
        onProgress?.([...extractionTasks])
        throw new Error(`Harvest for "${doc.name}" returned no atoms.`)
      }

      // ── Stage 2: organize ────────────────────────────────────────
      organize.input = atoms
      organize.status = 'running'
      onProgress?.([...extractionTasks])
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
        const organizeMessages = buildOrganizePrompt(atoms, doc.name, userPrompt)
        const organizeResponse = await callLLM({
          provider: provider as LLMProvider,
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

  // Collect successes
  // Collect successful per-document markdowns (output of the organize step).
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
  if (markdowns.length === 0) {
    // [EduMap multimodal] 2026-04-21: Include the first task's actual
    // error instead of a generic message. Without this Jun just saw
    // "All document extraction agents failed" in the root node and had
    // no way to know whether it was a bad model id, an auth error, or
    // the backend being down.
    //
    // [EduMap fix] 2026-04-22: With two stages, prefer the earliest
    // error message — harvest failures explain organize failures, so
    // surfacing harvest's error is more useful when both failed.
    const firstError = extractionTasks.find((t) => t.status === 'error')?.output
    const detail = firstError ? `\n${firstError}` : ''
    throw new Error(`All document extraction agents failed.${detail}`)
  }

  // Single document — no merge needed
  if (markdowns.length === 1) {
    return { markdown: markdowns[0], tasks: extractionTasks }
  }

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