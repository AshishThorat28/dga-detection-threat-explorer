"""Lookalike / typosquatting check against a small brand list (local only).

This is separate from DGA scoring: a domain can be non-DGA yet still be a
brand lookalike (e.g. ``amozon.in`` vs ``amazon``). Returns a flag plus the
matched brand and reason so the UI can warn without changing the verdict.
"""
from __future__ import annotations

BRANDS = [
    "amazon", "google", "microsoft", "apple", "paypal", "facebook",
    "instagram", "netflix", "flipkart", "hdfcbank", "sbi", "icici",
]

# Common homoglyph / leet substitutions normalized before comparison.
_HOMOGLYPHS = str.maketrans({
    "0": "o", "1": "l", "3": "e", "4": "a", "5": "s",
    "6": "g", "7": "t", "8": "b", "9": "g",
    "@": "a", "$": "s", "!": "l",
})


def normalize_lookalike(text: str) -> str:
    return text.lower().translate(_HOMOGLYPHS)


def levenshtein(a: str, b: str) -> int:
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def check_typosquat(sld: str) -> dict:
    """Flag ``sld`` if it is an exact brand hit or a close lookalike."""
    raw = (sld or "").lower().strip()
    norm = normalize_lookalike(raw).strip("-")
    if not norm:
        return {"flagged": False, "brand": None, "reason": None, "distance": None}
    for brand in BRANDS:
        if norm == brand:
            return {
                "flagged": True, "brand": brand, "distance": 0,
                "reason": "exact brand-name match — verify the TLD and sender before trusting",
            }
    for brand in BRANDS:
        if len(brand) < 3 or len(norm) < 3:
            continue
        # brand embedded with extra words, e.g. amazonsupport, secure-paypal
        stripped = norm.replace("-", "")
        if brand in stripped and stripped != brand:
            return {
                "flagged": True, "brand": brand, "distance": levenshtein(stripped, brand),
                "reason": f"contains brand name '{brand}' with extra characters",
            }
        distance = levenshtein(norm, brand)
        # threshold scales with brand length: short brands get 1, longer get 2
        allowed = 1 if len(brand) <= 4 else 2
        if distance <= allowed:
            return {
                "flagged": True, "brand": brand, "distance": distance,
                "reason": f"1–2 edits away from brand '{brand}' (possible typosquat)",
            }
    return {"flagged": False, "brand": None, "reason": None, "distance": None}
