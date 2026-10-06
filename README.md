# DGA Detection & Threat Explorer

A local-first, reproducible teaching and research service for **domain-string-only
DGA screening**. It trains a 5-slot ensemble (LR, Random Forest, XGBoost,
character-level LSTM, character-level 1D-CNN), serves it over FastAPI, and ships a
dependency-free browser UI with detection, batch, 3D, lab, evasion-loop and
Human-vs-AI tools.

> **Research prototype — not a security control.** Default data is synthetic with a
> tiny benign vocabulary. Scores are ranking signals, not proof of maliciousness.
> Nothing resolves, contacts, or registers domains.

## Why this model suite fits the Top-3 roadmap

| Slot | Input | Role in the new features |
|---|---|---|
| `LR` | char 2–4-gram TF-IDF + 10 lexical features | Explainable baseline; logit attributions; lab refit head |
| `RF` | same sparse matrix | Strong classical reference; fast CPU inference |
| `XGB` | same sparse matrix | Best random-holdout F1 in `report/report.md`; hard-to-e‑vade gradient signal |
| `LSTM` | char sequence (SLD, ≤63) | Order-sensitive view that punishes random-looking strings differently from n-grams |
| `CNN` | char sequence (SLD, ≤63) | Local-motif view (runs, digit clusters) complementary to LSTM |

