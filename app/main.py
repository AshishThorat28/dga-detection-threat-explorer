from __future__ import annotations
from contextlib import asynccontextmanager
from functools import lru_cache
import json
from pathlib import Path
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from .schemas import AdversarialRequest, BatchRequest, DomainRequest, EvasionLoopRequest, EvasionRetrainRequest, GenerateRequest, SimulationRequest, UnseenExperimentRequest
from . import services
from src.adversarial import mutate_domain
from src.dga_internals import generate
from src.evasion import retrain_report, run_evasion_loop
from src.experiments import run_unseen
from src.game import sample_game_domains
from src.simulation import run_simulation

BASE = Path(__file__).resolve().parent

@lru_cache(maxsize=16)
def _cached_unseen(per_family: int, train_families: tuple[str, ...] | None, unseen_families: tuple[str, ...] | None):
    return run_unseen(
        per_family,
        list(train_families) if train_families is not None else None,
        list(unseen_families) if unseen_families is not None else None,
    )

@asynccontextmanager
async def lifespan(app: FastAPI):
    services.load_services()
    yield

app = FastAPI(title="DGA Detection Threat Explorer", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["http://127.0.0.1:8000", "http://localhost:8000"], allow_methods=["GET", "POST"], allow_headers=["*"])
app.mount("/static", StaticFiles(directory=BASE / "static"), name="static")

@app.get("/")
def index():
    return FileResponse(BASE / "static" / "index.html")

@app.get("/api/health")
def health():
    loaded = services.load_services()
    payload = {"status": "ok", "models_loaded": list(loaded.models), "dataset_stats": {"domains": loaded.dataset_size, "families": loaded.families, "source": loaded.training_source}, "versions": {"python": "3.10+", "seed": 42}}
    warnings = getattr(loaded, "load_warnings", [])
    if warnings:
        payload["load_warnings"] = warnings
    return payload

@app.post("/api/predict")
def api_predict(request: DomainRequest):
    try: return services.predict(request.domain)
    except ValueError as exc: raise HTTPException(422, detail=str(exc)) from exc

@app.post("/api/predict/batch")
def api_batch(request: BatchRequest):
    try:
        results = [services.predict(domain) for domain in request.domains]
        return {"results": results, "summary": {"total": len(results), "dga": sum(row["verdict"] == "DGA" for row in results), "legitimate": sum(row["verdict"] == "LEGITIMATE" for row in results)}}
    except ValueError as exc:
        raise HTTPException(422, detail=str(exc)) from exc

@app.post("/api/explain")
def api_explain(request: DomainRequest):
    try:
        prediction = services.load_services().predict(request.domain)
        return {"domain": prediction.domain, "verdict": prediction.verdict, "probability": prediction.probability, **prediction.explanation}
    except ValueError as exc:
        raise HTTPException(422, detail=str(exc)) from exc

@app.post("/api/experiments/unseen")
def api_unseen_experiment(request: UnseenExperimentRequest):
    try:
        train_families = tuple(sorted(set(request.train_families))) if request.train_families is not None else None
        unseen_families = tuple(sorted(set(request.unseen_families))) if request.unseen_families is not None else None
        return _cached_unseen(request.per_family, train_families, unseen_families)
    except ValueError as exc:
        raise HTTPException(422, detail=str(exc)) from exc

@app.post("/api/adversarial")
def api_adversarial(request: AdversarialRequest):
    engine = services.load_services()
    try:
        original = engine.predict(request.domain, include_explanation=False)
        modified_domain = mutate_domain(
            original.domain, request.length, request.randomness, request.digit_ratio,
            request.vowel_ratio, request.meaningful_word, request.seed,
        )
        modified = engine.predict(modified_domain, include_explanation=False)
        feature_changes = {
            name: round(modified.features[name] - original.features[name], 5)
            for name in original.features
        }
        return {
            "original": original.__dict__,
            "modified_domain": modified_domain,
            "modified": modified.__dict__,
            "confidence_change": round(modified.probability - original.probability, 5),
            "feature_changes": feature_changes,
        }
    except ValueError as exc:
        raise HTTPException(422, detail=str(exc)) from exc

@app.post("/api/simulate")
def api_simulate(request: SimulationRequest):
    try:
        return run_simulation(
            services.load_services(), request.algorithm, request.seed,
            request.date, request.count, request.benign_count,
        )
    except ValueError as exc:
        raise HTTPException(422, detail=str(exc)) from exc

@app.post("/api/evasion/loop")
def api_evasion_loop(request: EvasionLoopRequest):
    """Defensive robustness test: mutate DGA strings until the local model misses."""
    try:
        if request.domains:
            domains = request.domains
        else:
            domains = generate(request.algorithm, request.seed, request.date, request.count)
        return run_evasion_loop(
            services.load_services(), domains,
            rounds=request.rounds, tries_per_domain=request.tries_per_domain, seed=request.seed,
        )
    except ValueError as exc:
        raise HTTPException(422, detail=str(exc)) from exc

@app.post("/api/evasion/retrain")
def api_evasion_retrain(request: EvasionRetrainRequest):
    """Teaching-lab refit on evasive samples; does not overwrite the saved bundle."""
    try:
        return retrain_report(
            services.load_services(), request.evasive_domains, request.benign_domains,
        )
    except ValueError as exc:
        raise HTTPException(422, detail=str(exc)) from exc

@app.get("/api/game/sample")
def api_game_sample(count: int = 8, seed: int = 42):
    try:
        return sample_game_domains(services.load_services(), count=count, seed=seed)
    except ValueError as exc:
        raise HTTPException(422, detail=str(exc)) from exc

@app.post("/api/generate")
def api_generate(request: GenerateRequest):
    try:
        domains = generate(request.algorithm, request.seed, request.date, request.count)
        results = [services.predict(domain) for domain in domains]
        return {"algorithm": request.algorithm, "domains": results, "caught": sum(row["verdict"] == "DGA" for row in results), "count": len(results)}
    except ValueError as exc: raise HTTPException(422, detail=str(exc)) from exc

@app.post("/api/robustness")
def api_robustness(request: DomainRequest):
    try:
        return {"results": services.load_services().robustness(request.domain)}
    except ValueError as exc:
        raise HTTPException(422, detail=str(exc)) from exc

@app.post("/api/typosquat")
def api_typosquat(request: DomainRequest):
    """Lookalike check: exact brand hit or ≤2 edits from a known brand (local list)."""
    from src.data import normalize_domain, split_domain
    from src.typosquat import check_typosquat

    try:
        domain = normalize_domain(request.domain)
        if not domain or len(domain) > 253:
            raise ValueError("domain must be a non-empty domain no longer than 253 characters")
        sld, _ = split_domain(domain)
        return {"domain": domain, **check_typosquat(sld)}
    except ValueError as exc:
        raise HTTPException(422, detail=str(exc)) from exc

@app.get("/api/points")
def points():
    path = BASE.parent / "results" / "points3d.json"
    try: return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError: return []

@app.get("/api/results")
def results(): return services.load_services().result_payload()

@app.get("/api/export")
def export(fmt: str = "csv"):
    if fmt not in {"csv", "json"}: raise HTTPException(400, detail="format must be csv or json")
    media, content = services.export_history(fmt)
    return Response(content, media_type=media, headers={"Content-Disposition": f"attachment; filename=scan-history.{fmt}"})
