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
  /**
   * [EduMap multimodal] Added 2026-04-21.
   * Optional multimodal enrichment from the Yana pipeline (via
   * POST /api/pdf/extract-multimodal). When present, agentOrchestrator sends
   * `multimodalContext` to the LLM instead of plain `text`. Shape is documented
   * in server/routes/multimodal.ts and edumap_yana_model/code/multimodal_pipeline_v2.py.
   */
  multimodal?: MultimodalExtraction
}

/* ── Multimodal (Yana pipeline v2) ── */
export interface MultimodalFigure {
  id: string
  page: number
  bbox: number[] | null
  image_path: string
  caption: string
  vision_description: string
  surrounding_text: string
  ocr_text: string
  source: string
}

export interface MultimodalFormula {
  id: string
  page: number
  kind: 'text' | 'image'
  context: string
  latex_guess: string
  image_path?: string | null
}

export interface MultimodalTable {
  page: number
  header: string[]
  rows: string[][]
  csv: string
}

export interface MultimodalAnchor {
  kind: 'figure' | 'table' | 'equation'
  number: number
  page: number
  char_offset: number
}

export interface MultimodalExtraction {
  doc_id: string
  page_count: number
  layout: 'single' | 'two-column' | 'mixed'
  text_blocks: { page: number; bbox: number[] | null; text: string; column: number }[]
  figures: MultimodalFigure[]
  formulas: MultimodalFormula[]
  tables: MultimodalTable[]
  anchors: MultimodalAnchor[]
  counts: Record<string, number>
  token_stats: { input_tokens: number; output_tokens: number }
  timing_seconds: number
  multimodal_context: string
  markdown: string
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
// [EduMap fix] 2026-04-22: Added 'harvest' and 'organize' so the per-doc
// pipeline can run as two LLM calls — first a concept-harvest pass that
// produces a flat list of atomic concepts (ignoring document structure),
// then a semantic-organize pass that clusters them by knowledge category
// into the hierarchical markdown. 'extract' is kept for callers that
// still want the old single-shot flow (e.g., fallback paths). The UI
// just renders the list, so adding new types is backward-compatible.
export interface AgentTask {
  id: string
  type: 'extract' | 'harvest' | 'organize' | 'merge'
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

export type ProviderStatus = {
  configured: boolean
  reachable: boolean | null
  error?: string
}

export type HealthResult =
  | { status: 'ok'; providers: Record<string, ProviderStatus> }
  | { status: 'unavailable'; reason: string }