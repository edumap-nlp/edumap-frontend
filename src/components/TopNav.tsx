import { Link } from 'react-router-dom'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { TopNavProps } from '../types'

/**
 * [EduMap fix] 2026-04-23: Lightweight hook for closing a dropdown when
 * the user clicks outside of it or presses Escape. Kept local to this
 * file so the dropdown remains self-contained.
 */
function useDismissableDropdown(
  onDismiss: () => void
): React.MutableRefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (!ref.current) return
      if (!ref.current.contains(e.target as Node)) onDismiss()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onDismiss()
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onDismiss])
  return ref
}

/**
 * [EduMap fix] 2026-04-23: A dropdown export button. Shows two items
 * (Current / Original) when the original variant is available; when it
 * isn't, renders as a plain single-action button that just invokes
 * `onInvoke('current')`. Keeps the UI tidy in the common "no edits yet"
 * case and surfaces the second option as soon as it becomes meaningful.
 */
function ExportDropdown({
  label,
  icon,
  originalAvailable,
  editedNote,
  onInvoke,
}: {
  label: string
  icon: React.ReactNode
  originalAvailable: boolean
  editedNote: boolean
  onInvoke: (variant: 'current' | 'original') => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useDismissableDropdown(useCallback(() => setOpen(false), []))

  if (!originalAvailable) {
    // Original not snapshotted yet → no meaningful choice, render a
    // plain button that exports the current view.
    return (
      <button
        type="button"
        onClick={() => onInvoke('current')}
        className="px-3 py-1.5 rounded-lg border border-surface-border text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors flex items-center gap-1.5"
      >
        {icon}
        {label}
      </button>
    )
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="px-3 py-1.5 rounded-lg border border-surface-border text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors flex items-center gap-1.5"
      >
        {icon}
        {label}
        <svg
          className={`w-3 h-3 ml-0.5 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-1 w-60 rounded-lg border border-surface-border bg-white shadow-lg z-20 overflow-hidden"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onInvoke('current')
            }}
            className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-start gap-2"
          >
            <span className="text-blue-500 mt-0.5">●</span>
            <span className="flex-1">
              <span className="font-medium block text-slate-800">Current view</span>
              <span className="text-[11px] text-slate-500 block">
                {editedNote
                  ? 'Includes your edits'
                  : 'Same as original (no edits yet)'}
              </span>
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onInvoke('original')
            }}
            className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 border-t border-slate-100 flex items-start gap-2"
          >
            <span className="text-slate-400 mt-0.5">○</span>
            <span className="flex-1">
              <span className="font-medium block text-slate-800">
                Original (from LLM)
              </span>
              <span className="text-[11px] text-slate-500 block">
                Pristine AI output, ignores your edits
              </span>
            </span>
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * [EduMap fix] 2026-04-23: Compact icon button used for the newly-
 * consolidated Save / Copy / Fit / Expand / Collapse / Add-Node actions
 * that used to live scattered across the sidebar footer, outline header,
 * and canvas panel. Keeps the TopNav from ballooning horizontally by
 * letting each action stay ~28px wide.
 */
function IconButton({
  title,
  onClick,
  children,
  active = false,
  disabled = false,
  accent = 'slate',
}: {
  title: string
  onClick: () => void
  children: React.ReactNode
  active?: boolean
  disabled?: boolean
  accent?: 'slate' | 'blue' | 'green' | 'red'
}) {
  const base =
    'h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
  let cls: string
  if (active) {
    cls = 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700'
  } else if (accent === 'blue') {
    cls = 'bg-white border-blue-200 text-blue-700 hover:bg-blue-50'
  } else if (accent === 'green') {
    cls = 'bg-white border-emerald-200 text-emerald-700 hover:bg-emerald-50'
  } else if (accent === 'red') {
    cls = 'bg-white border-red-200 text-red-700 hover:bg-red-50'
  } else {
    cls = 'bg-white border-surface-border text-slate-700 hover:bg-slate-50'
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${base} ${cls}`}
    >
      {children}
    </button>
  )
}

/**
 * [EduMap fix] 2026-04-23 (batch 5 #4): Dropdown button that replaces the
 * single-action Expand All / Collapse All buttons. Lets the user jump
 * straight to a chosen depth (All, L2, L3, L4, L5) or fall back to the
 * full expand/collapse behaviour. Kept self-contained to match the
 * existing `ExportDropdown` style.
 */
function LevelsDropdown({
  onShowUpToLevel,
  onExpandAll,
  onCollapseAll,
}: {
  onShowUpToLevel: (maxDepth: number | null) => void
  onExpandAll: () => void
  onCollapseAll: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useDismissableDropdown(useCallback(() => setOpen(false), []))

  const items: { label: string; sub: string; run: () => void }[] = [
    {
      label: 'Expand all levels',
      sub: 'Reveal every node, including leaves',
      run: onExpandAll,
    },
    {
      label: 'Show to level 2',
      sub: 'Only top-level headings',
      run: () => onShowUpToLevel(2),
    },
    {
      label: 'Show to level 3',
      sub: 'Headings + one level of detail',
      run: () => onShowUpToLevel(3),
    },
    {
      label: 'Show to level 4',
      sub: 'Most subtrees visible',
      run: () => onShowUpToLevel(4),
    },
    {
      label: 'Show to level 5',
      sub: 'Almost everything — still hides the deepest',
      run: () => onShowUpToLevel(5),
    },
    {
      label: 'Collapse all',
      sub: 'Hide every subtree',
      run: onCollapseAll,
    },
  ]

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Choose how many levels of the tree to show"
        className="h-8 px-2.5 rounded-lg border border-surface-border bg-white text-slate-700 hover:bg-slate-50 text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
      >
        ▾ Levels
        <svg
          className={`w-3 h-3 ml-0.5 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 mt-1 w-64 rounded-lg border border-surface-border bg-white shadow-lg z-20 overflow-hidden"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                item.run()
              }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 border-b border-slate-100 last:border-b-0 flex flex-col"
            >
              <span className="font-medium text-slate-800">{item.label}</span>
              <span className="text-[11px] text-slate-500">{item.sub}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function TopNav({
  onUploadPdf,
  onExportImage,
  onExportMarkdown,
  hasOriginalPng,
  hasOriginalMarkdown,
  hasEdits,
  isProcessing,
  onSave,
  onCopyMarkdown,
  onFitView,
  onExpandAll,
  onCollapseAll,
  onShowUpToLevel,
  highlightedNodeId,
  onAddChildNode,
  onDeleteNode,
}: TopNavProps) {
  const hasSelection = !!highlightedNodeId

  return (
    <header className="h-14 border-b border-surface-border bg-panel flex items-center justify-between px-4 shrink-0 gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <Link to="/" className="flex items-center gap-2 text-primary font-semibold shrink-0">
          <EduMapLogo />
          <span>EduMap</span>
        </Link>
        <button
          type="button"
          onClick={onUploadPdf}
          disabled={isProcessing}
          className="px-3 py-1.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50 flex items-center gap-1.5 shrink-0"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          Upload PDF
        </button>

        {isProcessing && (
          <div className="flex items-center gap-1.5 text-xs text-slate-500 shrink-0">
            <span className="inline-block w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            Processing...
          </div>
        )}

        {/* [EduMap fix] 2026-04-23: Consolidated action cluster — every
            tool that used to live in the sidebar/canvas/outline now sits
            here so the user has a single toolbar to scan. */}
        <div className="flex items-center gap-1 shrink-0 pl-3 border-l border-surface-border">
          <IconButton title="Save modifications to markdown" onClick={onSave} accent="green">
            💾 Save
          </IconButton>
          <IconButton title="Copy markdown to clipboard" onClick={onCopyMarkdown}>
            📋 Copy
          </IconButton>
          <IconButton title="Fit all visible nodes in view" onClick={onFitView}>
            ⊞ Fit
          </IconButton>
          {/* [EduMap fix] 2026-04-23 (batch 5 #4): Replaced the two single-
              action Expand/Collapse buttons with a Levels dropdown so the
              user can jump to a specific depth in one click (or still fall
              back to the old Expand All / Collapse All behaviour). */}
          <LevelsDropdown
            onShowUpToLevel={onShowUpToLevel}
            onExpandAll={onExpandAll}
            onCollapseAll={onCollapseAll}
          />

          <div className="w-px h-5 bg-slate-200 mx-1"></div>
          <IconButton
            title={hasSelection ? "Add a child node to the selected node" : "Select a node to add a child"}
            onClick={onAddChildNode}

            disabled={!hasSelection}
          >
            ＋ Add
          </IconButton>
          <IconButton
            title={hasSelection ? "Delete the selected node" : "Select a node to delete"}
            onClick={onDeleteNode}
            disabled={!hasSelection}
            accent="red"
          >
            🗑 Delete
          </IconButton>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <ExportDropdown
          label="Export Image"
          icon={
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          }
          originalAvailable={hasOriginalPng}
          editedNote={hasEdits}
          onInvoke={onExportImage}
        />
        <ExportDropdown
          label="Export Markdown"
          icon={
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          }
          originalAvailable={hasOriginalMarkdown}
          editedNote={hasEdits}
          onInvoke={onExportMarkdown}
        />
        <div
          className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 ml-2 flex items-center justify-center text-white text-xs font-bold"
          title="Profile"
        >
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
