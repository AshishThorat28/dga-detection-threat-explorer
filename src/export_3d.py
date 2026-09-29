from __future__ import annotations
import json
from pathlib import Path
from .data import load_dataset
from .inference import InferenceEngine

def export_points(count=5000):
    root = Path(__file__).resolve().parents[1]; frame = load_dataset(per_family=max(20, count // 8)); engine = InferenceEngine(frame)
    points = []
    for row in frame.head(count).itertuples():
        x, y, z = engine.coordinates(row.domain); points.append({"x": x, "y": y, "z": z, "label": int(row.label), "family": row.family, "domain": row.domain, "seen_flag": True})
    root.joinpath("results").mkdir(exist_ok=True); (root / "results" / "points3d.json").write_text(json.dumps(points), encoding="utf-8")
    return points

if __name__ == "__main__": print(f"exported {len(export_points())} points")
