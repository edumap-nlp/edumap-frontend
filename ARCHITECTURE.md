# EduMap — System Architecture

_CSCI 5541, Spring 2026. Snapshot as of 2026-04-22, after the PR #6 merge._

## 1. What EduMap does

EduMap is a mind-map authoring tool for students working through academic papers. A user uploads one or more PDFs; the system extracts their content, uses an LLM to identify atomic concepts, reorganizes those concepts by semantic category (rather than the paper's reading order), and renders the result as an interactive mind map that the user can edit, collapse, expand, and export.

The codebase is a single Vite + React + TypeScript project that also ships its own Express backend for LLM calls, plus an optional Python pipeline (the Yana multimodal extractor) that pulls figures, equations, and tables out of PDFs. Everything lives in one repository and is developed against three LLM providers (OpenAI / Azure OpenAI, Anthropic, Google) behind a provider-agnostic abstraction.

## 2. Top-level topology

The app has three tiers that run on the user's machine during development.

The **frontend** (`src/`) is a standard Vite dev server on port 5173. It renders the mind-map canvas with `@xyflow/react`, manages UI state through Zustand, and never holds API keys — all LLM calls are proxied through the backend.

The **backend** (`server/`) is a small Express service on port 3001. Its sole job is to hold provider API keys in `process.env`, expose a unified `POST /api/llm/chat` endpoint that speaks to OpenAI, Anthropic, or Google based on a `provider` field in the request, and expose a `GET /api/health` endpoint that the frontend uses to discover which providers are actually reachable. A second route, `POST /api/pdf/extract-multimodal`, shells out to a Python process when the Yana pipeline is available.

## 3. Data flow: PDF upload to rendered mind map

The path a document takes from drop-zone to rendered node is:

1. **PDF ingestion.** `pdfjs-dist` extracts raw text per page in the browser. If the backend signals that the Yana pipeline is available, the frontend additionally calls `/api/pdf/extract-multimodal` and stores the enriched `MultimodalExtraction` on the `PDFDocument` object. The enriched text (with `[FIGURE]` / `[FORMULA]` / `[TABLE]` tags) is what the LLM later sees.

2. **Agent orchestration.** `processDocumentsWithAgents` in `src/services/agentOrchestrator.ts` runs one per-document pipeline per uploaded PDF, in parallel. Each pipeline produces a markdown mind map scoped to that document.

3. **Markdown parsing.** `parseMarkdownToNodes` in `src/services/mindmapTransformer.ts` turns the final markdown into a list of typed `ParsedNode` objects (label, description, depth, parent, tags). Heading depth drives tree structure; plain-text lines between headings become descriptions on the preceding node.

4. **Layout.** `layoutNodes` runs a simplified Reingold-Tilford tidy-tree pass to assign x/y coordinates, using the layout constants `COL_WIDTH=320`, `ROW_HEIGHT=110`, and `ORIGIN_{X,Y}=40`.

5. **Render.** `buildReactFlowGraph` converts the laid-out nodes and parent-child relationships into React Flow `Node` and `Edge` arrays. Edges use the `default` (bezier) type. The result flows into `<MindMapCanvas>`, which is a thin wrapper around `<ReactFlow>` with custom node and edge components.

Collapse state, highlight state, and the sidebar outline are managed in a Zustand store that both the canvas and the `MarkdownEditorPanel` subscribe to.

## 4. LLM orchestration

The LLM layer is the most complex piece of the system. After the PR #6 merge it supports two distinct extraction strategies and a provider-agnostic fallback chain.

The default extraction pipeline, introduced in the 2026-04-22 round of work, splits the old single-shot extraction into two LLM calls per document.

The **harvest** call (`buildHarvestPrompt`, using `HARVEST_SYSTEM` in `llmService.ts`) asks the LLM to read the entire document and dump every atomic concept as a flat numbered list in the format `N. LABEL | SHORT DESCRIPTION [TAGS]`. The prompt explicitly forbids hierarchy, root selection, or clustering — the harvest step is purely a recall pass. Target yield is 15 to 40 atoms per document.

The **organize** call (`buildOrganizePrompt`, using `ORGANIZE_SYSTEM`) receives *only* the atom list from the harvest step, not the original document. This is the key design decision: by hiding the source text, the model cannot accidentally fall back to the paper's section order and must instead cluster atoms by semantic category. The organize prompt enforces adaptive heading depth (between three and six levels, `#` through `######`), two to five children per non-leaf node, no level jumps, and a set of tree-correctness rules (parent attribution, no duplicate siblings, no split concepts, contiguity).

Per-document pipelines run in parallel across documents. Within a document, harvest must complete before organize starts, and a failed harvest cascades to an "error" organize task with the message "Skipped — harvest step failed." Every pipeline surfaces its state through the `onProgress` callback as two `AgentTask` objects (type `harvest` and type `organize`) per document.

## 5. Core modules

The most important files, their responsibilities, and where to look when something breaks:

**`src/services/agentOrchestrator.ts`** is the top-level coordinator. `processDocumentsWithAgents` is the single entry point the UI calls; `recursiveExtract` is the internal three-pass helper. Provider selection heuristics (`selectModelForDocument`, `firstAvailableLabel`) also live here. This file is currently about 350 lines.

**`src/services/llmService.ts`** owns the transport layer and the default extraction prompts. `callLLM` is the thin wrapper over `fetch('/api/llm/chat')`; `callWithFallback` is the provider-chain walker. It also exports `PROVIDER_CHAIN` (the single source of truth for fallback order), `buildHarvestPrompt`, `buildOrganizePrompt`, and the recursive-path parsers (`parseRootTopic`, `parseBranchHeadings`, `assembleRecursiveMarkdown`).

**`src/services/prompts.ts`** holds the recursive-mode prompt builders (`buildRootTopicPrompt`, `buildBranchConceptsPrompt`, `buildExpansionPrompt`), a fallback `buildExtractionPrompt` used when recursive-mode pass 1 or pass 2 fails, and `buildMergePrompt`. This module was introduced by PR #6 and is kept distinct from `llmService.ts` so the two extraction strategies remain visually separable.

**`src/services/mindmapTransformer.ts`** handles everything from markdown to coordinates. `parseMarkdownToNodes` is the parser; `layoutNodes` is the tidy-tree layout; `buildReactFlowGraph` is the React Flow adapter; `reactFlowToMarkdown` is the inverse direction used when the user edits nodes on the canvas.

**`src/services/pdfService.ts`** wraps `pdfjs-dist` text extraction and calls out to the backend's multimodal route when available.

**`src/types.ts`** is the shared type surface. The most load-bearing types are `PDFDocument`, `MultimodalExtraction`, `MindMapNode`/`MindMapEdge`, `AgentTask` (with its four-member union `'extract' | 'harvest' | 'organize' | 'merge'`), and `LLMConfig`.

**`server/routes/llm.ts`** is the provider dispatcher. `server/routes/multimodal.ts` shells out to the Yana pipeline. `server/index.ts` mounts the routes and exposes `/api/health`.

## 6. Layout engine

Before April, the layout used `dagre`. It produced edges that looped back on themselves when a node had many children and siblings that sometimes overlapped. The April rewrite replaced it with a hand-written simplified Reingold-Tilford tidy tree that lays out a node's subtree bottom-up: leaves pack tightly, non-leaves center over their children, and sibling subtrees are separated by a fixed minimum gap. Column width and row height are tuned (`COL_WIDTH=320`, `ROW_HEIGHT=110`) so that the 18 px breathing room between adjacent subtrees is preserved even in deep trees.

Edges use the React Flow `default` (bezier) type rather than `smoothstep`. With bezier edges, parent-to-child curves arc cleanly and do not create the right-angle cross-overs that smoothstep produced at the layout's most congested depths.

## 7. Configuration

All runtime configuration flows through `.env` at the repository root. The file is gitignored and must never be committed.

Three API key variables control provider availability: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, and `GOOGLE_API_KEY`. At least one must be set for the app to function. If more than one is set, the fallback chain will use whichever providers are reachable.

OpenAI has four optional companion variables. `OPENAI_ENDPOINT` flips the backend into Azure mode when present. `OPENAI_DEPLOYMENT_NAME` and `OPENAI_API_VERSION` are Azure-only. `OPENAI_MODEL` is a standard-OpenAI-only override that forces every OpenAI call to use a specific model id, useful when the frontend references a newer model (like `gpt-5.2`) that a given account does not yet have access to.

`PORT` sets the backend port and defaults to 3001. `VITE_API_BASE` tells the frontend where to find the backend and defaults to `http://localhost:3001/api`; Vite exposes any `VITE_`-prefixed variable to the browser, so nothing secret belongs under that prefix.

## 8. Recent development milestones

The current state is the product of several recent rounds of work this spring.

The **layout round** replaced dagre with the tidy-tree layout and switched edges from smoothstep to bezier, fixing the looping-edge and overlapping-sibling issues that had made deep maps unreadable.

The **adaptive-depth round** relaxed the extraction and merge prompts from a rigid three-level structure to an adaptive three-to-six-level structure with two-to-five children per parent and the tree-correctness rules described above. Different subtrees can now reach different depths based on content density rather than on where they sit in the paper's outline.

The **semantic-reorganization round** split the single extraction call into the two-stage harvest-then-organize pipeline described in section 4.2, forcing the model to cluster by knowledge category rather than mirror the paper's section order.

The **PR #6 merge round** integrated Shaun's recursive extraction strategy. Because Shaun's branch and the main branch had touched the same files in overlapping ways, the initial accept-both merge left `agentOrchestrator.ts` syntactically broken (duplicate function bodies, circular imports, dangling braces). The review-and-fix pass that followed rewrote the orchestrator cleanly, moved `PROVIDER_CHAIN` to `llmService.ts` to break a circular dependency, and kept both extraction pipelines behind a single `options.recursive` toggle. As a security side-finding, a tracked file named `OPENAI_API_KEY` containing a real OpenAI key had been committed to the repository; the key was revoked and the file untracked.

## 9. Running the app

With `.env` populated, the three relevant commands are:

`npm run dev` starts the Vite frontend on port 5173.
`npm run dev:server` starts the Express backend on port 3001 using `tsx watch`.
`npm run dev:full` starts both concurrently.

`npm run build` runs `tsc -b` followed by `vite build` and is the only command that exercises the full type-check plus bundle. `npm run lint` runs ESLint across the whole tree. Type-checking the project in isolation is `npx tsc --noEmit` and currently exits clean.
