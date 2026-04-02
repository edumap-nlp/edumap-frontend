import { create } from 'zustand'
import type { MindMapNode, MindMapEdge, PDFDocument, AgentTask } from '../types'
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

  setMarkdown: (md) => set({ markdown: md }),

  setNodesAndEdges: (nodes, edges) => set({ nodes, edges }),

  updateFromMarkdown: (md) => {
    const { nodes, edges } = markdownToReactFlow(md)
    set({ markdown: md, nodes, edges })
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
}))
