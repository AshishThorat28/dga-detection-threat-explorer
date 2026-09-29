# DGA Detection and Threat Explorer

A reproducible, local-first research and teaching application for detecting domain-generation-algorithm (DGA) domains from their strings. It combines synthetic-data generation, character n-gram classifiers, lexical feature analysis, deterministic DGA demonstrations, a FastAPI service, and a browser-based threat explorer.

> **Research prototype:** this project is not a production detection system. Its default dataset is synthetic and has a small benign-domain vocabulary. Model scores and probabilities must not be used as operational security decisions.

## Capabilities

- Train and evaluate a deterministic baseline using a seeded synthetic dataset.
- Score one domain or a batch, inspect lexical features, and view character-occlusion explanations.
- Generate example domains for supported DGA algorithms without making network requests or registering domains.
- Inspect robustness variants and export the current in-memory scan history as CSV or JSON.
- Explore the service from a no-build HTML, CSS, and JavaScript interface.
- Run API and dataset-integrity tests with pytest.

## Quick Start

Requirements: Python 3.10 or newer and `pip`.

### Windows PowerShell

```powershell
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

### macOS or Linux

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Open <http://127.0.0.1:8000> for the application or <http://127.0.0.1:8000/docs> for interactive API documentation. The service is bound to loopback by default and is not exposed to the network. The default application path does not require a downloaded dataset, a prebuilt model, cloud credentials, or external network access.

## Training and Tests

Run the deterministic training/evaluation entry point to write a serialized model and result artifacts under `models/` and `results/`:

```bash
python -m src.train
```

Run the test suite from the repository root:

```bash
python -m pytest -q
```

The application builds its inference engine from synthetic data when it starts; it does not load `models/char_models.joblib`. The training command is therefore useful for reproducible evaluation and artifact generation, but is not required before launching the API. Generated models, datasets, caches, and result files are intentionally excluded from version control.

## Model Scope and Interpretation

The default data generator creates eight synthetic DGA-like families and a small list of benign domains using seed `42`. Domain strings are normalized and deduplicated before training. The primary text representation is character-level TF-IDF with 2- to 4-character n-grams.

The current lightweight inference engine exposes five model names for comparison, but they are not five independent state-of-the-art architectures:

| Slot | Current implementation |
|---|---|
| `LR` | Logistic regression baseline |
| `RF` | Random forest |
| `XGB` | Logistic regression variant; XGBoost is not currently used |
| `LSTM` | Logistic regression variant; not an LSTM in the default path |
| `CNN` | Logistic regression variant; not a CNN in the default path |

Optional Keras model builders are provided in `src/models_deep.py`; they are not wired into the default training or serving path. Install their additional dependency with `python -m pip install -r requirements-optional-deep.txt` if you are working on those builders.

The synthetic benchmark is deliberately easy to separate and does not represent real-world prevalence, distribution shift, unseen-family generalization, calibrated probabilities, or adversarial robustness. A credible operational evaluation requires independently sourced and licensed benign and malicious data, family-disjoint evaluation, leakage controls, calibration, and monitoring. Do not interpret a displayed score as proof that a domain is safe or malicious.

## API Reference

All endpoints are served from the same local FastAPI process.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Service and dataset status |
| `POST` | `/api/predict` | Analyze one domain: `{"domain":"example.com"}` |
| `POST` | `/api/predict/batch` | Analyze a list: `{"domains":["example.com"]}` |
| `POST` | `/api/explain` | Character-occlusion explanation for one domain |
| `POST` | `/api/generate` | Generate and score domains for a supported algorithm |
| `POST` | `/api/robustness` | Score simple string variants of a domain |
| `GET` | `/api/points` | Return generated 3D teaching-projection points, or an empty list if absent |
| `GET` | `/api/results` | Return the current result summary |
| `GET` | `/api/export?format=csv` | Export in-memory scan history as CSV; `format=json` is also supported |

Request validation and error responses are provided by FastAPI/Pydantic. Batch requests are capped at 500 domains; generated batches are capped at 500. See `/docs` for the complete request and response schemas.

## Repository Layout

```text
app/                 FastAPI application and static browser interface
src/                 Data generation, features, DGA algorithms, inference, training
tests/               API and dataset-integrity tests
notebooks/            Colab-compatible exploratory notebook
report/               Project report and methodology notes
requirements.txt      Default runtime and test dependencies
requirements-optional-deep.txt  Optional TensorFlow dependency set
```

`data/`, `models/`, and `results/` are runtime artifact locations. Their generated or locally supplied contents are not required in the public source repository.

## Privacy and Safety

- The shipped code does not submit domains to a third-party analysis service.
- DGA examples are generated locally; the generators do not resolve, contact, or register domains.
- API scan history is held in process memory and is reset when the service restarts.
- Keep the service bound to localhost unless you have added appropriate authentication, network controls, and deployment hardening.
- Treat submitted domains and exported scan history according to your organization's data-handling requirements.

## Limitations

- Synthetic training data and limited benign coverage are not substitutes for representative labeled telemetry.
- Model probabilities are not calibrated confidence estimates.
- Family hints, lexical explanations, and 3D coordinates are heuristic teaching aids, not causal explanations or semantic embeddings.
- Optional Keras builders are not integrated into the default pipeline; the displayed `LSTM` and `CNN` slots are lightweight sklearn models.
- No unseen-family, production, or real-world performance claim is made.

## License

No license has been added to this repository. Until a license is selected and included, standard copyright applies and reuse permissions are not granted.
