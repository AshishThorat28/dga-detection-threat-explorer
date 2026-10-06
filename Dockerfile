# Industrial-grade, low-power runtime image.
# Slim CPU-only build: serves LR + RF on the synthetic fallback with zero
# model files required. No TensorFlow / XGBoost in this layer (fast build,
# low RAM). For the full 5-slot bundle, build with the ml target or install
# requirements-optional-ml.txt and retrain (see README).
FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# System deps kept minimal (curl only for HEALTHCHECK).
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY src ./src
COPY data ./data

# Runtime artifact dirs (empty in the image; mounted or generated at runtime).
RUN mkdir -p models results/figures

# Non-root runtime user (least privilege).
RUN useradd -m -u 10001 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8000/api/health || exit 1

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
