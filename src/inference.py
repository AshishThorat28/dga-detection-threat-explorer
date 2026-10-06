from __future__ import annotations
from dataclasses import dataclass
from pathlib import Path
import numpy as np
import joblib
from sklearn.base import BaseEstimator, TransformerMixin
from sklearn.ensemble import RandomForestClassifier
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import FeatureUnion, Pipeline
from sklearn.preprocessing import StandardScaler
from .data import load_dataset, normalize_domain, split_domain
from .features import handcrafted, handcrafted_frame
from .character_models import CharacterSequenceClassifier, train_character_models

def _second_level_label(domain: str) -> str:
    return split_domain(normalize_domain(str(domain)))[0]


class HandcraftedTransformer(BaseEstimator, TransformerMixin):
    def fit(self, domains, labels=None):
        return self

    def transform(self, domains):
        labels = [_second_level_label(domain) for domain in domains]
        return handcrafted_frame(labels, include_tld=False).to_numpy()

    def get_feature_names_out(self, input_features=None):
        return np.asarray([
            "length", "entropy", "vowel_ratio", "consonant_ratio", "digit_ratio",
            "hyphen_count", "longest_consonant_run", "unique_ratio",
            "dictionary_coverage", "tld_length",
        ], dtype=object)

@dataclass
class Prediction:
    domain: str
    verdict: str
    probability: float
    risk: str
    models: dict
    features: dict
    warnings: list[str]
    family: dict
    coordinates: list[float]
    explanation: dict
    typosquat: dict

