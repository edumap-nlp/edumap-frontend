import { Routes, Route } from 'react-router-dom'
import MainEditor from './pages/MainEditor'
import TopNav from './components/TopNav'
import { useMindMapStore } from './hooks/useMindMapStore'
import { useCallback } from 'react'

function App() {
  const store = useMindMapStore()

  const handleExportImage = useCallback(() => {
    // Trigger PNG export on the canvas (handled by MindMapCanvas component)
    const btn = document.querySelector('[title="Export as PNG"]') as HTMLButtonElement
    btn?.click()
  }, [])

  const handleExportMarkdown = useCallback(() => {
    const blob = new Blob([store.markdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'edumap-mindmap.md'
    a.click()
    URL.revokeObjectURL(url)
  }, [store.markdown])

  return (
    <div className="min-h-screen flex flex-col bg-surface">
      <TopNav
        onUploadPdf={() => store.setShowUploadModal(true)}
        onExportImage={handleExportImage}
        onExportMarkdown={handleExportMarkdown}
        isProcessing={store.isProcessing}
        activeModels={store.activeModels}
      />
      <main className="flex-1 flex flex-col">
        <Routes>
          <Route path="/" element={<MainEditor />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
