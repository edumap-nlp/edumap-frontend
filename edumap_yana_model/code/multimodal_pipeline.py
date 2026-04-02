#!/usr/bin/env python3
# code/multimodal_pipeline.py

"""
Multimodal PDF Processing Pipeline

This pipeline converts a research paper PDF into a structured, hierarchical Markdown representation by integrating multiple processing components.

Workflow:
1. Extract layout-aware content (text, tables, images) from the PDF.
2. Apply OCR and image captioning to interpret visual elements.
3. Merge all extracted content into a unified text representation.
4. Split the content into manageable chunks.
5. Use a large language model (LLM) to summarize each chunk.
6. Consolidate summaries into a 3-level hierarchical Markdown structure.

Key Features:
- Combines document parsing, OCR, computer vision, and LLM-based reasoning.
- Captures both textual and visual information (e.g., tables and figures).
- Produces human-readable, structured outputs suitable for study and analysis.

Usage:
  export OPENAI_API_KEY="sk-..."
  python code/multimodal_pipeline.py --pdf data/sepsis_definition.pdf --out output
"""


import sys, os, subprocess, importlib, time, json, math, argparse
from pathlib import Path

# ---------- Auto-install minimal required packages (best-effort) ----------
REQUIRED = [
    "PyMuPDF",        # fitz
    "pdfplumber",
    "pytesseract",
    "Pillow",
    "transformers",
    "torch",
    "tiktoken",
    "openai",
    "nltk",
]

def install(pkg):
    print("Installing", pkg)
    subprocess.check_call([sys.executable, "-m", "pip", "install", pkg])

def ensure(pkgs):
    for p in pkgs:
        try:
            if p == "PyMuPDF":
                importlib.import_module("fitz")
            else:
                importlib.import_module(p)
        except Exception:
            try:
                install(p)
            except Exception as e:
                print(f"Failed to install {p}: {e}")

ensure(REQUIRED)

# ---------- Imports ----------
import fitz
import pdfplumber
from PIL import Image
import pytesseract
import nltk
from transformers import BlipProcessor, BlipForConditionalGeneration
import tiktoken
from openai import OpenAI
import torch
import re
from nltk.tokenize import sent_tokenize

# ---------- Config ----------
RANDOM_SEED = 42
CHUNK_CHAR = 3000
OPENAI_MODEL = "gpt-4o-mini"
CAPTION_MODEL = "Salesforce/blip-image-captioning-base"
MAX_SUMMARY_TOKENS = 800
EST_INPUT_PRICE_PER_M = 0.15
EST_OUTPUT_PRICE_PER_M = 0.60

# ---------- Device ----------
if torch.backends.mps.is_available():
    device = "mps"
elif torch.cuda.is_available():
    device = "cuda"
else:
    device = "cpu"
print("Using device:", device)

# ---------- OpenAI client (v1+) ----------
openai_key = os.environ.get("OPENAI_API_KEY")
if not openai_key:
    print("ERROR: set OPENAI_API_KEY in environment")
    sys.exit(1)
client = OpenAI(api_key=openai_key)

# ---------- NLTK resources ----------
for r in ("punkt","stopwords"):
    try:
        if r == "punkt":
            nltk.data.find("tokenizers/punkt")
        else:
            nltk.data.find("corpora/stopwords")
    except LookupError:
        nltk.download(r, quiet=True)

# ---------- Load caption model (optional) ----------
processor = None
caption_model = None
try:
    processor = BlipProcessor.from_pretrained(CAPTION_MODEL)
    caption_model = BlipForConditionalGeneration.from_pretrained(CAPTION_MODEL).to(device)
except Exception as e:
    print("Warning: failed to load caption model:", e)
    processor = None
    caption_model = None

