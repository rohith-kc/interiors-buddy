import base64
import json
import re

from anthropic import Anthropic

from .benchmarks import category_list_text
from .config import ANTHROPIC_API_KEY, CLAUDE_MODEL

_client: Anthropic | None = None


def get_client() -> Anthropic:
    global _client
    if not ANTHROPIC_API_KEY:
        raise RuntimeError(
            "ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key "
            "from https://console.anthropic.com/settings/keys"
        )
    if _client is None:
        _client = Anthropic(api_key=ANTHROPIC_API_KEY)
    return _client


def _text_of(message) -> str:
    return "".join(block.text for block in message.content if block.type == "text")


def _parse_json(text: str) -> dict:
    text = text.strip()
    # Strip a ```json ... ``` fence if the model wrapped its answer in one.
    fence = re.match(r"^```(?:json)?\s*(.*)```\s*$", text, re.DOTALL)
    if fence:
        text = fence.group(1).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        return json.loads(match.group(0))
    raise ValueError("Claude's reply wasn't valid JSON")


QUOTE_UNITS = ["SFT", "MM_DIM", "RFT", "NOS", "LSM", "OTHER"]


def extract_quote(raw_text: str, requirements_text: str, vendor_hint: str | None = None) -> dict:
    prompt = f"""You are reading one modular-interior / carpentry quotation, pasted as raw
text below (table structure may be mangled from PDF extraction — reconstruct it sensibly).
{"The vendor may be called '" + vendor_hint + "'." if vendor_hint else ""}

Return ONLY a JSON object, no prose, no markdown fence, matching exactly this shape:

{{
  "vendorName": string,
  "items": [
    {{
      "room": string,
      "item": string,
      "category": one of the keys listed below,
      "unit": one of {QUOTE_UNITS},
      "qty": number|null,
      "heightMm": number|null,
      "widthMm": number|null,
      "rate": number|null,
      "amount": number|null
    }}
  ],
  "totals": {{"statedSubtotal": number|null, "gstPercent": number|null, "statedGrandTotal": number|null}},
  "paymentTerms": string|null,
  "warrantyText": string|null,
  "designFeeNote": string|null,
  "checklist": [
    {{"item": string, "present": boolean, "evidence": string|null}}
  ]
}}

Rules:
- One entry in items[] per priced line in the quote. Keep room names as given in the
  quote (e.g. "Master Bedroom", "Kitchen", "Second Floor Living").
- category must be exactly one of:
{category_list_text()}
  Pick the closest match; use "other" only if nothing fits.
- unit "MM_DIM" is for items priced from height+width dimensions in millimetres with a
  lump amount and no sqft given. Use "SFT" when the quote already states a sqft
  quantity and a rate per sqft. Use RFT/NOS/LSM/OTHER as printed in the quote.
- totals.statedGrandTotal is the final payable figure printed in the quote (after any
  negotiated discount), if shown anywhere.
- checklist: for EACH line of the requirement list below, decide whether the quote's
  text shows it is actually included, with a short quoted or paraphrased evidence
  snippet (or null if you found nothing). Be literal — don't assume something is
  covered just because it seems like it should be.

Requirement list:
{requirements_text}

QUOTE TEXT:
{raw_text[:60000]}
"""
    client = get_client()
    resp = client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}],
    )
    return _parse_json(_text_of(resp))


def extract_floorplan(image_bytes: bytes, media_type: str) -> dict:
    prompt = """Look at this residential floor plan image. List every distinct room or
named space you can identify (bedrooms, living/hall/drawing areas, kitchen, pantry,
utility, pooja room, study/office, dining, balconies, foyer). If a room's dimensions
are marked on the plan, use them to estimate its area in square feet; otherwise leave
approxSqft null rather than guessing.

Return ONLY a JSON object, no prose, no markdown fence:
{"rooms": [{"name": string, "approxSqft": number|null, "notes": string|null}], "summary": string}

"summary" is one short sentence describing the overall layout (e.g. "two-storey, 4
bedrooms, 2 living areas, one kitchen, study and pooja room")."""
    client = get_client()
    resp = client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=2048,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": base64.b64encode(image_bytes).decode(),
                        },
                    },
                    {"type": "text", "text": prompt},
                ],
            }
        ],
    )
    return _parse_json(_text_of(resp))


def get_guidance(payload: dict, requirements_text: str) -> str:
    prompt = f"""Compare these interior-vendor quotes for a homeowner, using the structured
data below (JSON). It includes, per vendor: the line items with their category, amount,
computed ₹/sqft rate and whether that rate fell below/within/above the typical market
range, the requirement checklist results, and totals. It may also include a floor plan
room list with a "coverageGaps" field per vendor listing floor-plan rooms that don't
appear to be priced in that vendor's quote.

DATA:
{json.dumps(payload)}

HOMEOWNER'S MUST-HAVE LIST:
{requirements_text}

Write a short, direct assessment: 2-3 sentences per vendor on real strengths and real
gaps — name specific rooms, items and numbers from the data, don't speak in
generalities. Call out any floor-plan coverage gaps explicitly. Then one closing
paragraph recommending how to proceed given the price spread and the gaps found.
Plain prose, no headers, no bullet symbols, no flattery, ground every claim in the
data given."""
    client = get_client()
    resp = client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=1500,
        messages=[{"role": "user", "content": prompt}],
    )
    return _text_of(resp)
