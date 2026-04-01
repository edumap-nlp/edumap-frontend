import { useCallback, useRef, useState, useEffect } from 'react'
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
import type { MindMapEdge, MindMapCanvasProps, MindMapNodeData } from '../types'

let nextNodeId = 1000

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

  // Sync external node/edge changes
  const prevNodesRef = useRef(initialNodes)
  const prevEdgesRef = useRef(initialEdges)
  if (initialNodes !== prevNodesRef.current) {
    prevNodesRef.current = initialNodes
    setNodes(initialNodes)
  }
  if (initialEdges !== prevEdgesRef.current) {
    prevEdgesRef.current = initialEdges
    setEdges(initialEdges)
  }

  // Listen for label-change events dispatched by editable node labels
  useEffect(() => {
    const handler = (e: Event) => {
      const { nodeId, newLabel } = (e as CustomEvent).detail
      // Update the node's label locally
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

  // Handle new connections (user draws edge between nodes)
  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((currentEdges) => {
        const newEdges = addEdge(
          {
            ...connection,
            type: 'smoothstep',
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

  // Add new node at a position
  const addNewNode = useCallback(
    (x: number, y: number) => {
      const id = `node-new-${nextNodeId++}`
      const newNode = {
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

      // Clear highlight after animation
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

  // Double-click canvas → create new node at click position
  const onPaneDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY })
      addNewNode(position.x, position.y)
    },
    [screenToFlowPosition, addNewNode]
  )

  // Click canvas in "add node" mode → create new node
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

  // Highlight a specific node (zoom + flash)
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

  // Expose highlight function via ref effect when highlightedNodeId changes
  const prevHighlightRef = useRef<string | null>(null)
  if (highlightedNodeId && highlightedNodeId !== prevHighlightRef.current) {
    prevHighlightRef.current = highlightedNodeId
    setTimeout(() => highlightNode(highlightedNodeId), 100)
  } else if (!highlightedNodeId && prevHighlightRef.current) {
    prevHighlightRef.current = null
  }

  // Export PNG — capture full canvas
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

  return (
    <div
      ref={reactFlowWrapper}
      className={`w-full h-full ${isAddingNode ? 'cursor-crosshair' : ''}`}
      onKeyDown={onKeyDown}
      tabIndex={0}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
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
        defaultEdgeOptions={{ type: 'smoothstep' }}
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
        <Panel position="top-left" className="flex gap-2">
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
            title="Click to toggle add-node mode, then click on the canvas to place a new node"
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
