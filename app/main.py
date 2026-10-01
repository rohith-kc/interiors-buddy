from typing import Any, List, Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.requests import Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel

from . import claude_client
from .benchmarks import CATEGORIES, DEFAULT_REQUIREMENTS, ROOM_EXPECTATIONS
from .config import MAX_UPLOAD_MB
from .pdf_utils import extract_text_from_pdf

app = FastAPI(title="Interiors Buddy")
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

MAX_BYTES = MAX_UPLOAD_MB * 1024 * 1024
ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp"}


@app.get("/")
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/api/config")
async def get_config():
    return {
        "categories": CATEGORIES,
        "roomExpectations": ROOM_EXPECTATIONS,
        "defaultRequirements": DEFAULT_REQUIREMENTS,
    }


@app.post("/api/extract-quote")
async def api_extract_quote(
    requirements: str = Form(...),
    vendorName: Optional[str] = Form(None),
    rawText: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
):
    text = (rawText or "").strip()

    if file is not None:
        content = await file.read()
        if len(content) > MAX_BYTES:
            raise HTTPException(400, f"That file is over the {MAX_UPLOAD_MB}MB limit.")
        is_pdf = (file.content_type == "application/pdf") or (file.filename or "").lower().endswith(".pdf")
        if not is_pdf:
            raise HTTPException(400, "Only PDF files are supported for quote uploads right now — paste the text instead for other formats.")
        text = extract_text_from_pdf(content)
        if not text or len(text) < 20:
            raise HTTPException(
                400,
                "Couldn't find selectable text in that PDF — it's probably a scanned image. "
                "Open it, select all, copy, and paste the text in instead.",
            )

    if not text or len(text) < 20:
        raise HTTPException(400, "Paste the quote's text, or upload a PDF, before analyzing.")

    try:
        data = claude_client.extract_quote(text, requirements, vendor_hint=vendorName)
    except RuntimeError as e:
        raise HTTPException(500, str(e))
    except Exception:
        raise HTTPException(502, "Claude couldn't read that quote cleanly. Try trimming it to just the line-item table, or add rows by hand on the page.")

    if not isinstance(data, dict) or not isinstance(data.get("items"), list):
        raise HTTPException(502, "Claude's reply came back in an unexpected shape — try analyzing again.")

    return data


@app.post("/api/extract-floorplan")
async def api_extract_floorplan(file: UploadFile = File(...)):
    content = await file.read()
    if len(content) > MAX_BYTES:
        raise HTTPException(400, f"That file is over the {MAX_UPLOAD_MB}MB limit.")
    ctype = file.content_type or ""
    if ctype not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(400, "Upload the floor plan as a PNG or JPG image — a screenshot or photo of the plan works fine.")

    try:
        data = claude_client.extract_floorplan(content, ctype)
    except RuntimeError as e:
        raise HTTPException(500, str(e))
    except Exception:
        raise HTTPException(502, "Claude couldn't read that floor plan clearly. Try a clearer or more cropped image.")

    if not isinstance(data, dict) or not isinstance(data.get("rooms"), list):
        raise HTTPException(502, "Claude's reply came back in an unexpected shape — try again.")

    return data


class GuidanceRequest(BaseModel):
    requirements: str
    vendors: List[Any]
    floorplan: Optional[Any] = None


@app.post("/api/guidance")
async def api_guidance(payload: GuidanceRequest):
    try:
        text = claude_client.get_guidance(payload.model_dump(), payload.requirements)
    except RuntimeError as e:
        raise HTTPException(500, str(e))
    except Exception:
        raise HTTPException(502, "Couldn't get guidance just now — try again in a moment.")
    return {"text": text}
