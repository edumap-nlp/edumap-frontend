# bl_tfidf_kmeans.py

"""
bl_tfidf_kmeans.py — Simple reproducible baseline: PDF -> hierarchical Markdown (for mind maps)

Purpose:
- Extract text from an input PDF, split into sentences, and vectorize sentences using TF-IDF.
- Cluster sentences with KMeans; each cluster represents a "section/node".
- Extract candidate section titles per cluster using RAKE, and select top sentences per cluster by TF-IDF score as key points.
- Produce a Markdown file with a document title, multiple section headings, and bullet-point key sentences suitable for building a mind map.

Design principles:
- Simple and reproducible: uses classic NLP techniques (TF-IDF, KMeans, RAKE) rather than large or nondeterministic models.
- Reproducibility ensured via a fixed random seed (RANDOM_SEED = 42) and deterministic KMeans settings.
- Easy to inspect and tune (adjust cluster count heuristics, top-N sentences, etc.).

Dependencies:
- Python 3.8+
- PyPDF2, nltk, scikit-learn, rake-nltk

Example usage:
python bl_tfidf_kmeans.py --pdf data/sepsis_definition.pdf --out output/sepsis_definition_bl_tfidf_kmeans.md --top 5
"""

import sys
import subprocess
import importlib
import os
import math
import re
import argparse
import random
from pathlib import Path

# ---------- Auto-install missing pip packages ----------
REQUIRED_PACKAGES = ["PyPDF2", "nltk", "scikit-learn", "rake-nltk"]

def install_package(pkg):
    print(f"Installing package: {pkg}")
    subprocess.check_call([sys.executable, "-m", "pip", "install", pkg])

def ensure_packages(packages):
    for pkg in packages:
        try:
            importlib.import_module(pkg if pkg != "scikit-learn" else "sklearn")
        except Exception:
            install_package(pkg)

# Run package checks/installs before importing heavy deps
ensure_packages(REQUIRED_PACKAGES)

# Now safe to import
import PyPDF2
import nltk
from nltk.tokenize import sent_tokenize
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.cluster import KMeans
from rake_nltk import Rake

# ---------- Reproducibility ----------
RANDOM_SEED = 42
random.seed(RANDOM_SEED)

# ---------- NLTK resource setup ----------
def setup_nltk_resources():
    resources = ["punkt", "punkt_tab", "stopwords"]
    for res in resources:
        try:
            if res == "stopwords":
                nltk.data.find("corpora/stopwords")
            else:
                nltk.data.find(f"tokenizers/{res}")
        except LookupError:
            print(f"Downloading NLTK resource: {res}")
            nltk.download(res, quiet=False)
            # verify
            try:
                if res == "stopwords":
                    nltk.data.find("corpora/stopwords")
                else:
                    nltk.data.find(f"tokenizers/{res}")
            except Exception as e:
                raise RuntimeError(f"Failed to download NLTK resource '{res}': {e}")

# ---------- PDF/text processing ----------
def extract_text_from_pdf(pdf_path):
    text_parts = []
    with open(pdf_path, "rb") as f:
        reader = PyPDF2.PdfReader(f)
        for page in reader.pages:
            try:
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(page_text)
            except Exception:
                continue
    return "\n".join(text_parts)

def clean_text(text):
    text = re.sub(r'\r\n?', '\n', text)
    text = re.sub(r'\n{2,}', '\n\n', text)
    return text.strip()

def split_sentences(text):
    sents = sent_tokenize(text)
    sents = [s.strip() for s in sents if len(s.strip()) > 20]
    return sents

def choose_k(n_sentences):
    k = max(3, int(math.sqrt(max(1, n_sentences))))
    return min(k, 12)

def cluster_sentences(sentences, k):
    vectorizer = TfidfVectorizer(
        max_features=2000,
        stop_words="english",
        ngram_range=(1,2),
    )
    X = vectorizer.fit_transform(sentences)
    km = KMeans(n_clusters=k, random_state=RANDOM_SEED, n_init=10)
    labels = km.fit_predict(X)
    return labels, X, vectorizer

def extract_section_title(texts_in_cluster):
    r = Rake(max_length=4, min_length=1)
    combined = " ".join(texts_in_cluster)
    r.extract_keywords_from_text(combined)
    phrases = r.get_ranked_phrases()
    if phrases:
        title = phrases[0]
        if len(title) > 60:
            title = title[:57] + "..."
        return title.title()
    else:
        return combined.split(".")[0][:60].strip().title()

def rank_sentences_in_cluster(sentences, vectorizer):
    tfidf = vectorizer.transform(sentences)
    scores = tfidf.sum(axis=1).A1
    return scores

