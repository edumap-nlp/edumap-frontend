from bert_score import score as bert_score_fn
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity as sk_cosine


def flatten_mindmap(md_content: str) -> str:
    """Strip # markers from heading lines and join all non-empty lines with newlines."""
    lines = []
    for line in md_content.splitlines():
        stripped = line.lstrip("#").strip()
        if stripped:
            lines.append(stripped)
    return "\n".join(lines)


def score_bertscore(source_text: str, mindmap_flat: str) -> dict:
    """Compute BERTScore. mindmap_flat is the candidate; source_text is the reference."""
    P, R, F1 = bert_score_fn(
        [mindmap_flat],
        [source_text],
        lang="en",
        model_type="roberta-large",
        verbose=False,
    )
    return {
        "precision": round(float(P[0]), 4),
        "recall": round(float(R[0]), 4),
        "f1": round(float(F1[0]), 4),
    }


def score_cosine(source_text: str, mindmap_text: str) -> float:
    """Compute TF-IDF cosine similarity between source and mind map text."""
    vectorizer = TfidfVectorizer()
    tfidf = vectorizer.fit_transform([source_text, mindmap_text])
    return round(float(sk_cosine(tfidf[0:1], tfidf[1:2])[0][0]), 4)
