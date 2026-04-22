import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { MultimodalExtraction, PDFDocument } from '../types'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl

// [EduMap multimodal] Added 2026-04-21. Same VITE_API_BASE var llmService.ts uses.
const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:3001/api'

export interface ExtractedPage {
  pageNumber: number
  text: string
}

export async function extractTextFromPdf(file: File): Promise<{
  text: string
  pages: ExtractedPage[]
  pageCount: number
}> {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const pages: ExtractedPage[] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const text = content.items
      .map((item: any) => item.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    pages.push({ pageNumber: i, text })
  }

  return {
    text: pages.map((p) => p.text).join('\n\n'),
    pages,
    pageCount: pdf.numPages,
  }
}

export async function extractMultiplePdfs(
  files: File[]
): Promise<PDFDocument[]> {
  const results = await Promise.all(
    files.map(async (file) => {
      const { text, pageCount } = await extractTextFromPdf(file)
      return {
        id: crypto.randomUUID(),
        name: file.name,
        text,
        pageCount,
        file,
      }
    })
  )
  return results
}

// ── [EduMap multimodal] Added 2026-04-21 ──────────────────────────────
// The multimodal path goes through the new /api/pdf/extract-multimodal
// endpoint, which runs the Yana pipeline_v2 as a Python subprocess and
// returns layout-aware text + figures (with GPT-4o Vision descriptions) +
// formula candidates + tables + anchors. The orchestrator can feed the
// flattened `multimodal_context` string to the LLM instead of the raw
// text. If the backend is down, the caller should fall back to
// `extractMultiplePdfs` (plain text).

/** Convert a File to a base64 string (chunked to avoid call-stack issues on big PDFs). */
async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const bytes = new Uint8Array(buf)
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)))
  }
  return btoa(binary)
}

export async function extractMultimodalFromPdf(
  file: File
): Promise<MultimodalExtraction> {
  const pdfBase64 = await fileToBase64(file)
  const res = await fetch(`${API_BASE}/pdf/extract-multimodal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName: file.name, pdfBase64 }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Multimodal extraction failed (${res.status}): ${body}`)
  }
  const json = (await res.json()) as
    | { ok: true; data: MultimodalExtraction }
    | { ok: false; error: string; stderr?: string }
  if (!json.ok) {
    throw new Error(json.error + (json.stderr ? `\nstderr: ${json.stderr}` : ''))
  }
  return json.data
}

/**
 * Multimodal-aware replacement for extractMultiplePdfs().
 *
 * Runs the Yana pipeline per file and returns PDFDocument objects whose
 * `text` field holds the flattened multimodal context (ready for the LLM),
 * and whose `multimodal` field carries the structured record for anyone who
 * wants to render figures/formulas/anchors in the UI later.
 *
 * If a file fails the multimodal path (backend unreachable, Python missing,
 * etc.) we transparently fall back to plain text extraction — this keeps
 * EduMap usable even without the Python sidecar running.
 */
export async function extractMultimodalFromPdfs(
  files: File[]
): Promise<PDFDocument[]> {
  const results = await Promise.all(
    files.map(async (file): Promise<PDFDocument> => {
      try {
        const mm = await extractMultimodalFromPdf(file)
        // The flattened multimodal context is what the LLM should see. If
        // the pipeline returns nothing useful, fall back so we don't send an
        // empty prompt.
        const mmText = mm.multimodal_context?.trim() || ''
        if (mmText.length < 200) {
          console.warn(
            `[pdfService] Multimodal context too short for "${file.name}"; `
            + `falling back to plain text extraction.`
          )
          const { text, pageCount } = await extractTextFromPdf(file)
          return {
            id: crypto.randomUUID(),
            name: file.name,
            text,
            pageCount,
            file,
            multimodal: mm,
          }
        }
        return {
          id: crypto.randomUUID(),
          name: file.name,
          text: mmText,
          pageCount: mm.page_count,
          file,
          multimodal: mm,
        }
      } catch (err) {
        console.warn(
          `[pdfService] Multimodal extraction failed for "${file.name}"; `
          + `falling back to plain text. Reason:`,
          err
        )
        const { text, pageCount } = await extractTextFromPdf(file)
        return {
          id: crypto.randomUUID(),
          name: file.name,
          text,
          pageCount,
          file,
        }
      }
    })
  )
  return results
}
