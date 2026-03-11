import { useCallback, useRef } from 'react'
import MDEditor from '@uiw/react-md-editor'
import type { ICommand } from '@uiw/react-md-editor'
import { bold, italic, strikethrough, TextAreaCommandOrchestrator } from '@uiw/react-md-editor'
import { MarkdownEditorPanelProps } from '../types'

const underlineCommand: ICommand = {
  name: 'underline',
  keyCommand: 'underline',
  buttonProps: { 'aria-label': 'Underline', title: 'Underline' },
  prefix: '<u>',
  suffix: '</u>',
  execute(state, api) {
    const { selection, text, command } = state
    const prefix = command.prefix ?? '<u>'
    const suffix = command.suffix ?? '</u>'
    const selectedText = text.slice(selection.start, selection.end)
    if (selectedText.startsWith(prefix) && selectedText.endsWith(suffix)) {
      api.replaceSelection(selectedText.slice(prefix.length, -suffix.length))
      api.setSelectionRange({ start: selection.start, end: selection.end - prefix.length - suffix.length })
    } else {
      api.replaceSelection(prefix + selectedText + suffix)
      api.setSelectionRange({ start: selection.start + prefix.length, end: selection.end + prefix.length })
    }
  },
}

export default function MarkdownEditorPanel({
  value,
  onChange,
  onSave,
  onCopyMarkdown,
}: MarkdownEditorPanelProps) {
  const editorRef = useRef<{ container?: HTMLDivElement; textarea?: HTMLTextAreaElement } | null>(null)

  const handleChange = useCallback(
    (val?: string) => {
      onChange(val ?? '')
    },
    [onChange]
  )

  const applyFormat = useCallback(
    (command: ICommand) => {
      const container = editorRef.current?.container
      const textarea = container?.querySelector?.('textarea') ?? editorRef.current?.textarea
      if (!textarea || !onChange) return
      const orchestrator = new TextAreaCommandOrchestrator(textarea)
      orchestrator.executeCommand(command)
      onChange(textarea.value)
    },
    [onChange]
  )

  return (
    <section className="flex flex-col h-full border-r border-surface-border bg-panel min-w-[420px] max-w-[520px]">
      <h2 className="text-lg font-semibold text-slate-800 px-4 py-3 border-b border-surface-border shrink-0">
        Text Extraction & Markdown Editor
      </h2>
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="border-b border-surface-border bg-slate-50/50 px-2 py-1 flex items-center gap-1 flex-wrap shrink-0">
          <ToolbarButton title="Bold" onClick={() => applyFormat(bold)} className="font-bold">B</ToolbarButton>
          <ToolbarButton title="Italic" onClick={() => applyFormat(italic)} className="italic">I</ToolbarButton>
          <ToolbarButton title="Strikethrough" onClick={() => applyFormat(strikethrough)} className="line-through">S</ToolbarButton>
          <ToolbarButton title="Underline" onClick={() => applyFormat(underlineCommand)} className="underline">U</ToolbarButton>
          <span className="w-px h-5 bg-surface-border mx-1" />
          <ToolbarButton title="Undo">↶</ToolbarButton>
          <ToolbarButton title="Redo">↷</ToolbarButton>
        </div>
        <div className="flex-1 min-h-0 overflow-auto" data-color-mode="light">
          <MDEditor
            ref={editorRef}
            value={value}
            onChange={handleChange}
            height="100%"
            minHeight={200}
            preview="edit"
            hideToolbar
            visibleDragbar={false}
            className="flex-1 border-0"
          />
        </div>
        <div className="p-4 border-t border-surface-border shrink-0 flex gap-2">
          <button
            type="button"
            onClick={onSave}
            className="px-4 py-2 rounded-lg bg-primary text-white font-medium hover:bg-primary-hover transition-colors"
          >
            Save Modifications
          </button>
          <button
            type="button"
            onClick={onCopyMarkdown}
            className="px-4 py-2 rounded-lg bg-sky-100 text-sky-800 font-medium hover:bg-sky-200 transition-colors"
          >
            Copy Markdown
          </button>
        </div>
      </div>
    </section>
  )
}

function ToolbarButton({
  title,
  children,
  onClick,
  className = '',
}: {
  title: string
  children: React.ReactNode
  onClick?: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`w-8 h-8 rounded hover:bg-slate-200 flex items-center justify-center text-slate-700 text-sm font-medium ${className}`}
    >
      {children}
    </button>
  )
}
