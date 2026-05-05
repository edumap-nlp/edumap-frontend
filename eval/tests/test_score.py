import pytest
from score import flatten_mindmap, score_cosine


def test_flatten_mindmap_strips_hashes():
    md = "# Root Topic\n## Child Node\n### Grandchild"
    result = flatten_mindmap(md)
    assert "Root Topic" in result
    assert "Child Node" in result
    assert "Grandchild" in result
    assert "#" not in result


def test_flatten_mindmap_keeps_descriptions():
    md = "# Attention Mechanisms\nCore concept for transformers\n## Self-Attention"
    result = flatten_mindmap(md)
    assert "Core concept for transformers" in result


def test_flatten_mindmap_skips_blank_lines():
    md = "# Root\n\n## Child\n\n"
    result = flatten_mindmap(md)
    lines = [l for l in result.splitlines() if l.strip()]
    assert len(lines) == 2


def test_score_cosine_identical_text():
    text = "attention mechanism transformer self-attention query key value"
    score = score_cosine(text, text)
    assert score == pytest.approx(1.0, abs=0.01)


def test_score_cosine_unrelated_text():
    score = score_cosine(
        "attention mechanism transformer self-attention",
        "cooking recipe pasta tomato sauce ingredients",
    )
    assert score < 0.1


def test_score_cosine_partial_overlap():
    score = score_cosine(
        "attention mechanism transformer self-attention",
        "attention is all you need transformer model",
    )
    assert 0.1 < score < 0.9


def test_score_cosine_returns_float():
    score = score_cosine("hello world", "hello world")
    assert isinstance(score, float)
