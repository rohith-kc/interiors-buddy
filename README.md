# Interiors Buddy

A quote evaluator for interior / modular-furniture quotations. Paste or upload a
vendor's quote (PDF or pasted text), and it:

- reads every line item into a table and works out a real **₹/sqft rate** for each
  one — from the stated rate, or from the panel's height × width when the vendor
  only gives mm dimensions and a lump amount
- checks each rate against a typical **market range** per category (editable)
- checks the quote against **your own must-have list** (editable, with evidence
  quoted from the text for each item)
- flags **room-level gaps** on its own — e.g. a kitchen with no wall/overhead unit
  priced — independent of anything you thought to ask for
- optionally reads an uploaded **floor plan image** and flags any room it shows
  that isn't priced anywhere in a given quote
- compares 2–4 vendors side by side, category by category and on the grand total
- writes a short plain-English assessment of strengths, gaps, and which way to
  lean, grounded in the extracted numbers

## Stack

FastAPI (Python) backend + a plain HTML/CSS/JS frontend — no build step, no
Node.js required. PDF text extraction is local (`pdfplumber`); quote reading,
floor-plan reading, and the guidance summary call the Anthropic API
(`claude-sonnet-5` by default).

## Running it locally

```bash
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # then paste your key into .env
uvicorn app.main:app --reload
```

Open http://127.0.0.1:8000

You need an Anthropic API key from https://console.anthropic.com/settings/keys —
the app reads/analyzes quotes using *your* key, so each analysis costs a small
amount against your Anthropic account. There's no other cost and no database;
nothing is stored server-side, everything lives in the browser tab until you
refresh.

## Project layout

```
app/
  main.py          FastAPI routes
  claude_client.py Anthropic API calls (quote extraction, floor-plan reading, guidance)
  pdf_utils.py      PDF -> text
  benchmarks.py     ₹/sqft ranges, room-expectation rules, default must-have list
templates/index.html  page shell
static/app.js         all frontend logic and state
static/styles.css      styling
```

## Known limitations (MVP)

- Scanned, image-only PDF quotes have no selectable text — `pdfplumber` can't
  read them. The page will ask you to paste the text instead; OCR support would
  close this gap.
- The benchmark ₹/sqft ranges in `app/benchmarks.py` are informed estimates for
  tier-1 India, not a sourced live dataset. Treat a flag as a prompt to ask the
  vendor a question, not as a verified fact — the editable panel on the page lets
  you tune them to your own city.
- No accounts, no saved history — each session is scratch. Add a database if you
  want quotes to persist across visits.
- The guidance call and quote extraction are synchronous (no streaming yet), so
  larger quotes take a few seconds with no progress indicator beyond "Reading…".

## Deploying

Any host that runs a Python ASGI app works (Render, Railway, Fly.io, a VPS).
Set `ANTHROPIC_API_KEY` as an environment variable there instead of a `.env`
file, and run `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
