import { useState, useCallback } from 'react'
import MarkdownEditorPanel from '../components/MarkdownEditorPanel'
import MindMapViewer from '../components/MindMapViewer'
import { SAMPLE_MARKDOWN } from '../data/sampleMarkdown'

export default function MainEditor() {
  const [markdown, setMarkdown] = useState(SAMPLE_MARKDOWN)

  const handleSave = useCallback(() => {
    // Persist or sync with backend when implemented
    console.log('Save modifications')
  }, [])

  const handleCopyMarkdown = useCallback(() => {
    navigator.clipboard.writeText(markdown)
  }, [markdown])

  const handleExportPng = useCallback(() => {
    console.log('Export PNG')
    // TODO: use markmap instance or html2canvas on the mind map SVG
  }, [])

  const handleExportSvg = useCallback(() => {
    const container = document.querySelector('.markmap-container svg')
    if (!container) return
    const svg = container.cloneNode(true) as SVGElement
    const s = new XMLSerializer().serializeToString(svg)
    const blob = new Blob([s], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'edumap-mindmap.svg'
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  const handleExportMarkdown = useCallback(() => {
    const blob = new Blob([markdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'edumap-mindmap.md'
    a.click()
    URL.revokeObjectURL(url)
  }, [markdown])

  return (
    <div className="flex-1 flex min-h-0">
      <MarkdownEditorPanel
        value={markdown}
        onChange={setMarkdown}
        onSave={handleSave}
        onCopyMarkdown={handleCopyMarkdown}
      />
      <MindMapViewer
        markdown={markdown}
        onExportPng={handleExportPng}
        onExportSvg={handleExportSvg}
        onExportMarkdown={handleExportMarkdown}
      />
    </div>
  )
}
