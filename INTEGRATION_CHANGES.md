# EduMap Multimodal Integration — Change Log

**Date:** 2026-04-21
**Branch focus:** integrate the improved Yana multimodal pipeline (`multimodal_pipeline_v2.py`) into the EduMap frontend without touching the mind-map rendering layer.

All lines marked with `// [EduMap multimodal]` or `# [EduMap multimodal]` comments in the code are part of this change set.

---

## 1. High-level summary

**Goal:** replace the text-only PDF extraction path with a multimodal path that preserves figures (with GPT-4o Vision descriptions), formulas, tables, and layout (two-column support), and feeds a structured, tagged string (`[TEXT]`/`[FIGURE]`/`[FORMULA]`/`[TABLE]`) to the LLM.

**Architecture choice (confirmed with user):**

```
File upload (browser)
   │
   ▼
PdfUploadModal.tsx
   │    uses
   ▼
pdfService.extractMultimodalFromPdfs()
   │    POST /api/pdf/extract-multimodal  (base64 PDF → JSON)
   ▼
server/routes/multimodal.ts  ── spawn ──▶  python3 multimodal_pipeline_v2.py
   │    (stdout = JSON extraction result)
   ▼
PDFDocument.text = multimodal_context    ◀── tagged flat string
PDFDocument.multimodal = structured record
   │
   ▼
agentOrchestrator.processDocumentsWithAgents()
   │    buildExtractionPrompt(doc.text, ...)
   ▼
/api/llm/chat  ── provider → OpenAI/Anthropic/Google
   │
   ▼
3-level Markdown  →  mindmapTransformer  →  React Flow graph
```

If the Python sidecar is unreachable or fails, `extractMultimodalFromPdfs` **transparently falls back** to the original `extractTextFromPdf` path, so the UI still works.

---

## 2. New files

| Path | Role |
| --- | --- |
| `edumap_yana_model/code/multimodal_pipeline_v2.py` | Improved extractor. See §5 for what's new vs. v1. Exposes a `--stdout-json` mode for the Node bridge. |
| `edumap-frontend/server/routes/multimodal.ts` | Node endpoint `POST /api/pdf/extract-multimodal`. Writes the uploaded PDF to a temp dir, spawns the Python pipeline, returns the parsed JSON payload. Cleans up temp files after. |
| `edumap-frontend/INTEGRATION_CHANGES.md` | This document. |

---

## 3. Modified files (with exact touch points)

### 3.1 `edumap-frontend/server/index.ts`
- Imported `multimodalRouter` from `./routes/multimodal.js`.
- Mounted it at `/api/pdf`:
  ```ts
  app.use('/api/pdf', multimodalRouter)
  ```
- No other lines changed.

### 3.2 `edumap-frontend/src/services/pdfService.ts`
- Added `extractMultimodalFromPdf(file)` and `extractMultimodalFromPdfs(files)`.
- Added `fileToBase64()` helper (chunked `btoa` to survive large PDFs).
- Kept the original `extractTextFromPdf` and `extractMultiplePdfs` exports intact — they are the fallback path.
- Return type of `extractMultiplePdfs` now comes from `PDFDocument` in `types.ts` (structural superset, no breaking change for existing callers).

### 3.3 `edumap-frontend/src/types.ts`
- `PDFDocument` gained an optional `multimodal?: MultimodalExtraction` field.
- Added new exported interfaces: `MultimodalExtraction`, `MultimodalFigure`, `MultimodalFormula`, `MultimodalTable`, `MultimodalAnchor`. Shape mirrors the JSON produced by `multimodal_pipeline_v2.py`.

### 3.4 `edumap-frontend/src/components/PdfUploadModal.tsx`
- Changed the import from `extractMultiplePdfs` to `extractMultimodalFromPdfs`.
- Updated the progress label string from "Extracting text from PDFs…" to "Running multimodal extraction (text + figures + formulas)…".
- No prop / behavior changes visible to the parent component.

