import { useCallback, useEffect, useRef } from 'react'
import MarkdownEditorPanel from '../components/MarkdownEditorPanel'
import MindMapCanvas from '../components/MindMapCanvas'
import PdfUploadModal from '../components/PdfUploadModal'
import { useMindMapStore } from '../hooks/useMindMapStore'
import { processDocumentsWithAgents, expandNode } from '../services/agentOrchestrator'
import { SAMPLE_MARKDOWN } from '../data/sampleMarkdown'
import type { PDFDocument, MindMapNode, MindMapEdge, MindMapNodeData } from '../types'

export default function MainEditor() {
  const store = useMindMapStore()
  const initialized = useRef(false)

  // Initialize with sample data
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    store.updateFromMarkdown(SAMPLE_MARKDOWN)
  }, [])

  // Handle markdown changes from editor → update mind map
  const handleMarkdownChange = useCallback(
    (md: string) => {
      store.updateFromMarkdown(md)
    },
    [store]
  )

  // Handle save
  const handleSave = useCallback(() => {
    store.updateFromGraph()
    console.log('Saved. Markdown synced with mind map.')
  }, [store])

  // Handle copy
  const handleCopyMarkdown = useCallback(() => {
    navigator.clipboard.writeText(store.markdown)
  }, [store])

  // Handle PDF upload → process with agents
  const handleDocumentsReady = useCallback(
    async (docs: PDFDocument[]) => {
      store.addDocuments(docs)
      store.setIsProcessing(true)

      try {
        const result = await processDocumentsWithAgents(docs, (tasks) => {
          store.setAgentTasks(tasks)
        })
        store.updateFromMarkdown(result.markdown)
      } catch (err) {
        console.error('Document processing failed:', err)
        // Fallback: use raw text as markdown
        const fallbackMd = docs
          .map((d) => `# ${d.name}\n\n${d.text.slice(0, 2000)}`)
          .join('\n\n')
        store.updateFromMarkdown(fallbackMd)
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
      // Clear after animation
      setTimeout(() => store.highlightNode(null), 2500)
    },
    [store]
  )

  // Handle node click from editor → highlight in mind map
  const handleNodeClickFromEditor = useCallback(
    (nodeId: string) => {
      store.highlightNode(nodeId)
      // Clear after animation
      setTimeout(() => store.highlightNode(null), 2500)
    },
    [store]
  )

  // Handle double-click expand on a node
  const handleExpandNode = useCallback(
    async (nodeId: string) => {
      const node = store.nodes.find((n) => n.id === nodeId)
      if (!node) return

      const data = node.data as MindMapNodeData
      store.setIsProcessing(true)

      try {
        const expansion = await expandNode(data.label, data.description ?? '', store.markdown)
        store.expandNodeInGraph(nodeId, expansion)
      } catch (err) {
        console.error('Node expansion failed:', err)
        // Fallback: add placeholder sub-concepts
        const placeholders = `- ${data.label} Detail 1 [New]\n- ${data.label} Detail 2 [New]\n- ${data.label} Detail 3 [New]`
        store.expandNodeInGraph(nodeId, placeholders)
      } finally {
        store.setIsProcessing(false)
      }
    },
    [store]
  )

  // Handle node label change → update store + trigger LLM concept generation
  const handleNodeLabelChange = useCallback(
    async (nodeId: string, newLabel: string) => {
      // Update the label in store
      store.updateNodeLabel(nodeId, newLabel)

      // If label is non-trivial, trigger LLM to generate sub-concepts
      if (newLabel.length < 3 || newLabel === 'New Concept') return

      store.setIsProcessing(true)
      try {
        const expansion = await expandNode(newLabel, '', store.markdown)
        store.expandNodeInGraph(nodeId, expansion)
      } catch (err) {
        console.error('Concept generation from label failed:', err)
        // Fallback: add placeholder sub-concepts
        const placeholders = [
          `- ${newLabel}: Key Aspect 1 [New]`,
          `- ${newLabel}: Key Aspect 2 [New]`,
          `- ${newLabel}: Key Aspect 3 [New]`,
        ].join('\n')
        store.expandNodeInGraph(nodeId, placeholders)
      } finally {
        store.setIsProcessing(false)
      }
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

  // Export handlers
  const handleExportPng = useCallback(() => {
    // Triggered by MindMapCanvas internally
  }, [])

  const handleExportMarkdown = useCallback(() => {
    const blob = new Blob([store.markdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'edumap-mindmap.md'
    a.click()
    URL.revokeObjectURL(url)
  }, [store])

  return (
    <>
      <div className="flex-1 flex min-h-0">
        <MarkdownEditorPanel
          value={store.markdown}
          onChange={handleMarkdownChange}
          onSave={handleSave}
          onCopyMarkdown={handleCopyMarkdown}
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

          {/* Mind map canvas */}
          <div className="flex-1 min-h-0">
            {store.nodes.length > 0 ? (
              <MindMapCanvas
                nodes={store.nodes}
                edges={store.edges}
                onNodesChange={handleNodesChange}
                onEdgesChange={handleEdgesChange}
                onNodeClick={handleNodeClickFromMap}
                onExpandNode={handleExpandNode}
                onNodeLabelChange={handleNodeLabelChange}
                highlightedNodeId={store.highlightedNodeId}
                onExportPng={handleExportPng}
              />
            ) : (
              <div className="flex items-center justify-center h-full min-h-[400px] text-slate-500">
                <div className="text-center">
                  <div className="text-5xl mb-3">🧠</div>
                  <p className="font-medium">Upload PDFs or edit markdown to generate a mind map</p>
                  <p className="text-sm mt-1 text-slate-400">
                    Drag nodes to rearrange · Double-click to expand · Draw connections between nodes
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Export footer */}
          <div className="p-4 border-t border-surface-border shrink-0">
            <p className="text-sm font-medium text-slate-700 mb-2">Export Final Mind Map</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleExportPng}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                📷 PNG
              </button>
              <button
                type="button"
                onClick={handleExportMarkdown}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                📄 Markdown
              </button>
            </div>
          </div>
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
