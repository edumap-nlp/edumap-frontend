import dagre from 'dagre'
import type { MindMapNode, MindMapEdge, MindMapNodeData, NodeTag } from '../types'

interface ParsedNode {
  id: string
  label: string
  description?: string
  tags: NodeTag[]
  depth: number
  parentId: string | null
  markdownLine: number
}

// [EduMap multimodal] Added 2026-04-21: Visual|Formula|Table are tags the LLM
// attaches to multimodal-derived nodes (see llmService.ts EXTRACTION_SYSTEM).
// We strip them so they don't leak into node labels; rendering them as
// dedicated badges is intentionally left to a follow-up UI iteration.
const TAG_REGEX = /\[(Hard|Low Priority|Important|Cross-Doc|New|Visual|Formula|Table)\]/gi
const TAG_MAP: Record<string, NodeTag> = {
  hard: 'hard',
  'low priority': 'low-priority',
  important: 'important',
  'cross-doc': 'important',
  new: 'new',
  // [EduMap multimodal] map the new multimodal tags to existing visual
  // categories so the mind-map badge palette doesn't need to change. Visual-
  // heavy nodes count as "important"; formula-heavy as "hard"; tables as "new"
  // (temporary marker, can be swapped once we add dedicated badges).
  visual: 'important',
  formula: 'hard',
  table: 'new',
}

function extractTags(text: string): { cleanText: string; tags: NodeTag[] } {
  const tags: NodeTag[] = []
  const cleanText = text.replace(TAG_REGEX, (_, tag: string) => {
    const mapped = TAG_MAP[tag.toLowerCase()]
    if (mapped && !tags.includes(mapped)) tags.push(mapped)
    return ''
  }).trim()
  return { cleanText, tags }
}

/**
 * Parse markdown headings and bullets into a flat list of nodes with parent references.
 *
 * [EduMap multimodal] 2026-04-21: Depth normalization added.
 * LLMs occasionally emit level jumps (e.g., `# Root` → `### Child` with no `##`
 * in between). Previously this stored `depth=3` for Child while its parent was
 * depth=1; the round-trip through `reactFlowToMarkdown` then used tree-traversal
 * depth (2), downgrading `###` to `##`. It also made the dagre layout look
 * inconsistent (some depth=3 nodes adjacent to depth=1 root, others via depth=2).
 *
 * Fix: track both the RAW markdown depth (used for sibling/parent pop logic —
 * preserves LLM intent that two `###` lines are siblings) and a NORMALIZED
 * depth capped at `parent.normalizedDepth + 1`. Nodes receive the normalized
 * depth so there are no gaps in the tree.
 */
export function parseMarkdownToNodes(markdown: string): ParsedNode[] {
  const lines = markdown.split('\n')
  const nodes: ParsedNode[] = []
  // Stack entries carry both raw (for sibling detection) and normalized
  // (for the stored node depth) values.
  const parentStack: { id: string; rawDepth: number; normalizedDepth: number }[] = []
  let nodeCounter = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/)
    const bulletMatch = line.match(/^(\s*)([-*+]|\d+\.)\s+(.+)/)

    if (headingMatch) {
      const rawDepth = headingMatch[1].length
      const { cleanText, tags } = extractTags(headingMatch[2])
      const id = `node-${nodeCounter++}`

      // Pop by RAW depth so `### X` after `### Y` correctly pops Y
      // (siblings), not nests under it.
      while (
        parentStack.length > 0 &&
        parentStack[parentStack.length - 1].rawDepth >= rawDepth
      ) {
        parentStack.pop()
      }

      // Normalize: can't be deeper than parent + 1.
      const parentNormalized =
        parentStack.length > 0
          ? parentStack[parentStack.length - 1].normalizedDepth
          : 0
      const depth = Math.min(rawDepth, parentNormalized + 1)

      const parentId = parentStack.length > 0 ? parentStack[parentStack.length - 1].id : null
      nodes.push({ id, label: cleanText, tags, depth, parentId, markdownLine: i })
      parentStack.push({ id, rawDepth, normalizedDepth: depth })
    } else if (bulletMatch) {
      const indent = bulletMatch[1].length
      const rawBulletDepth = 7 + Math.floor(indent / 2)
      const { cleanText, tags } = extractTags(bulletMatch[3])

      // Skip descriptions (lines starting with -- or sub-sub-bullets with long text)
      if (cleanText.startsWith('–') || cleanText.startsWith('—')) {
        // Attach as description to the last node
        if (nodes.length > 0 && !nodes[nodes.length - 1].description) {
          nodes[nodes.length - 1].description = cleanText.replace(/^[–—]\s*/, '')
        }
        continue
      }

      const id = `node-${nodeCounter++}`

      while (
        parentStack.length > 0 &&
        parentStack[parentStack.length - 1].rawDepth >= rawBulletDepth
      ) {
        parentStack.pop()
      }

      const parentNormalized =
        parentStack.length > 0
          ? parentStack[parentStack.length - 1].normalizedDepth
          : 0
      const depth = Math.min(rawBulletDepth, parentNormalized + 1)

      const parentId = parentStack.length > 0 ? parentStack[parentStack.length - 1].id : null
      nodes.push({ id, label: cleanText, tags, depth, parentId, markdownLine: i })
      parentStack.push({ id, rawDepth: rawBulletDepth, normalizedDepth: depth })
    }
  }

  return nodes
}

