import csv
import json
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

from score import flatten_mindmap, score_bertscore, score_cosine
from judge import score_judge

BENCHMARK_DIR = Path(__file__).parent / "benchmark"
RESULTS_DIR = Path(__file__).parent / "results"
SYSTEMS = ["edumap", "tfidf", "notebooklm", "multimodal"]


def run() -> None:
    extracted_dir = BENCHMARK_DIR / "extracted"
    outputs_dir = BENCHMARK_DIR / "outputs"
    api_key = os.environ["OPENAI_API_KEY"]

    papers = sorted(p.stem for p in extracted_dir.glob("*.txt"))
    systems_present = [s for s in SYSTEMS if (outputs_dir / s).is_dir()]
    records = []

    for paper in papers:
        source_text = (extracted_dir / f"{paper}.txt").read_text(encoding="utf-8")

        for system in systems_present:
            md_path = outputs_dir / system / f"{paper}.md"
            if not md_path.exists():
                print(f"WARNING: missing {md_path}, skipping")
                continue

            mindmap_md = md_path.read_text(encoding="utf-8")
            mindmap_flat = flatten_mindmap(mindmap_md)

            bert = score_bertscore(source_text, mindmap_flat)
            cosine = score_cosine(source_text, mindmap_flat)
            judge = score_judge(source_text, mindmap_md, api_key)

            record = {
                "paper": paper,
                "system": system,
                "bertscore": bert,
                "cosine_similarity": cosine,
                "judge": judge,
            }
            records.append(record)
            print(
                f"  {paper}/{system}: "
                f"BERTScore F1={bert['f1']:.3f}  cosine={cosine:.3f}  "
                f"judge avg={sum(v['score'] for v in judge.values()) / len(judge):.1f}"
            )

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    with open(RESULTS_DIR / "scores.json", "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2)

    with open(RESULTS_DIR / "summary.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow([
            "paper", "system",
            "bertscore_precision", "bertscore_recall", "bertscore_f1",
            "cosine_similarity",
            "conceptual_accuracy", "coverage",
            "hierarchical_organization", "study_usefulness",
        ])
        for r in records:
            writer.writerow([
                r["paper"], r["system"],
                r["bertscore"]["precision"],
                r["bertscore"]["recall"],
                r["bertscore"]["f1"],
                r["cosine_similarity"],
                r["judge"]["conceptual_accuracy"]["score"],
                r["judge"]["coverage"]["score"],
                r["judge"]["hierarchical_organization"]["score"],
                r["judge"]["study_usefulness"]["score"],
            ])

    print(f"\nResults written to {RESULTS_DIR}/")


if __name__ == "__main__":
    run()
