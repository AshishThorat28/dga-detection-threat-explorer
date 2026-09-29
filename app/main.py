from __future__ import annotations
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, Response
from fastapi.staticfiles import StaticFiles
from .schemas import BatchRequest, DomainRequest, GenerateRequest
from . import services
from src.dga_internals import generate

@asynccontextmanager
async def lifespan(app: FastAPI):
    services.load_services()
    yield

app = FastAPI(title="DGA Detection Threat Explorer", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["http://127.0.0.1:8000", "http://localhost:8000"], allow_methods=["GET", "POST"], allow_headers=["*"])
app.mount("/static", StaticFiles(directory="app/static"), name="static")

@app.get("/", response_class=HTMLResponse)
def index():
    return HTMLResponse(open("app/static/index.html", encoding="utf-8").read())

@app.get("/api/health")
def health():
    loaded = services.load_services()
    return {"status": "ok", "models_loaded": list(loaded.models), "dataset_stats": {"domains": len(loaded.frame), "families": loaded.families}, "versions": {"python": "3.10+", "seed": 42}}

@app.post("/api/predict")
def api_predict(request: DomainRequest):
    try: return services.predict(request.domain)
    except ValueError as exc: raise HTTPException(422, detail=str(exc)) from exc

@app.post("/api/predict/batch")
def api_batch(request: BatchRequest):
    results = [services.predict(domain) for domain in request.domains]
    return {"results": results, "summary": {"total": len(results), "dga": sum(row["verdict"] == "DGA" for row in results), "legitimate": sum(row["verdict"] == "LEGITIMATE" for row in results)}}

@app.post("/api/explain")
def api_explain(request: DomainRequest):
    return {"domain": request.domain, "contributions": services.load_services().explain(request.domain)}

@app.post("/api/generate")
def api_generate(request: GenerateRequest):
    try:
        domains = generate(request.algorithm, request.seed, request.date, request.count)
        results = [services.predict(domain) for domain in domains]
        return {"algorithm": request.algorithm, "domains": results, "caught": sum(row["verdict"] == "DGA" for row in results), "count": len(results)}
    except ValueError as exc: raise HTTPException(422, detail=str(exc)) from exc

@app.post("/api/robustness")
def api_robustness(request: DomainRequest): return {"results": services.load_services().robustness(request.domain)}

@app.get("/api/points")
def points():
    path = "results/points3d.json"
    try: return __import__("json").load(open(path, encoding="utf-8"))
    except FileNotFoundError: return []

@app.get("/api/results")
def results(): return services.load_services().result_payload()

@app.get("/api/export")
def export(fmt: str = "csv"):
    if fmt not in {"csv", "json"}: raise HTTPException(400, detail="format must be csv or json")
    media, content = services.export_history(fmt)
    return Response(content, media_type=media, headers={"Content-Disposition": f"attachment; filename=scan-history.{fmt}"})
