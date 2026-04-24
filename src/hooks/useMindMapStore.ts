import { create } from 'zustand'
import type {
  MindMapNode,
  MindMapEdge,
  MindMapNodeData,
  NodeTag,
  PDFDocument,
  AgentTask,
} from '../types'
import {
  layoutNodes,
  markdownToReactFlow,
  reactFlowToMarkdown,
} from '../services/mindmapTransformer'

interface MindMapStore {
  // State
  markdown: string
  nodes: MindMapNode[]
  edges: MindMapEdge[]
  documents: PDFDocument[]
  agentTasks: AgentTask[]
  isProcessing: boolean
  highlightedNodeId: string | null
  showUploadModal: boolean
  activeModels: string[]
  /**
   * [EduMap multimodal] 2026-04-21: Single source of truth for "which nodes
   * are currently collapsed" — shared between the mind map and the sidebar
   * tree so the two views never disagree about what's hidden.
   */
  collapsedNodeIds: Set<string>
  /**
   * [EduMap fix] 2026-04-23: Last extraction/processing error message,
   * rendered as a dismissable banner above the canvas. Set via
   * `setError(msg)`; cleared on successful `updateFromMarkdown` or by the
   * user clicking the dismiss button.
   */
  error: string | null
  /**
   * [EduMap fix] 2026-04-23 (edit tracking):
   * - `originalMarkdown`: the markdown exactly as the LLM produced it on the
   *   most recent successful extraction. Set once by `updateFromLLMMarkdown`,
   *   never touched by user edits — so we can always regenerate the
   *   "pristine, AI-only" version on demand.
   * - `editedNodeIds`: which nodes the user has directly modified since the
   *   last LLM load. Used by MindMapNode to paint a small "edited" badge,
   *   and by the TopNav to decide whether the Original export items are
   *   meaningfully different from Current.
   * - `originalPngDataUrl`: a PNG snapshot taken ~immediately after the
   *   LLM's markdown landed on the canvas (before the user had a chance to
   *   edit). Lets us export the "original mind map image" even after the
   *   user has dragged / edited nodes. Null until the snapshot completes.
   */
  originalMarkdown: string
  editedNodeIds: Set<string>
  originalPngDataUrl: string | null
  /**
   * [EduMap fix] 2026-04-23: Transient toast message shown after the user
   * clicks the Save button. Null means no toast is visible. Auto-clears
   * ~2.5s after being set; App.tsx owns the timer.
   */
  saveToastMessage: string | null
  /**
   * [EduMap fix] 2026-04-23 (button consolidation): Add-node mode used to
   * live as local state inside MindMapCanvas. Lifted to the store so the
   * TopNav button can toggle it (and so the canvas can read the flag to
   * paint the crosshair cursor + placement banner).
   */
  isAddingNode: boolean

