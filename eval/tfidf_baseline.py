"""
tfidf_baseline.py — Reproducible TF-IDF + KMeans baseline for EduMap evaluation.

Reads pre-extracted .txt files from eval/benchmark/extracted/, clusters sentences
with hierarchical KMeans, extracts section titles via RAKE, and writes a 3-level
Markdown mind map to eval/benchmark/outputs/tfidf/<paper_id>.md.

Design:
- Sentence-level granularity (not paragraphs)
- RAKE keyword extraction for section/subsection labels
- Two-level KMeans: top-level clusters → sub-clusters within each
- Fixed random seed (42) for reproducibility

Usage:
    python eval/tfidf_baseline.py attention          # single paper
    python eval/tfidf_baseline.py --all              # all papers in extracted/
    python eval/tfidf_baseline.py attention --top 5  # custom top-N sentences
"""

import argparse
import math
import re
import sys
from pathlib import Path

import nltk
from nltk.tokenize import sent_tokenize
from rake_nltk import Rake
from sklearn.cluster import KMeans
from sklearn.feature_extraction.text import TfidfVectorizer

EXTRACTED_DIR = Path(__file__).parent / "benchmark" / "extracted"
OUTPUT_DIR = Path(__file__).parent / "benchmark" / "outputs" / "tfidf"

RANDOM_SEED = 42
TOP_N_SENTENCES = 5


# ── NLTK setup ──────────────────────────────────────────────────────────────

def _ensure_nltk():
    for resource, path in [("punkt_tab", "tokenizers/punkt_tab"), ("stopwords", "corpora/stopwords")]:
        try:
            nltk.data.find(path)
        except LookupError:
            nltk.download(resource, quiet=True)


# ── Text processing ──────────────────────────────────────────────────────────

def _split_sentences(text: str) -> list[str]:
    sents = sent_tokenize(text)
    return [s.strip() for s in sents if len(s.strip()) > 20]


def _choose_k(n: int, max_k: int = 12) -> int:
    return min(max(3, int(math.sqrt(max(1, n)))), max_k)


def _extract_title(texts: list[str]) -> str:
    r = Rake(max_length=4, min_length=1)
    r.extract_keywords_from_text(" ".join(texts))
    phrases = r.get_ranked_phrases()
    if phrases:
        title = phrases[0]
        return (title[:57] + "…" if len(title) > 60 else title).title()
    return " ".join(texts[0].split()[:6]).title()


def _rank_sentences(sentences: list[str], vectorizer: TfidfVectorizer) -> list[float]:
    return vectorizer.transform(sentences).sum(axis=1).A1.tolist()


# ── Core algorithm ───────────────────────────────────────────────────────────

def build_mindmap(paper_id: str, top_n: int = TOP_N_SENTENCES) -> str:
    txt_path = EXTRACTED_DIR / f"{paper_id}.txt"
    if not txt_path.exists():
        raise FileNotFoundError(f"No extracted text for '{paper_id}' at {txt_path}")

    _ensure_nltk()
    sentences = _split_sentences(txt_path.read_text(encoding="utf-8"))
    if not sentences:
        raise RuntimeError(f"No sentences extracted from {txt_path}")

    # Top-level TF-IDF vectorizer (shared for ranking throughout)
    vectorizer = TfidfVectorizer(
        max_features=2000,
        stop_words="english",
        ngram_range=(1, 2),
    )
    X = vectorizer.fit_transform(sentences)

    k = _choose_k(len(sentences))
    km = KMeans(n_clusters=k, random_state=RANDOM_SEED, n_init=10)
    labels = km.fit_predict(X)

    # Group sentences by cluster
    cluster_map: dict[int, list[str]] = {i: [] for i in range(k)}
    for idx, lab in enumerate(labels):
        cluster_map[lab].append(sentences[idx])

    # Order clusters largest-first
    cluster_order = sorted(cluster_map.items(), key=lambda x: (-len(x[1]), x[0]))

    title = paper_id.replace("_", " ").replace("-", " ").title()
    lines = [f"# {title}\n"]

    for _, cluster_sentences in cluster_order:
        section_title = _extract_title(cluster_sentences)
        lines.append(f"## {section_title}\n")

        n = len(cluster_sentences)
        sub_k = min(max(1, int(math.sqrt(n))), n, 6)

        if sub_k == 1:
            lines.append(f"### {section_title} — Details\n")
            scores = _rank_sentences(cluster_sentences, vectorizer)
            top = sorted(zip(scores, cluster_sentences), reverse=True)[:top_n]
            for _, sent in top:
                lines.append(f"- {sent}")
            lines.append("")
            continue

        # Sub-cluster within this section
        sub_vec = TfidfVectorizer(max_features=1000, stop_words="english", ngram_range=(1, 2))
        try:
            X_sub = sub_vec.fit_transform(cluster_sentences)
            sub_labels = KMeans(n_clusters=sub_k, random_state=RANDOM_SEED, n_init=10).fit_predict(X_sub)
        except Exception:
            sub_labels = [0] * n

        sub_map: dict[int, list[str]] = {i: [] for i in range(sub_k)}
        for i, lab in enumerate(sub_labels):
            sub_map[lab].append(cluster_sentences[i])

        for _, sub_sentences in sorted(sub_map.items(), key=lambda x: (-len(x[1]), x[0])):
            sub_title = _extract_title(sub_sentences)
            lines.append(f"### {sub_title}\n")
            scores = _rank_sentences(sub_sentences, vectorizer)
            top = sorted(zip(scores, sub_sentences), reverse=True)[:max(1, min(top_n, len(sub_sentences)))]
            for _, sent in top:
                lines.append(f"- {sent}")
            lines.append("")

    return "\n".join(lines)


# ── CLI ──────────────────────────────────────────────────────────────────────

def run_single(paper_id: str, top_n: int) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    md = build_mindmap(paper_id, top_n)
    out_path = OUTPUT_DIR / f"{paper_id}.md"
    out_path.write_text(md, encoding="utf-8")
    print(f"  {paper_id} → {out_path}")


def run_all(top_n: int) -> None:
    papers = sorted(p.stem for p in EXTRACTED_DIR.glob("*.txt"))
    if not papers:
        print(f"No .txt files found in {EXTRACTED_DIR}")
        sys.exit(1)
    print(f"Processing {len(papers)} paper(s)…")
    for paper_id in papers:
        run_single(paper_id, top_n)
    print("Done.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="TF-IDF + KMeans mind map baseline")
    parser.add_argument("paper_id", nargs="?", help="Paper ID (stem of .txt file)")
    parser.add_argument("--all", action="store_true", help="Process all extracted papers")
    parser.add_argument("--top", type=int, default=TOP_N_SENTENCES, help=f"Top sentences per subsection (default {TOP_N_SENTENCES})")
    args = parser.parse_args()

    if args.all:
        run_all(args.top)
    elif args.paper_id:
        run_single(args.paper_id, args.top)
    else:
        parser.print_help()
        sys.exit(1)
