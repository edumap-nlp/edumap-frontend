import type { PDFDocument, AgentTask, LLMProvider } from '../types'
import { callLLM, buildExtractionPrompt, buildMergePrompt } from './llmService'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:3001/api'

const GOOGLE_MODEL = 'gemini-2.5-flash'

export type HealthResult =
  | { status: 'ok'; providers: Record<string, boolean> }
  | { status: 'unavailable'; reason: string }

/**
 * Fetches /api/health and returns validated provider flags, or why we could not use them.
 */
export async function getAvailableProviders(): Promise<HealthResult> {
  try {
    const resp = await fetch(`${API_BASE}/health`)
    if (!resp.ok) {
      return { status: 'unavailable', reason: `health returned ${resp.status}` }
    }
    const data: unknown = await resp.json()
    if (!data || typeof data !== 'object' || !('models' in data)) {
      return { status: 'unavailable', reason: 'health response missing models' }
    }
    const models = (data as { models: unknown }).models
    if (!models || typeof models !== 'object' || Array.isArray(models)) {
      return { status: 'unavailable', reason: 'health models is not a valid object' }
    }
    return { status: 'ok', providers: models as Record<string, boolean> }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { status: 'unavailable', reason: msg }
  }
}

/**
 * Default extract/merge target when heuristics do not apply.
 *
 * [EduMap multimodal] 2026-04-21: Reordered OpenAI ahead of Google because the
 * team's primary deployment is Azure OpenAI (teammate) / standard OpenAI (Jun)
 * — with only OPENAI_API_KEY set, the previous Google-first order caused the
 * orchestrator to match nothing useful, fail, and fall back to raw PDF text
 * (which is exactly what Jun was seeing: "只有一个PDF文件, 没有思维导图").
 *
 * Also bumped the OpenAI default model from the future-dated `gpt-5.2` to
 * `gpt-5` to match OPENAI_DEPLOYMENT_NAME in .env.example. The backend
 * (server/routes/llm.ts) honours an OPENAI_MODEL env override so accounts
 * without gpt-5 access can pin e.g. `gpt-4o` without touching this code.
 */
function pickFallbackProvider(available: Record<string, boolean>): {
  provider: LLMProvider
  model: string
} {
  if (available.openai) return { provider: 'openai', model: 'gpt-5' }
  if (available.anthropic) return { provider: 'anthropic', model: 'claude-sonnet-4.6' }
  if (available.google) return { provider: 'google', model: GOOGLE_MODEL }
  throw new Error(
    'No LLM provider is available. Ensure the API server is running and set OPENAI_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_API_KEY in .env.'
  )
}

/**
 * Heuristics for extraction; anything that does not match uses pickFallbackProvider.
 */
function selectModelForDocument(
  doc: PDFDocument,
  available: Record<string, boolean>
): { provider: string; model: string } {
  const fallback = pickFallbackProvider(available)
  const textLength = doc.text.length

  if (textLength > 20000 && available.google) {
    return { provider: 'google', model: GOOGLE_MODEL }
  }

  const codeIndicators = ['function', 'class', 'import', 'def ', 'const ', 'let ', 'var ']
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

  if (textLength > 5000 && available.anthropic) {
    return { provider: 'anthropic', model: 'claude-sonnet-4.6' }
  }

  if (available.anthropic) {
    return { provider: 'anthropic', model: 'claude-sonnet-4.6' }
  }

  return fallback
}

export type ProgressCallback = (tasks: AgentTask[]) => void

/**
 * Process multiple documents with parallel agents.
 * Each document gets its own agent, then a coordinator merges the results.
 */
export async function processDocumentsWithAgents(
  documents: PDFDocument[],
  onProgress?: ProgressCallback,
  userPrompt?: string
): Promise<{ markdown: string; tasks: AgentTask[] }> {
  const health = await getAvailableProviders()
  if (health.status !== 'ok') {
    throw new Error(`LLM configuration unavailable: ${health.reason}`)
  }
  const available = health.providers

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
        const messages = buildExtractionPrompt(task.input, documents[idx].name, userPrompt)
        const response = await callLLM({
          provider: provider as LLMProvider,
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
    // [EduMap multimodal] 2026-04-21: Include the first task's actual
    // error instead of a generic message. Without this Jun just saw
    // "All document extraction agents failed" in the root node and had
    // no way to know whether it was a bad model id, an auth error, or
    // the backend being down.
    const firstError = extractionTasks.find((t) => t.status === 'error')?.output
    const detail = firstError ? `\n${firstError}` : ''
    throw new Error(`All document extraction agents failed.${detail}`)
  }

  // Single document — no merge needed
  if (markdowns.length === 1) {
    return { markdown: markdowns[0], tasks: extractionTasks }
  }

  const mergePick = pickFallbackProvider(available)
  const mergeTask: AgentTask = {
    id: 'merge-coordinator',
    type: 'merge',
    model: `${mergePick.provider}/${mergePick.model}`,
    status: 'running',
    input: markdowns.join('\n---\n'),
  }

  const allTasks = [...extractionTasks, mergeTask]
  onProgress?.(allTasks)

  try {
    const mergeMessages = buildMergePrompt(markdowns, docNames, userPrompt)
    const mergeResponse = await callLLM({
      provider: mergePick.provider,
      model: mergePick.model,
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
