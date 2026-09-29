from __future__ import annotations
import math
import re
from collections import Counter
import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer

WORDS = {"google", "microsoft", "github", "wiki", "python", "cloud", "river", "stone", "light", "green", "signal", "safe"}

def _entropy(text: str) -> float:
    counts = Counter(text)
    return -sum((n / len(text)) * math.log2(n / len(text)) for n in counts.values()) if text else 0.0

def handcrafted(domain: str, include_tld: bool = True) -> dict[str, float]:
    parts = domain.split(".")
    sld = parts[-2] if len(parts) > 1 else parts[0]
    tld = parts[-1] if len(parts) > 1 else ""
    text = sld + (tld if include_tld else "")
    vowels = sum(ch in "aeiou" for ch in sld)
    consonants = sum(ch.isalpha() and ch not in "aeiou" for ch in sld)
    digits = sum(ch.isdigit() for ch in sld)
    runs = re.findall(r"[^aeiou\W\d_]+", sld)
    words = re.findall(r"[a-z]+", sld)
    covered = sum(word in WORDS for word in words)
    return {"length": float(len(text)), "entropy": _entropy(text), "vowel_ratio": vowels / max(1, len(sld)), "consonant_ratio": consonants / max(1, len(sld)), "digit_ratio": digits / max(1, len(sld)), "hyphen_count": float(sld.count("-")), "longest_consonant_run": float(max(map(len, runs), default=0)), "unique_ratio": len(set(sld)) / max(1, len(sld)), "dictionary_coverage": covered / max(1, len(words)), "tld_length": float(len(tld))}

def handcrafted_frame(domains: list[str], include_tld: bool = True) -> pd.DataFrame:
    return pd.DataFrame([handcrafted(domain, include_tld) for domain in domains]).fillna(0.0)

def build_vectorizer(domains: list[str]) -> TfidfVectorizer:
    return TfidfVectorizer(analyzer="char", ngram_range=(2, 4), min_df=1, max_features=12000, lowercase=True)
