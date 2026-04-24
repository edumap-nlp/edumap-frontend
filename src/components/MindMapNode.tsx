import { memo, useState, useCallback, useRef, useEffect } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { MindMapNodeData, NodeTag } from '../types'
import { PREDEFINED_TAGS } from '../types'
import { useMindMapStore } from '../hooks/useMindMapStore'

/* ── Edited badge ── */
/**
 * [EduMap fix] 2026-04-23: Small pencil pip rendered on the top-right of
 * every node in `editedNodeIds`. Positioned outside the node's own
 * border so it never covers the label. Rendered via absolute positioning
 * so it travels with the node without needing extra flex shuffling.
 */
function EditedBadge() {
  return (
    <span
      className="absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full bg-blue-500 text-white flex items-center justify-center text-[9px] font-bold shadow-sm ring-2 ring-white"
      title="You've edited this node (click the Original export to compare)"
      aria-label="User-edited node"
    >
      ✎
    </span>
  )
}

/* ── Tag badge ── */
/**
 * [EduMap fix] 2026-04-23: Handle arbitrary tag strings.
 *
 * Presets get dedicated colors (hard / easy / important / low-priority /
 * new). Anything else falls back to a neutral slate palette and the slug
 * is pretty-printed back into Title Case so `chapter-3` renders as
 * "Chapter 3". Clicking the × chip removes the tag from the node — this
 * is the inline way to discard an unwanted tag without opening the
 * editor.
 */
const TAG_PRESETS: Record<
  string,
  { bg: string; text: string; label: string }