def build_markdown(title, sentences, labels, vectorizer, top_n_sentences=5):
    """
    Produce 3-level Markdown:
    # Title
    ## Section (cluster)
    ### Subsection (sub-cluster)
    - bullet points (top sentences)
    """
    md_lines = []
    md_lines.append(f"# {title}\n")
    n_clusters = max(labels) + 1
    cluster_map = {i: [] for i in range(n_clusters)}
    for idx, lab in enumerate(labels):
        cluster_map[lab].append((idx, sentences[idx]))

    # order clusters by size desc then index
    cluster_order = sorted(cluster_map.items(), key=lambda x: (-len(x[1]), x[0]))

    for cluster_idx, items in cluster_order:
        texts = [t for (_, t) in items]
        section_title = extract_section_title(texts)
        md_lines.append(f"## {section_title}\n")

        # decide number of subsections for this section
        n_texts = len(texts)
        # heuristic: sqrt, at least 1, at most min(n_texts, 6)
        sub_k = max(1, int(math.sqrt(max(1, n_texts))))
        sub_k = min(sub_k, n_texts, 6)

        if sub_k == 1:
            # single subsection fallback
            sub_title = section_title + " — Details"
            md_lines.append(f"### {sub_title}\n")
            ranks = rank_sentences_in_cluster(texts, vectorizer)
            scored = list(zip(range(len(texts)), texts, ranks))
            scored.sort(key=lambda x: (-x[2], x[0]))
            chosen = scored[:top_n_sentences]
            for _, sent, _ in chosen:
                md_lines.append(f"- {sent}")
            md_lines.append("")
            continue

        # vectorize texts in this cluster and run KMeans for subsections
        sub_vectorizer = TfidfVectorizer(max_features=1000, stop_words="english", ngram_range=(1,2))
        try:
            X_sub = sub_vectorizer.fit_transform(texts)
            km_sub = KMeans(n_clusters=sub_k, random_state=RANDOM_SEED, n_init=10)
            sub_labels = km_sub.fit_predict(X_sub)
        except Exception:
            # fallback: single subsection if clustering fails
            md_lines.append(f"### {section_title} — Details\n")
            ranks = rank_sentences_in_cluster(texts, vectorizer)
            scored = list(zip(range(len(texts)), texts, ranks))
            scored.sort(key=lambda x: (-x[2], x[0]))
            chosen = scored[:top_n_sentences]
            for _, sent, _ in chosen:
                md_lines.append(f"- {sent}")
            md_lines.append("")
            continue

        # build subsections map
        sub_map = {i: [] for i in range(sub_k)}
        for i, lab in enumerate(sub_labels):
            sub_map[lab].append((i, texts[i]))

        # order subsections by size
        sub_order = sorted(sub_map.items(), key=lambda x: (-len(x[1]), x[0]))
        for sub_idx, sub_items in sub_order:
            sub_texts = [t for (_, t) in sub_items]
            sub_title = extract_section_title(sub_texts)
            md_lines.append(f"### {sub_title}\n")
            # rank sentences within subsection using the main vectorizer for consistency
            ranks = rank_sentences_in_cluster(sub_texts, vectorizer)
            scored = list(zip(range(len(sub_texts)), sub_texts, ranks))
            scored.sort(key=lambda x: (-x[2], x[0]))
            chosen = scored[:max(1, min(top_n_sentences, len(sub_texts)))]
            for _, sent, _ in chosen:
                md_lines.append(f"- {sent}")
            md_lines.append("")
    return "\n".join(md_lines)

# ---------- Main ----------
def main(pdf_path, out_md_path, top_n=5):
    # ensure nltk resources
    setup_nltk_resources()

    pdf_path = Path(pdf_path)
    assert pdf_path.exists(), f"PDF not found: {pdf_path}"
    raw = extract_text_from_pdf(str(pdf_path))
    raw = clean_text(raw)
    sentences = split_sentences(raw)
    if not sentences:
        raise RuntimeError("No sentences extracted from PDF.")
    k = choose_k(len(sentences))
    labels, X, vectorizer = cluster_sentences(sentences, k)
    title = pdf_path.stem.replace("_", " ").replace("-", " ").title()
    md = build_markdown(title, sentences, labels, vectorizer, top_n_sentences=top_n)
    out_dir = Path(out_md_path).parent
    out_dir.mkdir(parents=True, exist_ok=True)
    with open(out_md_path, "w", encoding="utf-8") as f:
        f.write(md)
    print(f"Wrote baseline markdown to: {out_md_path}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Simple reproducible baseline: PDF -> hierarchical MD")
    parser.add_argument("--pdf", type=str, default="data/sepsis_definition.pdf", help="Input PDF file (default: data/sepsis_definition.pdf)")
    parser.add_argument("--out", type=str, default="output/sepsis_definition_bl_tfidf_kmeans.md", help="Output MD file (default: output/sepsis_definition_bl_tfidf_kmeans.md)")
    parser.add_argument("--top", type=int, default=5, help="Top sentences per section")
    args = parser.parse_args()
    main(args.pdf, args.out, top_n=args.top)