/**
 * [EduMap multimodal] 2026-04-21: Re-run dagre on an arbitrary set of nodes
 * and edges and return the nodes with new positions. Used by MindMapCanvas
 * to physically pack visible nodes when the user collapses a branch — the
 * previous behaviour only called `fitView`, which zooms the viewport but
 * leaves the logical positions spread out, so "collapsing" didn't actually
 * shrink the mind map (Jun: "显示二级标题时思维导图的长度会根据内容自动缩短").
 *
 * Node sizes mirror `buildReactFlowGraph` so the two layouts stay visually
 * consistent. Nodes not present in `edges` still get a position (dagre
 * stacks orphans).
 */
export function layoutNodes(
  nodes: MindMapNode[],
  edges: MindMapEdge[]
): MindMapNode[] {
  if (nodes.length === 0) return nodes

  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 120, marginx: 40, marginy: 40 })

  const idSet = new Set(nodes.map((n) => n.id))

  for (const n of nodes) {
    const data = n.data as MindMapNodeData
    const isRoot = data.depth === 1
    const isBranch = data.depth <= 3
    const width = isRoot ? 180 : isBranch ? 200 : 180
    const height = isRoot ? 60 : data.description ? 70 : 44
    g.setNode(n.id, { width, height })
  }

  for (const e of edges) {
    if (idSet.has(e.source) && idSet.has(e.target)) {
      g.setEdge(e.source, e.target)
    }
  }

  dagre.layout(g)

  return nodes.map((n) => {
    const pos = g.node(n.id)
    if (!pos) return n
    return {
      ...n,
      position: {
        x: pos.x - (pos.width ?? 0) / 2,
        y: pos.y - (pos.height ?? 0) / 2,
      },
    }
  })
}

/**
 * Convert parsed nodes to React Flow nodes + edges with dagre auto-layout.
 */
export function buildReactFlowGraph(
  parsedNodes: ParsedNode[],
  sourceDocId?: string
): { nodes: MindMapNode[]; edges: MindMapEdge[] } {
  if (parsedNodes.length === 0) {
    return { nodes: [], edges: [] }
  }

  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 120, marginx: 40, marginy: 40 })

  const rfNodes: MindMapNode[] = []
  const rfEdges: MindMapEdge[] = []

  // Determine node sizes based on depth
  for (const pn of parsedNodes) {
    const isRoot = pn.depth === 1
    const isBranch = pn.depth <= 3
    const width = isRoot ? 180 : isBranch ? 200 : 180
    const height = isRoot ? 60 : pn.description ? 70 : 44

    g.setNode(pn.id, { width, height })

    const nodeType = isRoot ? 'rootNode' : isBranch ? 'branchNode' : 'leafNode'

    rfNodes.push({
      id: pn.id,
      type: nodeType,
      position: { x: 0, y: 0 },
      data: {
        label: pn.label,
        description: pn.description,
        tags: pn.tags,
        depth: pn.depth,
        sourceDocId: sourceDocId,
        markdownLine: pn.markdownLine,
      } satisfies MindMapNodeData,
    })

    if (pn.parentId) {
      const edgeId = `edge-${pn.parentId}-${pn.id}`
      g.setEdge(pn.parentId, pn.id)
      rfEdges.push({
        id: edgeId,
        source: pn.parentId,
        target: pn.id,
        type: 'smoothstep',
        style: { stroke: '#94a3b8', strokeWidth: 2 },
        animated: false,
      })
    }
  }

  dagre.layout(g)

  // Apply computed positions
  for (const node of rfNodes) {
    const pos = g.node(node.id)
    if (pos) {
      node.position = { x: pos.x - (pos.width ?? 0) / 2, y: pos.y - (pos.height ?? 0) / 2 }
    }
  }

  return { nodes: rfNodes, edges: rfEdges }
}

/**
 * Convert markdown string to React Flow nodes and edges.
 */
export function markdownToReactFlow(
  markdown: string,
  sourceDocId?: string
): { nodes: MindMapNode[]; edges: MindMapEdge[] } {
  const parsed = parseMarkdownToNodes(markdown)
  return buildReactFlowGraph(parsed, sourceDocId)
}

/**
 * Convert React Flow nodes back to markdown.
 */
export function reactFlowToMarkdown(nodes: MindMapNode[], edges: MindMapEdge[]): string {
  // Build adjacency: parent → children
  const childrenMap = new Map<string, string[]>()
  const hasParent = new Set<string>()

  for (const edge of edges) {
    if (!childrenMap.has(edge.source)) childrenMap.set(edge.source, [])
    childrenMap.get(edge.source)!.push(edge.target)
    hasParent.add(edge.target)
  }

  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  const roots = nodes.filter((n) => !hasParent.has(n.id))
  const lines: string[] = []

  function visit(nodeId: string, depth: number) {
    const node = nodeMap.get(nodeId)
    if (!node) return

    const data = node.data as MindMapNodeData
    const tagStr = data.tags?.map((t) => {
      if (t === 'hard') return ' [Hard]'
      if (t === 'low-priority') return ' [Low Priority]'
      if (t === 'important') return ' [Important]'
      return ''
    }).join('') ?? ''

    if (depth <= 6) {
      lines.push(`${'#'.repeat(depth)} ${data.label}${tagStr}`)
    } else {
      const indent = '  '.repeat(depth - 7)
      lines.push(`${indent}- ${data.label}${tagStr}`)
    }

    if (data.description) {
      const indent = depth <= 6 ? '' : '  '.repeat(depth - 6)
      lines.push(`${indent}  – ${data.description}`)
    }

    const children = childrenMap.get(nodeId) ?? []
    for (const childId of children) {
      visit(childId, depth + 1)
    }
  }

  for (const root of roots) {
    visit(root.id, 1)
  }

  return lines.join('\n')
}
