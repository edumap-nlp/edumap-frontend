import { Link } from 'react-router-dom'
import type { TopNavProps } from '../types'

export default function TopNav({
  onUploadPdf,
  onExportImage,
  onExportMarkdown,
  isProcessing,
}: TopNavProps) {
  return (
    <header className="h-14 border-b border-surface-border bg-panel flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-4">
        <Link to="/" className="flex items-center gap-2 text-primary font-semibold">
          <EduMapLogo />
          <span>EduMap</span>
        </Link>
        <button
          type="button"
          onClick={onUploadPdf}
          disabled={isProcessing}
          className="px-3 py-1.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50 flex items-center gap-1.5"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          Upload PDF
        </button>

        {isProcessing && (
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className="inline-block w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            Processing...
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onExportImage}
          className="px-3 py-1.5 rounded-lg border border-surface-border text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors flex items-center gap-1.5"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          Export Image
        </button>
        <button
          type="button"
          onClick={onExportMarkdown}
          className="px-3 py-1.5 rounded-lg border border-surface-border text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors flex items-center gap-1.5"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          Export Markdown
        </button>
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 ml-2 flex items-center justify-center text-white text-xs font-bold" title="Profile">
          U
        </div>
      </div>
    </header>
  )
}

function EduMapLogo() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 8h6v6H8V8zm10 0h6v6h-6V8zM8 18h6v6H8v-6zm10 0h6v6h-6v-6z" fill="currentColor" opacity="0.9" />
      <path d="M14 11h4M14 21h4M11 14v4M21 14v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
