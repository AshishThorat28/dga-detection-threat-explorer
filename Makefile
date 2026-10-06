.PHONY: install install-ml run train test lint docker-build docker-run clean

install:
	python -m pip install --upgrade pip
	python -m pip install -r requirements.txt

install-ml:
	python -m pip install -r requirements.txt -r requirements-optional-ml.txt

run:
	python -m uvicorn app.main:app --host 127.0.0.1 --port 8000

train:
	python -m src.train

test:
	python -m pytest -q

docker-build:
	docker build -t dga-threat-explorer:slim .

docker-run:
	docker run --rm -p 8000:8000 dga-threat-explorer:slim

clean:
	python -c "import pathlib,shutil; [shutil.rmtree(p,ignore_errors=True) for p in list(pathlib.Path('.').rglob('__pycache__')) + [pathlib.Path('.pytest_cache')]]"
