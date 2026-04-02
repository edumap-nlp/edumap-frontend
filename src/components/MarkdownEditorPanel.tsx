import { useCallback, useRef, useMemo } from 'react'
import MDEditor from '@uiw/react-md-editor'
import type { ICommand } from '@uiw/react-md-editor'
import { bold, italic, strikethrough, TextAreaCommandOrchestrator } from '@uiw/react-md-editor'
import type { MarkdownEditorPanelProps, MindMapNodeData, NodeTag } from '../types'

const underlineCommand: ICommand = {
  name: 'underline',
  keyCommand: 'underline',
  buttonProps: { 'aria-label': 'Underline', title: 'Underline' },
  prefix: '<u>',
  suffix: '</u>',
  execute(state, api) {
    const { selection, text, command } = state
    const prefix = command.prefix ?? '<u>'
    const suffix = command.suffix ?? '</u>'
    const selectedText = text.slice(selection.start, selection.end)
    if (selectedText.startsWith(prefix) && selectedText.endsWith(suffix)) {
      api.replaceSelection(selectedText.slice(prefix.length, -suffix.length))
      api.setSelectionRange({ start: selection.start, end: selection.end - prefix.length - suffix.length })
    } else {
      api.replaceSelection(prefix + selectedText + suffix)
      api.setSelectionRange({ start: selection.start + prefix.length, end: selection.end + prefix.length })
    }
  },
}

interface NodeIndexItem {
  nodeId: string
  label: string
  depth: number
  tags: NodeTag[]
  description?: string
}

