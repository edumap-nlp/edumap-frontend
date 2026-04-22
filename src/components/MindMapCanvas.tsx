import { useCallback, useRef, useState, useEffect, useMemo } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  useReactFlow,
  ReactFlowProvider,
  type Connection,
  type NodeMouseHandler,
  Panel,
  BackgroundVariant,
  getNodesBounds,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { toPng } from 'html-to-image'
import { nodeTypes } from './MindMapNode'
import { layoutNodes } from '../services/mindmapTransformer'
import { useMindMapStore } from '../hooks/useMindMapStore'
import type { MindMapEdge, MindMapCanvasProps, MindMapNode, MindMapNodeData } from '../types'

let nextNodeId = 1000

/**
 * Build a child-map: nodeId → [childId, ...]
 */
function buildChildMap(edges: MindMapEdge[]): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const e of edges) {
    if (!map.has(e.source)) map.set(e.source, [])
    map.get(e.source)!.push(e.target)
  }
  return map
}

/**
 * Given a set of collapsed node IDs, collect all descendant IDs that
 * should be hidden (collapsed nodes themselves stay visible).
 */
function collectHiddenIds(
  collapsedIds: Set<string>,
  childMap: Map<string, string[]>
): Set<string> {
  const hidden = new Set<string>()

  function recurse(nodeId: string) {
    for (const childId of childMap.get(nodeId) ?? []) {
      hidden.add(childId)
      recurse(childId)
    }
  }

  for (const nodeId of collapsedIds) {
    recurse(nodeId)
  }

  return hidden
}

