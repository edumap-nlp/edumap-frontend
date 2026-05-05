import pytest
from pathlib import Path
from unittest.mock import patch, MagicMock


def test_paper_id_from_path():
    from extract import paper_id_from_path
    assert paper_id_from_path(Path("eval/benchmark/papers/attention.pdf")) == "attention"
    assert paper_id_from_path(Path("resnet50.pdf")) == "resnet50"
    assert paper_id_from_path(Path("/abs/path/gpt3.pdf")) == "gpt3"


def test_extract_writes_txt(tmp_path):
    mock_page = MagicMock()
    mock_page.extract_text.return_value = "This is page text."

    mock_pdf = MagicMock()
    mock_pdf.__enter__ = MagicMock(return_value=mock_pdf)
    mock_pdf.__exit__ = MagicMock(return_value=False)
    mock_pdf.pages = [mock_page]

    pdf_path = tmp_path / "attention.pdf"
    pdf_path.write_bytes(b"fake pdf content")
    output_dir = tmp_path / "extracted"

    with patch("extract.pdfplumber.open", return_value=mock_pdf):
        from extract import extract_pdf
        extract_pdf(pdf_path, output_dir)

    out_file = output_dir / "attention.txt"
    assert out_file.exists()
    assert "This is page text." in out_file.read_text()


def test_extract_joins_pages_with_double_newline(tmp_path):
    pages_text = ["Page one content.", "Page two content."]
    mock_pages = []
    for text in pages_text:
        p = MagicMock()
        p.extract_text.return_value = text
        mock_pages.append(p)

    mock_pdf = MagicMock()
    mock_pdf.__enter__ = MagicMock(return_value=mock_pdf)
    mock_pdf.__exit__ = MagicMock(return_value=False)
    mock_pdf.pages = mock_pages

    pdf_path = tmp_path / "test.pdf"
    pdf_path.write_bytes(b"fake")
    output_dir = tmp_path / "out"

    with patch("extract.pdfplumber.open", return_value=mock_pdf):
        from extract import extract_pdf
        extract_pdf(pdf_path, output_dir)

    content = (output_dir / "test.txt").read_text()
    assert "Page one content.\n\nPage two content." in content


def test_extract_skips_none_pages(tmp_path):
    mock_page_good = MagicMock()
    mock_page_good.extract_text.return_value = "Good page."
    mock_page_empty = MagicMock()
    mock_page_empty.extract_text.return_value = None

    mock_pdf = MagicMock()
    mock_pdf.__enter__ = MagicMock(return_value=mock_pdf)
    mock_pdf.__exit__ = MagicMock(return_value=False)
    mock_pdf.pages = [mock_page_good, mock_page_empty]

    pdf_path = tmp_path / "test.pdf"
    pdf_path.write_bytes(b"fake")
    output_dir = tmp_path / "out"

    with patch("extract.pdfplumber.open", return_value=mock_pdf):
        from extract import extract_pdf
        extract_pdf(pdf_path, output_dir)

    content = (output_dir / "test.txt").read_text()
    assert "Good page." in content
    assert "None" not in content
