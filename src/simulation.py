"""Local attack-versus-defense simulation; no network activity is performed."""
from __future__ import annotations

import random
from time import perf_counter

from .data import BENIGN
from .dga_internals import generate
from .inference import InferenceEngine


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
    controls = random.Random(seed).choices(BENIGN, k=benign_count)
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
        "note": "Ground truth is known because this simulation creates the DGA samples and benign controls locally. It is not a real-traffic performance estimate.",
    }