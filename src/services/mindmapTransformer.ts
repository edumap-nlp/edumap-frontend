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

// [EduMap fix] 2026-04-22: LLMs occasionally emit meta-headings that describe
// the ABSENCE of content — "Topics not covered", "Not discussed", "N/A" —
// when they cannot find material for the topic the user asked about. These
// are not real concepts and shouldn't pollute the sidebar outline or the
// mind map. We match against the cleaned label and skip the heading (plus
// any subtree under it) during parsing. Patterns are anchored to the start
// of the label to keep false-positives low — a legitimate node called
// "Methods not requiring labeled data" will NOT match because the noise
// patterns require a verb like covered/discussed/addressed immediately after
// "not".
const NOISE_LABEL_PATTERNS: RegExp[] = [
  // Catch both grammatical and ungrammatical LLM output — we've seen the
  // user-facing phrase "Topic not cover" (singular, no -ed), so accept both
  // the past-participle and the bare form of each verb.
  /^(topics?|concepts?|items?|sections?|aspects?|points?|areas?|ideas?|details?)?\s*not\s+(cover(ed)?|discuss(ed)?|address(ed)?|explor(ed)?|mention(ed)?|includ(ed)?|applicable|explicit(ly\s+\w+)?|present|available)\b/i,
  /^(topics?|concepts?|items?|sections?|aspects?)\s+(not|never)\s+\w+/i,
  /^(out\s+of\s+scope|not\s+in\s+scope|outside\s+(the\s+)?scope)\b/i,
  /^(n\/a|none|tbd|todo|tba)\.?$/i,
  /^(no\s+(relevant|additional|further|specific|other)?\s*(content|information|topic|topics|data|nodes?|items?|concepts?))\b/i,
  /^(uncovered|omitted|skipped|excluded)\s+(topics?|sections?|concepts?|items?)\b/i,
  // Chinese noise phrases — the LLM occasionally mirrors user-prompt
  // language and produces these when the PDF is in Chinese or the custom
  // instruction is Chinese.
  /^(未(涵盖|提及|讨论|覆盖|包含)|暂无|无(相关|此类|其他)?(内容|主题|话题)|不适用|超出(范围|讨论范围))/,
]

function isNoiseLabel(label: string): boolean {
  const trimmed = label.trim()
  if (!trimmed) return true
  const forMatch = trimmed.replace(/[:.!?,;\s]+$/, '').trim()
  if (!forMatch) return true
  return NOISE_LABEL_PATTERNS.some((p) => p.test(forMatch))
}

/**
 * [EduMap fix] 2026-04-22: Node-attribution correctness — merge duplicate
 * siblings.
 *
 * The LLM extraction step occasionally produces the same concept twice under
 * the same parent. A few observed failure modes:
 *   - "Study Findings" listed twice as `##` siblings, each with a partial set
 *     of children, so the sidebar shows two sections with the same name and
 *     the mind map draws two trees for one concept.
 *   - The same specific finding appearing as both `### Underdiagnosis` and
 *     later, with different casing, `### underdiagnosis.` under the same
 *     parent — a duplicate from the LLM's perspective but a "cross-branch
 *     contamination" from the user's.
 *   - A user-editable markdown round-trip where collapsing/expanding created
 *     two `- New Concept` bullets under the same parent.
 *
 * Strategy: compute a canonical form of each label (lowercase, whitespace
 * collapsed, trailing punctuation stripped) and use `parentId|canonical` as
 * the dedup key. The FIRST occurrence in document order is the keeper; later
 * duplicates are merged into it — their tags are unioned into the keeper, a
 * description is copied over if the keeper lacks one, and any children of
 * the duplicate get reparented onto the keeper.
 *
 * Cascade: because children are reparented, we must consult the redirect
 * table when computing the parent key, so a chain like
 *   "A" (duplicate of earlier "A") → "B"
 * becomes "original A" → "B", and B's dedup key uses the original A's id.
 * Iterating in the original document order guarantees that by the time we
 * see a node, any ancestor whose id has been rewritten is already in the
 * redirect map.
 *
 * This runs after noise/subtree filtering so it can assume every node in
 * `parsedNodes` is a legitimate concept and only needs dedup treatment.
 */
