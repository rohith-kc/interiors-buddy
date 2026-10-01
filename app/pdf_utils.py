import io

import pdfplumber


def extract_text_from_pdf(file_bytes: bytes) -> str:
    """Pull selectable text out of a PDF. Scanned, image-only PDFs will come back
    empty — the caller should ask the user to paste the text instead in that case.
    """
    parts = []
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            if text:
                parts.append(text)
    return "\n".join(parts).strip()
