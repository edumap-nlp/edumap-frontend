import json
import os
import pytest
from pathlib import Path
from unittest.mock import patch


FAKE_BERT = {"precision": 0.80, "recall": 0.78, "f1": 0.79}
FAKE_JUDGE = {
    "conceptual_accuracy": {"score": 4, "rationale": "Good."},
    "coverage": {"score": 3, "rationale": "Decent."},
    "hierarchical_organization": {"score": 5, "rationale": "Excellent."},
    "study_usefulness": {"score": 4, "rationale": "Helpful."},
}


def _setup_benchmark(tmp_path, systems=None, papers=None):
    systems = systems or ["edumap"]
    papers = papers or ["testpaper"]

    extracted = tmp_path / "benchmark" / "extracted"
    extracted.mkdir(parents=True)
    for paper in papers:
        (extracted / f"{paper}.txt").write_text("source text content for " + paper)

    for system in systems:
        out_dir = tmp_path / "benchmark" / "outputs" / system
        out_dir.mkdir(parents=True)
        for paper in papers:
            (out_dir / f"{paper}.md").write_text(f"# {paper}\n## Node")


def test_run_produces_scores_json(tmp_path):
    _setup_benchmark(tmp_path)

    with patch("run_eval.BENCHMARK_DIR", tmp_path / "benchmark"), \
         patch("run_eval.RESULTS_DIR", tmp_path / "results"), \
         patch("run_eval.score_bertscore", return_value=FAKE_BERT), \
         patch("run_eval.score_cosine", return_value=0.42), \
         patch("run_eval.score_judge", return_value=FAKE_JUDGE), \
         patch.dict(os.environ, {"GOOGLE_API_KEY": "fake"}):
        import run_eval
        run_eval.run()

    scores_path = tmp_path / "results" / "scores.json"
    assert scores_path.exists()
    data = json.loads(scores_path.read_text())
    assert len(data) == 1
    record = data[0]
    assert record["paper"] == "testpaper"
    assert record["system"] == "edumap"
    assert record["bertscore"]["f1"] == 0.79
    assert record["cosine_similarity"] == 0.42
    assert record["judge"]["coverage"]["score"] == 3


def test_run_produces_summary_csv(tmp_path):
    _setup_benchmark(tmp_path)

    with patch("run_eval.BENCHMARK_DIR", tmp_path / "benchmark"), \
         patch("run_eval.RESULTS_DIR", tmp_path / "results"), \
         patch("run_eval.score_bertscore", return_value=FAKE_BERT), \
         patch("run_eval.score_cosine", return_value=0.42), \
         patch("run_eval.score_judge", return_value=FAKE_JUDGE), \
         patch.dict(os.environ, {"GOOGLE_API_KEY": "fake"}):
        import run_eval
        run_eval.run()

    csv_path = tmp_path / "results" / "summary.csv"
    assert csv_path.exists()
    lines = csv_path.read_text().splitlines()
    assert lines[0].startswith("paper,system,bertscore_precision")
    assert "testpaper,edumap" in lines[1]


def test_run_skips_missing_outputs(tmp_path, capsys):
    extracted = tmp_path / "benchmark" / "extracted"
    extracted.mkdir(parents=True)
    (extracted / "testpaper.txt").write_text("source")

    for system in ["edumap", "tfidf", "notebooklm", "multimodal"]:
        (tmp_path / "benchmark" / "outputs" / system).mkdir(parents=True)

    with patch("run_eval.BENCHMARK_DIR", tmp_path / "benchmark"), \
         patch("run_eval.RESULTS_DIR", tmp_path / "results"), \
         patch("run_eval.score_bertscore", return_value=FAKE_BERT), \
         patch("run_eval.score_cosine", return_value=0.0), \
         patch("run_eval.score_judge", return_value=FAKE_JUDGE), \
         patch.dict(os.environ, {"GOOGLE_API_KEY": "fake"}):
        import run_eval
        run_eval.run()

    captured = capsys.readouterr()
    assert "WARNING" in captured.out
    data = json.loads((tmp_path / "results" / "scores.json").read_text())
    assert data == []


def test_run_handles_multiple_papers_and_systems(tmp_path):
    _setup_benchmark(
        tmp_path,
        systems=["edumap", "tfidf"],
        papers=["attention", "resnet"],
    )

    with patch("run_eval.BENCHMARK_DIR", tmp_path / "benchmark"), \
         patch("run_eval.RESULTS_DIR", tmp_path / "results"), \
         patch("run_eval.score_bertscore", return_value=FAKE_BERT), \
         patch("run_eval.score_cosine", return_value=0.5), \
         patch("run_eval.score_judge", return_value=FAKE_JUDGE), \
         patch.dict(os.environ, {"GOOGLE_API_KEY": "fake"}):
        import run_eval
        run_eval.run()

    data = json.loads((tmp_path / "results" / "scores.json").read_text())
    assert len(data) == 4  # 2 papers × 2 systems