function mergeDuplicateSiblings(parsedNodes: ParsedNode[]): ParsedNode[] {
  if (parsedNodes.length === 0) return parsedNodes

  const canonical = (s: string): string =>
    s
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[:.!?,;]+$/, '')
      .trim()

  // `parentId|canonicalLabel` → the id of the FIRST node we saw with that key.
  const keeperByKey = new Map<string, string>()
  // Maps duplicate node id → keeper id. Used both for skipping duplicates
  // and for reparenting later nodes whose parent was deduped away.
  const idRedirect = new Map<string, string>()

  for (const node of parsedNodes) {
    const canon = canonical(node.label)
    if (!canon) continue // paranoia — noise filter should have dropped these

    // Walk the redirect chain so chained duplicates all collapse to the
    // same keeper. In practice the chain depth is 0 or 1 because keepers
    // are never themselves redirected, but walk defensively.
    let effectiveParent = node.parentId ?? '__root__'
    while (idRedirect.has(effectiveParent)) {
      effectiveParent = idRedirect.get(effectiveParent)!
    }

    const key = effectiveParent + '|' + canon
    const existingKeeper = keeperByKey.get(key)
    if (existingKeeper && existingKeeper !== node.id) {
      idRedirect.set(node.id, existingKeeper)
    } else if (!existingKeeper) {
      keeperByKey.set(key, node.id)
    }
  }

  if (idRedirect.size === 0) return parsedNodes

  // Build the surviving node list. Skip duplicates entirely; reparent any
  // remaining node whose parent was a duplicate onto the keeper.
  const survivors: ParsedNode[] = []
  for (const node of parsedNodes) {
    if (idRedirect.has(node.id)) continue
    let pid = node.parentId
    while (pid && idRedirect.has(pid)) {
      pid = idRedirect.get(pid)!
    }
    survivors.push({ ...node, parentId: pid ?? null })
  }

  // Merge metadata from duplicates into their keepers so nothing is lost.
  const keeperById = new Map(survivors.map((n) => [n.id, n]))
  for (const node of parsedNodes) {
    const keeperId = idRedirect.get(node.id)
    if (!keeperId) continue
    const keeper = keeperById.get(keeperId)
    if (!keeper) continue
    for (const t of node.tags) {
      if (!keeper.tags.includes(t)) keeper.tags.push(t)
    }
    if (!keeper.description && node.description) {
      keeper.description = node.description
    }
  }

  return survivors
}