  // Actions
  setMarkdown: (md: string) => void
  setNodesAndEdges: (nodes: MindMapNode[], edges: MindMapEdge[]) => void
  updateFromMarkdown: (md: string) => void
  /**
   * [EduMap fix] 2026-04-23: Called when a fresh markdown just came back
   * from the LLM. Runs everything `updateFromMarkdown` does AND captures
   * this markdown as the new `originalMarkdown`, clears `editedNodeIds`,
   * and resets `originalPngDataUrl` so the canvas can re-snapshot.
   */
  updateFromLLMMarkdown: (md: string) => void
  updateFromGraph: () => void
  addDocuments: (docs: PDFDocument[]) => void
  setAgentTasks: (tasks: AgentTask[]) => void
  setIsProcessing: (v: boolean) => void
  highlightNode: (id: string | null) => void
  setShowUploadModal: (v: boolean) => void
  addManualEdge: (edge: MindMapEdge) => void
  updateNodeLabel: (nodeId: string, newLabel: string) => void
  toggleCollapsed: (nodeId: string) => void
  setCollapsedNodeIds: (ids: Set<string>) => void
  expandAll: () => void
  collapseAll: () => void
  /**
   * [EduMap fix] 2026-04-23 (batch 5 #4): Collapse every branch deeper
   * than `maxDepth` so only L1..maxDepth stay visible. `null` is
   * equivalent to `expandAll()` (show every level).
   */
  showUpToLevel: (maxDepth: number | null) => void
  setError: (err: string | null) => void
  /** Mark a single node as user-edited (additive; never auto-clears). */
  markNodeEdited: (nodeId: string) => void
  /** Replace the set outright — used when loading/clearing baseline. */
  setEditedNodeIds: (ids: Set<string>) => void
  /** Revert markdown + graph to the last LLM output, clearing all edits. */
  resetToOriginal: () => void
  /** Canvas pushes the snapshot into the store once the capture succeeds. */
  setOriginalPngDataUrl: (url: string | null) => void
  /** Show a transient "Saved" (or similar) toast. */
  showSaveToast: (message: string) => void
  /** Clear the toast (App.tsx calls this on the auto-dismiss timer). */
  hideSaveToast: () => void
  /** Toggle the canvas' add-node placement mode. */
  setIsAddingNode: (v: boolean) => void
  toggleIsAddingNode: () => void
  /**
   * [EduMap fix] 2026-04-23 (tags): Replace a node's full tag list. Also
   * marks the node as user-edited and re-serialises markdown so the
   * sidebar reflects the change immediately.
   */
  setNodeTags: (nodeId: string, tags: NodeTag[]) => void
  /** Add `tag` to a node if absent, remove it if already present. */
  toggleNodeTag: (nodeId: string, tag: NodeTag) => void
  /**
   * [EduMap fix] 2026-04-23 (drag-to-reparent): Move `draggedId` so that
   * it lives as the `insertIndex`-th child of `newParentId`. If
   * `newParentId` is null the node becomes a top-level root. All of the
   * dragged node's own descendants travel with it (we only touch its
   * incoming edge). No-ops if the move would create a cycle.
   *
   * After the edges are rewired we re-run the tidy-tree layout, mark the
   * moved node as user-edited, and regenerate the markdown so the
   * sidebar outline updates in lockstep.
   */
  reparentAndReorder: (
    draggedId: string,
    newParentId: string | null,
    insertIndex: number
  ) => void
}

/**
 * [EduMap multimodal] 2026-04-21: Default collapse policy.
 * Jun: "默认展示的时候只显示到二级标题" — only L1 (`#`) and L2 (`##`)
 * should be visible initially. So we collapse every node whose depth >= 2
 * AND that actually has children. L1 stays expanded (it IS the root), its
 * L2 children show as collapsed-but-visible placeholders, and clicking the
 * triangle on a L2 reveals its L3 subtree.
 */
function computeDefaultCollapsedSet(
  nodes: MindMapNode[],
  edges: MindMapEdge[]
): Set<string> {
  const hasChildren = new Set<string>()
  for (const e of edges) hasChildren.add(e.source)

  const collapsed = new Set<string>()
  for (const n of nodes) {
    if (!hasChildren.has(n.id)) continue
    const depth = (n.data as MindMapNodeData).depth
    if (depth >= 2) collapsed.add(n.id)
  }
  return collapsed
}