# ---------- Helpers ----------
def extract_layout_blocks(pdf_path, out_img_dir):
    """
    Returns list of blocks: dict with keys: type (text/table/image), page, bbox, text/table_csv/image_path
    Uses pdfplumber for text/tables, fits for images (open fitz once).
    """
    blocks = []
    pdf = pdfplumber.open(pdf_path)
    doc = fitz.open(pdf_path)
    for i, page in enumerate(pdf.pages, start=1):
        counts = 0
        width, height = page.width, page.height
        # words and two-column heuristic
        try:
            words = page.extract_words(use_text_flow=True)
        except Exception:
            words = page.extract_words()
        x_mids = [ (float(w['x0'])+float(w['x1']))/2 for w in words ] if words else []
        col_mode = 1
        if len(x_mids) > 30:
            mid = sum(x_mids)/len(x_mids)
            left = [x for x in x_mids if x < mid]
            right = [x for x in x_mids if x >= mid]
            if len(left) >= 0.25*len(x_mids) and len(right) >= 0.25*len(x_mids):
                col_mode = 2
        if col_mode == 2:
            left_bbox = (0,0,width/2,height)
            right_bbox = (width/2,0,width,height)
            for bbox in (left_bbox,right_bbox):
                txt = page.within_bbox(bbox).extract_text() or ""
                if txt.strip():
                    blocks.append({"type":"text","page":i,"bbox":bbox,"text":txt.strip()})
        else:
            txt = page.extract_text() or ""
            if txt.strip():
                blocks.append({"type":"text","page":i,"bbox":(0,0,width,height),"text":txt.strip()})
        # tables
        try:
            for t in page.extract_tables():
                rows = t
                csv_text = "\n".join([",".join([cell if cell is not None else "" for cell in row]) for row in rows])
                blocks.append({"type":"table","page":i,"bbox":None,"table_csv":csv_text})
        except Exception:
            pass
        # images via fitz (doc open once)
        try:
            page_fitz = doc[i-1]
            for img_index, img in enumerate(page_fitz.get_images(full=True)):
                xref = img[0]
                pix = fitz.Pixmap(doc, xref)
                img_name = out_img_dir / f"page{i}_img{img_index}.png"
                try:
                    pix.save(str(img_name))
                except Exception:
                    # fallback: convert to PIL and save
                    if pix.n < 4:
                        mode = "RGB"
                        img_pil = Image.frombytes(mode, [pix.width, pix.height], pix.samples)
                    else:
                        pix0 = fitz.Pixmap(fitz.csRGB, pix)
                        img_pil = Image.frombytes("RGB", [pix0.width, pix0.height], pix0.samples)
                        pix0 = None
                    img_pil.save(img_name)
                blocks.append({"type":"image","page":i,"bbox":None,"image_path":str(img_name)})
                pix = None
        except Exception:
            pass
    doc.close()
    pdf.close()
    return blocks

def ocr_image(image_path):
    try:
        img = Image.open(image_path)
        text = pytesseract.image_to_string(img, lang="eng")
        return text.strip()
    except Exception:
        return ""

def caption_image(image_path):
    if caption_model is None or processor is None:
        return ""
    try:
        raw = Image.open(image_path).convert("RGB")
        inputs = processor(raw, return_tensors="pt").to(device)
        out = caption_model.generate(**inputs, max_new_tokens=64)
        caption = processor.decode(out[0], skip_special_tokens=True)
        return caption.strip()
    except Exception:
        return ""

def chunk_texts(text_list, max_chars=CHUNK_CHAR):
    paras = []
    for t in text_list:
        paras.extend([p.strip() for p in re.split(r'\n\s*\n', t) if p.strip()])
    chunks = []
    cur = ""
    for p in paras:
        if len(cur) + len(p) + 2 <= max_chars:
            cur = (cur + "\n\n" + p).strip()
        else:
            if cur:
                chunks.append(cur)
            cur = p
    if cur:
        chunks.append(cur)
    return chunks if chunks else [ " ".join(paras)[:max_chars] ]

def count_tokens(text, model_name=OPENAI_MODEL):
    try:
        enc = tiktoken.encoding_for_model(model_name)
    except Exception:
        enc = tiktoken.get_encoding("cl100k_base")
    return len(enc.encode(text))