// [EduMap fix] 2026-04-22: The EXTRACTION_SYSTEM prompt explicitly forbids
// inline markdown in labels, but LLMs occasionally slip `**bold**` or
// `*italic*` through anyway — especially when the user's custom prompt
// includes formatted text. Stripping inline markers here keeps the node
// labels and sidebar outline readable regardless of model behaviour.
function stripInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/(^|[^*])\*(?!\s)([^*]+?)\*(?!\*)/g, '$1$2')
    .replace(/(^|[^_])_(?!\s)([^_]+?)_(?!_)/g, '$1$2')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/`([^`]+?)`/g, '$1')
    .trim()
}

function extractTags(text: string): { cleanText: string; tags: NodeTag[] } {
  const tags: NodeTag[] = []
  const withoutTags = text.replace(TAG_REGEX, (_, tag: string) => {
    const mapped = TAG_MAP[tag.toLowerCase()]
    if (mapped && !tags.includes(mapped)) tags.push(mapped)
    return ''
  })
  const cleanText = stripInlineMarkdown(withoutTags).replace(/\s+/g, ' ').trim()
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

  // [EduMap fix] 2026-04-22: When a noise heading (e.g. "Topic not covered")
  // is detected, we must skip not just the heading itself but also anything
  // nested beneath it — otherwise a child `### some specific thing` would
  // re-attach to the previous valid parent and appear as a real concept
  // with a wrong depth. `skipBelowRawDepth` holds the raw depth of the
  // noise heading; we skip every heading/bullet with a strictly greater
  // raw depth until we hit a sibling or ancestor level.
  let skipBelowRawDepth: number | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/)
    const bulletMatch = line.match(/^(\s*)([-*+]|\d+\.)\s+(.+)/)

    if (headingMatch) {
      const rawDepth = headingMatch[1].length

      // Exit skip mode once we climb back to (or above) the noise heading's
      // own level. A strictly-deeper heading is still inside the skipped
      // subtree, so keep skipping.
      if (skipBelowRawDepth !== null) {
        if (rawDepth <= skipBelowRawDepth) {
          skipBelowRawDepth = null
        } else {
          continue
        }
      }

      const { cleanText, tags } = extractTags(headingMatch[2])

      // Drop meta/noise headings and their entire subtree.
      if (isNoiseLabel(cleanText)) {
        skipBelowRawDepth = rawDepth
        continue
      }

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

      // If we're skipping a noise subtree, bullets under it (deeper raw
      // depth) are part of that subtree and get dropped too.
      if (skipBelowRawDepth !== null && rawBulletDepth > skipBelowRawDepth) {
        continue
      }

      const { cleanText, tags } = extractTags(bulletMatch[3])

      // Skip descriptions (lines starting with -- or sub-sub-bullets with long text)
      if (cleanText.startsWith('–') || cleanText.startsWith('—')) {
        // Attach as description to the last node
        if (nodes.length > 0 && !nodes[nodes.length - 1].description) {
          nodes[nodes.length - 1].description = cleanText.replace(/^[–—]\s*/, '')
        }
        continue
      }

      if (isNoiseLabel(cleanText)) {
        skipBelowRawDepth = rawBulletDepth
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
    } else {
      // [EduMap fix] 2026-04-22: Capture plain-text paragraph lines that
      // sit directly under a heading as that heading's description.
      //
      // The LLM's current output format puts a one-liner description under
      // every ### heading, like:
      //
      //   ### Sepsis-3 Criteria
      //   Criteria include SOFA score ≥2 and suspected infection.
      //   ### Sepsis-3 Plus Shock
      //
      // Those description lines aren't headings and aren't bullets, so the
      // previous parser silently dropped them. We now attach them to the
      // most recently-created node (which is the immediately-preceding
      // heading, because the heading/bullet branches both push onto `nodes`
      // before control falls through). Multiple consecutive plain-text
      // lines accumulate, separated by a single space, so a two-sentence
      // description still round-trips. Blank lines and the next
      // heading/bullet implicitly terminate the description because this
      // branch only fires on non-empty plain text.
      if (skipBelowRawDepth !== null) continue
      const trimmed = line.trim()
      if (!trimmed) continue
      // Skip any line that looks like table pipes or a leftover markdown
      // artifact — only a real prose line is useful as a description.
      if (trimmed.startsWith('|') || trimmed.startsWith('>')) continue
      const cleaned = stripInlineMarkdown(trimmed).replace(/\s+/g, ' ').trim()
      if (!cleaned) continue
      if (isNoiseLabel(cleaned)) continue
      if (nodes.length === 0) continue

      const last = nodes[nodes.length - 1]
      last.description = last.description
        ? `${last.description} ${cleaned}`
        : cleaned
    }
  }

  // [EduMap fix] 2026-04-22: Run the duplicate-sibling merge after full
  // parsing so it can use final parent ids — the heading/bullet loop can't
  // safely dedup inline because a later line might deepen the tree and
  // reveal new sibling relationships we weren't aware of earlier.
  return mergeDuplicateSiblings(nodes)
}

