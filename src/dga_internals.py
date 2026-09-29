"""Deterministic, non-networking DGA teaching generators."""
from __future__ import annotations
from datetime import date
import hashlib
import random
import string

WORDS = ["blue", "cloud", "river", "stone", "light", "green", "quiet", "north", "safe", "signal", "maple", "orbit"]


def lcg_dga(seed: int, day: str | date, count: int = 20) -> list[str]:
    """LCG: x[n+1] = (a*x[n] + c) mod m, encoded as domain labels."""
    stamp = str(day).replace("-", "")
    state = (int(seed) ^ int(stamp)) & 0x7FFFFFFF
    a, c, modulus = 1103515245, 12345, 2**31
    domains = []
    for _ in range(count):
        chars = []
        for _ in range(12):
            state = (a * state + c) % modulus
            chars.append(string.ascii_lowercase[state % 26])
        domains.append("".join(chars) + ".com")
    return domains


def md5_date_dga(seed: int, day: str | date, count: int = 20) -> list[str]:
    """Date-seeded hashing lets malware and its operator recreate the same list."""
    material = f"{seed}:{day}"
    return [hashlib.md5(f"{material}:{index}".encode()).hexdigest()[:14] + ".net" for index in range(count)]


def dictionary_dga(seed: int, day: str | date, count: int = 20) -> list[str]:
    """Word concatenation demonstrates dictionary DGAs that look less random."""
    rng = random.Random(f"{seed}:{day}")
    return [rng.choice(WORDS) + rng.choice(WORDS) + str(rng.randrange(10, 99)) + ".org" for _ in range(count)]


def generate(algorithm: str, seed: int, day: str, count: int) -> list[str]:
    if not 1 <= count <= 500:
        raise ValueError("count must be between 1 and 500")
    generators = {"lcg": lcg_dga, "md5": md5_date_dga, "dictionary": dictionary_dga}
    if algorithm not in generators:
        raise ValueError(f"algorithm must be one of {', '.join(generators)}")
    return generators[algorithm](seed, day, count)