def openai_chat(messages, model=OPENAI_MODEL, max_tokens=MAX_SUMMARY_TOKENS):
    """
    Use OpenAI client to create chat completion. Return (content_str, resp_obj, usage_dict).
    """
    resp = client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=0.0,
        top_p=1.0,
        max_tokens=max_tokens,
        n=1,
    )
    # extract content robustly
    content = ""
    try:
        # dict-like
        choice = resp["choices"][0]
        content = choice["message"]["content"]
    except Exception:
        try:
            choice = resp.choices[0]
            msg = getattr(choice, "message", None)
            if isinstance(msg, dict):
                content = msg.get("content", "")
            else:
                content = getattr(msg, "content", str(msg))
        except Exception:
            content = str(resp)
    # extract usage robustly
    usage = {}
    try:
        usage = resp.get("usage", {}) or {}
    except Exception:
        try:
            usage = getattr(resp, "usage", {}) or {}
        except Exception:
            usage = {}
    return content.strip(), resp, usage

# ---------- Main pipeline ----------
def process(pdf_path, out_dir, chunk_chars=CHUNK_CHAR, top_n=5):
    t0 = time.time()
    pdf_path = Path(pdf_path)
    if not pdf_path.exists():
        raise FileNotFoundError(f"{pdf_path} not found")
    stem = pdf_path.stem
    out_dir = Path(out_dir) / stem
    out_dir.mkdir(parents=True, exist_ok=True)
    img_dir = out_dir / "extracted_images"
    img_dir.mkdir(parents=True, exist_ok=True)
    md_out = out_dir / f"{stem}_bl_multimodal.md"
    report_out = out_dir / f"{stem}_process_report.json"

    # 1. extract blocks
    print("Extracting layout blocks...")
    blocks = extract_layout_blocks(str(pdf_path), img_dir)
    counts = {"pages":0,"text_blocks":0,"tables":0,"images":0,"image_captions":0,"image_ocr":0,"formulas_images":0}
    # page count
    counts["pages"] = len(set(b["page"] for b in blocks)) if blocks else 0

    text_blocks = []
    for b in blocks:
        if b["type"] == "text":
            counts["text_blocks"] += 1
            text_blocks.append(f"(page {b['page']}) {b['text']}")
        elif b["type"] == "table":
            counts["tables"] += 1
            csv = b.get("table_csv","")
            rows = [r.split(",") for r in csv.splitlines() if r.strip()]
            header = rows[0] if rows else []
            sample = rows[1:4] if len(rows)>1 else []
            txt = f"(page {b['page']}) Table: header: {' | '.join(header)}; sample rows: {' ; '.join([' | '.join(r) for r in sample])}"
            text_blocks.append(txt)
        elif b["type"] == "image":
            counts["images"] += 1
            imgpath = b["image_path"]
            cap = caption_image(imgpath)
            ocrt = ocr_image(imgpath)
            if cap:
                counts["image_captions"] += 1
                text_blocks.append(f"(page {b['page']}) Figure caption (model): {cap}")
            if ocrt:
                counts["image_ocr"] += 1
                text_blocks.append(f"(page {b['page']}) Figure OCR: {ocrt}")
            # include image placeholder and relative path
            text_blocks.append(f"(page {b['page']}) [Figure: {os.path.relpath(imgpath, out_dir)}]")

    # fallback: if no text found, attempt full text via fitz
    if not any(b["type"]=="text" for b in blocks):
        print("No text blocks found; falling back to full-text extraction via fitz.")
        doc = fitz.open(str(pdf_path))
        full_text = []
        for p in doc:
            txt = p.get_text("text")
            if txt:
                full_text.append(txt)
        doc.close()
        if full_text:
            text_blocks.append("\n\n".join(full_text))

    # 2. chunking
    chunks = chunk_texts(text_blocks, max_chars=chunk_chars)
    print(f"Created {len(chunks)} chunks for summarization.")

    # 3. summarize each chunk
    summaries = []
    token_stats = {"input_tokens":0,"output_tokens":0}
    for i, c in enumerate(chunks):
        print(f" Summarizing chunk {i+1}/{len(chunks)}...")
        msgs = [
            {"role":"system","content":"You are an expert scientific assistant. Extract the main points concisely."},
            {"role":"user","content":f"Chunk text:\n\n{c}\n\nProvide 3-6 concise bullets of main ideas. Use short sentences."}
        ]
        content, resp, usage = openai_chat(msgs, model=OPENAI_MODEL, max_tokens=400)
        summaries.append(content)
        # update token stats robustly
        try:
            token_stats["input_tokens"] += usage.get("prompt_tokens", 0)
            token_stats["output_tokens"] += usage.get("completion_tokens", 0)
        except Exception:
            token_stats["input_tokens"] += count_tokens(c)
            token_stats["output_tokens"] += count_tokens(content)

    # 4. consolidate to 3-level Markdown
    system = (
        "You are an assistant that converts chunk summaries into a THREE-LEVEL hierarchical Markdown document suitable for a mind map.\n"
        "Structure: # Title, then multiple '##' sections, each containing multiple '###' subsections, each with 1-6 '-' bullets.\n"
        "Keep section titles <=6 words, subsection titles <=8 words. Output pure Markdown only."
    )
    user = "Chunk summaries:\n\n" + "\n\n---\n\n".join(f"Chunk {i+1}:\n{summaries[i]}" for i in range(len(summaries)))
    user += f"\n\nProduce a three-level hierarchical Markdown document for the paper titled: {stem.replace('_',' ').title()}"
    print("Consolidating chunk summaries into final Markdown...")
    final_content, final_resp, final_usage = openai_chat([{"role":"system","content":system},{"role":"user","content":user}], model=OPENAI_MODEL, max_tokens=MAX_SUMMARY_TOKENS)
    try:
        token_stats["input_tokens"] += final_usage.get("prompt_tokens", 0)
        token_stats["output_tokens"] += final_usage.get("completion_tokens", 0)
    except Exception:
        token_stats["input_tokens"] += count_tokens(user)
        token_stats["output_tokens"] += count_tokens(final_content)

    # 5. embed image links appendix if model didn't include image markdown
    md_text = final_content
    if "![Figure" not in md_text and "![figure" not in md_text:
        figs = sorted((img_dir).glob("*.png"))
        if figs:
            md_text += "\n\n## Extracted Figures\n\n"
            for f in figs:
                rel = os.path.relpath(f, out_dir)
                # optionally also add OCR/caption under each
                caption = ""
                ocrt = ocr_image(str(f))
                cap = caption_image(str(f))
                if cap:
                    caption += f"Caption: {cap}\n\n"
                if ocrt:
                    caption += f"OCR: {ocrt}\n\n"
                md_text += f"![Figure]({rel})\n\n{caption}"
    md_out.write_text(md_text, encoding="utf-8")

    # 6. report
    t_total = time.time() - t0
    est_cost = token_stats["input_tokens"]/1e6 * EST_INPUT_PRICE_PER_M + token_stats["output_tokens"]/1e6 * EST_OUTPUT_PRICE_PER_M
    report = {
        "pdf": str(pdf_path),
        "output_markdown": str(md_out),
        "counts": counts,
        "num_chunks": len(chunks),
        "token_stats": token_stats,
        "estimated_cost_usd": est_cost,
        "timing_seconds": t_total,
        "device": device
    }
    report_out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"Wrote Markdown to {md_out}")
    print(f"Wrote process report to {report_out}")
    print("Report summary:", json.dumps(report, indent=2))
    return md_out, report_out

# ---------- CLI ----------
if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", type=str, default="data/sepsis_definition.pdf")
    parser.add_argument("--out", type=str, default="output")
    parser.add_argument("--chunk_chars", type=int, default=CHUNK_CHAR)
    args = parser.parse_args()
    process(args.pdf, args.out, chunk_chars=args.chunk_chars)
