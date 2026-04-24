import type { Node, Edge } from '@xyflow/react'

/* ── Mind Map Node/Edge ── */
// [EduMap fix] 2026-04-23: Relaxed from a strict enum to `string` so users
// can attach custom tags (e.g. "easy", "exam", "chapter-3") beyond the
// original fixed set. The five presets below still get special treatment
// (color + canonical capitalisation) in `TagBadge`; anything else falls
// back to a neutral slate palette. The serializer emits every tag
// verbatim, so tags round-trip cleanly through markdown.
export type NodeTag = string

/** Presets shown first in the tag picker and given dedicated colors. */
export interface TagPreset {
  value: string
  label: string
}
export const PREDEFINED_TAGS: TagPreset[] = [
  { value: 'hard', label: 'Hard' },
  { value: 'easy', label: 'Easy' },
  { value: 'important', label: 'Important' },
  { value: 'low-priority', label: 'Low Priority' },
  { value: 'new', label: 'New' },
]

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
  /**
   * [EduMap fix] 2026-04-23: Number of descendants hidden when this node
   * is collapsed. Populated by MindMapCanvas from the visible childMap so
   * the collapse badge can display "··· N nodes hidden" instead of a
   * vague "subtree hidden".
   */
  descendantCount?: number
  /**
   * [EduMap fix] 2026-04-23: Stamped by MindMapCanvas from the store's
   * `editedNodeIds` set. When true the node renders a subtle blue edge
   * marker and a pencil badge so the user can tell at a glance which
   * nodes diverge from the LLM's original output.
   */
  isEdited?: boolean
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
  /**
   * [EduMap fix] 2026-04-23: Export handlers are now keyed by which
   * version to export — 'current' (live canvas/markdown) or 'original'
   * (pristine LLM output). The TopNav renders each as a dropdown when
   * both are available; it falls back to a single-action button when
   * the original version doesn't exist (e.g., user hasn't uploaded a
   * PDF yet) or when nothing has been edited yet.
   */
  onExportImage: (variant: 'current' | 'original') => void
  onExportMarkdown: (variant: 'current' | 'original') => void
  /** True when an "original" PNG snapshot exists and can be exported. */
  hasOriginalPng: boolean
  /** True when an "original" markdown baseline exists. */
  hasOriginalMarkdown: boolean
  /** True when the user has edited any node since the last LLM load. */
  hasEdits: boolean
  isProcessing?: boolean
  activeModels?: string[]
  /**
   * [EduMap fix] 2026-04-23 (button consolidation): every in-app action
   * button now lives in the top nav — Save/Copy moved out of the sidebar
   * footer, Fit/Add-Node moved out of the canvas panel, Expand/Collapse All
   * moved out of the outline header. The props below are the handlers
   * wiring the TopNav to the existing behaviours.
   */
  onSave: () => void
  onCopyMarkdown: () => void
  onFitView: () => void
  onExpandAll: () => void
  onCollapseAll: () => void
  /**
   * [EduMap fix] 2026-04-23 (batch 5 #4): Jump straight to a specific
   * depth — `null` = "show all levels" (same as Expand All). Used by
   * the TopNav's level-selector dropdown so users can say "show me down
   * to L3" with one click instead of expanding every branch manually.
   */
  onShowUpToLevel: (maxDepth: number | null) => void
  onToggleAddNode: () => void
  isAddingNode: boolean
}

export type ProviderStatus = {
  configured: boolean
  reachable: boolean | null
  error?: string
}

export type HealthResult =
  | { status: 'ok'; providers: Record<string, ProviderStatus> }
  | { status: 'unavailable'; reason: string }