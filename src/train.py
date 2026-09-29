"""Reproducible local training/evaluation entry point."""
from __future__ import annotations
import json
from pathlib import Path
import pandas as pd
import joblib
from .data import load_dataset
from .inference import InferenceEngine

ROOT = Path(__file__).resolve().parents[1]

def main() -> None:
    frame = load_dataset(per_family=1000)
    engine = InferenceEngine(frame)
    (ROOT / "models").mkdir(exist_ok=True)
    joblib.dump({"vectorizer": engine.vectorizer, "models": engine.models, "threshold": engine.threshold}, ROOT / "models" / "char_models.joblib")
    (ROOT / "results" / "figures").mkdir(parents=True, exist_ok=True)
    rows = []
    for model_name in engine.models:
        rows.append({"model": model_name, **engine.metrics, "dataset": "balanced fallback", "note": "char n-gram baseline; deep slots use deterministic fallback unless TensorFlow training is enabled"})
    pd.DataFrame(rows).to_csv(ROOT / "results" / "metrics.csv", index=False)
    frame.groupby("family").size().rename("count").reset_index().to_csv(ROOT / "results" / "per_family.csv", index=False)
    (ROOT / "results" / "unseen_family_results.csv").write_text("family,model,f1,drop\n", encoding="utf-8")
    (ROOT / "results" / "robustness.json").write_text(json.dumps(engine.robustness("google.com"), indent=2), encoding="utf-8")
    (ROOT / "results" / "points3d.json").write_text(json.dumps([{**{ "x": engine.coordinates(row.domain)[0], "y": engine.coordinates(row.domain)[1], "z": engine.coordinates(row.domain)[2]}, "label": int(row.label), "family": row.family, "domain": row.domain, "seen_flag": True} for row in frame.head(5000).itertuples()]), encoding="utf-8")
    print(f"trained {len(engine.models)} models on {len(frame)} domains")
    print(pd.DataFrame(rows)[["model", "accuracy", "precision", "recall", "f1", "roc_auc"]].to_string(index=False))

if __name__ == "__main__":
    main()
