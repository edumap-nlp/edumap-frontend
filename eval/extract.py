import sys
import pdfplumber
from pathlib import Path

DEFAULT_OUTPUT_DIR = Path(__file__).parent / "benchmark" / "extracted"


def paper_id_from_path(pdf_path: Path) -> str:
    return Path(pdf_path).stem


def extract_pdf(pdf_path: Path, output_dir: Path = DEFAULT_OUTPUT_DIR) -> Path:
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    paper_id = paper_id_from_path(pdf_path)
    out_path = output_dir / f"{paper_id}.txt"

    pages = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                pages.append(text)

    out_path.write_text("\n\n".join(pages), encoding="utf-8")
    print(f"Extracted {len(pages)} pages → {out_path}")
    return out_path


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python extract.py <pdf_path> [output_dir]")
        sys.exit(1)
    pdf_path = Path(sys.argv[1])
    output_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_OUTPUT_DIR
    extract_pdf(pdf_path, output_dir)