### 3.5 `edumap-frontend/src/services/llmService.ts`
- Extended `EXTRACTION_SYSTEM` with a new "Multimodal input format" block that teaches the LLM how to consume `[TEXT p{N} c{N}]`, `[FIGURE id=... p{N}]`, `[FORMULA id=... p{N} kind=...]`, `[TABLE p{N}]` tagged blocks.
- Extended the tag list to include `[Visual]`, `[Formula]`, `[Table]` (for multimodal-derived nodes).
- **No changes** to `MERGE_SYSTEM`, `callLLM`, `buildExtractionPrompt`, `buildMergePrompt`. The new tag system is **strictly additive** — a plain-text document with no tagged blocks will still produce the same output it did before.

### 3.6 `edumap-frontend/src/services/mindmapTransformer.ts`
- Widened `TAG_REGEX` to also strip `[Visual]`, `[Formula]`, `[Table]`.
- Added them to `TAG_MAP`, mapping them onto the existing `NodeTag` union (`important` / `hard` / `new`). This is a temporary placeholder so the renderer can show some kind of badge — a dedicated badge palette is out of scope for this iteration.

### 3.7 `edumap-frontend/server/routes/llm.ts`
- **Unchanged.** The chat route already handles arbitrarily long messages; the multimodal context just flows through as `messages[].content` on the `user` role.

---

## 4. Environment variables

New (all optional, documented in `server/routes/multimodal.ts`):

| Var | Default | What it does |
| --- | --- | --- |
| `YANA_PIPELINE_PATH` | `../../edumap_yana_model/code/multimodal_pipeline_v2.py` (relative to this repo) | Absolute path to the v2 pipeline. |
| `YANA_PYTHON` | `python3` | Interpreter. Use `./venv/bin/python` to pin to a virtualenv. |
| `YANA_VISION_DISABLED` | *(unset)* | Set to `1` to pass `--no-vision` (no GPT-4o call; uses BLIP + Tesseract only). |
| `YANA_TIMEOUT_MS` | `300000` (5 min) | Subprocess timeout. |

Also required: `OPENAI_API_KEY` must be exported in the shell that starts the Node server *and* be visible to the Python subprocess, since GPT-4o Vision runs inside Python.

---

## 5. What's actually new in `multimodal_pipeline_v2.py`

Compared to the original `multimodal_pipeline.py`, v2 addresses each of the diagnosed failure modes:

| Issue in v1 | Fix in v2 |
| --- | --- |
| Text (pdfplumber) and images (PyMuPDF) were in different coordinate systems → "figure can't be located near its Figure N mention". | Single-pass extraction via `page.get_text("dict")` and `page.get_image_rects(xref)`. Text blocks and image blocks live in the same page coordinate system. |
| Two-column PDFs were detected but the rest of the pipeline ignored the detection. | Column mode stored on every `TextBlock`, propagated into `multimodal_context` as `[TEXT p{N} c{N}]` so the LLM knows which column a sentence came from. |
| No caption → image linkage. | `_nearest_caption` scores candidate text blocks by vertical gap + horizontal overlap, prefers blocks matching `^(Figure|Fig\.|Table)\s*\d+`. |
| No surrounding-text context passed to vision. | `_surrounding_text` grabs ~400 chars of same-page prose; Vision call receives caption + surrounding text + image. |
| Formula count was always zero. | Two-track detector: (a) text spans with Unicode math symbols / LaTeX cues; (b) image blocks whose aspect ratio is consistent with a rendered equation (wide & short). |
| Figure descriptions came from BLIP, which is weak on academic figures. | GPT-4o Vision call with the instruction "Describe this figure from a research paper for a student building a concept map…". BLIP stays as a `--no-vision` fallback. |
| No structured output for downstream consumers. | New JSON schema (see docstring at top of `multimodal_pipeline_v2.py`) with `text_blocks` / `figures` / `formulas` / `tables` / `anchors` / `multimodal_context` / `counts`. |
| `--skip-markdown` didn't exist; pipeline always paid 30-60 s to generate its own Markdown even when the caller would just re-do it. | `--skip-markdown` added. The Node bridge sets it because the EduMap frontend LLM produces the final Markdown. |
| Anchors (Figure N, Table N, Equation N) were never surfaced. | `_build_anchors` records `{kind, number, page, char_offset}` for every mention; emitted in `anchors[]`. The frontend currently doesn't use this but it's the hook for cross-referencing. |

