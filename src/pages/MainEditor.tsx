import { useCallback, useEffect, useRef } from 'react'
import MarkdownEditorPanel from '../components/MarkdownEditorPanel'
import MindMapCanvas from '../components/MindMapCanvas'
import PdfUploadModal from '../components/PdfUploadModal'
import { useMindMapStore } from '../hooks/useMindMapStore'
import { processDocumentsWithAgents } from '../services/agentOrchestrator'
import { SAMPLE_MARKDOWN } from '../data/sampleMarkdown'
import type { PDFDocument, MindMapNode, MindMapEdge } from '../types'

export default function MainEditor() {
  const store = useMindMapStore()
  const initialized = useRef(false)

  // Initialize with sample data. Use the LLM-source variant so the
  // sample markdown becomes the "original" baseline — otherwise the very
  // first session has no original, and the TopNav Original export items
  // would be silently missing.
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    store.updateFromLLMMarkdown(SAMPLE_MARKDOWN)
  }, [])

  // Handle markdown changes from editor → update mind map
  const handleMarkdownChange = useCallback(
    (md: string) => {
      store.updateFromMarkdown(md)
    },
    [store]
  )

  // [EduMap fix] 2026-04-23: Save + Copy are now owned by App.tsx (so the
  // TopNav can fire them) and produce a transient toast for feedback.
  // This component just has to not re-duplicate the wiring.

  // Handle PDF upload → process with agents
  const handleDocumentsReady = useCallback(
    async (docs: PDFDocument[], prompt?: string) => {
      store.addDocuments(docs)
      store.setIsProcessing(true)

      try {
        const result = await processDocumentsWithAgents(docs, (tasks) => {
          store.setAgentTasks(tasks)
        }, prompt)
        // [EduMap fix] 2026-04-23: Route LLM output through
        // `updateFromLLMMarkdown` so this markdown becomes the new
        // "original" baseline (for the TopNav Original export) and the
        // edit tracking resets to a clean slate.
        store.updateFromLLMMarkdown(result.markdown)
        // Trigger the canvas to snapshot its freshly-rendered state into
        // `originalPngDataUrl`. We dispatch once on the next paint frame
        // so the canvas' fitView has already settled, then again after a
        // beat in case the first render didn't land in time.
        requestAnimationFrame(() => {
          window.dispatchEvent(new CustomEvent('edumap-snapshot-original'))
        })
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('edumap-snapshot-original'))
        }, 900)
      } catch (err) {
        // [EduMap fix] 2026-04-23: Surface extraction failures as a
        // dismissable banner above the canvas instead of cramming the
        // error text into fake mind map nodes. Previously the fallback
        // built a pseudo-markdown ("# ⚠️ Mind map generation failed" +
        // the raw error as headings) which made the canvas look like it
        // had successfully produced a map from garbage input. Now the
        // canvas is left untouched (or empty) and the user sees a clear
        // red banner explaining what actually failed.
        console.error('Document processing failed:', err)
        const msg = err instanceof Error ? err.message : String(err)
        store.setError(msg || 'Unknown error while generating the mind map.')
      } finally {
        store.setIsProcessing(false)
      }
    },
    [store]
  )

  // Handle node click in mind map → highlight in editor
  const handleNodeClickFromMap = useCallback(
    (nodeId: string) => {
      store.highlightNode(nodeId)
    },
    [store]
  )

  // Handle node click from editor → highlight in mind map
  const handleNodeClickFromEditor = useCallback(
    (nodeId: string) => {
      store.highlightNode(nodeId)
    },
    [store]
  )

  // Handle node label change → sync label into markdown (no LLM)
  const handleNodeLabelChange = useCallback(
    (nodeId: string, newLabel: string) => {
      store.updateNodeLabel(nodeId, newLabel)
      store.updateFromGraph()
    },
    [store]
  )

  // Handle graph node/edge changes (from dragging)
  const handleNodesChange = useCallback(
    (nodes: MindMapNode[]) => {
      store.setNodesAndEdges(nodes, store.edges)
    },
    [store]
  )

  const handleEdgesChange = useCallback(
    (edges: MindMapEdge[]) => {
      store.setNodesAndEdges(store.nodes, edges)
    },
    [store]
  )

  // [EduMap fix] 2026-04-23: Export handlers removed along with the
  // footer buttons — both PNG and Markdown export now live exclusively
  // in the TopNav (see App.tsx: `handleExportImage`, `handleExportMarkdown`).

  return (
    <>
      <div className="flex-1 flex min-h-0">
        <MarkdownEditorPanel
          value={store.markdown}
          onChange={handleMarkdownChange}
          onSave={() => {}}
          onCopyMarkdown={() => {}}
          onNodeClick={handleNodeClickFromEditor}
          highlightedNodeId={store.highlightedNodeId}
          nodes={store.nodes}
        />
        <section className="flex flex-col flex-1 min-w-0 bg-panel">
          {/* Mind map header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border shrink-0">
            <h2 className="text-lg font-semibold text-slate-800">
              {store.markdown.trim()
                ? (store.markdown.match(/^#\s+(.+)/m) || [])[1]?.trim() || 'Mind Map'
                : 'Mind Map'}
            </h2>
            <div className="flex items-center gap-2">
              {store.documents.length > 0 && (
                <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
                  {store.documents.length} doc{store.documents.length > 1 ? 's' : ''} loaded
                </span>
              )}
              <span className="text-xs text-slate-400">
                {store.nodes.length} nodes · {store.edges.length} connections
              </span>
            </div>
          </div>

          {/* [EduMap fix] 2026-04-23: Error banner for failed extractions.
              Displayed above the canvas instead of rendering the error as
              fake mind map nodes (which used to make broken states look
              like successful outputs). */}
          {store.error && (
            <div
              role="alert"
              className="flex items-start gap-3 mx-4 mt-3 px-4 py-3 rounded-lg border border-red-200 bg-red-50 text-red-900 shadow-sm"
            >
              <span className="text-lg leading-none select-none" aria-hidden="true">⚠️</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">Mind map generation failed</p>
                <p className="text-xs mt-1 text-red-800 break-words whitespace-pre-wrap">
                  {store.error}
                </p>
                <p className="text-[11px] mt-2 text-red-700/80">
                  Open DevTools › Console for the full stack trace, or check the
                  dev server terminal. Verify your <code className="font-mono">OPENAI_API_KEY</code>
                  {' '}and <code className="font-mono">OPENAI_MODEL</code> in <code className="font-mono">.env</code>.
                </p>
              </div>
              <button
                type="button"
                onClick={() => store.setError(null)}
                className="shrink-0 text-red-700 hover:text-red-900 text-sm font-bold px-2 py-0.5 rounded hover:bg-red-100 transition-colors"
                title="Dismiss"
                aria-label="Dismiss error"
              >
                ×
              </button>
            </div>
          )}

          {/* Mind map canvas */}
          <div className="flex-1 min-h-0">
            {store.nodes.length > 0 ? (
              <MindMapCanvas
                nodes={store.nodes}
                edges={store.edges}
                onNodesChange={handleNodesChange}
                onEdgesChange={handleEdgesChange}
                onNodeClick={handleNodeClickFromMap}
                onNodeLabelChange={handleNodeLabelChange}
                highlightedNodeId={store.highlightedNodeId}
              />
            ) : (
              <div className="flex items-center justify-center h-full min-h-[400px] text-slate-500">
                <div className="text-center">
                  <div className="text-5xl mb-3">🧠</div>
                  <p className="font-medium">
                    {store.error
                      ? 'No mind map — see the error above'
                      : 'Upload PDFs or edit markdown to generate a mind map'}
                  </p>
                  <p className="text-sm mt-1 text-slate-400">
                    Drag nodes to rearrange · Draw connections between nodes
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* [EduMap fix] 2026-04-23: Removed the "Export Final Mind Map"
              footer. Both actions are duplicates of the TopNav's
              "Export Image" and "Export Markdown" buttons — keeping a
              single, always-visible location at the top of the app. */}
        </section>
      </div>

      {/* Upload modal */}
      <PdfUploadModal
        isOpen={store.showUploadModal}
        onClose={() => store.setShowUploadModal(false)}
        onDocumentsReady={handleDocumentsReady}
      />
    </>
  )
}
