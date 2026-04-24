import { useCallback, useRef, useEffect, useMemo } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  addEdge,
  useReactFlow,
  ReactFlowProvider,
  type Connection,
  type NodeMouseHandler,
  type Node,
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

/**
 * [EduMap fix] 2026-04-23: Count every descendant under a given node,
 * memoized in a cache so repeated lookups across a tree remain O(N).
 * Used to stamp `descendantCount` onto collapsed nodes so the badge
 * can display "··· N nodes hidden" instead of a vague "subtree hidden".
 */
function countDescendants(
  nodeId: string,
  childMap: Map<string, string[]>,
  cache: Map<string, number>
): number {
  const cached = cache.get(nodeId)
  if (cached !== undefined) return cached

  let total = 0
  for (const childId of childMap.get(nodeId) ?? []) {
    total += 1 + countDescendants(childId, childMap, cache)
  }
  cache.set(nodeId, total)
  return total
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

  // ── Collapse state ──────────────────────────────────────────────────────────
  // [EduMap multimodal] 2026-04-21: Pull collapse state from the shared
  // store so the sidebar and the mind map can never disagree about which
  // subtrees are hidden. The store seeds this to the default-L2 view
  // whenever new markdown arrives.
  const collapsedNodeIds = useMindMapStore((s) => s.collapsedNodeIds)
  const toggleCollapsed = useMindMapStore((s) => s.toggleCollapsed)
  // [EduMap fix] 2026-04-23: `expandAll` / `collapseAll` are driven from
  // the sidebar outline's "Document Outline" header — the canvas used to
  // have duplicate buttons in its top-left Panel, now removed.
  // [EduMap fix] 2026-04-23 (edit tracking): Read the user-edit set so
  // we can stamp `isEdited` onto visible nodes for the "pencil" badge.
  const editedNodeIds = useMindMapStore((s) => s.editedNodeIds)
  const setOriginalPngDataUrl = useMindMapStore((s) => s.setOriginalPngDataUrl)
  // [EduMap fix] 2026-04-23 (button consolidation): Add-node mode is now
  // owned by the store so the TopNav button can flip it; the canvas reads
  // it to paint the crosshair cursor + placement banner.
  const isAddingNode = useMindMapStore((s) => s.isAddingNode)
  const setIsAddingNode = useMindMapStore((s) => s.setIsAddingNode)
  // [EduMap fix] 2026-04-23 (drag-to-reparent): action used by
  // `onNodeDragStop` below to splice the dragged node into its new parent.
  const reparentAndReorder = useMindMapStore((s) => s.reparentAndReorder)

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
    // [EduMap fix] 2026-04-23: Precompute descendant counts once per tree
    // so the collapse badge can render "··· N nodes hidden" instead of a
    // vague "subtree hidden". Shared cache makes this O(N) total.
    const descendantCache = new Map<string, number>()
    return nodes
      .filter((n) => !hiddenIds.has(n.id))
      .map((n) => {
        const hasChildren = childMap.has(n.id)
        const isCollapsed = collapsedNodeIds.has(n.id)
        const descendantCount = hasChildren
          ? countDescendants(n.id, childMap, descendantCache)
          : 0
        const isEdited = editedNodeIds.has(n.id)
        return {
          ...n,
          data: {
            ...n.data,
            hasChildren,
            isCollapsed,
            descendantCount,
            isEdited,
          } as MindMapNodeData,
        }
      })
  }, [nodes, hiddenIds, childMap, collapsedNodeIds, editedNodeIds])

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
    [setNodes, setIsAddingNode]
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

  // [EduMap fix] 2026-04-23: Let the TopNav "Export Image" button trigger
  // this canvas's PNG export via a window-level custom event. Previously
  // App.tsx simulated a DOM click on a hidden PNG button inside the
  // canvas Panel; once that duplicate button was removed we switched to
  // this event-based wiring, which is also how label-change and
  // collapse-toggle messages already flow between the canvas and the
  // rest of the app.
  useEffect(() => {
    const handler = () => {
      handleExportPng()
    }
    window.addEventListener('edumap-export-png', handler)
    return () => window.removeEventListener('edumap-export-png', handler)
  }, [handleExportPng])

  // [EduMap fix] 2026-04-23 (edit tracking): Capture a PNG of the current
  // canvas and stash it in the store as `originalPngDataUrl`. MainEditor
  // dispatches this event shortly after `updateFromLLMMarkdown` so the
  // snapshot reflects the LLM's output before the user has had a chance
  // to edit. The TopNav later uses this stored dataUrl to offer an
  // "Export Original Image" item that stays correct even after edits.
  useEffect(() => {
    const handler = async () => {
      if (!reactFlowWrapper.current) return
      const viewport = reactFlowWrapper.current.querySelector(
        '.react-flow__viewport'
      ) as HTMLElement | null
      if (!viewport) return
      const allNodes = getNodes()
      if (allNodes.length === 0) return
      try {
        const bounds = getNodesBounds(allNodes)
        const padding = 50
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
        setOriginalPngDataUrl(dataUrl)
      } catch (err) {
        console.warn('[EduMap] original PNG snapshot failed:', err)
      }
    }
    window.addEventListener('edumap-snapshot-original', handler)
    return () => window.removeEventListener('edumap-snapshot-original', handler)
  }, [getNodes, setOriginalPngDataUrl])

  // [EduMap fix] 2026-04-23 (button consolidation): Listen for top-nav
  // actions that need to reach the canvas. `edumap-fit-view` re-runs
  // fitView (replacing the old in-canvas Fit button), and
  // `edumap-toggle-add-node` flips add-node mode from the TopNav button
  // via the shared store.
  useEffect(() => {
    const onFit = () => fitView({ duration: 400, padding: 0.2 })
    window.addEventListener('edumap-fit-view', onFit)
    return () => window.removeEventListener('edumap-fit-view', onFit)
  }, [fitView])

  // [EduMap fix] 2026-04-23 (drag-to-reparent): When the user finishes
  // dragging a node, figure out where they dropped it and decide:
  //   (a) re-parent under a different parent (dropped to the right of the
  //       target node, i.e. into its child column), or
  //   (b) re-order among siblings (dropped above / below a node that
  //       shares the same parent, or directly above/below a node in the
  //       same column as the dragged node's current parent's children),
  //   (c) nothing — drop was too far from any other node or the move
  //       would create a cycle.
  //
  // Strategy: scan every visible node except the dragged one; find the
  // closest by distance from the dragged node's drop CENTER to the
  // target's center. Then classify:
  //   - If the drop center is further RIGHT than the target's right edge
  //     by ≥ HALF_COL, treat it as "drop into target" → becomes child of
  //     target, appended to the end of its children.
  //   - Otherwise compare y against target's center y. If drop is ABOVE,
  //     insert the dragged node as a sibling BEFORE target (under
  //     target's parent). If BELOW, insert as sibling AFTER target.
  //   - If we can't identify a target's parent (target is a root and the
  //     drop would make the dragged node another root), default to
  //     making dragged a child of target instead.
  //
  // We fire the store action even when the computed new position equals
  // the old one — the layout pass will simply no-op visually, but the
  // edited-flag still gets set, which matches the user's intent
  // ("I moved this, so show me it's edited").
  const COL_WIDTH_EST = 320
  const NODE_W_EST = 200
  const NODE_H_EST = 60

  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent | MouseEvent | TouchEvent, draggedNode: Node) => {
      // Gather every currently-visible node from React Flow's live state
      // so we see the positions AFTER the drag finished.
      const liveNodes = getNodes().filter((n) => !n.hidden)
      const dragged = liveNodes.find((n) => n.id === draggedNode.id)
      if (!dragged) return

      // Center of the dragged node (approx — React Flow doesn't always
      // have measured width/height during a drag, so fall back to our
      // layout estimates which line up with the actual node CSS).
      const dragW = dragged.measured?.width ?? NODE_W_EST
      const dragH = dragged.measured?.height ?? NODE_H_EST
      const dx = dragged.position.x + dragW / 2
      const dy = dragged.position.y + dragH / 2

      // Find the closest OTHER node. Guard against dropping onto a
      // descendant of the dragged node (that would make a cycle) by
      // skipping them up front.
      const childMap = new Map<string, string[]>()
      for (const e of edges) {
        if (!childMap.has(e.source)) childMap.set(e.source, [])
        childMap.get(e.source)!.push(e.target)
      }
      const forbidden = new Set<string>([dragged.id])
      const stack = [dragged.id]
      while (stack.length > 0) {
        const id = stack.pop()!
        for (const c of childMap.get(id) ?? []) {
          if (!forbidden.has(c)) {
            forbidden.add(c)
            stack.push(c)
          }
        }
      }

      let closest: Node | null = null
      let closestDist = Infinity
      for (const n of liveNodes) {
        if (forbidden.has(n.id)) continue
        const nw = n.measured?.width ?? NODE_W_EST
        const nh = n.measured?.height ?? NODE_H_EST
        const nx = n.position.x + nw / 2
        const ny = n.position.y + nh / 2
        const d = Math.hypot(dx - nx, dy - ny)
        if (d < closestDist) {
          closestDist = d
          closest = n
        }
      }

      // If nothing close by — drop was into empty space: no-op.
      if (!closest || closestDist > COL_WIDTH_EST * 1.5) return

      const targetW = closest.measured?.width ?? NODE_W_EST
      const targetH = closest.measured?.height ?? NODE_H_EST
      const targetRight = closest.position.x + targetW
      const targetCenterX = closest.position.x + targetW / 2
      const targetCenterY = closest.position.y + targetH / 2

      // Figure out target's parent (first incoming edge — mirrors the
      // layout's "first edge wins" spanning tree).
      let targetParentId: string | null = null
      for (const e of edges) {
        if (e.target === closest.id) {
          targetParentId = e.source
          break
        }
      }

      // Classify drop mode by the horizontal relationship with the
      // target. "Into child column" is where dx is well past the
      // target's right edge.
      const isIntoChildColumn =
        dx > targetRight + COL_WIDTH_EST * 0.25 ||
        // Also: very close on x, very close on y → treat as drop-onto.
        (Math.abs(dx - targetCenterX) < targetW * 0.4 &&
          Math.abs(dy - targetCenterY) < targetH * 0.4)

      if (isIntoChildColumn || !targetParentId) {
        // Become a child of the closest node, appended to the end.
        const existingKids = childMap.get(closest.id) ?? []
        reparentAndReorder(dragged.id, closest.id, existingKids.length)
        return
      }

      // Otherwise, insert as sibling before/after target under
      // target's parent. Determine position by comparing y against
      // target's vertical center.
      //
      // [EduMap fix] 2026-04-23 (batch 5 #2): The `insertIndex` we hand to
      // `reparentAndReorder` must be an index into the sibling list WITH
      // the dragged node already removed — that's the list the store's
      // splice will run against (it strips the incoming edge first).
      // Previously we computed `targetIndex` against the full sibling list
      // (which still includes the dragged node when moving within the same
      // parent), and the resulting off-by-one meant intra-parent re-orders
      // landed at the wrong slot (or at the end) and felt like "drag
      // doesn't work". Filtering the dragged id out FIRST lines the two
      // index spaces up.
      const siblingIdsRaw = childMap.get(targetParentId) ?? []
      const siblingIdsWithoutDragged = siblingIdsRaw.filter(
        (s) => s !== dragged.id
      )
      const targetIndexInFiltered = siblingIdsWithoutDragged.indexOf(closest.id)
      const insertAfter = dy > targetCenterY
      const insertIndex =
        targetIndexInFiltered < 0
          ? siblingIdsWithoutDragged.length
          : insertAfter
            ? targetIndexInFiltered + 1
            : targetIndexInFiltered

      reparentAndReorder(dragged.id, targetParentId, insertIndex)
    },
    [edges, getNodes, reparentAndReorder]
  )

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
        onNodeDragStop={onNodeDragStop}
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
        selectionOnDrag={false}
        panOnDrag={true}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e2e8f0" />
        <Controls position="bottom-right" />
        {/* [EduMap fix] 2026-04-23: All action buttons (Fit, Add Node,
            Expand All, Collapse All, Save, Copy, Export *) now live in the
            TopNav. The canvas keeps only passive surface indicators —
            a "hidden N nodes" counter and, when the user is in add-node
            mode, the floating placement hint. */}
        {hiddenCount > 0 && (
          <Panel position="top-left">
            <span className="px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-xs font-medium shadow-sm">
              {hiddenCount} node{hiddenCount !== 1 ? 's' : ''} hidden
            </span>
          </Panel>
        )}
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
