from __future__ import annotations
from pathlib import Path
import pandas as pd
from .data import load_dataset
from .inference import InferenceEngine

def run():
    root = Path(__file__).resolve().parents[1]
    engine = InferenceEngine(load_dataset(per_family=1000))
    rows = [{"model": name, **engine.metrics, "dataset": "balanced"} for name in engine.models]
    root.joinpath("results").mkdir(exist_ok=True)
    pd.DataFrame(rows).to_csv(root / "results" / "metrics.csv", index=False)
    return pd.DataFrame(rows)

if __name__ == "__main__": print(run().to_string(index=False))
