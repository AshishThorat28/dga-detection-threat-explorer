"""Defensive evasion-robustness loop (local only, no network activity).

The attacker here is a bounded, deterministic string-mutation search that tries
to make DGA-looking domains score as benign *against the local model only*.
It exists to demonstrate the arms race and to produce labeled evasive samples
for offline retraining — never to attack real infrastructure.
"""
from __future__ import annotations

import random

from .adversarial import mutate_domain
from .data import normalize_domain

_WORDS = ["cloud", "signal", "safe", "green", "light", "north", "maple", "orbit"]


def evade_single(engine, domain: str, tries: int = 24, seed: int = 42) -> dict:
    """Search bounded mutations of ``domain`` for the lowest DGA score."""
    base = normalize_domain(domain)
    try:
        original = engine.predict(base, include_explanation=False)
    except ValueError:
        original = None
    original_prob = float(original.probability) if original else 1.0

    rng = random.Random(f"{seed}:{base}")
    best_domain, best_prob = base, original_prob
    for attempt in range(max(1, tries)):
        candidate = mutate_domain(
            base,
            length=rng.choice([10, 12, 14, 16, 18]),
            randomness=rng.uniform(0.35, 0.9),
            digit_ratio=rng.choice([0.0, 0.05, 0.1, 0.15]),
            vowel_ratio=rng.uniform(0.3, 0.5),
            meaningful_word=rng.choice(["", rng.choice(_WORDS)]),
            seed=seed + attempt,
        )
        try:
            scored = engine.predict(candidate, include_explanation=False)
        except ValueError:
            continue
        if scored.probability < best_prob:
            best_domain, best_prob = candidate, float(scored.probability)
            if best_prob < 0.5:
                break
    return {
        "original_domain": base,
        "original_probability": round(original_prob, 4),
        "evasive_domain": best_domain,
        "evasive_probability": round(best_prob, 4),
        "evaded": bool(best_prob < 0.5),
    }


def run_evasion_loop(
    engine,
    domains: list[str],
    rounds: int = 5,
    tries_per_domain: int = 12,
    seed: int = 42,
) -> dict:
    """Iterate attack steps; each round mutates currently-detected domains."""
    if not 1 <= len(domains) <= 200:
        raise ValueError("domains must contain 1-200 entries")
    if not 1 <= rounds <= 10:
        raise ValueError("rounds must be between 1 and 10")
    current = [normalize_domain(d) for d in domains]
    round_rows: list[dict] = []
    evasive_bank: dict[str, dict] = {}
    for current_round in range(rounds + 1):
        scored = []
        for domain in current:
            try:
                prediction = engine.predict(domain, include_explanation=False)
                prob = float(prediction.probability)
            except ValueError:
                prob = 1.0
            scored.append({"domain": domain, "probability": round(prob, 4), "detected": bool(prob >= 0.5)})
        detected = sum(1 for row in scored if row["detected"])
        round_rows.append({
            "round": current_round,
            "domains": len(scored),
            "detected": detected,
            "evaded": len(scored) - detected,
            "detection_rate": round(detected / max(1, len(scored)), 4),
            "examples": scored[:6],
        })
        if current_round == rounds:
            break
        # Attacker mutates only the still-detected domains for the next round.
        nxt: list[str] = []
        for row in scored:
            if not row["detected"]:
                nxt.append(row["domain"])
                continue
            result = evade_single(engine, row["domain"], tries=tries_per_domain, seed=seed + current_round)
            evasive_bank[result["evasive_domain"]] = result
            nxt.append(result["evasive_domain"])
        current = nxt
    return {
        "rounds": round_rows,
        "evasive_samples": sorted(evasive_bank),
        "evasive_details": list(evasive_bank.values())[:24],
        "note": (
            "Local defensive robustness test only. Mutations are scored against "
            "this service's own model; nothing is sent to any network."
        ),
    }


def retrain_report(engine, evasive_domains: list[str], benign_domains: list[str] | None = None) -> dict:
    """Fit a teaching-lab LR on evasives + benign controls and compare.

    The production bundle is NOT overwritten. The vectorizer vocabulary is
    frozen; a fresh logistic-regression head is trained on the small
    evasion set to show before/after detection on those same samples.
    """
    from sklearn.linear_model import LogisticRegression

    evasives = [normalize_domain(d) for d in evasive_domains if normalize_domain(d)]
    if not 1 <= len(evasives) <= 500:
        raise ValueError("provide 1-500 evasive domains")
    benign = [normalize_domain(d) for d in (benign_domains or [
        "google.com", "github.com", "wikipedia.org", "python.org",
        "mozilla.org", "ubuntu.com", "cloudflare.com", "apple.com",
    ]) if normalize_domain(d)]
    if not benign:
        raise ValueError("provide at least one benign control domain")

    def detection_rate(items: list[str]) -> tuple[float, list[float]]:
        probs = []
        for domain in items:
            try:
                probs.append(float(engine.predict(domain, include_explanation=False).probability))
            except ValueError:
                probs.append(1.0)
        rate = sum(p >= 0.5 for p in probs) / max(1, len(probs))
        return round(rate, 4), [round(p, 4) for p in probs]

    before_rate, before_probs = detection_rate(evasives)
    matrix = engine.vectorizer.transform(evasives + benign)
    import numpy as np

    labels = np.array([1] * len(evasives) + [0] * len(benign))
    head = LogisticRegression(max_iter=500, random_state=42, class_weight="balanced")
    head.fit(matrix, labels)
    after_probs = [round(float(p), 4) for p in head.predict_proba(matrix)[:, 1][: len(evasives)]]
    after_rate = round(sum(p >= 0.5 for p in after_probs) / max(1, len(after_probs)), 4)
    return {
        "evasive_count": len(evasives),
        "benign_controls": len(benign),
        "before": {"detection_rate": before_rate, "probabilities": before_probs[:24]},
        "after": {"detection_rate": after_rate, "probabilities": after_probs[:24]},
        "delta": round(after_rate - before_rate, 4),
        "note": (
            "Teaching-lab refit only: a fresh LR head on the frozen vectorizer, "
            "evaluated on the same evasive set. Retrain the full bundle offline "
            "with `python -m src.train` for real weights."
        ),
    }
