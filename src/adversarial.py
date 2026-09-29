"""Deterministic domain-string mutations for the robustness teaching lab."""
from __future__ import annotations

import random
import re

from .data import normalize_domain, split_domain


def mutate_domain(
    domain: str,
    length: int,
    randomness: float,
    digit_ratio: float,
    vowel_ratio: float,
    meaningful_word: str = "",
    seed: int = 42,
) -> str:
    normalized = normalize_domain(domain)
    label, suffix = split_domain(normalized)
    source = "".join(char for char in label if char.isascii() and char.isalnum()) or "domain"
    word = meaningful_word.strip().lower()
    if word and not re.fullmatch(r"[a-z]+", word):
        raise ValueError("meaningful_word must contain ASCII letters only")

    rng = random.Random(seed)
    digit_count = min(length, round(length * digit_ratio))
    vowel_count = min(length - digit_count, round(length * vowel_ratio))
    slots = ["vowel"] * vowel_count + ["digit"] * digit_count
    slots.extend(["consonant"] * (length - len(slots)))
    for _ in range(round(length * randomness)):
        first, second = rng.randrange(length), rng.randrange(length)
        slots[first], slots[second] = slots[second], slots[first]

    pools = {"vowel": "aeiou", "consonant": "bcdfghjklmnpqrstvwxyz", "digit": "0123456789"}
    characters = []
    for index, category in enumerate(slots):
        pool = pools[category]
        original = source[index % len(source)]
        if original in pool and rng.random() >= randomness:
            characters.append(original)
        elif rng.random() < randomness:
            characters.append(rng.choice(pool))
        else:
            characters.append(pool[index % len(pool)])

    if word:
        word = word[:length]
        start = (length - len(word)) // 2
        characters[start:start + len(word)] = word
    mutated = "".join(characters)
    return f"{mutated}.{suffix}" if suffix else mutated