function MindMapCanvasInner({
  nodes: initialNodes,
  edges: initialEdges,
  onNodesChange: _onNodesChangeExternal,
  onEdgesChange: onEdgesChangeExternal,
  onNodeClick: onNodeClickExternal,
  onNodeLabelChange,
  highlightedNodeId,
  onExportPng,
}: MindMapCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const { fitView, setCenter, getNodes, screenToFlowPosition } = useReactFlow()
  const [isAddingNode, setIsAddingNode] = useState(false)

  // ── Collapse state ──────────────────────────────────────────────────────────
  // [EduMap multimodal] 2026-04-21: Pull collapse state from the shared
  // store so the sidebar and the mind map can never disagree about which
  // subtrees are hidden. The store seeds this to the default-L2 view
  // whenever new markdown arrives.
  const collapsedNodeIds = useMindMapStore((s) => s.collapsedNodeIds)
  const toggleCollapsed = useMindMapStore((s) => s.toggleCollapsed)
  const expandAll = useMindMapStore((s) => s.expandAll)
  const collapseAll = useMindMapStore((s) => s.collapseAll)

  // [EduMap fix] 2026-04-22: Sync external node/edge changes in a SINGLE
  // effect so nodes and edges always land in the internal state together.
  //
  // Previously each had its own top-level `if` that compared against a ref
  // and called setState during render:
  //   if (nodeKey !== prevNodesKey.current) setNodes(initialNodes)
  //   if (initialEdges !== prevEdgesRef.current) setEdges(initialEdges)
  //
  // Two independent `if`s meant the two setters weren't batched together
  // deterministically — on the upload path the parent re-renders with new
  // nodes+edges, but React Flow's internal pipeline could observe an
  // intermediate state where `nodes` is the new set and `edges` is still
  // the previous set (or vice versa). That's exactly the "right after
  // upload the mind map looks completely wrong, then a moment later it
  // corrects itself" symptom Yana reported — the first render after the
  // store swap momentarily paired new nodes with stale edges (or new
  // edges with stale nodes), producing a wrong tidy-layout pass before
  // the second render caught up.
  //
  // Moving both updates into one `useEffect` makes them happen in the
  // same commit, and comparing by reference (the store hands us new
  // array references on every update) keeps the effect cheap. We
  // explicitly skip no-op runs so unrelated parent re-renders don't
  // thrash React Flow's internal state.
  useEffect(() => {
    setNodes(initialNodes)
    setEdges(initialEdges)
  }, [initialNodes, initialEdges, setNodes, setEdges])

  // Listen for label-change events dispatched by editable node labels
  useEffect(() => {
    const handler = (e: Event) => {
      const { nodeId, newLabel } = (e as CustomEvent).detail
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId
            ? { ...n, data: { ...n.data, label: newLabel } as MindMapNodeData }
            : n
        )
      )
      onNodeLabelChange?.(nodeId, newLabel)
    }

    window.addEventListener('mindmap-node-label-change', handler)
    return () => window.removeEventListener('mindmap-node-label-change', handler)
  }, [setNodes, onNodeLabelChange])

  // Listen for collapse-toggle events dispatched by node buttons.
  // [EduMap multimodal] 2026-04-21: Delegate to the store so the sidebar
  // tree instantly reflects the same change — single source of truth.
  useEffect(() => {
    const handler = (e: Event) => {
      const { nodeId } = (e as CustomEvent).detail as { nodeId: string }
      toggleCollapsed(nodeId)
    }
    window.addEventListener('mindmap-node-collapse-toggle', handler)
    return () => window.removeEventListener('mindmap-node-collapse-toggle', handler)
  }, [toggleCollapsed])

  // [EduMap multimodal] 2026-04-21: Auto-fit the viewport to the visible
  // nodes whenever collapse state changes. Without this the frame stays sized
  // for the full (expanded) tree even after the user collapses a branch, so
  // the canvas feels like it has a lot of empty space. We skip the *first*
  // render so we don't conflict with ReactFlow's own `fitView` prop.
  const isFirstFitRef = useRef(true)
  useEffect(() => {
    if (isFirstFitRef.current) {
      isFirstFitRef.current = false
      return
    }
    // Let ReactFlow finish its internal layout/diff pass before measuring.
    const timer = setTimeout(() => {
      fitView({ duration: 400, padding: 0.2 })
    }, 50)
    return () => clearTimeout(timer)
  }, [collapsedNodeIds, fitView])

  // ── Derive visible nodes & edges based on collapsed state ──────────────────
  const childMap = useMemo(() => buildChildMap(edges), [edges])

  const hiddenIds = useMemo(
    () => collectHiddenIds(collapsedNodeIds, childMap),
    [collapsedNodeIds, childMap]
  )

  const visibleNodesRaw = useMemo(() => {
    return nodes
      .filter((n) => !hiddenIds.has(n.id))
      .map((n) => {
        const hasChildren = childMap.has(n.id)
        const isCollapsed = collapsedNodeIds.has(n.id)
        return {
          ...n,
          data: {
            ...n.data,
            hasChildren,
            isCollapsed,
          } as MindMapNodeData,
        }
      })
  }, [nodes, hiddenIds, childMap, collapsedNodeIds])

  const visibleEdges = useMemo(
    () => edges.filter((e) => !hiddenIds.has(e.source) && !hiddenIds.has(e.target)),
    [edges, hiddenIds]
  )

  // [EduMap multimodal] 2026-04-21: Re-run dagre on the visible subset so
  // collapsed branches actually pack the remaining nodes tightly. Without
  // this the sibling of a collapsed node stays at its original far-right
  // coordinate and the canvas looks the same width as the fully-expanded
  // tree — which is exactly what Jun reported ("只显示二级标题和显示全部
  // 的长度是一样的"). The subsequent `fitView` then frames the tighter
  // layout instead of the old sprawling one.
  const visibleNodes = useMemo(
    () => layoutNodes(visibleNodesRaw, visibleEdges),
    [visibleNodesRaw, visibleEdges]
  )

  // ── Handlers ────────────────────────────────────────────────────────────────

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((currentEdges) => {
        const newEdges = addEdge(
          {
            ...connection,
            // [EduMap fix] 2026-04-22: Match the bezier edge style used by
            // the graph builder (see mindmapTransformer.ts) so user-drawn
            // edges look identical to LLM-derived ones.
            type: 'default',
            style: { stroke: '#3b82f6', strokeWidth: 2, strokeDasharray: '5,5' },
            animated: true,
          },
          currentEdges
        )
        onEdgesChangeExternal?.(newEdges as MindMapEdge[])
        return newEdges
      })
    },
    [setEdges, onEdgesChangeExternal]
  )

  const addNewNode = useCallback(
    (x: number, y: number) => {
      const id = `node-new-${nextNodeId++}`
      const newNode: MindMapNode = {
        id,
        type: 'branchNode' as const,
        position: { x, y },
        data: {
          label: 'New Concept',
          tags: ['new' as const],
          depth: 3,
          isHighlighted: true,
        } satisfies MindMapNodeData,
      }
      setNodes((nds) => [...nds, newNode])

      setTimeout(() => {
        setNodes((nds) =>
          nds.map((n) =>
            n.id === id
              ? { ...n, data: { ...n.data, isHighlighted: false } as MindMapNodeData }
              : n
          )
        )
      }, 1500)

      setIsAddingNode(false)
      return id
    },
    [setNodes]
  )

  const onPaneDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY })
      addNewNode(position.x, position.y)
    },
    [screenToFlowPosition, addNewNode]
  )

  const onPaneClick = useCallback(
    (event: React.MouseEvent) => {
      if (!isAddingNode) return
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY })
      addNewNode(position.x, position.y)
    },
    [isAddingNode, screenToFlowPosition, addNewNode]
  )

  const handleNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      onNodeClickExternal?.(node.id)
    },
    [onNodeClickExternal]
  )

  // Delete selected nodes/edges with Delete or Backspace key
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Delete' || event.key === 'Backspace') {
        setNodes((nds) => nds.filter((n) => !n.selected))
        setEdges((eds) => eds.filter((e) => !e.selected))
      }
    },
    [setNodes, setEdges]
  )

  const highlightNode = useCallback(
    (nodeId: string) => {
      const allNodes = getNodes()
      const target = allNodes.find((n) => n.id === nodeId)
      if (!target) return

      setCenter(target.position.x + 80, target.position.y + 25, { duration: 600, zoom: 1.5 })

      setNodes((nds) =>
        nds.map((n) => ({
          ...n,
          data: { ...n.data, isHighlighted: n.id === nodeId } as MindMapNodeData,
        }))
      )

      setTimeout(() => {
        setNodes((nds) =>
          nds.map((n) => ({
            ...n,
            data: { ...n.data, isHighlighted: false } as MindMapNodeData,
          }))
        )
      }, 2000)
    },
    [getNodes, setCenter, setNodes]
  )

  const prevHighlightRef = useRef<string | null>(null)
  if (highlightedNodeId && highlightedNodeId !== prevHighlightRef.current) {
    prevHighlightRef.current = highlightedNodeId
    setTimeout(() => highlightNode(highlightedNodeId), 100)
  } else if (!highlightedNodeId && prevHighlightRef.current) {
    prevHighlightRef.current = null
  }

  const handleExportPng = useCallback(async () => {
    if (!reactFlowWrapper.current) return

    const allNodes = getNodes()
    if (allNodes.length === 0) return

    const bounds = getNodesBounds(allNodes)
    const padding = 50

    const viewport = reactFlowWrapper.current.querySelector('.react-flow__viewport') as HTMLElement
    if (!viewport) return

    try {
      const dataUrl = await toPng(viewport, {
        backgroundColor: '#ffffff',
        width: bounds.width + padding * 2,
        height: bounds.height + padding * 2,
        style: {
          width: String(bounds.width + padding * 2),
          height: String(bounds.height + padding * 2),
          transform: `translate(${-bounds.x + padding}px, ${-bounds.y + padding}px)`,
        },
      })

      const a = document.createElement('a')
      a.href = dataUrl
      a.download = 'edumap-mindmap.png'
      a.click()
    } catch (err) {
      console.error('PNG export failed:', err)
    }

    onExportPng?.()
  }, [getNodes, onExportPng])

  // ── Expand/Collapse all ─────────────────────────────────────────────────────
  // [EduMap multimodal] 2026-04-21: Route through the store so the sidebar
  // tree expands/collapses in lockstep with the canvas.
  const handleExpandAll = useCallback(() => expandAll(), [expandAll])
  const handleCollapseAll = useCallback(() => collapseAll(), [collapseAll])

  const hiddenCount = hiddenIds.size

  return (
    <div
      ref={reactFlowWrapper}
      className={`w-full h-full ${isAddingNode ? 'cursor-crosshair' : ''}`}
      onKeyDown={onKeyDown}
      tabIndex={0}
    >
      <ReactFlow
        nodes={visibleNodes}
        edges={visibleEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={handleNodeClick}
        onPaneClick={onPaneClick}
        onDoubleClick={onPaneDoubleClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={3}
        connectOnClick
        className="bg-slate-50/50"
        connectionLineStyle={{ stroke: '#3b82f6', strokeWidth: 2 }}
        defaultEdgeOptions={{ type: 'default' }}
        deleteKeyCode={['Delete', 'Backspace']}
        selectionOnDrag
        panOnDrag={[1, 2]}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e2e8f0" />
        <Controls position="bottom-right" />
        <MiniMap
          nodeStrokeWidth={3}
          nodeColor={(node) => {
            if (node.type === 'rootNode') return '#1e293b'
            if (node.type === 'branchNode') return '#3b82f6'
            return '#94a3b8'
          }}
          position="top-right"
          pannable
          zoomable
          className="!bg-white !border !border-slate-200 !rounded-lg !shadow-sm"
        />
        <Panel position="top-left" className="flex gap-2 flex-wrap">
          <button
            onClick={() => fitView({ duration: 400, padding: 0.2 })}
            className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 text-xs font-medium hover:bg-slate-50 shadow-sm transition-colors"
            title="Fit all nodes in view"
          >
            ⊞ Fit
          </button>
          <button
            onClick={() => setIsAddingNode(!isAddingNode)}
            className={`px-3 py-1.5 rounded-lg border text-xs font-medium shadow-sm transition-colors ${
              isAddingNode
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
            title="Toggle add-node mode"
          >
            ＋ Add Node
          </button>
          <button
            onClick={handleExportPng}
            className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 text-xs font-medium hover:bg-slate-50 shadow-sm transition-colors"
            title="Export as PNG"
          >
            📷 PNG
          </button>
          <button
            onClick={handleExpandAll}
            className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 text-xs font-medium hover:bg-slate-50 shadow-sm transition-colors"
            title="Expand all collapsed nodes"
          >
            ↔ Expand All
          </button>
          <button
            onClick={handleCollapseAll}
            className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 text-xs font-medium hover:bg-slate-50 shadow-sm transition-colors"
            title="Collapse all nodes to root"
          >
            ↕ Collapse All
          </button>
          {hiddenCount > 0 && (
            <span className="px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-xs font-medium shadow-sm">
              {hiddenCount} node{hiddenCount !== 1 ? 's' : ''} hidden
            </span>
          )}
        </Panel>
        {isAddingNode && (
          <Panel position="bottom-center">
            <div className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium shadow-lg animate-bounce">
              Click anywhere on the canvas to place a new node · Press Esc to cancel
            </div>
          </Panel>
        )}
      </ReactFlow>
    </div>
  )
}

export default function MindMapCanvas(props: MindMapCanvasProps) {
  return (
    <ReactFlowProvider>
      <MindMapCanvasInner {...props} />
    </ReactFlowProvider>
  )
}
