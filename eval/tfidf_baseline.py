"""
TF-IDF + KMeans baseline for EduMap evaluation.

Splits the source text into paragraphs, clusters them with KMeans, labels each
cluster using its top TF-IDF terms, and writes a markdown mind map to
eval/benchmark/outputs/tfidf/<paper_id>.md.

This is the structural baseline: it groups text by word overlap, not by
conceptual meaning, so it mirrors the paper's vocabulary distribution rather
than its knowledge structure.

Usage:
    python eval/tfidf_baseline.py attention          # single paper
    python eval/tfidf_baseline.py --all              # all papers in extracted/
    python eval/tfidf_baseline.py attention --k 8    # custom cluster count
"""

import argparse
import re
import sys
from pathlib import Path

import numpy as np
from sklearn.cluster import KMeans
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

EXTRACTED_DIR = Path(__file__).parent / "benchmark" / "extracted"
OUTPUT_DIR = Path(__file__).parent / "benchmark" / "outputs" / "tfidf"

DEFAULT_K = 6          # top-level clusters (branches)
MIN_CHUNK_WORDS = 15   # discard very short fragments
TOP_TERMS = 4          # terms used to label a cluster
REPR_PER_CLUSTER = 2   # representative phrases shown per branch


def _split_chunks(text: str) -> list[str]:
    """Split text into paragraph-level chunks, discarding noise."""
    raw = re.split(r"\n{2,}", text.strip())
    chunks = []
    for chunk in raw:
        cleaned = " ".join(chunk.split())
        if len(cleaned.split()) >= MIN_CHUNK_WORDS:
            chunks.append(cleaned)
    return chunks


def _extract_title(text: str) -> str:
    """Heuristic: first non-empty line that looks like a title (short, no period)."""
    for line in text.splitlines():
        line = line.strip()
        if 3 < len(line.split()) <= 20 and not line.endswith("."):
            return line
    return "Document"


def _label_cluster(centroid: np.ndarray, vectorizer: TfidfVectorizer) -> str:
    """Return a human-readable label from the highest-weight terms at the centroid."""
    feature_names = vectorizer.get_feature_names_out()
    top_indices = centroid.argsort()[::-1][:TOP_TERMS]
    terms = [feature_names[i] for i in top_indices]
    return " / ".join(t.title() for t in terms)


def _representative_chunks(
    chunk_indices: list[int],
    chunks: list[str],
    tfidf_matrix,
    centroid: np.ndarray,
    n: int,
) -> list[str]:
    """Pick the n chunks closest to the cluster centroid."""
    if not chunk_indices:
        return []
    sub_matrix = tfidf_matrix[chunk_indices]
    sims = cosine_similarity(sub_matrix, centroid.reshape(1, -1)).flatten()
    ranked = sorted(zip(sims, chunk_indices), reverse=True)
    results = []
    for _, idx in ranked[:n]:
        # Trim to first sentence or 12 words, whichever is shorter
        first_sentence = re.split(r"(?<=[.!?])\s", chunks[idx])[0]
        words = first_sentence.split()
        snippet = " ".join(words[:12]) + ("…" if len(words) > 12 else "")
        results.append(snippet)
    return results


def build_mindmap(paper_id: str, k: int = DEFAULT_K) -> str:
    """Run TF-IDF + KMeans on extracted text and return markdown mind map."""
    txt_path = EXTRACTED_DIR / f"{paper_id}.txt"
    if not txt_path.exists():
        raise FileNotFoundError(f"No extracted text for '{paper_id}' at {txt_path}")

    text = txt_path.read_text(encoding="utf-8")
    chunks = _split_chunks(text)

    if len(chunks) < k:
        k = max(2, len(chunks))

    vectorizer = TfidfVectorizer(
        stop_words="english",
        ngram_range=(1, 2),
        max_df=0.85,
        min_df=2,
        max_features=5000,
    )
    tfidf_matrix = vectorizer.fit_transform(chunks)

    km = KMeans(n_clusters=k, random_state=42, n_init=10)
    labels = km.fit_predict(tfidf_matrix)
    centroids = km.cluster_centers_

    title = _extract_title(text)
    lines = [f"# {title}"]

    for cluster_id in range(k):
        member_indices = [i for i, lbl in enumerate(labels) if lbl == cluster_id]
        if not member_indices:
            continue

        label = _label_cluster(centroids[cluster_id], vectorizer)
        reprs = _representative_chunks(
            member_indices, chunks, tfidf_matrix.toarray(), centroids[cluster_id], REPR_PER_CLUSTER
        )

        lines.append(f"## {label}")
        for r in reprs:
            lines.append(r)

    return "\n".join(lines)


def run_single(paper_id: str, k: int) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    md = build_mindmap(paper_id, k)
    out_path = OUTPUT_DIR / f"{paper_id}.md"
    out_path.write_text(md, encoding="utf-8")
    print(f"  {paper_id} → {out_path}  ({md.count(chr(10))+1} lines)")


def run_all(k: int) -> None:
    papers = sorted(p.stem for p in EXTRACTED_DIR.glob("*.txt"))
    if not papers:
        print(f"No .txt files found in {EXTRACTED_DIR}")
        sys.exit(1)
    print(f"Processing {len(papers)} paper(s) with k={k}…")
    for paper_id in papers:
        run_single(paper_id, k)
    print("Done.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="TF-IDF + KMeans mind map baseline")
    parser.add_argument("paper_id", nargs="?", help="Paper ID (stem of .txt file)")
    parser.add_argument("--all", action="store_true", help="Process all extracted papers")
    parser.add_argument("--k", type=int, default=DEFAULT_K, help=f"Number of clusters (default {DEFAULT_K})")
    args = parser.parse_args()

    if args.all:
        run_all(args.k)
    elif args.paper_id:
        run_single(args.paper_id, args.k)
    else:
        parser.print_help()
        sys.exit(1)
