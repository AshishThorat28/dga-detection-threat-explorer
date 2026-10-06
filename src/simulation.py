"""Local attack-versus-defense simulation; no network activity is performed."""
from __future__ import annotations

import random
from time import perf_counter

from .dga_internals import generate
from .inference import InferenceEngine

SIMULATION_CONTROLS = [
    "amazon.com", "netflix.com", "reddit.com", "adobe.com", "spotify.com",
    "dropbox.com", "salesforce.com", "zoom.us", "ikea.com", "nasa.gov",
    "bbc.com", "nytimes.com",
]


def run_simulation(
    engine: InferenceEngine,
    algorithm: str,
    seed: int,
    day: str,
    count: int,
    benign_count: int,
) -> dict:
    started = perf_counter()
    generated = generate(algorithm, seed, day, count)
    controls = random.Random(seed).choices(SIMULATION_CONTROLS, k=benign_count)
    rows = []
    for domain in generated:
        prediction = engine.predict(domain, include_explanation=False)
        rows.append({"domain": domain, "expected": "DGA", "alert": prediction.verdict == "DGA", "verdict": prediction.verdict, "probability": prediction.probability})
    for domain in controls:
        prediction = engine.predict(domain, include_explanation=False)
        rows.append({"domain": domain, "expected": "LEGITIMATE", "alert": prediction.verdict == "DGA", "verdict": prediction.verdict, "probability": prediction.probability})

    true_positive = sum(row["expected"] == "DGA" and row["alert"] for row in rows)
    false_negative = sum(row["expected"] == "DGA" and not row["alert"] for row in rows)
    false_positive = sum(row["expected"] == "LEGITIMATE" and row["alert"] for row in rows)
    return {
        "algorithm": algorithm,
        "generated": count,
        "benign_controls": benign_count,
        "detected_dgas": true_positive,
        "false_positives": false_positive,
        "false_negatives": false_negative,
        "detection_rate": round(true_positive / count, 4),
        "processing_ms": round((perf_counter() - started) * 1000, 2),
        "alerts": [row for row in rows if row["alert"]],
        "results": rows,
        "note": "The benign controls are held out from training, but the set is small and repeated when benign_count exceeds its size. Ground truth is known because samples are selected or generated locally; this is not a real-traffic performance estimate.",
    }