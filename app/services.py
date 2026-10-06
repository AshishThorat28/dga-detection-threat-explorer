from __future__ import annotations
import csv
import io
from pathlib import Path
from src.data import load_dataset
from src.dga_internals import generate
from src.inference import InferenceEngine

ROOT = Path(__file__).resolve().parents[1]
engine: InferenceEngine | None = None
history: list[dict] = []

def load_services() -> InferenceEngine:
    global engine
    if engine is None:
        artifact = ROOT / "models" / "model_bundle.joblib"
        if artifact.is_file():
            try:
                engine = InferenceEngine.from_artifacts(artifact.parent)
            except Exception:
                # Stale or partial bundle (e.g. Keras/sklearn version drift,
                # missing optional deps): fall back to the synthetic baseline
                # so the API stays up. Retrain to rebuild the full bundle.
                engine = InferenceEngine(load_dataset(per_family=240))
                engine.training_source = "synthetic fallback (saved bundle incompatible)"
        else:
            engine = InferenceEngine(load_dataset(per_family=240))
    return engine

def predict(domain: str) -> dict:
    result = load_services().predict(domain).__dict__
    history.append(result)
    return result

def export_history(fmt: str) -> tuple[str, str]:
    if fmt == "json": return "application/json", __import__("json").dumps(history, indent=2)
    output = io.StringIO()
    fields = ["domain", "verdict", "probability", "risk"]
    writer = csv.DictWriter(output, fieldnames=fields); writer.writeheader()
    writer.writerows({key: row.get(key) for key in fields} for row in history)
    return "text/csv", output.getvalue()
