import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl

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
): Promise<{ id: string; name: string; text: string; pageCount: number; file: File }[]> {
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
