from __future__ import annotations
from dataclasses import dataclass
import numpy as np
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


class HandcraftedTransformer(BaseEstimator, TransformerMixin):
    def fit(self, domains, labels=None):
        return self

    def transform(self, domains):
        return handcrafted_frame([str(domain) for domain in domains]).to_numpy()

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

class InferenceEngine:
    def __init__(self, frame=None, include_baselines: bool = True):
        self.frame = frame if frame is not None else load_dataset(per_family=240)
        self.include_baselines = include_baselines
        self.models = {}
        self.vectorizer = FeatureUnion([
            ("char_ngrams", TfidfVectorizer(analyzer="char", ngram_range=(2, 4), min_df=1, max_features=12000)),
            ("handcrafted", Pipeline([
                ("features", HandcraftedTransformer()),
                ("scale", StandardScaler()),
            ])),
        ])
        self._fit()

    def _fit(self):
        domains = self.frame.domain.tolist()
        x_text = self.vectorizer.fit_transform(domains)
        y = self.frame.label.to_numpy()
        family_y = self.frame.family.astype(str).to_numpy()
        train_x, test_x, train_y, test_y, train_families, _ = train_test_split(
            x_text, y, family_y, test_size=.25, random_state=42, stratify=y,
        )
        self.models["LR"] = LogisticRegression(max_iter=250, random_state=42, class_weight="balanced").fit(train_x, train_y)
        if self.include_baselines:
            self.models["RF"] = RandomForestClassifier(n_estimators=80, max_depth=18, random_state=42, n_jobs=-1, class_weight="balanced").fit(train_x, train_y)
            self.family_model = LogisticRegression(max_iter=300, random_state=42, class_weight="balanced").fit(train_x, train_families)
            # These named comparison slots are sklearn variants, not XGBoost/CNN/LSTM architectures.
            self.models["XGB"] = LogisticRegression(C=2.0, max_iter=250, random_state=43, class_weight="balanced").fit(train_x, train_y)
            self.models["LSTM"] = LogisticRegression(C=.65, max_iter=250, random_state=44, class_weight="balanced").fit(train_x, train_y)
            self.models["CNN"] = LogisticRegression(C=1.35, max_iter=250, random_state=45, class_weight="balanced").fit(train_x, train_y)
        else:
            self.family_model = None
        self.threshold = .5
        self.metrics = {"accuracy": accuracy_score(test_y, self.models["LR"].predict(test_x)), "precision": precision_score(test_y, self.models["LR"].predict(test_x), zero_division=0), "recall": recall_score(test_y, self.models["LR"].predict(test_x), zero_division=0), "f1": f1_score(test_y, self.models["LR"].predict(test_x), zero_division=0), "roc_auc": roc_auc_score(test_y, self.models["LR"].predict_proba(test_x)[:, 1])}
        self.families = sorted(self.frame.family.unique().tolist())
        self.dga_families = [family for family in self.families if family != "benign"]
        self._coordinate_mean = np.zeros(3)

    def _probabilities(self, domain: str) -> dict[str, float]:
        vector = self.vectorizer.transform([domain])
        return {name: float(model.predict_proba(vector)[0, 1]) for name, model in self.models.items()}

    def predict(self, raw_domain: str, include_explanation: bool = True) -> Prediction:
        domain = normalize_domain(raw_domain)
        if not domain or len(domain) > 253:
            raise ValueError("domain must be a non-empty domain no longer than 253 characters")
        probabilities = self._probabilities(domain)
        probability = float(np.mean(list(probabilities.values())))
        verdict = "DGA" if probability >= self.threshold else "LEGITIMATE"
        risk = "HIGH" if probability >= .75 else "MEDIUM" if probability >= .4 else "LOW"
        sld, _ = split_domain(domain)
        feature_values = handcrafted(domain)
        warnings = []
        if any(ord(char) > 127 for char in domain): warnings.append("non-ASCII input was normalized")
        if len(sld) < 5: warnings.append("very short label")
        if len(sld) > 50: warnings.append("unusually long label")
        if feature_values["dictionary_coverage"] > .5: warnings.append("dictionary-looking label")
        family = self._family_prediction(domain, verdict)
        coords = self.coordinates(domain)
        explanation = self.explain(domain) if include_explanation else {}
        return Prediction(domain, verdict, probability, risk, probabilities, feature_values, warnings, family, coords, explanation)

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
        return {"metrics": [{"model": "LR", **self.metrics}], "unseen_family_results": [], "per_family": [], "calibration": [], "robustness": [], "message": "LR metrics are a random holdout from the synthetic dataset. Run the family-disjoint evaluation below for unseen-family results."}
