import { Link } from 'react-router-dom'

export default function TopNav() {
  return (
    <header className="h-14 border-b border-surface-border bg-panel flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-4">
        <Link to="/" className="flex items-center gap-2 text-primary font-semibold">
          <EduMapLogo />
          <span>EduMap</span>
        </Link>
        <button
          type="button"
          className="px-3 py-1.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors"
        >
          Upload PDF
        </button>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="px-3 py-1.5 rounded-lg border border-surface-border text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
        >
          Export Image
        </button>
        <button
          type="button"
          className="px-3 py-1.5 rounded-lg border border-surface-border text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
        >
          Export Markdown
        </button>
        <div className="w-8 h-8 rounded-full bg-slate-300 ml-2" title="Profile" />
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
