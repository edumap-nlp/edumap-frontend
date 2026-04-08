import type { LLMMessage } from '../services/llmService'

const MAX_EXTRACT_CHARS = 200_000


// ── System prompts ──────────────────────────────────────────────────

const SHARED_CONCEPT_RULES = [
  'What counts as a concept:',
  '- A technique, method, or algorithm',
  '- A problem or challenge being addressed',
  '- A theoretical principle or finding',
  '',
  'What does NOT count:',
  '- Paper sections ("Related Work", "Evaluation", "Future Work")',
  '- Vague grouping categories like "Background" or "Methods"',
].join('\n')

const SHARED_FORMAT_RULES = [
  '- Do NOT use bold (**), italic (*), or any inline formatting. Plain text only.',
  '- No preamble, no commentary.',
  '- Tags: [Hard] for mathematically dense, [Important] for foundational, [Low Priority] for tangential.',
  '- Do NOT mirror the paper\'s section order or headings.',
].join('\n')

const EXTRACTION_SYSTEM = [
  'You are an expert at reading academic papers and building concept maps for students.',
  '',
  'Identify the core IDEAS in the document and organize them by logical dependency, not by document structure.',
  '',
  'HIERARCHY (you must use ALL four levels):',
  '- # = ONE root topic for the entire document (2-6 words). There must be EXACTLY ONE # heading.',
  '- ## = 5-7 major concepts under the root.',
  '- ### = 2-4 sub-concepts under each ##.',
  '- #### = 1-3 details under each ###. Do NOT go deeper.',
  '',
  SHARED_CONCEPT_RULES,
  '- The paper title verbatim as the root node',
  '',
  'Formatting:',
  '- Response must begin with a single # heading.',
  '- Use ONLY heading levels: #, ##, ###, ####. No bullet points.',
  '- Do NOT exceed 25 total nodes.',
  '- Node labels: 10 words max.',
  SHARED_FORMAT_RULES,
  '- Do NOT use multiple # headings. Only ONE root.',
  '',
  'Organize by logical dependency (prerequisite, construction, specialization).',
  '',
  'Example:',
  '# Root Topic [Important]',
  '## Branch One [Important]',
  '### Sub-concept A',
  '#### Detail X',
  '#### Detail Y',
  '### Sub-concept B [Hard]',
  '## Branch Two',
  '### Sub-concept C',
  '#### Detail Z',
].join('\n')

const ROOT_TOPIC_SYSTEM = [
  'You are an expert at reading academic papers.',
  '',
  'Identify the single overarching topic of this document for a mind map root node.',
  '',
  '- Return exactly ONE heading starting with #',
  '- Concise conceptual label (2-6 words), not the paper title verbatim.',
  '- One-line description (10 words max) as a bullet point under the heading.',
  '- Response must begin with # and contain NOTHING else.',
  SHARED_FORMAT_RULES,
  '',
  'Example:',
  '# Deep Learning Theory',
  '- Mathematical foundations of training deep neural networks',
].join('\n')

const BRANCH_CONCEPTS_SYSTEM = [
  'You are an expert at reading academic papers and identifying core concepts.',
  '',
  'Given a document and its root topic, identify 5-7 important concepts under that root.',
  '',
  SHARED_CONCEPT_RULES,
  '- The root topic itself repeated',
  '',
  '- Return ONLY ## headings. Do NOT expand sub-branches.',
  '- Each concept gets a one-line description (10 words max) as a bullet point.',
  '- Response must begin with ## and contain NOTHING else.',
  '- Organize by logical dependency, not document order.',
  SHARED_FORMAT_RULES,
  '',
  'Example:',
  '## Gradient Descent [Important]',
  '- Iterative optimization by following the loss gradient',
  '## Batch Normalization [Hard]',
  '- Normalizes layer inputs to stabilize training',
].join('\n')

const EXPANSION_SYSTEM = [
  'You are an expert at building detailed concept maps from academic papers.',
  '',
  'Given a document and ONE concept, expand it into sub-concepts.',
  'Search the ENTIRE document, not just the section where it first appears.',
  '',
  '- 3-5 sub-concepts as ### headings.',
  '- Each ### has 2-3 children as #### headings (deepest level).',
  '- No bullet points under ####.',
  '- Node labels: 10 words max. Do NOT exceed 20 nodes total.',
  '- Response must begin with ### and contain NOTHING else.',
  '- Do NOT repeat the parent concept as a heading.',
  '- Organize by logical dependency (prerequisite, construction, specialization).',
  SHARED_FORMAT_RULES,
  '',
  'Example:',
  '### Stochastic Gradient Descent [Important]',
  '#### Mini-batch size tradeoffs',
  '#### Learning rate schedules',
  '#### Convergence guarantees [Hard]',
  '### Momentum Methods',
  '#### Classical momentum',
  '#### Nesterov accelerated gradient [Hard]',
].join('\n')

const MERGE_SYSTEM = [
  'You are an expert at synthesizing knowledge from multiple academic documents into a unified concept map.',
  '',
  '- Find 3-5 highest-level themes spanning the documents as top-level nodes.',
  '- Merge overlapping concepts into one node, not two.',
  '- Preserve unique concepts under the most relevant shared theme.',
  '- Tag cross-document nodes with [Cross-Doc].',
  '- Do NOT organize by document. Never create "From Document A" branches.',
  '',
  'Output valid markdown using headings (# ## ###).',
].join('\n')

// ── Prompt builders ─────────────────────────────────────────────────

function clip(text: string) { return text.slice(0, MAX_EXTRACT_CHARS) }

function withUserPrompt(system: string, userPrompt?: string): string {
  return userPrompt ? `${system}\n\nAdditional instructions from the user: ${userPrompt}` : system
}

export function buildExtractionPrompt(text: string, name: string, userPrompt?: string): LLMMessage[] {
  return [
    { role: 'system', content: withUserPrompt(EXTRACTION_SYSTEM, userPrompt) },
    { role: 'user', content: `Extract a structured mind map from "${name}":\n\n${clip(text)}` },
  ]
}

export function buildRootTopicPrompt(text: string, name: string, userPrompt?: string): LLMMessage[] {
  return [
    { role: 'system', content: withUserPrompt(ROOT_TOPIC_SYSTEM, userPrompt) },
    { role: 'user', content: `Identify the root topic of "${name}":\n\n${clip(text)}` },
  ]
}

export function buildBranchConceptsPrompt(text: string, rootTopic: string, name: string, userPrompt?: string): LLMMessage[] {
  return [
    { role: 'system', content: withUserPrompt(BRANCH_CONCEPTS_SYSTEM, userPrompt) },
    { role: 'user', content: `Document: "${name}"\nRoot topic: ${rootTopic}\n\nIdentify 5-7 branch concepts:\n\n${clip(text)}` },
  ]
}

export function buildExpansionPrompt(text: string, heading: string, name: string, userPrompt?: string): LLMMessage[] {
  return [
    { role: 'system', content: withUserPrompt(EXPANSION_SYSTEM, userPrompt) },
    { role: 'user', content: `Document: "${name}"\nConcept to expand: ${heading}\n\nFull document:\n${clip(text)}` },
  ]
}

export function buildMergePrompt(markdowns: string[], docNames: string[], userPrompt?: string): LLMMessage[] {
  const docs = markdowns.map((md, i) => `--- ${docNames[i]} ---\n${md}`).join('\n\n')
  return [
    { role: 'system', content: withUserPrompt(MERGE_SYSTEM, userPrompt) },
    { role: 'user', content: `Merge these mind maps:\n\n${docs}` },
  ]
}