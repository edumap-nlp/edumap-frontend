import csv
import json
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

from score import flatten_mindmap, score_bertscore, score_cosine
from judge import score_judge, CRITERIA

BENCHMARK_DIR = Path(__file__).parent / "benchmark"
RESULTS_DIR = Path(__file__).parent / "results"
SYSTEMS = ["edumap", "tfidf", "notebooklm", "multimodal"]


def run() -> None:
    extracted_dir = BENCHMARK_DIR / "extracted"
    outputs_dir = BENCHMARK_DIR / "outputs"
    api_key = os.environ["OPENAI_API_KEY"]

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    papers = sorted(p.stem for p in extracted_dir.glob("*.txt"))
    systems_present = [s for s in SYSTEMS if (outputs_dir / s).is_dir()]

    criteria_keys = list(CRITERIA.keys())

    # Write CSV header once
    csv_path = RESULTS_DIR / "summary.csv"
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        csv.writer(f).writerow(
            ["paper", "system",
             "bertscore_precision", "bertscore_recall", "bertscore_f1",
             "cosine_similarity"]
            + criteria_keys
        )

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

            # Write incrementally so a crash doesn't lose completed work
            with open(RESULTS_DIR / "scores.json", "w", encoding="utf-8") as f:
                json.dump(records, f, indent=2)
            with open(csv_path, "a", newline="", encoding="utf-8") as f:
                csv.writer(f).writerow(
                    [paper, system,
                     bert["precision"], bert["recall"], bert["f1"],
                     cosine]
                    + [judge.get(k, {}).get("score", 0) for k in criteria_keys]
                )

            print(
                f"  {paper}/{system}: "
                f"BERTScore F1={bert['f1']:.3f}  cosine={cosine:.3f}  "
                f"judge avg={sum(v['score'] for v in judge.values()) / len(judge):.1f}"
            )

    print(f"\nResults written to {RESULTS_DIR}/")


if __name__ == "__main__":
    run()
