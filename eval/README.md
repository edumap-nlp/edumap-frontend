# EduMap Evaluation Pipeline

Scores pre-generated mind map outputs using BERTScore, TF-IDF cosine similarity,
and an LLM-as-judge across four qualitative criteria.

## Setup

From the repo root:

```bash
pip install -r eval/requirements.txt
```

Requires `OPENAI_API_KEY` in the root `.env` file (same key used by the app).

## Usage

### 1. Extract text from benchmark PDFs (one-time setup)

```bash
python eval/extract.py eval/benchmark/papers/attention.pdf
```

Writes to `eval/benchmark/extracted/attention.txt`. Repeat for each paper.

### 2. Generate TF-IDF baseline outputs

```bash
python eval/tfidf_baseline.py --all
```

Writes to `eval/benchmark/outputs/tfidf/`. Requires extracted `.txt` files from step 1.

### 3. Add EduMap and NotebookLM outputs

- **EduMap:** upload each PDF in the app, copy the markdown from the editor, save as `eval/benchmark/outputs/edumap/<paper_id>.md`
- **NotebookLM:** generate outputs at notebooklm.google.com, save as `eval/benchmark/outputs/notebooklm/<paper_id>.md`

All filenames must match the paper ID (PDF stem). Example: `attention.pdf` → `attention.md`.

### 4. Run the full evaluation

```bash
python eval/run_eval.py
```

Results are written to `eval/results/scores.json` and `eval/results/summary.csv`.

## Paper IDs

Paper IDs are derived from the PDF filename (without extension). All files across
`extracted/`, `outputs/edumap/`, `outputs/tfidf/`, etc. must use the same ID.

## Scripts

| Script | Purpose |
|--------|---------|
| `extract.py` | PDF → `.txt` (one-time, uses pdfplumber) |
| `tfidf_baseline.py` | `.txt` → TF-IDF+KMeans `.md` baseline |
| `score.py` | BERTScore + TF-IDF cosine similarity |
| `judge.py` | LLM-as-judge (GPT-4o), 4 criteria, 1–5 scale |
| `run_eval.py` | Orchestrator — runs all metrics, writes results |