/**
 * [EduMap fix] 2026-04-22: Tidy-tree layout that preserves OUTLINE ORDER.
 *
 * Why this replaces dagre: dagre is a generic DAG layout algorithm — for
 * each rank it runs a crossing-reduction pass that reorders siblings to
 * minimize edge crossings. That's great for arbitrary graphs but wrong for
 * a mind map, where the user reads the tree top-to-bottom and expects
 * `Study Findings → {Underdiagnosis, Risk Factors, Mortality}` to render
 * as three contiguous children in that order. Dagre was scattering them
 * across the canvas and interleaving them with siblings from other
 * branches, which was exactly Yana's complaint ("同一父节点的 children 没
 * 有聚在一起，被横向拉开 + 分散").
 *
 * Algorithm (classic Reingold–Tilford simplified for a single tree):
 *   1. Pick a deterministic tree by taking, for each node, only its FIRST
 *      incoming edge as the "tree parent". User-drawn cross-links therefore
 *      don't distort the layout.
 *   2. `x = depth × COL_WIDTH` — columns per level.
 *   3. Walk the tree in preorder. Leaves get sequential y-slots. An
 *      internal node's y is the midpoint of its first and last child's y,
 *      so parents sit centered next to their subtree.
 *   4. Children are sorted by their index in the `nodes` array (= document
 *      order = sidebar order), so the mind map always matches the outline
 *      top-to-bottom.
 *
 * A secondary benefit: the output is deterministic. Dagre's crossing-
 * reduction has heuristic tie-breaks that can shuffle nodes between runs
 * on the same input, which was making the collapse animation look jittery.
 */
// [EduMap fix] 2026-04-22: Layout spacing tuned for the actual node sizes.
//
// Node widths: root/branch/leaf are all `max-w-[260px]`, so sibling columns
// were visibly touching when we previously set COL_WIDTH = 260 — a branch
// label long enough to hit max-width had literally 0px gap to its niece on
// the next column. Bumped to 320 to give ~60px of clean air + edge space
// even for worst-case labels.
//
// Node heights: a BranchNode renders label + (optional) 2-line description
// + (optional) tag badges, which empirically lands around 80-95px. The old
// ROW_HEIGHT = 70 guaranteed overlap whenever consecutive siblings both had
// descriptions (the new paragraph-capture parser made this the common case
// rather than the exception). 110 gives a clear ~15-30px gap between rows
// while keeping the tree compact enough to read without excessive panning.
const COL_WIDTH = 320
const ROW_HEIGHT = 110
const ORIGIN_X = 40
const ORIGIN_Y = 40

function computeTidyLayout(
  nodes: MindMapNode[],
  edges: MindMapEdge[]
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>()
  if (nodes.length === 0) return positions

  const idSet = new Set(nodes.map((n) => n.id))
  const nodeOrder = new Map(nodes.map((n, i) => [n.id, i]))

  // First-incoming-edge wins → deterministic spanning tree, cross-links ignored.
  const parentMap = new Map<string, string>()
  const childMap = new Map<string, string[]>()
  for (const e of edges) {
    if (!idSet.has(e.source) || !idSet.has(e.target)) continue
    if (parentMap.has(e.target)) continue
    parentMap.set(e.target, e.source)
    if (!childMap.has(e.source)) childMap.set(e.source, [])
    childMap.get(e.source)!.push(e.target)
  }

  // Children in document/outline order.
  for (const kids of childMap.values()) {
    kids.sort(
      (a, b) => (nodeOrder.get(a) ?? 0) - (nodeOrder.get(b) ?? 0)
    )
  }

  // Roots: nodes with no parent in our spanning tree. Iterate `nodes` so
  // multi-root documents also render in markdown order.
  const roots: string[] = []
  for (const n of nodes) {
    if (!parentMap.has(n.id)) roots.push(n.id)
  }

  // Depth (column index) via iterative DFS from every root.
  const depth = new Map<string, number>()
  const stack: { id: string; d: number }[] = roots.map((id) => ({ id, d: 0 }))
  while (stack.length > 0) {
    const { id, d } = stack.pop()!
    if (depth.has(id)) continue
    depth.set(id, d)
    for (const c of childMap.get(id) ?? []) stack.push({ id: c, d: d + 1 })
  }

  // Assign y: leaves get sequential slots, internal nodes center on kids.
  const yMap = new Map<string, number>()
  let leafCounter = 0
  function assignY(id: string) {
    const kids = childMap.get(id) ?? []
    if (kids.length === 0) {
      yMap.set(id, leafCounter * ROW_HEIGHT)
      leafCounter++
      return
    }
    for (const k of kids) assignY(k)
    const firstY = yMap.get(kids[0])!
    const lastY = yMap.get(kids[kids.length - 1])!
    yMap.set(id, (firstY + lastY) / 2)
  }
  for (const r of roots) {
    assignY(r)
    // Gap between multi-root subtrees so their leaves don't abut.
    leafCounter += 1
  }

  for (const n of nodes) {
    const d = depth.get(n.id) ?? 0
    const y = yMap.get(n.id) ?? 0
    positions.set(n.id, {
      x: ORIGIN_X + d * COL_WIDTH,
      y: ORIGIN_Y + y,
    })
  }
  return positions
}