export default function MarkdownEditorPanel({
  onChange,
  onSave,
  onCopyMarkdown,
  onNodeClick,
  highlightedNodeId,
  nodes,
}: MarkdownEditorPanelProps) {
  const editorRef = useRef<{ container?: HTMLDivElement; textarea?: HTMLTextAreaElement } | null>(null)

  const handleChange = useCallback(
    (val?: string) => {
      onChange(val ?? '')
    },
    [onChange]
  )

  const applyFormat = useCallback(
    (command: ICommand) => {
      const container = editorRef.current?.container
      const textarea = container?.querySelector?.('textarea') ?? editorRef.current?.textarea
      if (!textarea || !onChange) return
      const orchestrator = new TextAreaCommandOrchestrator(textarea)
      orchestrator.executeCommand(command)
      onChange(textarea.value)
    },
    [onChange]
  )

  // Build clickable node index from the mind map nodes
  const nodeIndex = useMemo<NodeIndexItem[]>(() => {
    if (!nodes) return []
    return nodes.map((n) => {
      const data = n.data as MindMapNodeData
      return {
        nodeId: n.id,
        label: data.label,
        depth: data.depth,
        tags: data.tags ?? [],
        description: data.description,
      }
    })
  }, [nodes])

  return (
    <section className="flex flex-col h-full border-r border-surface-border bg-panel min-w-[420px] max-w-[520px]">
      {/* <h2 className="text-lg font-semibold text-slate-800 px-4 py-3 border-b border-surface-border shrink-0 flex items-center gap-2">
        <svg className="w-5 h-5 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
        Text Extraction &amp; Markdown Editor
      </h2> */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Toolbar */}
        {/* <div className="border-b border-surface-border bg-slate-50/50 px-2 py-1 flex items-center gap-1 flex-wrap shrink-0">
          <ToolbarButton title="Bold" onClick={() => applyFormat(bold)} className="font-bold">B</ToolbarButton>
          <ToolbarButton title="Italic" onClick={() => applyFormat(italic)} className="italic">I</ToolbarButton>
          <ToolbarButton title="Strikethrough" onClick={() => applyFormat(strikethrough)} className="line-through">S</ToolbarButton>
          <ToolbarButton title="Underline" onClick={() => applyFormat(underlineCommand)} className="underline">U</ToolbarButton>
          <span className="w-px h-5 bg-surface-border mx-1" />
          <ToolbarButton title="Ordered list">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><text x="2" y="8" fontSize="8" fill="currentColor" stroke="none">1</text><text x="2" y="14" fontSize="8" fill="currentColor" stroke="none">2</text><text x="2" y="20" fontSize="8" fill="currentColor" stroke="none">3</text></svg>
          </ToolbarButton>
          <ToolbarButton title="Unordered list">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1.5" fill="currentColor"/><circle cx="4" cy="12" r="1.5" fill="currentColor"/><circle cx="4" cy="18" r="1.5" fill="currentColor"/></svg>
          </ToolbarButton>
          <span className="w-px h-5 bg-surface-border mx-1" />
          <ToolbarButton title="Undo">↶</ToolbarButton>
          <ToolbarButton title="Redo">↷</ToolbarButton>
        </div> */}

        {/* Markdown Editor */}
        {/* <div className="flex-1 min-h-0 overflow-auto" data-color-mode="light">
          <MDEditor
            ref={editorRef}
            value={value}
            onChange={handleChange}
            height="100%"
            minHeight={200}
            preview="edit"
            hideToolbar
            visibleDragbar={false}
            className="flex-1 border-0"
          />
        </div>  */}

        {/* Clickable node index — maps editor items to mind map nodes */}
        {nodeIndex.length > 0 && (
          <div className="border-t border-surface-border max-h-[600px] overflow-y-auto shrink-0">
            <div className="px-4 py-2 bg-slate-50/80 border-b border-surface-border sticky top-0">
              <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" /><path d="M8 12l2 2 4-4" />
                </svg>
                Interactive Editing Features
              </h3>
              <p className="text-[10px] text-slate-500 mt-0.5">Click an item to locate it in the mind map</p>
            </div>
            <div className="py-1">
              {nodeIndex.map((item) => (
                <button
                  key={item.nodeId}
                  onClick={() => onNodeClick?.(item.nodeId)}
                  className={`w-full text-left px-4 py-1.5 hover:bg-blue-50 transition-colors flex items-center gap-2 group
                    ${highlightedNodeId === item.nodeId ? 'bg-blue-100 border-l-2 border-blue-500' : 'border-l-2 border-transparent'}`}
                  style={{ paddingLeft: `${Math.min(item.depth, 5) * 12 + 16}px` }}
                >
                  <span className={`text-[11px] leading-tight flex-1 ${item.depth <= 1 ? 'font-bold text-slate-900' : item.depth <= 3 ? 'font-semibold text-slate-800' : 'text-slate-700'}`}>
                    {item.depth <= 1 ? '📋 ' : item.depth <= 3 ? '▸ ' : '• '}
                    {item.label}
                  </span>
                  {item.tags.map((tag) => (
                    <TagBadgeSmall key={tag} tag={tag} />
                  ))}
                  <span className="text-blue-400 opacity-0 group-hover:opacity-100 text-[10px] transition-opacity shrink-0">
                    ↗ locate
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Bottom buttons */}
        <div className="p-4 border-t border-surface-border shrink-0 flex gap-2">
          <button
            type="button"
            onClick={onSave}
            className="px-4 py-2 rounded-lg bg-primary text-white font-medium hover:bg-primary-hover transition-colors text-sm"
          >
            Save Modifications
          </button>
          <button
            type="button"
            onClick={onCopyMarkdown}
            className="px-4 py-2 rounded-lg bg-sky-100 text-sky-800 font-medium hover:bg-sky-200 transition-colors text-sm"
          >
            📋 Copy Markdown
          </button>
        </div>
      </div>
    </section>
  )
}

function TagBadgeSmall({ tag }: { tag: NodeTag }) {
  const config: Record<NodeTag, { cls: string; label: string }> = {
    hard: { cls: 'bg-yellow-200 text-yellow-900', label: 'Hard' },
    'low-priority': { cls: 'bg-slate-100 text-slate-600', label: 'Low Priority' },
    important: { cls: 'bg-blue-100 text-blue-800', label: 'Important' },
    new: { cls: 'bg-green-100 text-green-800', label: 'New' },
  }
  const c = config[tag]
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold ${c.cls} shrink-0`}>
      {c.label}
    </span>
  )
}

function ToolbarButton({
  title,
  children,
  onClick,
  className = '',
}: {
  title: string
  children: React.ReactNode
  onClick?: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`w-8 h-8 rounded hover:bg-slate-200 flex items-center justify-center text-slate-700 text-sm font-medium ${className}`}
    >
      {children}
    </button>
  )
}
