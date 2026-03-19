import { useEffect, useRef, useState } from 'react'
import { Markmap, loadCSS, loadJS, globalCSS } from 'markmap-view'
import * as markmapView from 'markmap-view'
import { Transformer } from 'markmap-lib'
import type { MindMapViewerProps } from '../types'

function injectMarkmapStyles() {
  if (document.getElementById('markmap-global-css')) return
  const style = document.createElement('style')
  style.id = 'markmap-global-css'
  style.textContent = globalCSS
  document.head.appendChild(style)
}

let assetsLoaded = false

async function ensureAssets(transformer: Transformer, features: unknown) {
  if (assetsLoaded) return
  injectMarkmapStyles()
  const assets = transformer.getUsedAssets(features)
  if (assets?.styles?.length) {
    await loadCSS(assets.styles)
  }
  if (assets?.scripts?.length) {
    await loadJS(assets.scripts, { getMarkmap: () => markmapView })
  }
  assetsLoaded = true
}

export default function MindMapViewer({
  markdown,
  onExportPng,
  onExportSvg,
  onExportMarkdown,
}: MindMapViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<ReturnType<typeof Markmap.create> | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!containerRef.current || !markdown.trim()) {
      setError(null)
      return
    }

    setError(null)
    let cancelled = false
    const container = containerRef.current
    const transformer = new Transformer()

    try {
      const { root, features } = transformer.transform(markdown)
      ensureAssets(transformer, features)
        .then(() => {
          if (cancelled || !containerRef.current) return
          const parent = containerRef.current!
          parent.innerHTML = ''
          const svg = document.createElement('svg')
          svg.setAttribute('class', 'markmap-svg')
          const updateSize = () => {
            if (!parent.isConnected) return
            const w = parent.offsetWidth || 600
            const h = Math.max(parent.offsetHeight || 500, 400)
            svg.setAttribute('width', String(w))
            svg.setAttribute('height', String(h))
          }
          updateSize()
          const ro = new ResizeObserver(() => {
            updateSize()
            viewRef.current?.renderData()
          })
          ro.observe(parent)
          resizeObserverRef.current = ro
          parent.appendChild(svg)
          const mm = Markmap.create(svg, undefined, root)
          viewRef.current = mm
        })
        .catch((err) => {
          if (!cancelled) {
            console.warn('Markmap assets load failed:', err)
            setError('Failed to load mind map viewer.')
          }
        })
    } catch (err) {
      console.warn('Markmap transform failed:', err)
      setError('Invalid markdown for mind map.')
    }

    return () => {
      cancelled = true
      resizeObserverRef.current?.disconnect()
      resizeObserverRef.current = null
      viewRef.current = null
    }
  }, [markdown])

  const title = markdown.trim()
    ? (markdown.match(/^#\s+(.+)/m) || [])[1]?.trim() || 'Mind Map'
    : 'Mind Map'

  return (
    <section className="flex flex-col flex-1 min-w-0 bg-panel">
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border shrink-0">
        <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            title="Undo"
            className="w-8 h-8 rounded hover:bg-slate-100 flex items-center justify-center text-slate-600"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" />
            </svg>
          </button>
          <button
            type="button"
            title="Redo"
            className="w-8 h-8 rounded hover:bg-slate-100 flex items-center justify-center text-slate-600"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 10H11a5 5 0 00-5 5v2M21 10l-4-4M21 10l-4 4" />
            </svg>
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-auto p-4 markmap-container">
        {error ? (
          <div className="flex items-center justify-center h-full min-h-[400px] text-amber-600">{error}</div>
        ) : markdown.trim() ? (
          <div ref={containerRef} className="w-full h-full min-h-[400px]" />
        ) : (
          <div className="flex items-center justify-center h-full min-h-[400px] text-slate-500">
            Add or paste markdown in the editor to see the mind map.
          </div>
        )}
      </div>
      <div className="p-4 border-t border-surface-border shrink-0">
        <p className="text-sm font-medium text-slate-700 mb-2">Export Final Mind Map</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onExportPng}
            className="px-4 py-2 rounded-lg border border-surface-border text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            PNG
          </button>
          <button
            type="button"
            onClick={onExportSvg}
            className="px-4 py-2 rounded-lg border border-surface-border text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            SVG
          </button>
          <button
            type="button"
            onClick={onExportMarkdown}
            className="px-4 py-2 rounded-lg border border-surface-border text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            Markdown
          </button>
        </div>
      </div>
    </section>
  )
}
