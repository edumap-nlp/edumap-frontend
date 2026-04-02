import type { Node, Edge } from '@xyflow/react'

/* ── Mind Map Node/Edge ── */
export type NodeTag = 'hard' | 'low-priority' | 'important' | 'new'

export interface MindMapNodeData extends Record<string, unknown> {
  label: string
  description?: string
  tags?: NodeTag[]
  depth: number
  sourceDocId?: string
  markdownLine?: number
  isHighlighted?: boolean
  hasChildren?: boolean
  isCollapsed?: boolean
}

export type MindMapNode = Node<MindMapNodeData>
export type MindMapEdge = Edge

/* ── PDF ── */
export interface PDFDocument {
  id: string
  name: string
  text: string
  pageCount: number
  file: File
}

/* ── LLM ── */
export type LLMProvider = 'openai' | 'anthropic' | 'google' | 'openai-codex'

export interface LLMConfig {
  provider: LLMProvider
  model: string
  apiKey?: string
  baseUrl?: string
}

export const DEFAULT_LLM_CONFIGS: Record<string, LLMConfig> = {
  'gpt-5.2': { provider: 'openai', model: 'gpt-5.2' },
  'claude-opus-4.6': { provider: 'anthropic', model: 'claude-opus-4.6' },
  'claude-sonnet-4.6': { provider: 'anthropic', model: 'claude-sonnet-4.6' },
  'gemini-3-pro-preview': { provider: 'google', model: 'gemini-3-pro-preview' },
  'gpt-codex-5.3': { provider: 'openai-codex', model: 'gpt-codex-5.3' },
}

/* ── Agent Orchestration ── */
export interface AgentTask {
  id: string
  type: 'extract' | 'merge'
  documentId?: string
  model: string
  status: 'pending' | 'running' | 'done' | 'error'
  input: string
  output?: string
}

export interface AgentResult {
  markdown: string
  concepts: ConceptNode[]
  relations: ConceptRelation[]
}

export interface ConceptNode {
  id: string
  label: string
  description?: string
  tags?: NodeTag[]
  sourceDocId?: string
  depth: number
  parentId?: string | null
}

export interface ConceptRelation {
  source: string
  target: string
  label?: string
  type: 'hierarchy' | 'semantic' | 'cross-document'
}

/* ── Component Props ── */
export interface MarkdownEditorPanelProps {
  value: string
  onChange: (value: string) => void
  onSave: () => void
  onCopyMarkdown: () => void
  onNodeClick?: (nodeId: string) => void
  highlightedNodeId?: string | null
  nodes?: MindMapNode[]
}

export interface MindMapCanvasProps {
  nodes: MindMapNode[]
  edges: MindMapEdge[]
  onNodesChange: (nodes: MindMapNode[]) => void
  onEdgesChange: (edges: MindMapEdge[]) => void
  onNodeClick?: (nodeId: string) => void
  onNodeLabelChange?: (nodeId: string, newLabel: string) => void
  highlightedNodeId?: string | null
  onExportPng?: () => void
}

/** Optional markmap-based viewer (not wired in MainEditor; kept for alternate layouts / future use). */
export interface MindMapViewerProps {
  markdown: string
  onExportPng?: () => void
  onExportSvg?: () => void
  onExportMarkdown?: () => void
}

export interface TopNavProps {
  onUploadPdf: () => void
  onExportImage: () => void
  onExportMarkdown: () => void
  isProcessing?: boolean
  activeModels?: string[]
}
