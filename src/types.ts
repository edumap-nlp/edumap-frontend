export interface MarkdownEditorPanelProps {
  value: string
  onChange: (value: string) => void
  onSave: () => void
  onCopyMarkdown: () => void
}

export interface MindMapViewerProps {
  markdown: string
  onExportPng?: () => void
  onExportSvg?: () => void
  onExportMarkdown?: () => void
}
