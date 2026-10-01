"""The tool's shared reference data: what a ₹/sqft rate should roughly look like,
what each kind of room is expected to have priced, and the default must-have list
shown to a first-time user. All of it is editable from the page itself; this is
just the starting point.

These ranges are indicative, tier-1-India ballpark figures based on general market
knowledge — not a live, sourced dataset. Treat a flag as a reason to ask the vendor
a question, not as a verified fact.
"""

CATEGORIES = {
    "wardrobe": {"label": "Wardrobe (laminate)", "low": 1100, "high": 1700},
    "wardrobe_acrylic": {"label": "Wardrobe (acrylic / high-gloss)", "low": 1800, "high": 2600},
    "loft": {"label": "Loft unit", "low": 650, "high": 950},
    "dressing_unit": {"label": "Dressing unit", "low": 1300, "high": 1800},
    "cot_bed": {"label": "Cot / bed", "low": None, "high": None},
    "headboard": {"label": "Headboard / cot-back", "low": None, "high": None},
    "kitchen_base": {"label": "Kitchen base unit (laminate)", "low": 1300, "high": 1800},
    "kitchen_base_acrylic": {"label": "Kitchen base unit (acrylic)", "low": 2000, "high": 2900},
    "kitchen_wall": {"label": "Kitchen wall / overhead unit (laminate)", "low": 1200, "high": 1700},
    "kitchen_wall_acrylic": {"label": "Kitchen wall / overhead unit (acrylic)", "low": 1900, "high": 2700},
    "kitchen_tall": {"label": "Kitchen tall unit", "low": 1300, "high": 1900},
    "tv_unit": {"label": "TV / entertainment unit", "low": 1100, "high": 1600},
    "study_unit": {"label": "Study / work unit", "low": 1200, "high": 1700},
    "false_ceiling_shell": {"label": "False ceiling (shell only, no electrical)", "low": 70, "high": 130},
    "false_ceiling_lit": {"label": "False ceiling (with lighting + wiring)", "low": 220, "high": 420},
    "pooja_unit": {"label": "Pooja unit", "low": 1300, "high": 2000},
    "shoe_rack": {"label": "Shoe rack", "low": 1100, "high": 1600},
    "accessory": {"label": "Accessory / hardware piece", "low": None, "high": None},
    "design_fee": {"label": "Design / rendering fee", "low": None, "high": None},
    "other": {"label": "Other / not benchmarked", "low": None, "high": None},
}

# Keyword -> categories a room of that kind is normally expected to have priced.
# Used to flag e.g. a kitchen with no wall/overhead unit, even if the user never
# thought to ask for that check explicitly.
ROOM_EXPECTATIONS = {
    "kitchen": {"keywords": ["kitchen"], "expect": ["kitchen_base", "kitchen_wall"]},
    "pantry": {"keywords": ["pantry", "utility"], "expect": ["kitchen_base"]},
    "bedroom": {"keywords": ["bedroom", "master", "guest room", "br "], "expect": ["wardrobe", "loft"]},
    "living": {"keywords": ["living", "hall", "drawing"], "expect": ["tv_unit"]},
    "study": {"keywords": ["study", "office"], "expect": ["study_unit"]},
    "pooja": {"keywords": ["pooja", "puja"], "expect": ["pooja_unit"]},
}

DEFAULT_REQUIREMENTS = [
    "False ceiling in every bedroom",
    "Cot and headboard in the main bedrooms",
    "Kitchen false ceiling with focus light",
    "Pooja unit: backpanel, top, storage, lighting, false ceiling",
    "Shoe rack",
    "Lighting / electrical wiring scope stated clearly",
    "GST rate stated (should read 18% for this kind of work)",
    "Warranty terms stated",
    "Design / 3D rendering charge stated",
]


def category_list_text() -> str:
    return "\n".join(f"{key} — {val['label']}" for key, val in CATEGORIES.items())


def room_type_for(room_name: str):
    """Best-effort guess at which expectation bucket a free-text room name belongs to."""
    name = (room_name or "").lower()
    for room_type, cfg in ROOM_EXPECTATIONS.items():
        if any(kw in name for kw in cfg["keywords"]):
            return room_type
    return None
