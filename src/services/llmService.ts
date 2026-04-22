import type { LLMProvider } from '../types'

// ── Config ──────────────────────────────────────────────────────────
/** Base URL for `/health` and `/llm/chat` (Express). Override with VITE_API_BASE. */
const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:3001/api'

/** Max characters of PDF text sent into a single extraction request. */
const MAX_EXTRACT_CHARS = 200_000



// ── Types (request/response for POST /api/llm/chat) ───────────────────
interface LLMMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
  userPrompt?: string
}

interface LLMCallOptions {
  provider?: LLMProvider
  model?: string
  messages: LLMMessage[]
  temperature?: number
  maxTokens?: number
}

interface LLMResponse {
  content: string
  model: string
  usage?: { promptTokens: number; completionTokens: number }
}



// ── API ───────────────────────────────────────────────────────────────
/**
 * Proxies a chat completion through the backend (keys stay on the server).
 * @throws If the HTTP response is not OK.
 */
export async function callLLM(options: LLMCallOptions): Promise<LLMResponse> {
  const {
    provider = 'google',
    model = 'gemini-2.5-flash',
    messages,
    temperature = 0.3,
    maxTokens = 4096,
  } = options

  const response = await fetch(`${API_BASE}/llm/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, model, messages, temperature, maxTokens }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`LLM API error (${response.status}): ${error}`)
  }

  return response.json()
}



// ── System prompts (string[] + join keeps sent text free of code-indent spaces) ──
// [EduMap multimodal] 2026-04-21: Extended with a block that teaches the LLM how
// to consume the tagged multimodal context produced by Yana pipeline v2
// ([TEXT], [FIGURE], [FORMULA], [TABLE]). When the document is plain text (no
// tags), those instructions are harmless and the model behaves as before.
//
// [EduMap fix] 2026-04-22: As of the two-stage pipeline, the live
// orchestrator uses HARVEST_SYSTEM + ORGANIZE_SYSTEM (see below) instead
// of this single-shot prompt. EXTRACTION_SYSTEM and buildExtractionPrompt
// are retained as a fallback / for any external caller that still wants
// one-shot extraction, but nothing in the app wires to them right now.
const EXTRACTION_SYSTEM = [
  'You are an expert at reading academic papers and building concept maps for students.',
  '',
  'Identify the core IDEAS in the document and organize them by logical dependency, not by document structure.',
  '',
  'What counts as a concept:',
  '- A technique, method, or algorithm',
  '- A problem or challenge being addressed',
  '- A theoretical principle or finding',
  '- A key empirical finding from a figure or table',
  '- A mathematical relationship from an equation',
  '',
  'What does NOT count:',
  '- Paper sections ("Related Work", "Evaluation", "Future Work")',
  '- The paper title or topic as a root node',
  '- Vague grouping categories that exist only to hold children',
  '',
  // ── Multimodal handling (added 2026-04-21) ─────────────────────────
  'Multimodal input format:',
  '- The document text may contain tagged blocks: [TEXT p{N} c{N}], [FIGURE id=... p{N}], [FORMULA id=... p{N} kind=...], [TABLE p{N}].',
  '- [FIGURE] blocks include a caption, a short vision-model description, and OCR text. Use the description (not the OCR) as the source of truth when deciding whether the figure deserves its own node.',
  '- [FORMULA] blocks include a latex_guess and a short context. Promote an equation to its own node only when it expresses a core relationship, not when it is a routine identity.',
  '- [TABLE] blocks include a header and a sample of rows. Extract the relationship the table is demonstrating, not the raw numbers.',
  '- When a concept was derived primarily from a figure, formula, or table, append the tag [Visual], [Formula], or [Table] at the end of the node text (in addition to [Hard]/[Important]/[Low Priority]).',
  '',
  'Strict formatting rules:',
  '- Your response must begin with # and contain NOTHING else. No preamble, no commentary.',
  '- Do NOT use bold (**), italic (*), or any inline formatting. Plain text only.',
  '- Use heading levels adaptively, between 3 and 6 levels deep:',
  '    • Exactly ONE `#` root node, named after the paper\'s core topic.',
  '    • Below the root, use `##`, `###`, `####`, `#####`, and `######` as the content warrants.',
  '    • A rich, multi-part concept may warrant `####` (or `#####`/`######`) children to capture its sub-parts.',
  '    • A simple concept should stay a leaf — do NOT invent children just to fill depth.',
  '    • Do not go deeper than `######` (6 levels total). Do NOT use bullet points.',
  '- Child-count target at every non-leaf node: 2 to 5 children. No parent has just 1 child (collapse it into the parent instead) and no parent has more than 5 (merge or group).',
  '- Depth should reflect conceptual structure, not section count. A paper with one complex method may have a deep `##` (3-4 extra levels under it) and shallow peers; a survey paper may stay flat with many `##` branches that only go to `###`.',
  '- Not every branch has to reach the same depth. It is normal and correct for some `##` branches to stop at `###` while another `##` branch drills down to `#####`.',
  '- Node descriptions: one short sentence max (≤20 words), and only when it actually adds information. Most nodes need no description at all.',
  '- Tags: [Hard] for mathematically dense, [Important] for foundational, [Low Priority] for tangential, [Visual]/[Formula]/[Table] for multimodal-derived nodes.',
  '',
  // [EduMap fix] 2026-04-22: Tree-correctness rules added after users
  // reported "cross-branch contamination", duplicate siblings, and the same
  // section being split across multiple subtrees. Each bullet names a
  // specific failure mode observed in real LLM output so the model can
  // pattern-match against its own draft before emitting.
  //
  // [EduMap fix] 2026-04-22 (adaptive depth): Generalized these rules from
  // "## and ###" to "every parent / every sibling set" so they still apply
  // at `####`, `#####`, `######`.
  'Tree-correctness rules (violations break the mind-map badly — self-check before emitting). These apply at EVERY level, not just `##`/`###`:',
  '- PARENT ATTRIBUTION: every child must belong to its immediate parent on semantic grounds. Before finalizing, read each heading and ask "is this genuinely a sub-part of the heading one level up?" If not, MOVE it. Do not leave a concept under a branch just because the paper mentioned them nearby.',
  '- NO DUPLICATE SIBLINGS: within the same parent at the same level, no two children share the same label or a near-identical paraphrase. If you catch yourself writing two `### Methods` or two `#### Assumptions` under one parent, merge them into a single node.',
  '- NO SPLIT CONCEPTS: one concept = one node. Do not spread a single idea across two sibling branches (e.g., "Risk Factors" and "Risk Analysis" for the same findings — pick one and keep the children together).',
  '- NO SIBLING→CHILD DEMOTION: if two topics are peers in the paper, keep them as peer nodes at the SAME level. Do not demote one to a child of the other unless it is genuinely a sub-part.',
  '- CONTIGUITY: every heading\'s subtree must appear as a single contiguous block. Do not list some of a section\'s children, jump to another sibling, then come back to add more children.',
  '- UNIQUE LABELS AT EACH LEVEL WITHIN A PARENT: all children of a given heading have distinct labels.',
  '- NO LEVEL JUMPS: do not skip a level (e.g., `##` directly followed by `####`). The child of a `##` must be `###`, the child of a `###` must be `####`, and so on.',
  '',
  'Relationships should reflect logical dependency:',
  '- "A requires B" (prerequisite)',
  '- "A is built using B" (construction)',
  '- "A is a type of B" (specialization)',
  '',
  'Do NOT mirror the paper\'s section order or headings.',
  '',
  // [EduMap fix] 2026-04-22 (adaptive depth): Removed the stale
  // "headings (# ## ###) and bullet points" line — it contradicted the
  // new 3-6 level guidance and kept nudging the model toward the old
  // flat structure. Bullet points are now explicitly forbidden above.
  'Output valid markdown using heading levels # through ###### as specified above.',
].join('\n')

const MERGE_SYSTEM = [
  'You are an expert at synthesizing knowledge from multiple academic documents into a unified concept map.',
  '',
  'Given individual concept maps from several documents, merge them into a single coherent map.',
  '',
  'Rules:',
  '- Find the 2-5 highest-level themes (`##`) that span the documents. These sit directly under the single `#` root.',
  '- When two documents cover the same concept (e.g., both discuss regularization), merge them into one node, not two separate ones.',
  '- Preserve concepts that are unique to a single document but place them under the most relevant shared theme.',
  '- Tag nodes that connect ideas from multiple documents with [Cross-Doc].',
  '- Do NOT organize by document. Never create a branch called "From Document A."',
  '',
  // [EduMap fix] 2026-04-22 (adaptive depth): Same relaxation as the
  // extraction prompt — allow 3-6 levels instead of a flat 3, let parents
  // have 2-5 children based on content, and let different subtrees reach
  // different depths. Merging is the most depth-sensitive step: concepts
  // that were shallow in each input often deserve to go deeper once their
  // siblings from other documents are factored in.
  'Depth and child-count rules:',
  '- Use heading levels adaptively between 3 and 6 levels deep (`#` through `######`). Do NOT use bullet points.',
  '- Every non-leaf node has 2-5 children. Never leave a parent with a single child — merge it into the parent instead.',
  '- Different branches can reach different depths. A theme with a lot of merged detail may warrant `#####` sub-nodes while a simpler theme stops at `###`.',
  '- NO LEVEL JUMPS: a `##` may only have `###` children, a `###` may only have `####` children, etc.',
  '',
  // [EduMap fix] 2026-04-22: Same tree-correctness guards as the extraction
  // prompt — merging is where split-concept and duplicate-sibling bugs show
  // up most, because each input map has already committed to one
  // organization and the model has to reconcile them.
  'Tree-correctness rules (apply at EVERY level, not just `##`/`###`):',
  '- NO DUPLICATE SIBLINGS: within one parent, no two children with the same or near-identical label.',
  '- NO SPLIT CONCEPTS: if two input maps both cover "regularization" under slightly different phrasings, produce ONE node for it, not two.',
  '- PARENT ATTRIBUTION: every child must be semantically a sub-part of its immediate parent after the merge. When reorganizing themes, re-check child placement — do not leave a concept under the branch it came from in the source map if it fits better elsewhere.',
  '- CONTIGUITY: each theme is a single contiguous subtree. No returning to an earlier theme later in the output.',
  '- UNIQUE LABELS WITHIN A PARENT: distinct labels among siblings at every level.',
  '',
  'Output valid markdown using heading levels # through ###### as specified above.',
].join('\n')


// [EduMap fix] 2026-04-22: Two-stage pipeline — harvest, then organize.
//
// Why split the single EXTRACTION step into two calls?
// The old single-shot extraction kept producing trees that followed the
// paper's section order: if a paper discussed SIRS in §2, Sepsis-3 in §4,
// and SEP-1 in §6, they landed as siblings of whatever section they came
// from rather than clustering under a shared "Diagnostic Criteria" branch.
// That's exactly what Yana flagged — the tree mirrored the paper's flow
// instead of the knowledge structure.
//
// Splitting the job into two focused calls fixes this:
//   1. HARVEST: read the doc and dump a FLAT numbered list of atomic
//      concepts. No hierarchy, no clustering — just "what are the ideas".
//      This removes the premature-structure pressure from the reading
//      pass.
//   2. ORGANIZE: given only the flat atom list (not the original text),
//      cluster by semantic category and build the 3-6 level tree. With
//      the full concept landscape in view, the model can actually see
//      "these 5 atoms are all about diagnostic criteria" and group them
//      — which is very hard to do while simultaneously reading the
//      document.
//
// Cost: the organize call sees ~2 KB of atom list instead of 200 KB of
// document text, so the second round-trip is close to free. The extra
// latency is one additional request per document.
const HARVEST_SYSTEM = [
  'You are an expert at reading academic papers and extracting every core idea as an atomic concept.',
  '',
  'YOUR JOB IN THIS STEP: produce a FLAT, UNORDERED list of atomic concepts from the document. Do NOT group them, do NOT build a hierarchy, do NOT pick a root. A separate later step handles the organization.',
  '',
  'What counts as an atomic concept:',
  '- A technique, method, or algorithm',
  '- A problem or challenge being addressed',
  '- A theoretical principle or finding',
  '- A key empirical finding from a figure or table',
  '- A mathematical relationship from an equation',
  '- A diagnostic criterion, definition, metric, or dataset',
  '',
  'What does NOT count:',
  '- Paper sections ("Related Work", "Evaluation", "Future Work")',
  '- The paper title itself',
  '- Vague grouping categories with no concrete content of their own',
  '',
  // Multimodal handling (same as before) ───────────────────
  'Multimodal input format:',
  '- The document text may contain tagged blocks: [TEXT p{N} c{N}], [FIGURE id=... p{N}], [FORMULA id=... p{N} kind=...], [TABLE p{N}].',
  '- For [FIGURE] blocks use the vision description (not the OCR) when deciding whether the figure earns an atom.',
  '- For [FORMULA] blocks, promote an equation to its own atom only when it expresses a core relationship.',
  '- For [TABLE] blocks, extract the relationship the table demonstrates, not the raw numbers.',
  '- If an atom was derived primarily from a figure, formula, or table, append the tag [Visual], [Formula], or [Table] after the description.',
  '',
  'Output format (STRICT — the next step parses this line-by-line):',
  '- Your response must begin with a concept line and contain NOTHING else. No preamble, no commentary, no markdown headings.',
  '- One concept per line, numbered starting from 1.',
  '- Each line: `N. LABEL | SHORT DESCRIPTION [TAGS]`',
  '    • LABEL is 2-8 words, plain text, no bold/italic/code.',
  '    • SHORT DESCRIPTION is one sentence, ≤20 words. If no description is useful, omit the `| DESCRIPTION` part entirely.',
  '    • TAGS are optional and chosen from: [Hard], [Important], [Low Priority], [Visual], [Formula], [Table].',
  '- Example lines:',
  '    `1. Sepsis-3 Criteria | Current definition using SOFA score ≥2 and suspected infection. [Important]`',
  '    `2. SIRS Criteria | Older clinical-signs-based definition, now superseded.`',
  '    `3. Underdiagnosis in Emergency Departments | Gap between cases meeting criteria and cases flagged. [Important]`',
  '',
  'Coverage guidance:',
  '- Aim for 15-40 atoms per document. Fewer is fine for short notes, more is fine for dense papers.',
  '- Be exhaustive within reason: every distinct idea in the paper should have exactly ONE atom.',
  '- No duplicates and no near-paraphrases. If two spots in the paper describe the same concept, emit it ONCE.',
  '- Do not invent atoms the paper does not actually discuss.',
  '',
  'Do NOT output any explanation, reasoning, or summary — only the numbered list.',
].join('\n')

const ORGANIZE_SYSTEM = [
  'You are an expert at organizing a set of atomic concepts into a knowledge-category hierarchy for students.',
  '',
  'YOUR JOB: you receive a flat list of atomic concepts harvested from a single document (format: `N. LABEL | DESCRIPTION [TAGS]`). Reorganize them into a hierarchical mind map clustered by SEMANTIC CATEGORY — not by the order they appeared in the paper.',
  '',
  'CRITICAL: the order of the input list reflects reading order, which you must IGNORE. Group related concepts together even if they were far apart in the source document. Two concepts on pages 2 and 18 that are both "diagnostic criteria" belong in the same `##` cluster.',
  '',
  'How to cluster:',
  '- Look for 2-5 natural THEMES that span the atoms — things like "Diagnostic Criteria", "Study Findings", "Methodology", "Clinical Implications", "Future Directions". These become the `##` nodes under the single `#` root.',
  '- Each atom must land under the theme it semantically fits, regardless of where it appeared in the document.',
  '- If several atoms share a finer sub-category (e.g., three criteria definitions all about shock), build a `###` (and deeper if needed) to cluster them.',
  '- A complex theme may drill down to `####`, `#####`, or `######`. A simple theme may stop at `###`. Different themes can reach different depths.',
  '- Theme labels should describe the KIND of knowledge (e.g., "Diagnostic Criteria"), not the document\'s phrasing (e.g., "Section 2").',
  '',
  'Strict formatting rules:',
  '- Your response must begin with `#` and contain NOTHING else. No preamble, no commentary.',
  '- Do NOT use bold (**), italic (*), or any inline formatting. Plain text only.',
  '- Use heading levels adaptively, between 3 and 6 levels deep (`#` through `######`).',
  '- Exactly ONE `#` root, named after the document\'s core topic.',
  '- Every non-leaf node has 2-5 children. A parent with a single child should be collapsed into the parent.',
  '- NO LEVEL JUMPS: a `##` may only have `###` children, a `###` may only have `####` children, etc.',
  '- Do NOT use bullet points.',
  '- Preserve each atom\'s description: when you emit the heading for an atom, put the description on the next line as plain text (not a bullet). Keep it ≤20 words.',
  '- Preserve each atom\'s TAGS at the end of the label: `### Sepsis-3 Criteria [Important]`.',
  '',
  // Tree-correctness rules (same as extraction, re-stated for clarity) ─
  'Tree-correctness rules (apply at EVERY level, not just `##`/`###`). Self-check before emitting:',
  '- PARENT ATTRIBUTION: every child must semantically be a sub-part of its parent. If an atom doesn\'t fit under any theme, create a new theme — don\'t force it under an unrelated one.',
  '- NO DUPLICATE SIBLINGS: within one parent, no two children with the same label or a near-identical paraphrase.',
  '- NO SPLIT CONCEPTS: one concept = one node. Do not spread the same atom across two branches.',
  '- CONTIGUITY: each subtree appears as a single contiguous block.',
  '- COVERAGE: every atom from the input list must appear exactly once in the output, except for atoms that are clearly noise or duplicates (drop them with no comment).',
  '',
  'Output valid markdown using heading levels # through ###### as specified above.',
].join('\n')


// ── Prompt builders (used by agentOrchestrator) ─────────────────────
/**
 * Messages for one PDF: system rules + user chunk of document text → markdown mind map.
 */
export function buildExtractionPrompt(documentText: string, documentName: string, userPrompt?: string): LLMMessage[] {
  const clipped = documentText.slice(0, MAX_EXTRACT_CHARS)

  // Extra instructions by the user
  const extraInstruction = userPrompt
    ? `\n\nAdditional instructions from the user: ${userPrompt}`
    : ''
  return [
    { role: 'system', content: EXTRACTION_SYSTEM + extraInstruction },
    {
      role: 'user',
      content: `Extract a structured mind map from this document "${documentName}":\n\n${clipped}`,
    },
  ]
}

/**
 * [EduMap fix] 2026-04-22: Stage 1 of the two-stage pipeline.
 *
 * Asks the LLM for a flat numbered list of atomic concepts from the
 * document, ignoring any structural ordering. The result is consumed by
 * `buildOrganizePrompt` in a separate round-trip.
 */
export function buildHarvestPrompt(
  documentText: string,
  documentName: string,
  userPrompt?: string
): LLMMessage[] {
  const clipped = documentText.slice(0, MAX_EXTRACT_CHARS)
  const extraInstruction = userPrompt
    ? `\n\nAdditional instructions from the user: ${userPrompt}`
    : ''
  return [
    { role: 'system', content: HARVEST_SYSTEM + extraInstruction },
    {
      role: 'user',
      content: `Harvest every atomic concept from this document "${documentName}" as a flat numbered list:\n\n${clipped}`,
    },
  ]
}

/**
 * [EduMap fix] 2026-04-22: Stage 2 of the two-stage pipeline.
 *
 * Takes the flat numbered atom list produced by `buildHarvestPrompt` and
 * asks the LLM to re-order it by semantic category into the final
 * hierarchical markdown. Gets no access to the original document text —
 * clustering must happen on the atom list alone, which is what forces
 * the model away from the paper's section order.
 */
export function buildOrganizePrompt(
  atomsList: string,
  documentName: string,
  userPrompt?: string
): LLMMessage[] {
  const extraInstruction = userPrompt
    ? `\n\nAdditional instructions from the user: ${userPrompt}`
    : ''
  return [
    { role: 'system', content: ORGANIZE_SYSTEM + extraInstruction },
    {
      role: 'user',
      content:
        `Document: "${documentName}"\n\n` +
        `Atomic concepts harvested from the document (reading-order is noise — ignore it):\n\n` +
        `${atomsList}\n\n` +
        `Now cluster these atoms by knowledge category and emit the hierarchical markdown.`,
    },
  ]
}

/**
 * Messages for merging several per-document mind maps into one markdown tree.
 * `markdowns` / `docNames` must align by index.
 */
export function buildMergePrompt(markdowns: string[], docNames: string[], userPrompt?: string): LLMMessage[] {
  const docs = markdowns
    .map((md, i) => `--- Document: ${docNames[i]} ---\n${md}`)
    .join('\n\n')

  const extraInstruction = userPrompt
    ? `\n\nAdditional instructions from the user: ${userPrompt}`
    : ''

  return [
    { role: 'system', content: MERGE_SYSTEM + extraInstruction },
    {
      role: 'user',
      content: `Merge these document mind maps into a unified mind map:\n\n${docs}`,
    },
  ]
}