export const useMindMapStore = create<MindMapStore>((set, get) => ({
  markdown: '',
  nodes: [],
  edges: [],
  documents: [],
  agentTasks: [],
  isProcessing: false,
  highlightedNodeId: null,
  showUploadModal: false,
  activeModels: [],
  collapsedNodeIds: new Set<string>(),
  error: null,
  originalMarkdown: '',
  editedNodeIds: new Set<string>(),
  originalPngDataUrl: null,
  saveToastMessage: null,
  isAddingNode: false,

  setMarkdown: (md) => set({ markdown: md }),

  setNodesAndEdges: (nodes, edges) => set({ nodes, edges }),

  updateFromMarkdown: (md) => {
    const { nodes, edges } = markdownToReactFlow(md)
    // [EduMap debug] 2026-04-22: Temporary debug hook so we can inspect the
    // LLM's raw markdown and the parsed graph from the browser console when a
    // user reports sidebar/mindmap divergence. Just type
    //   copy(window.__edumapDebug.markdown)
    // in DevTools to grab the current markdown; `nodes` / `edges` are there
    // too for poking at the graph shape. Guarded to keep prod bundles clean.
    if (import.meta.env.DEV && typeof window !== 'undefined') {
      ;(window as unknown as { __edumapDebug?: unknown }).__edumapDebug = {
        markdown: md,
        nodes,
        edges,
      }
    }
    set({
      markdown: md,
      nodes,
      edges,
      // Reset collapse to the default-L2 view every time new content lands.
      collapsedNodeIds: computeDefaultCollapsedSet(nodes, edges),
      // Any successful parse clears a previous extraction error banner.
      error: null,
    })
  },

  /**
   * [EduMap fix] 2026-04-23: LLM-sourced variant of `updateFromMarkdown`.
   * Sets this markdown as the authoritative "original" baseline, clears
   * the per-node edit marks, and resets the stored PNG snapshot so the
   * canvas can capture a fresh one once it finishes rendering.
   */
  updateFromLLMMarkdown: (md) => {
    const { nodes, edges } = markdownToReactFlow(md)
    if (import.meta.env.DEV && typeof window !== 'undefined') {
      ;(window as unknown as { __edumapDebug?: unknown }).__edumapDebug = {
        markdown: md,
        nodes,
        edges,
      }
    }
    set({
      markdown: md,
      nodes,
      edges,
      collapsedNodeIds: computeDefaultCollapsedSet(nodes, edges),
      error: null,
      originalMarkdown: md,
      editedNodeIds: new Set<string>(),
      originalPngDataUrl: null,
    })
  },

  updateFromGraph: () => {
    const { nodes, edges } = get()
    const md = reactFlowToMarkdown(nodes, edges)
    set({ markdown: md })
  },

  addDocuments: (docs) =>
    set((state) => ({ documents: [...state.documents, ...docs] })),

  setAgentTasks: (tasks) => {
    const activeModels = [...new Set(tasks.filter((t) => t.status === 'running').map((t) => t.model))]
    set({ agentTasks: tasks, activeModels })
  },

  setIsProcessing: (v) => set({ isProcessing: v }),

  highlightNode: (id) => set({ highlightedNodeId: id }),

  setShowUploadModal: (v) => set({ showUploadModal: v }),

  addManualEdge: (edge) =>
    set((state) => ({ edges: [...state.edges, edge] })),

  updateNodeLabel: (nodeId, newLabel) =>
    set((state) => {
      // [EduMap fix] 2026-04-23: Any label edit automatically marks the
      // node as user-modified so the canvas can render the "edited" badge
      // and the TopNav can offer a meaningful "Original vs Current" diff.
      const nextEdited = new Set(state.editedNodeIds)
      nextEdited.add(nodeId)
      return {
        nodes: state.nodes.map((n) =>
          n.id === nodeId
            ? { ...n, data: { ...n.data, label: newLabel } }
            : n
        ),
        editedNodeIds: nextEdited,
      }
    }),

  /**
   * [EduMap fix] 2026-04-23 (batch 5 #3): Progressive disclosure.
   *
   * When the user expands a previously-collapsed node, don't spill the
   * ENTIRE downstream subtree onto the canvas — only reveal ONE level
   * deeper. Concretely: after removing `nodeId` from the collapsed set,
   * walk its direct children and auto-collapse any child that has
   * grandchildren of its own. Leaf children stay visible; branch
   * children show up collapsed (so the user sees their labels but not
   * their subtrees), with the triangle ready for another click.
   *
   * Collapsing is unchanged — just adds the node to the set.
   *
   * Earlier behaviour just flipped membership, which was fine for the
   * initial default-L2 view (where every depth≥2 branch was already in
   * the set) but broke after "Expand All" cleared the set: expanding any
   * L2 node then revealed every descendant down to the leaves, which
   * isn't what Yana wanted ("我只想展开下一级的节点").
   */
  toggleCollapsed: (nodeId) =>
    set((state) => {
      const next = new Set(state.collapsedNodeIds)
      if (next.has(nodeId)) {
        next.delete(nodeId)
        const childMap = new Map<string, string[]>()
        for (const e of state.edges) {
          if (!childMap.has(e.source)) childMap.set(e.source, [])
          childMap.get(e.source)!.push(e.target)
        }
        for (const childId of childMap.get(nodeId) ?? []) {
          const hasGrandchildren = (childMap.get(childId) ?? []).length > 0
          if (hasGrandchildren) next.add(childId)
        }
      } else {
        next.add(nodeId)
      }
      return { collapsedNodeIds: next }
    }),

  setCollapsedNodeIds: (ids) => set({ collapsedNodeIds: new Set(ids) }),

  expandAll: () => set({ collapsedNodeIds: new Set<string>() }),

  collapseAll: () =>
    set((state) => {
      const hasChildren = new Set<string>()
      for (const e of state.edges) hasChildren.add(e.source)
      const all = new Set<string>()
      for (const n of state.nodes) {
        if (hasChildren.has(n.id)) all.add(n.id)
      }
      return { collapsedNodeIds: all }
    }),

  /**
   * [EduMap fix] 2026-04-23 (batch 5 #4): Show everything down to (and
   * including) depth `maxDepth`, collapsing any branch deeper than that.
   * Leaf nodes are never added to the collapsed set (the triangle would
   * be meaningless on them). Pass `null` / `Infinity` to expand the
   * whole tree.
   *
   * Example: `showUpToLevel(2)` → L1 + L2 visible, every L2 branch with
   * descendants is collapsed. `showUpToLevel(3)` → L1–L3 visible, L3
   * branches collapsed, etc.
   */
  showUpToLevel: (maxDepth) =>
    set((state) => {
      if (maxDepth === null || !Number.isFinite(maxDepth)) {
        return { collapsedNodeIds: new Set<string>() }
      }
      const hasChildren = new Set<string>()
      for (const e of state.edges) hasChildren.add(e.source)
      const next = new Set<string>()
      for (const n of state.nodes) {
        if (!hasChildren.has(n.id)) continue
        const d = (n.data as MindMapNodeData).depth ?? 1
        if (d >= maxDepth) next.add(n.id)
      }
      return { collapsedNodeIds: next }
    }),

  setError: (err) => set({ error: err }),

  markNodeEdited: (nodeId) =>
    set((state) => {
      if (state.editedNodeIds.has(nodeId)) return {}
      const next = new Set(state.editedNodeIds)
      next.add(nodeId)
      return { editedNodeIds: next }
    }),

  setEditedNodeIds: (ids) => set({ editedNodeIds: new Set(ids) }),

  /**
   * [EduMap fix] 2026-04-23: Replay the last LLM markdown through the
   * normal parser so collapse state and layout are all rebuilt from
   * scratch. Edit marks are cleared; the PNG snapshot is kept — users
   * often want "see the pristine version again" without losing the
   * snapshot they already have of it.
   */
  resetToOriginal: () =>
    set((state) => {
      if (!state.originalMarkdown) return {}
      const { nodes, edges } = markdownToReactFlow(state.originalMarkdown)
      return {
        markdown: state.originalMarkdown,
        nodes,
        edges,
        collapsedNodeIds: computeDefaultCollapsedSet(nodes, edges),
        editedNodeIds: new Set<string>(),
        error: null,
      }
    }),

  setOriginalPngDataUrl: (url) => set({ originalPngDataUrl: url }),

  showSaveToast: (message) => set({ saveToastMessage: message }),
  hideSaveToast: () => set({ saveToastMessage: null }),

  setIsAddingNode: (v) => set({ isAddingNode: v }),
  toggleIsAddingNode: () =>
    set((state) => ({ isAddingNode: !state.isAddingNode })),

  setNodeTags: (nodeId, tags) =>
    set((state) => {
      const nextNodes = state.nodes.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, tags } as MindMapNodeData }
          : n
      )
      const nextEdited = new Set(state.editedNodeIds)
      nextEdited.add(nodeId)
      // Re-serialise immediately so the sidebar markdown reflects the new
      // tag set without the user having to click Save.
      const md = reactFlowToMarkdown(nextNodes, state.edges)
      return { nodes: nextNodes, editedNodeIds: nextEdited, markdown: md }
    }),

  toggleNodeTag: (nodeId, tag) =>
    set((state) => {
      const target = state.nodes.find((n) => n.id === nodeId)
      if (!target) return {}
      const current = (target.data as MindMapNodeData).tags ?? []
      const nextTags = current.includes(tag)
        ? current.filter((t) => t !== tag)
        : [...current, tag]
      const nextNodes = state.nodes.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, tags: nextTags } as MindMapNodeData }
          : n
      )
      const nextEdited = new Set(state.editedNodeIds)
      nextEdited.add(nodeId)
      const md = reactFlowToMarkdown(nextNodes, state.edges)
      return { nodes: nextNodes, editedNodeIds: nextEdited, markdown: md }
    }),

  /**
   * Cross-parent re-parent + sibling reorder in a single action.
   *
   * Sibling ordering comes "for free" because `reactFlowToMarkdown` builds
   * its child map by iterating `edges` in insertion order. So to put the
   * dragged node at position `insertIndex` among `newParentId`'s existing
   * children, we:
   *   1. strip the one incoming edge that targets the dragged node
   *   2. locate the CURRENT insertIndex-th child edge of newParentId in
   *      the `edges` array (after step 1)
   *   3. splice the new edge in immediately BEFORE that position; if
   *      there is no such index (insertIndex >= sibling count) we append
   *      to the end of the array, which makes the dragged node the last
   *      child
   *
   * Cycle guard: if newParentId is a descendant of draggedId (or the
   * dragged node itself), the move is impossible in a tree — silently
   * no-op rather than produce garbage.
   */
  reparentAndReorder: (draggedId, newParentId, insertIndex) =>
    set((state) => {
      if (newParentId === draggedId) return {}

      // Build child-map to detect cycles.
      const childMap = new Map<string, string[]>()
      for (const e of state.edges) {
        if (!childMap.has(e.source)) childMap.set(e.source, [])
        childMap.get(e.source)!.push(e.target)
      }
      if (newParentId) {
        // DFS from draggedId; if we hit newParentId we'd create a loop.
        const stack = [draggedId]
        const seen = new Set<string>()
        while (stack.length > 0) {
          const id = stack.pop()!
          if (seen.has(id)) continue
          seen.add(id)
          if (id === newParentId) return {}
          for (const c of childMap.get(id) ?? []) stack.push(c)
        }
      }

      // Strip the single incoming edge (if any). Duplicate incoming edges
      // shouldn't happen in practice but handle them defensively.
      const filteredEdges = state.edges.filter((e) => e.target !== draggedId)

      let nextEdges: MindMapEdge[] = filteredEdges
      if (newParentId) {
        const newEdge: MindMapEdge = {
          id: `edge-${newParentId}-${draggedId}-${Date.now()}`,
          source: newParentId,
          target: draggedId,
          type: 'default',
          style: { stroke: '#3b82f6', strokeWidth: 2 },
          animated: false,
        }
        const siblingEdges = filteredEdges.filter(
          (e) => e.source === newParentId
        )
        let insertPos = filteredEdges.length
        if (insertIndex < siblingEdges.length) {
          const anchor = siblingEdges[Math.max(0, insertIndex)]
          insertPos = filteredEdges.indexOf(anchor)
        }
        nextEdges = [
          ...filteredEdges.slice(0, insertPos),
          newEdge,
          ...filteredEdges.slice(insertPos),
        ]
      }

      // Re-run tidy-tree layout so columns/rows reflect the new tree.
      const laidOut = layoutNodes(state.nodes, nextEdges)
      const md = reactFlowToMarkdown(laidOut, nextEdges)

      const nextEdited = new Set(state.editedNodeIds)
      nextEdited.add(draggedId)

      return {
        nodes: laidOut,
        edges: nextEdges,
        markdown: md,
        editedNodeIds: nextEdited,
      }
    }),
}))
