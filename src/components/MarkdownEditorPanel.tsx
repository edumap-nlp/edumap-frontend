import { useCallback, useRef, useMemo } from 'react'
import MDEditor from '@uiw/react-md-editor'
import type { ICommand } from '@uiw/react-md-editor'
import { bold, italic, strikethrough, TextAreaCommandOrchestrator } from '@uiw/react-md-editor'
import type { MarkdownEditorPanelProps, MindMapNodeData, MindMapEdge, NodeTag } from '../types'
import { useMindMapStore } from '../hooks/useMindMapStore'

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
  hasChildren: boolean
  isCollapsed: boolean
}

/**
 * [EduMap multimodal] 2026-04-21: Build parent → [children] adjacency from
 * the edge list so we can hide descendants of collapsed nodes in the sidebar.
 */
function buildChildMap(edges: MindMapEdge[]): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const e of edges) {
    if (!map.has(e.source)) map.set(e.source, [])
    map.get(e.source)!.push(e.target)
  }
  return map
}

/**
 * Collect every descendant of the given collapsed nodes. The collapsed
 * nodes themselves stay visible — only their children (and deeper) hide.
 */
function collectHidden(
  collapsed: Set<string>,
  childMap: Map<string, string[]>
): Set<string> {
  const hidden = new Set<string>()
  function recurse(id: string) {
    for (const c of childMap.get(id) ?? []) {
      hidden.add(c)
      recurse(c)
    }
  }
  for (const id of collapsed) recurse(id)
  return hidden
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

  // [EduMap multimodal] 2026-04-21: The sidebar shares the same collapse
  // state as the mind map via the zustand store, so clicking a triangle
  // in either view updates both. `edges` are also pulled from the store
  // because the parent only hands us `nodes` — we need the graph to know
  // which items are leaves vs. parents and which descendants to hide.
  const edges = useMindMapStore((s) => s.edges)
  const collapsedNodeIds = useMindMapStore((s) => s.collapsedNodeIds)
  const toggleCollapsed = useMindMapStore((s) => s.toggleCollapsed)
  const expandAll = useMindMapStore((s) => s.expandAll)
  const collapseAll = useMindMapStore((s) => s.collapseAll)

  const childMap = useMemo(() => buildChildMap(edges), [edges])
  const hiddenIds = useMemo(
    () => collectHidden(collapsedNodeIds, childMap),
    [collapsedNodeIds, childMap]
  )

  // [EduMap fix] 2026-04-22: Derive sidebar depth from an actual DFS over the
  // graph instead of trusting `data.depth`. Rationale — when the LLM emits
  // unusual markdown (e.g. `# Root` → `### Child` with no `##` in between,
  // or deep-then-shallow-then-deep patterns), the stored depth is computed
  // from the raw-vs-normalized heuristic in `parseMarkdownToNodes`. That
  // heuristic usually matches the edge-based tree depth, but "usually" is
  // not "always" — and the mind map's visible hierarchy is driven solely
  // by the edges via dagre. Walking the edges here guarantees the sidebar's
  // indent level for every node matches its actual ancestor count in the
  // mind map. This also fixes the order to be a true parent-first DFS so
  // the two views scroll in lockstep.
  const nodeIndex = useMemo<NodeIndexItem[]>(() => {
    if (!nodes || nodes.length === 0) return []

    const parentSet = new Set<string>()
    for (const e of edges) parentSet.add(e.target)
    const nodeMap = new Map(nodes.map((n) => [n.id, n]))

    const items: NodeIndexItem[] = []
    const visited = new Set<string>()

    const visit = (nodeId: string, depth: number) => {
      if (visited.has(nodeId)) return // guard against accidental cycles
      visited.add(nodeId)
      if (hiddenIds.has(nodeId)) return

      const n = nodeMap.get(nodeId)
      if (!n) return
      const data = n.data as MindMapNodeData
      const children = childMap.get(nodeId) ?? []

      // [EduMap fix] 2026-04-22: A node counts as "having children" for
      // the purpose of showing the collapse triangle if EITHER it has
      // real edge-children OR it has a plain-text description hanging
      // off it. Rationale — the LLM's current output puts a one-line
      // description under every ### heading, which the parser captures
      // into `data.description`. Yana wants those lines to live in the
      // outline and be hideable via the same triangle. Without the
      // description-check, a `###` with a description but no grand-
      // children wouldn't get a triangle and the user couldn't hide
      // the description row.
      const hasDescription = !!data.description
      items.push({
        nodeId: n.id,
        label: data.label,
        depth,
        tags: data.tags ?? [],
        description: data.description,
        hasChildren: children.length > 0 || hasDescription,
        isCollapsed: collapsedNodeIds.has(n.id),
      })

      for (const c of children) visit(c, depth + 1)
    }

    // Roots: nodes with no incoming edge. Preserve the document order they
    // appear in `nodes` so the sidebar reflects the same top-to-bottom
    // reading sequence as the markdown source.
    for (const n of nodes) {
      if (!parentSet.has(n.id)) visit(n.id, 1)
    }

    // Any node the DFS missed (dangling edges, disconnected pieces) still
    // gets rendered so nothing silently disappears from the outline.
    for (const n of nodes) {
      if (!visited.has(n.id)) visit(n.id, 1)
    }

    return items
  }, [nodes, edges, hiddenIds, childMap, collapsedNodeIds])

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
            <div className="px-4 py-2 bg-slate-50/80 border-b border-surface-border sticky top-0 z-10">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" /><path d="M8 12l2 2 4-4" />
                  </svg>
                  Document Outline
                </h3>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={expandAll}
                    className="px-2 py-0.5 rounded text-[10px] font-medium bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                    title="Expand every subtree"
                  >
                    Expand All
                  </button>
                  <button
                    type="button"
                    onClick={collapseAll}
                    className="px-2 py-0.5 rounded text-[10px] font-medium bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                    title="Collapse to level 2"
                  >
                    Collapse All
                  </button>
                </div>
              </div>
              <p className="text-[10px] text-slate-500 mt-0.5">
                Click ▶ to expand · click a row to locate it in the mind map
              </p>
            </div>
            <div className="py-1">
              {nodeIndex.map((item) => {
                // [EduMap fix] 2026-04-22: Indent by depth with a wider step
                // (16px vs 12px) so the hierarchy is visually unambiguous
                // when the LLM produces a shallow 3-level tree (the common
                // case for uploaded PDFs). Cap raised from 5 to 7 so deeper
                // outlines still step outward instead of crowding on one
                // line.
                const indent = Math.min(item.depth, 7) * 16 + 4
                // [EduMap fix] 2026-04-22: The description row lives one
                // level deeper than its parent heading in the outline,
                // visually distinguished by italic muted text. We show it
                // only when its heading is expanded — clicking the
                // triangle on the heading hides/shows it like any other
                // subtree.
                const descIndent = Math.min(item.depth + 1, 7) * 16 + 4
                const showDescription = !!item.description && !item.isCollapsed
                return (
                  <div key={item.nodeId}>
                    <div
                      className={`w-full flex items-center gap-1 group transition-colors
                        ${highlightedNodeId === item.nodeId ? 'bg-blue-100 border-l-2 border-blue-500' : 'border-l-2 border-transparent hover:bg-blue-50'}`}
                      style={{ paddingLeft: `${indent}px` }}
                    >
                      {/* Triangle — rendered on nodes that have either
                          edge-children or a description. Leaves get a
                          16px-wide spacer so their labels still align. */}
                      {item.hasChildren ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleCollapsed(item.nodeId)
                          }}
                          className="w-4 h-4 shrink-0 flex items-center justify-center text-slate-400 hover:text-slate-700 text-[10px] leading-none"
                          title={item.isCollapsed ? 'Expand' : 'Collapse'}
                          aria-label={item.isCollapsed ? 'Expand' : 'Collapse'}
                        >
                          {item.isCollapsed ? '▶' : '▼'}
                        </button>
                      ) : (
                        <span className="w-4 h-4 shrink-0" />
                      )}
                      <button
                        type="button"
                        onClick={() => onNodeClick?.(item.nodeId)}
                        className="flex-1 text-left py-1.5 pr-4 flex items-center gap-2"
                      >
                        <span
                          className={`text-[11px] leading-tight flex-1 ${
                            item.depth <= 1
                              ? 'font-bold text-slate-900'
                              : item.depth <= 2
                                ? 'font-semibold text-slate-800'
                                : item.depth <= 3
                                  ? 'font-medium text-slate-700'
                                  : 'text-slate-600'
                          }`}
                        >
                          {item.depth <= 1 ? '📋 ' : ''}
                          {item.label}
                        </span>
                        {item.tags.map((tag) => (
                          <TagBadgeSmall key={tag} tag={tag} />
                        ))}
                        <span className="text-blue-400 opacity-0 group-hover:opacity-100 text-[10px] transition-opacity shrink-0">
                          ↗ locate
                        </span>
                      </button>
                    </div>
                    {showDescription && (
                      <div
                        className="w-full flex items-start gap-1 border-l-2 border-transparent"
                        style={{ paddingLeft: `${descIndent}px` }}
                      >
                        <span className="w-4 h-4 shrink-0" />
                        <p className="flex-1 py-1 pr-4 text-[11px] leading-snug text-slate-500 italic">
                          {item.description}
                        </p>
                      </div>
                    )}
                  </div>
                )
              })}
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
