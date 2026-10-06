"""Human-vs-AI sampling game (local teaching game, no network activity)."""
from __future__ import annotations

import random

from .data import BENIGN, normalize_domain
from .dga_internals import generate

_BENIGN_POOL = list(dict.fromkeys([
    *BENIGN,
    "amazon.com", "netflix.com", "reddit.com", "adobe.com", "spotify.com",
    "dropbox.com", "salesforce.com", "zoom.us", "nasa.gov", "bbc.com",
]))


def sample_game_domains(engine, count: int = 8, seed: int = 42) -> dict:
    """Return a balanced, deterministically shuffled mix of legit + DGA domains.

    Each sample includes ground truth AND the local model's answer so the
    frontend can ask the human first, then reveal both. This is an honest-play
    teaching game: the payload is visible to the client by design.
    """
    if not 2 <= count <= 40:
        raise ValueError("count must be between 2 and 40")
    rng = random.Random(seed)
    n_dga = count // 2
    n_benign = count - n_dga
    benign = [rng.choice(_BENIGN_POOL) for _ in range(n_benign)]
    dga: list[str] = []
    algorithms = ["lcg", "md5", "dictionary"]
    per_algo = (n_dga // len(algorithms)) + 1
    for index, algorithm in enumerate(algorithms):
        dga.extend(generate(algorithm, seed + index, "2026-01-01", per_algo))
    dga = dga[:n_dga]
    items = [{"domain": normalize_domain(d), "label": "LEGITIMATE"} for d in benign]
    items += [{"domain": normalize_domain(d), "label": "DGA"} for d in dga]
    rng.shuffle(items)
    samples = []
    for item in items:
        try:
            prediction = engine.predict(item["domain"], include_explanation=False)
            model_verdict, model_prob = prediction.verdict, round(float(prediction.probability), 4)
            family = prediction.family.get("name", "unknown")
        except ValueError:
            model_verdict, model_prob, family = "LEGITIMATE", 0.0, "unknown"
        samples.append({**item, "model_verdict": model_verdict, "model_probability": model_prob, "family": family})
    model_correct = sum(1 for s in samples if s["model_verdict"] == s["label"])
    return {
        "seed": seed,
        "count": len(samples),
        "samples": samples,
        "model_accuracy": round(model_correct / max(1, len(samples)), 4),
        "note": "Balanced local teaching round. Labels are known because every domain was generated or chosen locally.",
    }