/**
 * [EduMap multimodal] 2026-04-21: Re-run layout on an arbitrary set of nodes
 * and edges and return the nodes with new positions. Used by MindMapCanvas
 * to physically pack visible nodes when the user collapses a branch — the
 * previous behaviour only called `fitView`, which zooms the viewport but
 * leaves the logical positions spread out, so "collapsing" didn't actually
 * shrink the mind map (Jun: "显示二级标题时思维导图的长度会根据内容自动缩短").
 *
 * [EduMap fix] 2026-04-22: Switched from dagre to tidy-tree (see
 * `computeTidyLayout`) so collapsed children of the same parent stay
 * contiguous in outline order.
 */
export function layoutNodes(
  nodes: MindMapNode[],
  edges: MindMapEdge[]
): MindMapNode[] {
  if (nodes.length === 0) return nodes
  const positions = computeTidyLayout(nodes, edges)
  return nodes.map((n) => {
    const pos = positions.get(n.id)
    if (!pos) return n
    return { ...n, position: pos }
  })
}

/**
 * Convert parsed nodes to React Flow nodes + edges with tidy-tree layout.
 *
 * [EduMap fix] 2026-04-22: Switched from dagre to `computeTidyLayout`.
 * Siblings are now placed in outline order and parents center on their
 * children's midpoint, so the visible canvas order matches the sidebar.
 */
export function buildReactFlowGraph(
  parsedNodes: ParsedNode[],
  sourceDocId?: string
): { nodes: MindMapNode[]; edges: MindMapEdge[] } {
  if (parsedNodes.length === 0) {
    return { nodes: [], edges: [] }
  }

  const rfNodes: MindMapNode[] = []
  const rfEdges: MindMapEdge[] = []

  for (const pn of parsedNodes) {
    const isRoot = pn.depth === 1
    const isBranch = pn.depth <= 3
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
      // [EduMap fix] 2026-04-22: Use bezier edges (React Flow's `default`)
      // instead of `smoothstep`. `smoothstep` lays down an orthogonal
      // polyline (horizontal → vertical → horizontal) with rounded
      // corners; when a parent's tidy-layout midpoint is well offset from
      // a given child's row (common for parents with ≥3 children), the
      // right-then-vertical-then-left pattern reads as a zig-zag or loop
      // before the line finally reaches the node — exactly what Yana saw
      // in the "edge routing not clean" complaint. Bezier draws one
      // smooth C-curve between the right-handle of the parent and the
      // left-handle of the child, which is the standard mind-map look
      // and avoids the visual "loop".
      rfEdges.push({
        id: edgeId,
        source: pn.parentId,
        target: pn.id,
        type: 'default',
        style: { stroke: '#94a3b8', strokeWidth: 2 },
        animated: false,
      })
    }
  }

  const positions = computeTidyLayout(rfNodes, rfEdges)
  for (const node of rfNodes) {
    const pos = positions.get(node.id)
    if (pos) node.position = pos
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

    // [EduMap fix] 2026-04-22: Descriptions under a heading are emitted as
    // a plain-text paragraph line (matching the LLM's current output format
    // — one sentence under each ###). Descriptions under a bullet still
    // use the `– ...` sub-bullet style so nested markdown stays valid.
    if (data.description) {
      if (depth <= 6) {
        lines.push(data.description)
      } else {
        const indent = '  '.repeat(depth - 6)
        lines.push(`${indent}– ${data.description}`)
      }
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
