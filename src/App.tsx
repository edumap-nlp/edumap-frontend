import { Routes, Route } from 'react-router-dom'
import MainEditor from './pages/MainEditor'
import TopNav from './components/TopNav'
import { useMindMapStore } from './hooks/useMindMapStore'
import { useCallback, useEffect, useState } from 'react'

function App() {
  const store = useMindMapStore()
  const [showConfirmDelete, setShowConfirmDelete] = useState(false)

  /**
   * [EduMap fix] 2026-04-23: Unified image-export handler.
   *
   * 'current' → fire the `edumap-export-png` event; the canvas captures
   * whatever it's currently showing (edits, drags, and all) and kicks
   * off a download.
   *
   * 'original' → read the pre-captured `originalPngDataUrl` snapshot
   * that was taken right after the LLM produced the current markdown,
   * and offer it as a download. No canvas round-trip needed, so it
   * stays valid even after the user has edited.
   */
  const handleExportImage = useCallback(
    (variant: 'current' | 'original') => {
      if (variant === 'current') {
        window.dispatchEvent(new CustomEvent('edumap-export-png'))
        return
      }
      const url = store.originalPngDataUrl
      if (!url) {
        console.warn('[EduMap] no original PNG snapshot available')
        return
      }
      const a = document.createElement('a')
      a.href = url
      a.download = 'edumap-mindmap-original.png'
      a.click()
    },
    [store.originalPngDataUrl]
  )

  /**
   * [EduMap fix] 2026-04-23: Markdown export is easy — both variants are
   * plain strings on the store. 'current' is the live markdown (which
   * may include user edits); 'original' is the last LLM output.
   */
  const handleExportMarkdown = useCallback(
    (variant: 'current' | 'original') => {
      const md = variant === 'original' ? store.originalMarkdown : store.markdown
      if (!md) return
      const blob = new Blob([md], { type: 'text/markdown' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download =
        variant === 'original' ? 'edumap-mindmap-original.md' : 'edumap-mindmap.md'
      a.click()
      URL.revokeObjectURL(url)
    },
    [store.markdown, store.originalMarkdown]
  )

  /**
   * [EduMap fix] 2026-04-23 (button consolidation): Save and Copy
   * Markdown used to be footer buttons inside MarkdownEditorPanel; they
   * now live in the TopNav so every action is in one toolbar. Save
   * triggers a short-lived toast ("Saved · Markdown synced"); Copy
   * confirms with its own toast because the clipboard write gives no
   * visible feedback otherwise.
   */
  const handleSave = useCallback(() => {
    store.updateFromGraph()
    store.showSaveToast('Saved · Markdown synced')
    // [lint] `store` is the whole store object which changes identity on
    // every state mutation, but `updateFromGraph`/`showSaveToast` are
    // stable zustand actions — referencing them via `store.xxx` at call
    // time is safe even though the callback closes over `store`.
  }, [store])

  const handleCopyMarkdown = useCallback(() => {
    if (!store.markdown) return
    navigator.clipboard
      .writeText(store.markdown)
      .then(() => store.showSaveToast('Markdown copied to clipboard'))
      .catch(() => store.showSaveToast("Couldn't copy — clipboard blocked"))
  }, [store])

  // Canvas-bound actions bubble via custom events so we don't need to
  // thread a ref all the way down.
  const handleFitView = useCallback(() => {
    window.dispatchEvent(new CustomEvent('edumap-fit-view'))
  }, [])

  // Auto-dismiss the save toast. Deliberately NOT depending on the
  // whole `store` object — that would cancel and restart the timer on
  // every unrelated store update (node edits, collapse changes, etc.)
  // and the toast would never actually dismiss. Depending on the
  // message string alone means the timer restarts only when a new
  // toast text arrives, which is the behaviour we want.
  const saveToastMessage = store.saveToastMessage
  const hideSaveToast = store.hideSaveToast
  useEffect(() => {
    if (!saveToastMessage) return
    const t = setTimeout(() => hideSaveToast(), 2500)
    return () => clearTimeout(t)
  }, [saveToastMessage, hideSaveToast])

  const undoToastMessage = store.undoToastMessage
  const undoLastAction = store.undoLastAction
  const clearUndo = store.clearUndo

  useEffect(() => {
    if (!undoToastMessage) return
    const t = setTimeout(() => clearUndo(), 5000)
    return () => clearTimeout(t)
  }, [undoToastMessage, clearUndo])

  const handleAddChildNode = useCallback(() => {
    if (store.highlightedNodeId) {
      store.addChildNode(store.highlightedNodeId)
    }
  }, [store])

  const handleDeleteNode = useCallback(() => {
    if (!store.highlightedNodeId) return
    const node = store.nodes.find(n => n.id === store.highlightedNodeId)
    if (!node) return
    
    // Check if the node has any children by looking at the edges
    const hasChildren = store.edges.some(e => e.source === store.highlightedNodeId)
    
    if (hasChildren) {
      setShowConfirmDelete(true)
    } else {
      store.deleteNode(store.highlightedNodeId)
    }
  }, [store])

  const confirmDelete = useCallback(() => {
    if (store.highlightedNodeId) {
      store.deleteNode(store.highlightedNodeId)
    }
    setShowConfirmDelete(false)
  }, [store])

  const cancelDelete = useCallback(() => {
    setShowConfirmDelete(false)
  }, [])

  return (
    <div className="min-h-screen flex flex-col bg-surface">
      <TopNav
        onUploadPdf={() => store.setShowUploadModal(true)}
        onExportImage={handleExportImage}
        onExportMarkdown={handleExportMarkdown}
        hasOriginalPng={!!store.originalPngDataUrl}
        hasOriginalMarkdown={!!store.originalMarkdown}
        hasEdits={store.editedNodeIds.size > 0 || store.markdown !== store.originalMarkdown}
        isProcessing={store.isProcessing}
        activeModels={store.activeModels}
        onSave={handleSave}
        onCopyMarkdown={handleCopyMarkdown}
        onFitView={handleFitView}
        onExpandAll={store.expandAll}
        onCollapseAll={store.collapseAll}
        onShowUpToLevel={store.showUpToLevel}
        onToggleAddNode={store.toggleIsAddingNode}
        isAddingNode={store.isAddingNode}
        highlightedNodeId={store.highlightedNodeId}
        onAddChildNode={handleAddChildNode}
        onDeleteNode={handleDeleteNode}
      />
      <main className="flex-1 flex flex-col">
        <Routes>
          <Route path="/" element={<MainEditor />} />
        </Routes>
      </main>
      {/* [EduMap fix] 2026-04-23: Toast rendered at app root so it floats
          above every page/modal. Auto-hides after ~2.5s (see useEffect
          above). Uses role="status" for accessibility. */}
      {store.saveToastMessage && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium shadow-lg flex items-center gap-2 animate-[fadeIn_0.15s_ease-out]"
        >
          <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          {store.saveToastMessage}
        </div>
      )}

      {store.undoToastMessage && (
        <div
          role="status"
          className="fixed bottom-6 left-6 z-50 px-4 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-medium shadow-lg flex items-center gap-4 animate-[fadeIn_0.15s_ease-out]"
        >
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
            {store.undoToastMessage}
          </span>
          <button
            onClick={undoLastAction}
            className="text-blue-400 hover:text-blue-300 font-semibold px-2 py-0.5 rounded hover:bg-slate-800 transition-colors"
          >
            Undo
          </button>
        </div>
      )}

      {showConfirmDelete && store.highlightedNodeId && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/40 nodrag nopan"
          onClick={cancelDelete}
        >
          <div
            className="bg-white rounded-xl shadow-2xl p-5 max-w-xs w-full text-center animate-[fadeIn_0.15s_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-slate-900 mb-2">Delete node?</h3>
            <p className="text-xs text-slate-500 mb-5">
              "{store.nodes.find(n => n.id === store.highlightedNodeId)?.data.label}" and its subtree will be removed.
            </p>
            <div className="flex gap-2 justify-center">
              <button
                className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg"
                onClick={cancelDelete}
              >
                Cancel
              </button>
              <button
                className="px-3 py-1.5 text-xs font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg shadow-sm"
                onClick={confirmDelete}
              >
                Delete all
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
