import { Router, type Request, type Response } from 'express'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Multimodal extraction bridge: accepts a PDF (as base64 JSON payload), writes
 * it to a temp file, spawns the Yana multimodal_pipeline_v2.py, and streams the
 * structured JSON it prints on stdout back to the frontend.
 *
 * Configuration (all optional, sensible defaults):
 *   YANA_PIPELINE_PATH   absolute path to multimodal_pipeline_v2.py
 *   YANA_PYTHON          python interpreter (defaults to "python3")
 *   YANA_VISION_DISABLED set to "1" to pass --no-vision (cheaper, lower quality)
 *   YANA_TIMEOUT_MS      subprocess timeout (default 5 minutes)
 *
 * Contract with the frontend (src/services/pdfService.ts):
 *   POST /api/pdf/extract-multimodal
 *   Body: { fileName: string, pdfBase64: string }
 *   Reply: { ok: true, data: <ExtractionResult JSON from pipeline_v2> }
 *        | { ok: false, error: string, stderr?: string }
 */
export const multimodalRouter = Router()

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/** Absolute default path to the v2 pipeline. Assumes the Yana model folder sits
 *  next to the frontend folder (../../edumap_yana_model/code/...). */
const DEFAULT_PIPELINE = resolve(
  __dirname,
  '../../../edumap_yana_model/code/multimodal_pipeline_v2.py'
)

const PIPELINE_PATH = process.env.YANA_PIPELINE_PATH ?? DEFAULT_PIPELINE
// [EduMap multimodal] 2026-04-21 update: default to `python` (user's alias).
// Override with YANA_PYTHON env var if your system uses `python3` or a venv.
const PYTHON = process.env.YANA_PYTHON ?? 'python'
const TIMEOUT_MS = Number(process.env.YANA_TIMEOUT_MS ?? 300_000)
const VISION_DISABLED = process.env.YANA_VISION_DISABLED === '1'

interface MultimodalRequest {
  fileName: string
  pdfBase64: string
}

multimodalRouter.post('/extract-multimodal', async (req: Request, res: Response) => {
  const { fileName, pdfBase64 } = req.body as MultimodalRequest
  if (!fileName || !pdfBase64) {
    return res.status(400).json({
      ok: false,
      error: 'Missing fileName or pdfBase64 in body',
    })
  }

  // Each request gets its own temp dir so concurrent uploads don't collide.
  const jobId = randomUUID()
  const workDir = join(tmpdir(), `edumap-mm-${jobId}`)
  const pdfPath = join(workDir, sanitizeFilename(fileName))
  const outDir = join(workDir, 'out')

  try {
    await mkdir(workDir, { recursive: true })
    await mkdir(outDir, { recursive: true })
    await writeFile(pdfPath, Buffer.from(pdfBase64, 'base64'))

    const args = [
      PIPELINE_PATH,
      '--pdf', pdfPath,
      '--out', outDir,
      '--stdout-json',
      // Frontend LLM does the 3-level markdown on the multimodal_context, so
      // we don't need the Python side to also consolidate. Saves ~30s/paper.
      '--skip-markdown',
    ]
    if (VISION_DISABLED) args.push('--no-vision')

    const { stdout, stderr, code } = await runPython(PYTHON, args, TIMEOUT_MS)

    if (code !== 0) {
      console.error(`[multimodal] pipeline exited with code ${code}`)
      console.error(`[multimodal] stderr tail:\n${stderr.slice(-2000)}`)
      return res.status(500).json({
        ok: false,
        error: `multimodal_pipeline_v2.py exited with code ${code}`,
        stderr: stderr.slice(-2000),
      })
    }

    // The pipeline prints JSON on stdout (and logs on stderr).
    let payload: unknown
    try {
      payload = JSON.parse(stdout)
    } catch (parseErr) {
      console.error('[multimodal] Failed to parse pipeline stdout as JSON.')
      console.error('[multimodal] stdout head:', stdout.slice(0, 500))
      console.error('[multimodal] stderr tail:', stderr.slice(-1000))
      return res.status(500).json({
        ok: false,
        error: 'Pipeline stdout was not valid JSON',
        stderr: stderr.slice(-1000),
      })
    }

    return res.json({ ok: true, data: payload })
  } catch (err: any) {
    console.error('[multimodal] Unexpected error:', err?.message ?? err)
    return res.status(500).json({
      ok: false,
      error: err?.message ?? 'Unknown error',
    })
  } finally {
    // Clean up temp files. Keep them on non-zero exit for debugging? For now we
    // always remove — the extracted_images live under outDir, and the frontend
    // already has the vision_description text it needs.
    rm(workDir, { recursive: true, force: true }).catch(() => {
      /* best-effort */
    })
  }
})

// ── Helpers ────────────────────────────────────────────────────────────

function sanitizeFilename(name: string): string {
  // Strip anything that isn't safe for a temp path.
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, '_')
  return safe.toLowerCase().endsWith('.pdf') ? safe : `${safe}.pdf`
}

interface PythonResult {
  stdout: string
  stderr: string
  code: number | null
}

function runPython(cmd: string, args: string[], timeoutMs: number): Promise<PythonResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })

    let stdout = ''
    let stderr = ''
    let timedOut = false

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8')
    })

    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, timeoutMs)

    child.on('close', (code) => {
      clearTimeout(timer)
      if (timedOut) {
        resolve({ stdout, stderr: stderr + '\n[multimodal] Timed out.', code: -1 })
        return
      }
      resolve({ stdout, stderr, code })
    })

    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({ stdout, stderr: stderr + `\n[multimodal] spawn error: ${err.message}`, code: -1 })
    })
  })
}
