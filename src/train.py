"""Train and persist the project classifiers."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd

from .data import load_dataset, load_labeled_dataset
from .experiments import run_unseen
from .inference import InferenceEngine

ROOT = Path(__file__).resolve().parents[1]


def _arguments(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dga-csv", help="Labeled DGA CSV with domain and class columns")
    parser.add_argument("--tranco-csv", help="Optional headerless rank,domain Tranco CSV")
    parser.add_argument(
        "--max-per-class", type=int, default=20_000,
        help="Maximum benign and total DGA rows to sample each (0 uses every valid row)",
    )
    parser.add_argument("--epochs", type=int, default=5, help="LSTM/CNN training epochs")
    parser.add_argument("--batch-size", type=int, default=256, help="LSTM/CNN batch size")
    parser.add_argument("--models-dir", type=Path, default=ROOT / "models")
    args = parser.parse_args(argv)
    if args.tranco_csv and not args.dga_csv:
        parser.error("--tranco-csv requires --dga-csv")
    if args.max_per_class < 0:
        parser.error("--max-per-class must be zero or positive")
    if args.epochs < 1 or args.batch_size < 1:
        parser.error("--epochs and --batch-size must be positive")
    return args


def main(argv: list[str] | None = None) -> None:
    args = _arguments(argv)
    if args.dga_csv:
        frame = load_labeled_dataset(
            args.dga_csv, args.tranco_csv, max_per_class=args.max_per_class,
        )
        engine = InferenceEngine(
            frame,
            include_extended=True,
            epochs=args.epochs,
            batch_size=args.batch_size,
        )
        engine.training_source = "labeled DGA dataset"
    else:
        frame = load_dataset(per_family=1000)
        engine = InferenceEngine(frame)
        engine.training_source = "synthetic fallback"

    args.models_dir.mkdir(parents=True, exist_ok=True)
    engine.save_artifacts(args.models_dir)
    results_dir = ROOT / "results"
    (results_dir / "figures").mkdir(parents=True, exist_ok=True)
    rows = [{
        "model": model_name,
        **engine.all_metrics[model_name],
        "test_examples": engine.test_counts["total"],
        "test_benign": engine.test_counts["benign"],
        "test_dga": engine.test_counts["dga"],
        "dataset": engine.training_source,
        "note": "Random holdout; domains are deduplicated by registrable label.",
    } for model_name in engine.models]
    pd.DataFrame(rows).to_csv(results_dir / "metrics.csv", index=False)
    frame.groupby("family").size().rename("count").reset_index().to_csv(
        results_dir / "per_family.csv", index=False,
    )

    if not args.dga_csv:
        unseen = run_unseen(per_family=100)
        unseen_rows = [{
            "family": row["unseen_family"],
            "model": "LR",
            "f1": row["unseen"]["f1"],
            "drop": round(row["known"]["f1"] - row["unseen"]["f1"], 4),
            "dga_samples": row["dga_samples"],
            "benign_controls": row["benign_controls"],
        } for row in unseen["per_family"]]
        pd.DataFrame(unseen_rows, columns=[
            "family", "model", "f1", "drop", "dga_samples", "benign_controls",
        ]).to_csv(results_dir / "unseen_family_results.csv", index=False)
    else:
        pd.DataFrame(columns=[
            "family", "model", "f1", "drop", "dga_samples", "benign_controls",
        ]).to_csv(results_dir / "unseen_family_results.csv", index=False)

    (results_dir / "robustness.json").write_text(
        json.dumps(engine.robustness("google.com"), indent=2), encoding="utf-8",
    )
    points = []
    for row in frame.head(5000).itertuples():
        x, y, z = engine.coordinates(row.domain)
        points.append({
            "x": x, "y": y, "z": z, "label": int(row.label),
            "family": row.family, "domain": row.domain, "seen_flag": True,
        })
    (results_dir / "points3d.json").write_text(json.dumps(points), encoding="utf-8")
    print(f"trained {len(engine.models)} models on {len(frame)} domains")
    print(pd.DataFrame(rows)[
        ["model", "accuracy", "precision", "recall", "f1", "roc_auc"]
    ].to_string(index=False))


if __name__ == "__main__":
    main()
