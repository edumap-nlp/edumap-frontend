import { useState, useCallback, useRef } from 'react'
import type { PDFDocument } from '../types'
import { extractMultiplePdfs } from '../services/pdfService'

interface PdfUploadModalProps {
  isOpen: boolean
  onClose: () => void
  onDocumentsReady: (docs: PDFDocument[], prompt?: string) => void
}

export default function PdfUploadModal({ isOpen, onClose, onDocumentsReady }: PdfUploadModalProps) {
  const [files, setFiles] = useState<File[]>([])
  const [isExtracting, setIsExtracting] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [userPrompt, setUserPrompt] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []).filter(
      (f) => f.type === 'application/pdf'
    )
    setFiles((prev) => [...prev, ...selected])
    setError(null)
  }, [])

  const removeFile = useCallback((idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx))
  }, [])

  const handleProcess = useCallback(async () => {
    if (files.length === 0) {
      setError('Please select at least one PDF file.')
      return
    }

    setIsExtracting(true)
    setProgress('Extracting text from PDFs...')
    setError(null)

    try {
      const docs = await extractMultiplePdfs(files)
      setProgress('Text extraction complete!')
      onDocumentsReady(docs, userPrompt.trim() || undefined)
      setFiles([])
      setUserPrompt('')
      onClose()
    } catch (err) {
      setError(`Extraction failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setIsExtracting(false)
    }
  }, [files, onDocumentsReady, onClose])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const dropped = Array.from(e.dataTransfer.files).filter(
      (f) => f.type === 'application/pdf'
    )
    setFiles((prev) => [...prev, ...dropped])
    setError(null)
  }, [])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-800">Upload PDF Documents</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Drop zone */}
        <div className="p-6">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all"
          >
            <div className="text-4xl mb-2">📄</div>
            <p className="text-sm font-medium text-slate-700">
              Drop PDF files here or click to browse
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Upload multiple PDFs — each will be processed by a separate AI agent
            </p>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf"
              multiple
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          {/* File list */}
          {files.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-xs font-medium text-slate-600 uppercase tracking-wide">
                {files.length} file{files.length > 1 ? 's' : ''} selected
              </p>
              {files.map((file, idx) => (
                <div
                  key={`${file.name}-${idx}`}
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 border border-slate-200"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-red-500 text-sm">📕</span>
                    <span className="text-sm text-slate-700 truncate">{file.name}</span>
                    <span className="text-xs text-slate-400 shrink-0">
                      {(file.size / 1024).toFixed(0)} KB
                    </span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      removeFile(idx)
                    }}
                    className="text-slate-400 hover:text-red-500 text-sm ml-2 transition-colors"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Prompt */}
          <div className="mt-4">
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              <span className="inline-flex items-center gap-1">
                <span>✨</span> Custom instructions <span className="text-slate-400 font-normal">(optional)</span>
              </span>
            </label>
            <div className="relative">
              <textarea
                value={userPrompt}
                onChange={(e) => setUserPrompt(e.target.value)}
                placeholder="e.g. Focus on optimization techniques and skip historical context. Highlight connections between topics."
                rows={3}
                className="w-full px-3 py-2.5 text-sm text-slate-700 placeholder-slate-400 bg-slate-50 border border-slate-200 rounded-xl resize-none outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition-all"
              />
              {userPrompt && (
                <button
                  onClick={() => setUserPrompt('')}
                  className="absolute top-2 right-2 text-slate-300 hover:text-slate-500 transition-colors text-xs"
                  title="Clear"
                >
                  ✕
                </button>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              The AI will use these instructions when building the mind map from your documents.
            </p>
          </div>

          {/* Progress */}
          {progress && (
            <div className="mt-4 px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-700">
              {isExtracting && (
                <span className="inline-block w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-2 align-middle" />
              )}
              {progress}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-4 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200 bg-slate-50">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-slate-700 text-sm font-medium hover:bg-slate-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleProcess}
            disabled={isExtracting || files.length === 0}
            className="px-5 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isExtracting ? 'Processing...' : `Process ${files.length} PDF${files.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
