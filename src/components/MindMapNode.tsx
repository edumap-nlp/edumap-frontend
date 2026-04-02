import { memo, useState, useCallback, useRef, useEffect } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { MindMapNodeData, NodeTag } from '../types'

/* ── Tag badge ── */
function TagBadge({ tag }: { tag: NodeTag }) {
  const config: Record<NodeTag, { bg: string; text: string; label: string }> = {
    hard: { bg: 'bg-yellow-200 border-yellow-300', text: 'text-yellow-900', label: 'Hard' },
    'low-priority': { bg: 'bg-slate-100 border-slate-200', text: 'text-slate-600', label: 'Low Priority' },
    important: { bg: 'bg-blue-100 border-blue-200', text: 'text-blue-800', label: 'Important' },
    new: { bg: 'bg-green-100 border-green-200', text: 'text-green-800', label: 'New' },
  }
  const c = config[tag]
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${c.bg} ${c.text}`}>
      {c.label}
    </span>
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
      title={isCollapsed ? `Expand (${childCount ?? ''} hidden)` : 'Collapse subtree'}
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
      cursor-pointer min-w-[120px] max-w-[260px] text-center`}
    >
      <Handle type="target" position={Position.Left} className="!bg-blue-400 !w-3 !h-3 !-left-1.5" />
      <EditableLabel
        value={d.label}
        onCommit={handleLabelChange}
        className="font-bold text-sm leading-tight text-white"
        inputClassName="text-slate-900 text-sm font-bold text-center"
      />
      {d.tags && d.tags.length > 0 && (
        <div className="flex gap-1 mt-1 justify-center flex-wrap">
          {d.tags.map((t) => <TagBadge key={t} tag={t} />)}
        </div>
      )}
      <Handle type="source" position={Position.Right} className="!bg-blue-400 !w-3 !h-3 !-right-1.5" />
      {d.hasChildren && (
        <CollapseToggle nodeId={id} isCollapsed={!!d.isCollapsed} />
      )}
    </div>
  )
})

/* ── Branch node (white, medium) ── */
export const BranchNode = memo(function BranchNode({ data, id }: NodeProps) {
  const d = data as MindMapNodeData
  const isNew = d.label === 'New Concept'

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
      cursor-pointer min-w-[100px] max-w-[260px] transition-colors duration-200`}
    >
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
          {d.tags && d.tags.length > 0 && (
            <div className="flex gap-1 mt-1 flex-wrap">
              {d.tags.map((t) => <TagBadge key={t} tag={t} />)}
            </div>
          )}
          {d.isCollapsed && (
            <div className="text-[10px] text-blue-500 font-medium mt-0.5">
              {/* collapsed indicator */}
              ··· subtree hidden
            </div>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-blue-400 !w-3 !h-3 !-right-1.5" />
      {d.hasChildren && (
        <CollapseToggle nodeId={id} isCollapsed={!!d.isCollapsed} />
      )}
    </div>
  )
})

/* ── Leaf node (compact) ── */
export const LeafNode = memo(function LeafNode({ data, id }: NodeProps) {
  const d = data as MindMapNodeData

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
      cursor-pointer min-w-[80px] max-w-[260px] transition-colors duration-200`}
    >
      <Handle type="target" position={Position.Left} className="!bg-blue-400 !w-2.5 !h-2.5 !-left-1" />
      <div className="flex items-center gap-1.5 flex-wrap">
        <EditableLabel
          value={d.label}
          onCommit={handleLabelChange}
          className="text-[12px] text-slate-700 leading-tight flex-1"
          inputClassName="text-[12px]"
        />
        {d.tags?.map((t) => <TagBadge key={t} tag={t} />)}
      </div>
      {d.description && (
        <div className="text-[10px] text-slate-400 mt-0.5 leading-snug line-clamp-2">{d.description}</div>
      )}
      {d.isCollapsed && (
        <div className="text-[10px] text-blue-500 font-medium mt-0.5">··· subtree hidden</div>
      )}
      <Handle type="source" position={Position.Right} className="!bg-blue-400 !w-2.5 !h-2.5 !-right-1" />
      {d.hasChildren && (
        <CollapseToggle nodeId={id} isCollapsed={!!d.isCollapsed} />
      )}
    </div>
  )
})

export const nodeTypes = {
  rootNode: RootNode,
  branchNode: BranchNode,
  leafNode: LeafNode,
}
