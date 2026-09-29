"""Unseen-family experiment scaffold with deterministic family-held-out reporting."""
from .data import load_dataset
from .inference import InferenceEngine

def run_unseen():
    frame = load_dataset(per_family=250)
    return [{"family": family, "model": "LR", "f1": None, "drop": None} for family in sorted(frame.family.unique()) if family != "benign"]
