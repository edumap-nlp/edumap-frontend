# bl_notebooklm.py
"""
bl_notebooklm.py — Emulate NotebookLM using OpenAI Chat API.
- Input: data/sepsis_definition.pdf (default)
- Output: output/sepsis_definition_bl_notebooklm.md (default)
- Input PDF -> chunked summaries -> consolidated hierarchical Markdown.

Usage:
  export OPENAI_API_KEY="sk-..."
  python code/bl_notebooklm.py --pdf data/sepsis_definition.pdf --out output/sepsis_definition_bl_notebooklm.md
"""


import sys
import subprocess
import importlib
import os
import argparse
from pathlib import Path

# ---------- Auto-install required pip packages ----------
REQUIRED_PACKAGES = ["PyPDF2", "nltk", "tiktoken", "openai"]

def install_package(pkg):
    print(f"Installing package: {pkg}")
    subprocess.check_call([sys.executable, "-m", "pip", "install", pkg])

def ensure_packages(packages):
    for pkg in packages:
        mod_name = "sklearn" if pkg == "scikit-learn" else pkg
        try:
            importlib.import_module(mod_name)
        except Exception:
            install_package(pkg)

ensure_packages(REQUIRED_PACKAGES)

# ---------- Imports (after ensuring packages) ----------
import PyPDF2
import nltk
from pathlib import Path
try:
    # prefer new client style if available
    from openai import OpenAI
    client = OpenAI()
    def chat_create(**kwargs):
        return client.chat.completions.create(**kwargs)
except Exception:
    import openai
    def chat_create(**kwargs):
        return openai.ChatCompletion.create(**kwargs)

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

# ---------- PDF/text helpers ----------
def extract_text_from_pdf(path):
    parts = []
    with open(path, "rb") as f:
        reader = PyPDF2.PdfReader(f)
        for page in reader.pages:
            txt = page.extract_text()
            if txt:
                parts.append(txt)
    return "\n".join(parts)

def chunk_text(text, max_chars=3000):
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    chunks = []
    cur = ""
    for p in paragraphs:
        if len(cur) + len(p) + 2 <= max_chars:
            cur = (cur + "\n\n" + p).strip()
        else:
            if cur:
                chunks.append(cur)
            cur = p
    if cur:
        chunks.append(cur)
    return chunks if chunks else [text[:max_chars]]

# ---------- OpenAI wrappers ----------
def _extract_content_from_response(resp):
    # support dict-style and OpenAI Python client objects
    if isinstance(resp, dict) and "choices" in resp:
        choice = resp["choices"][0]
        return choice["message"]["content"].strip()
    else:
        # object-style (openai v2 client)
        choice = resp.choices[0]
        # choice may have .message or .message.content attributes/object
        msg = getattr(choice, "message", None)
        if msg is None:
            # fallback to attribute 'text' or str(resp)
            return str(choice).strip()
        # msg may be a dict-like or object with .content
        if isinstance(msg, dict):
            return msg["content"].strip()
        return getattr(msg, "content", str(msg)).strip()

def summarize_chunk(chunk, model="gpt-4o-mini"):
    system = ("You are an assistant that extracts concise study notes from a document chunk. "
              "Return 3-6 short bullet points summarizing main ideas.")
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": f"Document chunk:\n\n{chunk}\n\nProvide 3-6 concise bullets of main ideas."}
    ]
    resp = chat_create(model=model, messages=messages, temperature=0.0, top_p=1.0, max_tokens=512, n=1)
    return _extract_content_from_response(resp)

def consolidate_and_generate_md(summaries, title, model="gpt-4o-mini"):
    system = (
        "You are an assistant that converts multiple chunk summaries into a three-level hierarchical Markdown "
        "document suitable for a mind map. Output MUST be pure Markdown with exactly this structure:\n\n"
        "- Top-level title line (h1) with the paper title.\n"
        "- Several section headings (h2, '##') representing major topics.\n"
        "- Under each h2, several subsection headings (h3, '###') representing subtopics.\n"
        "- Under each h3, 1-6 bullet points ('-') with concise key facts or takeaways.\n\n"
        "Constraints:\n"
        "- Keep section titles <= 6 words and subsection titles <= 8 words.\n"
        "- Use plain text only (no code blocks, no explanations about the process).\n"
        "- If a section has no natural subsections, create one subsection with a concise summary.\n"
        "- Be consistent and concise."
    )
    user = "Here are chunk summaries:\n\n" + "\n\n---\n\n".join(
        f"Chunk {i+1}:\n{summaries[i]}" for i in range(len(summaries))
    )
    user += f"\n\nProduce a three-level hierarchical Markdown document for the paper titled: {title}"
    messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
    resp = chat_create(model=model, messages=messages, temperature=0.0, top_p=1.0, max_tokens=2000, n=1)
    md = _extract_content_from_response(resp)

    # light normalization: ensure title as H1 and ensure spacing
    lines = [l.rstrip() for l in md.splitlines()]
    if not lines:
        return f"# {title}\n\n## Summary\n\n- (no content)"
    # ensure first non-empty line is H1 with title
    for i, ln in enumerate(lines):
        if ln.strip():
            if not ln.strip().startswith("#"):
                lines.insert(i, f"# {title}")
            break
    # ensure there is a blank line after H1
    if len(lines) > 0 and not (lines[0].strip() == "" or (len(lines) > 1 and lines[1].strip() == "")):
        lines.insert(1, "")
    return "\n".join(lines).strip() + "\n"


# ---------- Main ----------
def main(pdf="data/sepsis_definition.pdf", out="output/sepsis_definition_bl_notebooklm.md", chunk_chars=3000, model="gpt-4o-mini"):
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY not set in environment.")
    setup_nltk_resources()
    pdf_path = Path(pdf)
    if not pdf_path.exists():
        raise FileNotFoundError(f"PDF not found: {pdf}")
    text = extract_text_from_pdf(str(pdf_path))
    if not text.strip():
        raise RuntimeError("No text extracted from PDF.")
    chunks = chunk_text(text, max_chars=chunk_chars)
    print(f"Created {len(chunks)} chunk(s). Summarizing...")
    summaries = []
    for i, c in enumerate(chunks):
        print(f" Summarizing chunk {i+1}/{len(chunks)}")
        summaries.append(summarize_chunk(c, model=model))
    print("Consolidating into final Markdown...")
    title = pdf_path.stem.replace("_"," ").replace("-"," ").title()
    md = consolidate_and_generate_md(summaries, title, model=model)
    out_path = Path(out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(md, encoding="utf-8")
    print(f"Wrote NotebookLM-like Markdown to: {out_path}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", type=str, default="data/sepsis_definition.pdf")
    parser.add_argument("--out", type=str, default="output/sepsis_definition_bl_notebooklm.md")
    parser.add_argument("--chunk_chars", type=int, default=3000)
    parser.add_argument("--model", type=str, default="gpt-4o-mini")
    args = parser.parse_args()
    main(pdf=args.pdf, out=args.out, chunk_chars=args.chunk_chars, model=args.model)