class InferenceEngine:
    def __init__(
        self,
        frame=None,
        include_baselines: bool = True,
        include_extended: bool = False,
        epochs: int = 5,
        batch_size: int = 256,
    ):
        self.frame = frame if frame is not None else load_dataset(per_family=240)
        self.include_baselines = include_baselines
        self.include_extended = include_extended
        self.epochs = epochs
        self.batch_size = batch_size
        self.models = {}
        self.model_inputs = {}
        self.training_source = "synthetic fallback"
        self.vectorizer = FeatureUnion([
            ("char_ngrams", TfidfVectorizer(
                analyzer="char", ngram_range=(2, 4), min_df=1,
                max_features=12000, preprocessor=_second_level_label,
            )),
            ("handcrafted", Pipeline([
                ("features", HandcraftedTransformer()),
                ("scale", StandardScaler()),
            ])),
        ])
        self._fit()

    def _fit(self):
        domains = self.frame.domain.tolist()
        y = self.frame.label.to_numpy()
        family_y = self.frame.family.astype(str).to_numpy()
        train_domains, test_domains, train_y, test_y, train_families, _ = train_test_split(
            domains, y, family_y, test_size=.25, random_state=42, stratify=y,
        )
        train_x = self.vectorizer.fit_transform(train_domains)
        test_x = self.vectorizer.transform(test_domains)
        self.test_counts = {
            "total": int(len(test_y)),
            "benign": int(np.sum(test_y == 0)),
            "dga": int(np.sum(test_y == 1)),
        }
        self.models["LR"] = LogisticRegression(max_iter=250, random_state=42, class_weight="balanced").fit(train_x, train_y)
        self.model_inputs["LR"] = "features"
        if self.include_baselines:
            self.models["RF"] = RandomForestClassifier(n_estimators=80, max_depth=18, random_state=42, n_jobs=2, class_weight="balanced").fit(train_x, train_y)
            self.model_inputs["RF"] = "features"
            self.family_model = LogisticRegression(max_iter=300, random_state=42, class_weight="balanced").fit(train_x, train_families)
        else:
            self.family_model = None
        if self.include_extended:
            from xgboost import XGBClassifier

            self.models["XGB"] = XGBClassifier(
                n_estimators=160,
                max_depth=7,
                learning_rate=0.08,
                subsample=0.9,
                colsample_bytree=0.8,
                objective="binary:logistic",
                eval_metric="logloss",
                tree_method="hist",
                n_jobs=2,
                random_state=42,
            ).fit(train_x, train_y)
            self.model_inputs["XGB"] = "features"
            self.models.update(train_character_models(
                train_domains, train_y, test_domains, test_y,
                epochs=self.epochs, batch_size=self.batch_size,
            ))
            self.model_inputs.update({"LSTM": "characters", "CNN": "characters"})
        self.threshold = .5
        self.all_metrics = {
            name: self._score(
                model, test_x, test_y,
                test_domains if self.model_inputs[name] == "characters" else None,
            )
            for name, model in self.models.items()
        }
        self.metrics = self.all_metrics["LR"]
        self.families = sorted(self.frame.family.unique().tolist())
        self.dga_families = [family for family in self.families if family != "benign"]
        self._coordinate_mean = np.zeros(3)
        self.dataset_size = len(self.frame)
        self.load_warnings: list[str] = []

    @staticmethod
    def _score(model, test_x, test_y, test_domains=None) -> dict[str, float]:
        model_input = test_domains if test_domains is not None else test_x
        predicted = model.predict(model_input)
        probabilities = model.predict_proba(model_input)[:, 1]
        return {
            "accuracy": float(accuracy_score(test_y, predicted)),
            "precision": float(precision_score(test_y, predicted, zero_division=0)),
            "recall": float(recall_score(test_y, predicted, zero_division=0)),
            "f1": float(f1_score(test_y, predicted, zero_division=0)),
            "roc_auc": float(roc_auc_score(test_y, probabilities)),
        }

    def _probabilities(self, domain: str) -> dict[str, float]:
        vector = self.vectorizer.transform([domain])
        probabilities = {}
        for name, model in self.models.items():
            model_input = [domain] if self.model_inputs[name] == "characters" else vector
            probabilities[name] = float(model.predict_proba(model_input)[0, 1])
        return probabilities

    def save_artifacts(self, directory: str | Path) -> None:
        directory = Path(directory)
        directory.mkdir(parents=True, exist_ok=True)
        sequence_models = {}
        classical_models = {}
        for name, model in self.models.items():
            if self.model_inputs[name] == "characters":
                filename = f"{name.lower()}.keras"
                model.model.save(directory / filename)
                sequence_models[name] = filename
            else:
                classical_models[name] = model
        joblib.dump({
            "format_version": 1,
            "vectorizer": self.vectorizer,
            "models": classical_models,
            "model_inputs": self.model_inputs,
            "sequence_models": sequence_models,
            "family_model": self.family_model,
            "threshold": self.threshold,
            "all_metrics": self.all_metrics,
            "test_counts": self.test_counts,
            "families": self.families,
            "dga_families": self.dga_families,
            "dataset_size": self.dataset_size,
            "training_source": self.training_source,
        }, directory / "model_bundle.joblib")

    @classmethod
    def from_artifacts(cls, directory: str | Path) -> "InferenceEngine":
        import warnings

        directory = Path(directory)
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            bundle = joblib.load(directory / "model_bundle.joblib")
        if bundle.get("format_version") != 1:
            raise ValueError("Unsupported trained-model bundle format")
        engine = cls.__new__(cls)
        engine.frame = None
        engine.include_baselines = True
        engine.include_extended = True
        engine.epochs = 0
        engine.batch_size = 0
        engine.vectorizer = bundle["vectorizer"]
        engine.models = dict(bundle["models"])
        engine.model_inputs = dict(bundle["model_inputs"])
        engine.load_warnings: list[str] = []
        for name, filename in bundle.get("sequence_models", {}).items():
            try:
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore")
                    from tensorflow.keras.models import load_model

                    engine.models[name] = CharacterSequenceClassifier(
                        load_model(directory / filename),
                    )
            except Exception as exc:  # stale Keras bundle (e.g. initializer schema drift)
                engine.model_inputs.pop(name, None)
                engine.load_warnings.append(
                    f"Skipped sequence model {name} ({filename}): {type(exc).__name__}. "
                    "Retrain with the installed TensorFlow to re-enable it."
                )
                continue
        engine.family_model = bundle["family_model"]
        engine.threshold = bundle["threshold"]
        engine.all_metrics = {
            name: metrics for name, metrics in bundle["all_metrics"].items()
            if name in engine.models
        }
        engine.metrics = engine.all_metrics.get("LR", next(iter(engine.all_metrics.values())))
        engine.test_counts = bundle["test_counts"]
        engine.families = bundle["families"]
        engine.dga_families = bundle["dga_families"]
        engine.dataset_size = bundle["dataset_size"]
        engine.training_source = bundle["training_source"]
        engine._coordinate_mean = np.zeros(3)
        return engine

    def predict(self, raw_domain: str, include_explanation: bool = True) -> Prediction:
        domain = normalize_domain(raw_domain)
        if not domain or len(domain) > 253:
            raise ValueError("domain must be a non-empty domain no longer than 253 characters")
        probabilities = self._probabilities(domain)
        probability = float(np.mean(list(probabilities.values())))
        verdict = "DGA" if probability >= self.threshold else "LEGITIMATE"
        risk = "HIGH" if probability >= .75 else "MEDIUM" if probability >= .4 else "LOW"
        sld, _ = split_domain(domain)
        feature_values = handcrafted(sld, include_tld=False)
        warnings = []
        if any(ord(char) > 127 for char in domain): warnings.append("non-ASCII input was normalized")
        if len(sld) < 5: warnings.append("very short label")
        if len(sld) > 50: warnings.append("unusually long label")
        if feature_values["dictionary_coverage"] > .5: warnings.append("dictionary-looking label")
        from .typosquat import check_typosquat

        typosquat = check_typosquat(sld)
        if typosquat["flagged"]:
            warnings.append(f"possible lookalike of '{typosquat['brand']}': {typosquat['reason']}")
        # Lookalike override: a non-exact brand lookalike (amozon, paypa1) is
        # treated as malicious even when its DGA-shape score is low. An exact
        # brand-name match (amazon) keeps the model verdict with a verify note.
        if typosquat["flagged"] and sld.lower() != typosquat["brand"]:
            raw_probability = probability
            probability = max(probability, 0.85)
            verdict = "DGA"
            risk = "HIGH"
            warnings.append(
                f"verdict set to DGA by the lookalike check (raw DGA score {raw_probability:.3f})"
            )
        family = self._family_prediction(domain, verdict)
        coords = self.coordinates(domain)
        explanation = self.explain(domain) if include_explanation else {}
        return Prediction(domain, verdict, probability, risk, probabilities, feature_values, warnings, family, coords, explanation, typosquat)

    def _family_prediction(self, domain: str, verdict: str) -> dict:
        if self.family_model is None:
            return {"name": "unknown", "confidence": 0.0, "supported": False}
        scores = self.family_model.predict_proba(self.vectorizer.transform([domain]))[0]
        probabilities = dict(zip(self.family_model.classes_, scores))
        if verdict == "LEGITIMATE":
            return {"name": "benign", "confidence": round(float(probabilities.get("benign", 0.0)), 4), "supported": True}
        ranked = sorted(
            ((name, score) for name, score in probabilities.items() if name != "benign"),
            key=lambda item: item[1], reverse=True,
        )
        if not ranked:
            return {"name": "unknown", "confidence": 0.0, "supported": False}
        name, confidence = ranked[0]
        return {
            "name": name,
            "confidence": round(float(confidence), 4),
            "supported": name in self.dga_families,
            "candidates": [{"name": family, "confidence": round(float(score), 4)} for family, score in ranked[:3]],
        }

    def coordinates(self, domain: str) -> list[float]:
        values = [sum(ord(char) * (i + 1) for i, char in enumerate(domain)), len(domain), sum(char.isdigit() for char in domain)]
        return [round(((value % 2000) / 1000) - 1, 5) for value in values]

    def explain(self, raw_domain: str) -> dict:
        domain = normalize_domain(raw_domain)
        vector = self.vectorizer.transform([domain])
        model = self.models["LR"]
        contributions = vector.multiply(model.coef_[0]).toarray().ravel()
        names = self.vectorizer.get_feature_names_out()
        ranked = np.argsort(np.abs(contributions))[::-1]
        attributions = []
        for index in ranked:
            contribution = float(contributions[index])
            if abs(contribution) < 1e-8:
                continue
            name = str(names[index])
            is_lexical = name.startswith("handcrafted__")
            attributions.append({
                "feature": name.removeprefix("handcrafted__").removeprefix("char_ngrams__"),
                "source": "lexical" if is_lexical else "character n-gram",
                "contribution": round(contribution, 5),
                "direction": "toward DGA" if contribution > 0 else "toward legitimate",
            })
            if len(attributions) == 12:
                break
        return {
            "model": "LR local linear attribution",
            "intercept": round(float(model.intercept_[0]), 5),
            "attributions": attributions,
            "note": "Additive contributions are exact for the LR logit. The displayed verdict and probability are the mean of model-slot probabilities; those ensemble outputs are not decomposed by this LR explanation.",
        }

    def robustness(self, domain: str) -> list[dict]:
        sld, tld = split_domain(normalize_domain(domain))
        variants = [("original", domain), ("append_word", sld + "cloud." + tld), ("insert_hyphen", sld[:max(1, len(sld)//2)] + "-" + sld[max(1, len(sld)//2):] + "." + tld), ("lengthen", sld + "secure." + tld)]
        return [{"variant": name, **self.predict(value).__dict__} for name, value in variants]

    def result_payload(self) -> dict:
        counts = self.test_counts
        message = (
            f"{self.training_source} random holdout: {counts['benign']} benign and "
            f"{counts['dga']} DGA examples. Holdout metrics are not production estimates."
        )
        return {"metrics": [{"model": name, **metrics} for name, metrics in self.all_metrics.items()], "unseen_family_results": [], "per_family": [], "calibration": [], "robustness": [], "test_counts": counts, "message": message}