The displayed **DGA score is the mean of available slot probabilities**. Diversity is
the point: the evasion loop (#1) must fool *all* slots at once, and the Human-vs-AI
game (#3) compares human accuracy against that same ensemble. Keeping all five is
appropriate; dropping to classical-only would make evasion trivially easy and the
game less informative.

## Architecture

```text
domain string
  → normalize + split (tldextract, offline)
  → FeatureUnion[ char TF-IDF(2–4g, 12k) ‖ handcrafted(10) scaled ]
  → LR / RF / XGB  ─┐
  → char-id seq(63) → LSTM / CNN ─┤→ mean prob → verdict / risk / family / explanation
                                  └→ LR logit attributions (exact, LR-only)
```

Service layout: `app/` (FastAPI + static ES-module UI) over `src/` (data, features,
inference, training, evasion, game, simulation). Training writes
`models/model_bundle.joblib` + `lstm.keras`/`cnn.keras`; the API loads the bundle
if present, else the synthetic fallback. Stale Keras bundles are skipped slot-wise
with a `load_warnings` field instead of crashing the service.

## Quickstart

Prerequisites: Python 3.10+, `pip`. No npm / frontend build.

```powershell
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Open <http://127.0.0.1:8000> (app) or <http://127.0.0.1:8000/docs> (Swagger).
`make install run` / `make test` are equivalent shortcuts.

### Full 5-slot training (real data)

```powershell
python -m pip install -r requirements.txt -r requirements-optional-ml.txt
python -m src.train --dga-csv "C:\path\dataset_all.csv" --tranco-csv "C:\path\tranco.csv" --max-per-class 20000 --epochs 5
```

Inputs: DGA CSV with `domain,class` columns; optional headerless Tranco
`rank,domain` for presumed-benign augmentation. The loader normalizes, drops
cross-label SLD collisions, dedups by SLD, marks multi-family DGA SLDs
`ambiguous`, then stratified-samples per family. Metrics + `per_family.csv` land in
`results/`; the bundle lands in `models/`. Restart the API after training.
Synthetic fallback: `python -m src.train` (no args, seed 42).

## Methodology

- **Labels:** binary (benign 0 / DGA 1) + family string. Tranco = presumed benign.
- **Split:** stratified random holdout (25%), SLD-deduped so no label crosses the
  split. This is *not* a time-based or family-disjoint test — see `/api/experiments/unseen`
  and the family-held-out CSV for generalization evidence.
- **Features:** second-level-label TF-IDF + length, entropy, vowel/consonant/digit
  ratios, hyphens, longest consonant run, unique ratio, dictionary coverage,
  TLD length. Vectorizer is fit on train only; deep models use fixed 63-char IDs.
- **Calibration:** none. Probabilities are uncalibrated ranking scores.
- **Evasion lab:** bounded deterministic mutations (`src/adversarial.py`) searched in
  `src/evasion.py`; the refit trains a fresh LR head on the *frozen* vectorizer and
  never overwrites the saved bundle.
- **Game:** `src/game.py` deals balanced legit/DGA rounds from local pools +
  deterministic generators; labels are known by construction.
- **Lookalike override:** a non-exact brand lookalike (`amozon`, `paypa1`) forces
  verdict DGA / risk HIGH (displayed score floored at 0.85, raw DGA score kept in
  `warnings`). An exact brand-name match (`amazon`) keeps the model verdict.

## API reference

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Status, `models_loaded`, dataset stats, `load_warnings` |
| `POST` | `/api/predict` | One domain → verdict, probability, slots, features, family, explanation |
| `POST` | `/api/predict/batch` | ≤500 domains + summary counts |
| `POST` | `/api/explain` | Exact LR logit attributions (not ensemble) |
| `POST` | `/api/generate` | Deterministic LCG / MD5 / dictionary samples, scored |
| `POST` | `/api/robustness` | Fixed string variants (append-word, hyphen, lengthen) |
| `POST` | `/api/typosquat` | Lookalike check: exact brand hit or ≤2 edits from a known brand |
| `POST` | `/api/adversarial` | Bounded mutation under length/randomness/digit/vowel/word controls |
| `POST` | `/api/evasion/loop` | **#1** Attacker-vs-defender: rounds 0–N detection curve + evasive samples |
| `POST` | `/api/evasion/retrain` | **#1** Lab refit on evasives (before/after, bundle untouched) |
| `GET` | `/api/game/sample?count=8&seed=42` | **#3** Balanced Human-vs-AI round with truth + model answers |
| `POST` | `/api/simulate` | Local DGA-vs-benign detection simulation |
| `POST` | `/api/experiments/unseen` | Family-held-out evaluation (default LR) |
| `GET` | `/api/points` | 3D teaching coordinates or `[]` |
| `GET` | `/api/results` | Holdout metrics + message |
| `GET` | `/api/export?fmt=csv\|json` | In-memory scan history download |

UI tabs mirror the API: Detect, Batch, 3D, DGA lab, Experiments, Mutation,
Simulation, **Evasion loop**, **Human vs AI**, Results. Keys `1–9` switch tabs.

## Repository layout

```text
app/                  FastAPI (main.py, schemas.py, services.py) + static UI
app/static/js/        router, api, pages + detect/batch/evasion/game/simulation/…
src/                  data, features, dga_internals, inference, character_models,
                      adversarial, evasion (#1), game (#3), simulation, experiments, train
tests/                API + leakage/bundle round-trip tests
data/{raw,processed}/ local datasets (git-kept dirs, ignored contents)
models/               model_bundle.joblib + *.keras (local only, ignored)
results/              metrics.csv, per_family.csv, points3d.json (local only, ignored)
report/               full write-up + real-data metrics table
notebooks/            2-cell Colab pointer (uses src.train)
Dockerfile            slim CPU runtime (synthetic fallback, no TF/XGB)
docker-compose.yml    local run with optional model/result mounts
Makefile              install / run / train / test / docker shortcuts
```

Removed as dead weight: `src/models_classical.py`, `src/models_deep.py`
(re-export shims), `src/evaluate.py`, `src/export_3d.py` (duplicated `train.py`),
`requirements-optional-deep.txt` (folded into `requirements-optional-ml.txt`),
`models/char_models.joblib` (unreferenced artifact).

## Docker (fastest, low-power)

The image is intentionally **slim**: Python 3.11-slim, base requirements only, no
model files baked in — it boots on the synthetic LR+RF fallback in seconds with
~200–400 MB RAM. No GPU, no TensorFlow download.

```bash
docker build -t dga-threat-explorer:slim .
docker run --rm -p 8000:8000 dga-threat-explorer:slim
# or
docker compose up --build
```

Full ensemble inside Docker: install the ML bundle at build/run time and retrain
with your CSVs mounted, or train on the host and mount `./models` read-only
(compose already mounts it). If a mounted bundle was built with an older Keras,
its sequence slots are skipped with a warning instead of crashing.

## Testing & verification

```bash
python -m pip install -r requirements-dev.txt
python -m pytest -q
```

Covers health, predict/batch/explain/generate/robustness, adversarial,
simulation, unseen-family, **evasion loop + refit**, and **game sampling**, plus
SLD-dedup/leakage, TLD-invariance, encoder shape, and bundle round-trip tests.
`GET /api/export` uses `?fmt=` (the legacy `?format=` is ignored and defaults to CSV).

## Limitations & safety

- Synthetic fallback has 12 unique benign domains — holdout scores are unstable demos.
- Real-data path is a random holdout, not time-aware; Tranco ≠ proven benign; source
  CSV may be dated (see its GPL-2.0 provenance in `report/`).
- No calibration, no adversarial training in shipped weights, 3D = character
  projection (not embeddings), family scores are approximate.
- Evasion tooling is framed and rate-limited as a **defensive robustness test on your
  own local model** (≤200 domains, ≤10 rounds, ≤60 tries). Do not point it at real
  infrastructure.

## Roadmap

Shipped here: **#1 attacker-vs-defender loop** and **#3 Human-vs-AI**, both
model-agnostic across the 5-slot ensemble. Deferred to next: **#2 host-level
infection detector** (burst/NXDomain per-host scoring over simulated DNS logs) —
the most realistic SOC view, estimated ~2 days.

## License

No license selected yet — standard copyright applies until one is added.
