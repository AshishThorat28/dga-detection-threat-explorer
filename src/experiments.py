"""Deterministic family-held-out evaluation for binary DGA detection."""
from __future__ import annotations

from statistics import mean

import pandas as pd
from sklearn.model_selection import train_test_split

from .data import load_dataset
from .inference import InferenceEngine
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score


METRICS = ("accuracy", "precision", "recall", "f1")


def _scores(expected, predicted) -> dict[str, float]:
    return {
        "accuracy": float(accuracy_score(expected, predicted)),
        "precision": float(precision_score(expected, predicted, zero_division=0)),
        "recall": float(recall_score(expected, predicted, zero_division=0)),
        "f1": float(f1_score(expected, predicted, zero_division=0)),
    }


def _average(rows: list[dict[str, float]]) -> dict[str, float]:
    return {metric: round(mean(row[metric] for row in rows), 4) for metric in METRICS}


def run_unseen(
    per_family: int = 120,
    train_families: list[str] | None = None,
    unseen_families: list[str] | None = None,
) -> dict:
    frame = load_dataset(per_family=per_family)
    available = sorted(family for family in frame.family.unique() if family != "benign")
    benign = frame[frame.family == "benign"]
    benign_train, benign_controls = train_test_split(benign, test_size=.5, random_state=42)
    requested_train = sorted(set(train_families)) if train_families is not None else None
    requested_unseen = sorted(set(unseen_families)) if unseen_families is not None else None
    for requested in (requested_train, requested_unseen):
        if requested is not None and not set(requested).issubset(available):
            raise ValueError(f"families must be selected from: {', '.join(available)}")

    if requested_train is None and requested_unseen is None:
        scenarios = [(family, [candidate for candidate in available if candidate != family]) for family in available]
    else:
        held_out = requested_unseen or [family for family in available if family not in (requested_train or [])]
        training = requested_train or [family for family in available if family not in held_out]
        if set(training) & set(held_out):
            raise ValueError("training and unseen families must not overlap")
        if not training or not held_out:
            raise ValueError("select at least one training family and one unseen family")
        scenarios = [(family, training) for family in held_out]

    rows = []
    for held_out, training_families in scenarios:
        train_frame = pd.concat([benign_train, frame[frame.family.isin(training_families)]], ignore_index=True)
        dga_samples = frame[frame.family == held_out]
        test_frame = pd.concat([dga_samples, benign_controls], ignore_index=True)
        engine = InferenceEngine(train_frame, include_baselines=False)
        test_x = engine.vectorizer.transform(test_frame.domain.tolist())
        predicted = engine.models["LR"].predict(test_x)
        rows.append({
            "unseen_family": held_out,
            "training_families": training_families,
            "dga_samples": int(len(dga_samples)),
            "benign_controls": int(len(benign_controls)),
            "sample_count": int(len(test_frame)),
            "known": {metric: round(float(engine.metrics[metric]), 4) for metric in METRICS},
            "unseen": _scores(test_frame.label.to_numpy(), predicted),
        })

    known = _average([row["known"] for row in rows])
    unseen = _average([row["unseen"] for row in rows])
    return {
        "model": "LR",
        "per_family": rows,
        "known_macro": known,
        "unseen_macro": unseen,
        "generalization_gap": round(known["f1"] - unseen["f1"], 4),
        "per_family_size": per_family,
        "note": "Known scores are random held-out samples from selected training families. Each unseen test combines the entire excluded DGA family with benign controls reserved before fitting. The benign vocabulary is small and these synthetic results are not production estimates.",
    }