> = {
  hard: { bg: 'bg-yellow-200 border-yellow-300', text: 'text-yellow-900', label: 'Hard' },
  easy: { bg: 'bg-emerald-100 border-emerald-200', text: 'text-emerald-800', label: 'Easy' },
  important: { bg: 'bg-blue-100 border-blue-200', text: 'text-blue-800', label: 'Important' },
  'low-priority': { bg: 'bg-slate-100 border-slate-200', text: 'text-slate-600', label: 'Low Priority' },
  new: { bg: 'bg-green-100 border-green-200', text: 'text-green-800', label: 'New' },
}
function prettyTagLabel(tag: NodeTag): string {
  const preset = TAG_PRESETS[tag]
  if (preset) return preset.label
  return tag
    .split('-')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ''))
    .join(' ')
}
function TagBadge({
  tag,
  onRemove,
}: {
  tag: NodeTag
  onRemove?: () => void
}) {
  const preset = TAG_PRESETS[tag]
  const bg = preset?.bg ?? 'bg-slate-100 border-slate-200'
  const text = preset?.text ?? 'text-slate-700'
  const label = prettyTagLabel(tag)
  return (
    <span
      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${bg} ${text}`}
    >
      {label}
      {onRemove && (
        <button
          type="button"
          className="ml-0.5 text-[11px] leading-none opacity-60 hover:opacity-100 nodrag nopan"
          title={`Remove ${label}`}
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          ×
        </button>
      )}
    </span>
  )
}

/* ── Tag editor popover ── */
/**
 * [EduMap fix] 2026-04-23: Small "+ tag" button that opens a popover with
 * the five presets and a free-text input. The editor calls into the store
 * (`toggleNodeTag`, `setNodeTags`) so the markdown sidebar updates in
 * lockstep with the node's visible chips. Closes on outside-click via
 * the existing `mousedown` listener inside `useCloseOnOutside`.
 */
function useCloseOnOutside(onClose: () => void) {
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!ref.current) return
      if (!ref.current.contains(e.target as Node)) onClose()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])
  return ref
}

function TagEditor({
  nodeId,
  currentTags,
}: {
  nodeId: string
  currentTags: NodeTag[]
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const toggleNodeTag = useMindMapStore((s) => s.toggleNodeTag)
  const ref = useCloseOnOutside(useCallback(() => setOpen(false), []))

  const onAddCustom = useCallback(() => {
    const slug = draft
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9\-]/g, '')
    if (!slug) return
    if (!currentTags.includes(slug)) toggleNodeTag(nodeId, slug)
    setDraft('')
    // [EduMap fix] 2026-04-23 (batch 5 #1): Auto-close after adding a
    // custom tag so the popover doesn't linger obscuring the canvas.
    setOpen(false)
  }, [draft, currentTags, nodeId, toggleNodeTag])

  return (
    <div ref={ref} className="relative inline-block nodrag nopan">
      <button
        type="button"
        className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border border-dashed border-slate-300 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
        title="Add a tag"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        + tag
      </button>
      {open && (
        <div
          role="dialog"
          className="absolute left-0 top-full mt-1 z-30 w-56 rounded-lg border border-surface-border bg-white shadow-lg p-2"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-1">
            Presets
          </div>
          <div className="flex flex-wrap gap-1 mb-2">
            {PREDEFINED_TAGS.map((p) => {
              const on = currentTags.includes(p.value)
              return (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => {
                    toggleNodeTag(nodeId, p.value)
                    // [EduMap fix] 2026-04-23 (batch 5 #1): Close the
                    // popover as soon as the user picks a preset — one
                    // click = one tag applied, then get out of the way.
                    // If the user wants multiple tags they can re-open.
                    setOpen(false)
                  }}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border transition-colors ${
                    on
                      ? (TAG_PRESETS[p.value]?.bg ?? 'bg-slate-100 border-slate-200') +
                        ' ' +
                        (TAG_PRESETS[p.value]?.text ?? 'text-slate-700')
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {p.label}
                </button>
              )
            })}
          </div>
          <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-1">
            Custom
          </div>
          <div className="flex gap-1">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  onAddCustom()
                }
                e.stopPropagation()
              }}
              placeholder="e.g. exam, chapter-3"
              className="flex-1 text-[11px] px-1.5 py-1 rounded border border-slate-200 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none"
            />
            <button
              type="button"
              onClick={onAddCustom}
              className="px-2 py-1 rounded text-[11px] font-medium bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50"
              disabled={!draft.trim()}
            >
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Collapse toggle button ── */
function CollapseToggle({
  nodeId,
  isCollapsed,
  childCount,
}: {
  nodeId: string
  isCollapsed: boolean
  childCount?: number
}) {
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      window.dispatchEvent(
        new CustomEvent('mindmap-node-collapse-toggle', { detail: { nodeId } })
      )
    },
    [nodeId]
  )

  return (
    <button
      onClick={handleClick}
      onMouseDown={(e) => e.stopPropagation()}
      className={`
        absolute -right-5 top-1/2 -translate-y-1/2 z-10
        w-4 h-4 rounded-full border-2 flex items-center justify-center
        text-[8px] font-bold transition-all duration-200 nodrag nopan
        ${isCollapsed
          ? 'bg-blue-500 border-blue-600 text-white shadow-md hover:bg-blue-600 scale-110'
          : 'bg-white border-slate-300 text-slate-500 hover:bg-slate-100 hover:border-slate-400'
        }
      `}
      title={
        isCollapsed
          ? childCount !== undefined && childCount > 0
            ? `Expand (${childCount} node${childCount !== 1 ? 's' : ''} hidden)`
            : 'Expand subtree'
          : 'Collapse subtree'
      }
      style={{ right: '-18px' }}
    >
      {isCollapsed ? '▶' : '▼'}
    </button>
  )
}

/* ── Inline editable label ── */
function EditableLabel({
  value,
  onCommit,
  className = '',
  inputClassName = '',
  autoEdit = false,
}: {
  value: string
  onCommit: (newValue: string) => void
  className?: string
  inputClassName?: string
  autoEdit?: boolean
}) {
  const [isEditing, setIsEditing] = useState(autoEdit)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  // When the component enters edit mode, focus the input
  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [isEditing])

  // Sync draft when value changes externally (while not editing)
  useEffect(() => {
    if (!isEditing) setDraft(value)
  }, [value, isEditing])

  const handleCommit = useCallback(() => {
    setIsEditing(false)
    const trimmed = draft.trim()
    if (trimmed && trimmed !== value) {
      onCommit(trimmed)
    } else {
      setDraft(value)
    }
  }, [draft, value, onCommit])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleCommit()
      } else if (e.key === 'Escape') {
        setDraft(value)
        setIsEditing(false)
      }
      // Stop propagation so React Flow doesn't handle these keys
      e.stopPropagation()
    },
    [handleCommit, value]
  )

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleCommit}
        onKeyDown={handleKeyDown}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        className={`bg-blue-50 border border-blue-300 rounded px-1.5 py-0.5 outline-none focus:ring-2 focus:ring-blue-400 w-full nodrag nopan ${inputClassName}`}
        placeholder="Type a concept..."
      />
    )
  }

  return (
    <div
      onDoubleClick={(e) => {
        e.stopPropagation()
        setIsEditing(true)
      }}
      className={`cursor-text ${className}`}
      title="Double-click to edit"
    >
      {value || <span className="text-slate-400 italic">Double-click to edit</span>}
    </div>
  )
}

/* ── Root node (dark, central) ── */
export const RootNode = memo(function RootNode({ data, id }: NodeProps) {
  const d = data as MindMapNodeData
  const toggleNodeTag = useMindMapStore((s) => s.toggleNodeTag)

  const handleLabelChange = useCallback(
    (newLabel: string) => {
      // Dispatch a custom event so MindMapCanvas can pick it up
      window.dispatchEvent(
        new CustomEvent('mindmap-node-label-change', { detail: { nodeId: id, newLabel } })
      )
    },
    [id]
  )

  return (
    <div className={`root-node relative px-5 py-3 rounded-xl bg-slate-800 text-white shadow-lg border-2
      ${d.isHighlighted ? 'ring-4 ring-blue-400 animate-pulse-highlight' : 'border-slate-700'}
      ${d.isEdited ? 'border-l-[5px] border-l-blue-500' : ''}
      cursor-pointer min-w-[120px] max-w-[260px] text-center`}
    >
      {d.isEdited && <EditedBadge />}
      <Handle type="target" position={Position.Left} className="!bg-blue-400 !w-3 !h-3 !-left-1.5" />
      <EditableLabel
        value={d.label}
        onCommit={handleLabelChange}
        className="font-bold text-sm leading-tight text-white"
        inputClassName="text-slate-900 text-sm font-bold text-center"
      />
      <div className="flex gap-1 mt-1 justify-center flex-wrap items-center">
        {(d.tags ?? []).map((t) => (
          <TagBadge key={t} tag={t} onRemove={() => toggleNodeTag(id, t)} />
        ))}
        <TagEditor nodeId={id} currentTags={d.tags ?? []} />
      </div>
      <Handle type="source" position={Position.Right} className="!bg-blue-400 !w-3 !h-3 !-right-1.5" />
      {d.hasChildren && (
        <CollapseToggle
          nodeId={id}
          isCollapsed={!!d.isCollapsed}
          childCount={d.descendantCount}
        />
      )}
    </div>
  )
})

/* ── Branch node (white, medium) ── */
export const BranchNode = memo(function BranchNode({ data, id }: NodeProps) {
  const d = data as MindMapNodeData
  const isNew = d.label === 'New Concept'
  const toggleNodeTag = useMindMapStore((s) => s.toggleNodeTag)

  const handleLabelChange = useCallback(
    (newLabel: string) => {
      window.dispatchEvent(
        new CustomEvent('mindmap-node-label-change', { detail: { nodeId: id, newLabel } })
      )
    },
    [id]
  )

  return (
    <div className={`branch-node relative px-4 py-2.5 rounded-lg bg-white shadow-md border-2
      ${d.isHighlighted ? 'ring-4 ring-blue-400 animate-pulse-highlight border-blue-400' : 'border-slate-200'}
      ${d.isCollapsed ? 'border-blue-300 bg-blue-50' : ''}
      ${d.isEdited ? 'border-l-[5px] border-l-blue-500' : ''}
      cursor-pointer min-w-[100px] max-w-[260px] transition-colors duration-200`}
    >
      {d.isEdited && <EditedBadge />}
      <Handle type="target" position={Position.Left} className="!bg-blue-400 !w-3 !h-3 !-left-1.5" />
      <div className="flex items-start gap-1">
        <div className="flex-1 min-w-0">
          <EditableLabel
            value={d.label}
            onCommit={handleLabelChange}
            className="font-semibold text-[13px] text-slate-800 leading-tight"
            inputClassName="text-[13px] font-semibold"
            autoEdit={isNew}
          />
          {d.description && (
            <div className="text-[11px] text-slate-500 mt-1 leading-snug line-clamp-2">{d.description}</div>
          )}
          <div className="flex gap-1 mt-1 flex-wrap items-center">
            {(d.tags ?? []).map((t) => (
              <TagBadge key={t} tag={t} onRemove={() => toggleNodeTag(id, t)} />
            ))}
            <TagEditor nodeId={id} currentTags={d.tags ?? []} />
          </div>
          {d.isCollapsed && (
            <div className="text-[10px] text-blue-500 font-medium mt-0.5">
              {/* [EduMap fix] 2026-04-23: surface the exact number of
                  hidden descendants rather than a generic "subtree hidden" */}
              {d.descendantCount !== undefined && d.descendantCount > 0
                ? `··· ${d.descendantCount} node${d.descendantCount !== 1 ? 's' : ''} hidden`
                : '··· subtree hidden'}
            </div>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-blue-400 !w-3 !h-3 !-right-1.5" />
      {d.hasChildren && (
        <CollapseToggle
          nodeId={id}
          isCollapsed={!!d.isCollapsed}
          childCount={d.descendantCount}
        />
      )}
    </div>
  )
})

/* ── Leaf node (compact) ── */
export const LeafNode = memo(function LeafNode({ data, id }: NodeProps) {
  const d = data as MindMapNodeData
  const toggleNodeTag = useMindMapStore((s) => s.toggleNodeTag)

  const handleLabelChange = useCallback(
    (newLabel: string) => {
      window.dispatchEvent(
        new CustomEvent('mindmap-node-label-change', { detail: { nodeId: id, newLabel } })
      )
    },
    [id]
  )

  return (
    <div className={`leaf-node relative px-3 py-2 rounded-lg bg-white shadow-sm border
      ${d.isHighlighted ? 'ring-4 ring-blue-400 animate-pulse-highlight border-blue-400' : 'border-slate-200'}
      ${d.isCollapsed ? 'border-blue-300 bg-blue-50' : ''}
      ${d.isEdited ? 'border-l-[5px] border-l-blue-500' : ''}
      cursor-pointer min-w-[80px] max-w-[260px] transition-colors duration-200`}
    >
      {d.isEdited && <EditedBadge />}
      <Handle type="target" position={Position.Left} className="!bg-blue-400 !w-2.5 !h-2.5 !-left-1" />
      <div className="flex items-center gap-1.5 flex-wrap">
        <EditableLabel
          value={d.label}
          onCommit={handleLabelChange}
          className="text-[12px] text-slate-700 leading-tight flex-1"
          inputClassName="text-[12px]"
        />
        {(d.tags ?? []).map((t) => (
          <TagBadge key={t} tag={t} onRemove={() => toggleNodeTag(id, t)} />
        ))}
        <TagEditor nodeId={id} currentTags={d.tags ?? []} />
      </div>
      {d.description && (
        <div className="text-[10px] text-slate-400 mt-0.5 leading-snug line-clamp-2">{d.description}</div>
      )}
      {d.isCollapsed && (
        <div className="text-[10px] text-blue-500 font-medium mt-0.5">
          {d.descendantCount !== undefined && d.descendantCount > 0
            ? `··· ${d.descendantCount} node${d.descendantCount !== 1 ? 's' : ''} hidden`
            : '··· subtree hidden'}
        </div>
      )}
      <Handle type="source" position={Position.Right} className="!bg-blue-400 !w-2.5 !h-2.5 !-right-1" />
      {d.hasChildren && (
        <CollapseToggle
          nodeId={id}
          isCollapsed={!!d.isCollapsed}
          childCount={d.descendantCount}
        />
      )}
    </div>
  )
})

export const nodeTypes = {
  rootNode: RootNode,
  branchNode: BranchNode,
  leafNode: LeafNode,
}
