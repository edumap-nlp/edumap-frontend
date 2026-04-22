import { create } from 'zustand'
import type {
  MindMapNode,
  MindMapEdge,
  MindMapNodeData,
  PDFDocument,
  AgentTask,
} from '../types'
import { markdownToReactFlow, reactFlowToMarkdown } from '../services/mindmapTransformer'

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

  // Actions
  setMarkdown: (md: string) => void
  setNodesAndEdges: (nodes: MindMapNode[], edges: MindMapEdge[]) => void
  updateFromMarkdown: (md: string) => void
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
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, label: newLabel } }
          : n
      ),
    })),

  toggleCollapsed: (nodeId) =>
    set((state) => {
      const next = new Set(state.collapsedNodeIds)
      if (next.has(nodeId)) next.delete(nodeId)
      else next.add(nodeId)
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
}))