The v2 script is a standalone addition and does **not** modify v1. Anyone running the old `multimodal_pipeline.py` still gets the old behavior.

---

## 6. How to verify

### 6.1 Python side only
```bash
cd edumap_yana_model
export OPENAI_API_KEY=$(cat OPENAI_API_KEY | tr -d '\n')
python3 code/multimodal_pipeline_v2.py \
    --pdf data/sepsis_definition.pdf \
    --out output_v2 \
    --emit-json output_v2/sepsis_definition/extraction.json
```

Expected: `output_v2/sepsis_definition/sepsis_definition_process_report_v2.json` shows non-zero `figures` and a non-zero `formulas_text` and/or `formulas_image`. Compare to the old report (`output/sepsis_definition/sepsis_definition_process_report.json`) which had `formulas_images: 0`.

### 6.2 End-to-end through the Node bridge
```bash
cd edumap-frontend
npm install
npm run dev:full
```
Upload a PDF via the UI. Open the browser devtools Network tab; you should see a single `POST /api/pdf/extract-multimodal` call lasting ~60-120 s for a typical paper, followed by a `POST /api/llm/chat`. The Node server log prints `[pipeline_v2] Done in …s. Counts: {...}` when the subprocess finishes.

### 6.3 Fallback behavior
To verify the fallback works, temporarily point `YANA_PIPELINE_PATH` at a non-existent file (`YANA_PIPELINE_PATH=/tmp/nope.py npm run dev:server`). Uploads should still succeed — the console prints `[pdfService] Multimodal extraction failed … falling back to plain text` and the mind map is built from plain `pdfjs-dist` text.

---

## 7. Rollback

To revert:

1. Delete `server/routes/multimodal.ts` and the two lines in `server/index.ts` marked `[EduMap multimodal]`.
2. In `src/components/PdfUploadModal.tsx`, switch the import back to `extractMultiplePdfs` and delete the changed progress label.
3. In `src/services/llmService.ts`, remove the "Multimodal input format" block from `EXTRACTION_SYSTEM` (the lines between `// ── Multimodal handling (added 2026-04-21) ──` and the closing `,`).
4. In `src/services/mindmapTransformer.ts`, revert `TAG_REGEX` and `TAG_MAP` to the pre-change versions.
5. In `src/types.ts`, drop the `multimodal` field on `PDFDocument` and the new `Multimodal*` interfaces.
6. `pdfService.ts` can keep the new exports (they are unused after rollback) or you can `git checkout` the file.

No migrations, no persistent state — the change is entirely in code.

---

## 8. Known limits (things **not** addressed in this iteration)

- **UI:** figures and formulas are *not* rendered as thumbnails on mind-map nodes. They are used as LLM input only. Dedicated `[Visual]`/`[Formula]`/`[Table]` badges aren't in the palette yet.
- **Cost:** every extracted figure triggers one GPT-4o Vision call (~0.001-0.01 USD each). A 20-figure paper costs ~0.02 USD before the Markdown LLM even runs. Set `YANA_VISION_DISABLED=1` during development.
- **Cold start:** if `torch`/`transformers` aren't installed yet, the `--no-vision` fallback will try to load BLIP and log a warning; it does not crash.
- **Streaming:** the bridge returns the full JSON after the Python subprocess exits. For long PDFs (50+ pages) consider switching the bridge to stream progress over SSE — left as a follow-up.
- **Multi-file upload:** currently each file spawns its own subprocess in parallel from the browser. This works fine for 1-3 files; for larger batches add server-side queueing.
