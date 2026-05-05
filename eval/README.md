# EduMap Evaluation Pipeline

Scores pre-generated mind map outputs using BERTScore, TF-IDF cosine similarity,
and an LLM-as-judge across four qualitative criteria.

## Setup

```bash
cd eval
pip install -r requirements.txt
```

Requires `GOOGLE_API_KEY` in your environment (same key used by the app).

## Usage

### 1. Extract text from benchmark PDFs (one-time setup)

```bash
python eval/extract.py eval/benchmark/papers/attention.pdf
```

Writes to `eval/benchmark/extracted/attention.txt`. Repeat for each paper.

### 2. Add pre-generated mind map outputs

Place `.md` files in `eval/benchmark/outputs/<system>/` named by paper ID:

```
eval/benchmark/outputs/edumap/attention.md
eval/benchmark/outputs/tfidf/attention.md
eval/benchmark/outputs/notebooklm/attention.md
eval/benchmark/outputs/multimodal/attention.md
```

### 3. Run the full evaluation

```bash
python eval/run_eval.py
```

Results are written to `eval/results/scores.json` and `eval/results/summary.csv`.

## Paper IDs

Paper IDs are derived from the PDF filename (without extension). All output files
for a paper must use the same ID. Example: `bert.pdf` → `bert.txt`, `bert.md`.

## Running tests

```bash
cd eval
pytest tests/ -v
```
