from src.data import load_dataset, load_labeled_dataset, split_domain
from src.inference import InferenceEngine
from src.simulation import SIMULATION_CONTROLS
from src.character_models import MAX_LENGTH, encode_domains
from app import services

def test_domains_are_unique_and_splits_can_be_disjoint():
    frame = load_dataset(per_family=30)
    assert frame.domain.is_unique
    assert frame.sld.is_unique
    assert not set(frame.loc[frame.label == 0, 'domain']) & set(frame.loc[frame.label == 1, 'domain'])
    assert not set(frame.domain) & set(SIMULATION_CONTROLS)
    assert split_domain('www.example.co.uk') == ('example', 'co.uk')


def test_models_have_per_model_metrics_and_ignore_tld_features():
    engine = InferenceEngine(load_dataset(per_family=30))
    assert set(engine.models) == {'LR', 'RF'}
    assert set(engine.all_metrics) == set(engine.models)
    assert all(set(values) == {'accuracy', 'precision', 'recall', 'f1', 'roc_auc'} for values in engine.all_metrics.values())
    assert (engine.vectorizer.transform(['same-label.com']) != engine.vectorizer.transform(['same-label.xyz'])).nnz == 0


def test_labeled_dataset_loads_dga_families_and_tranco(tmp_path):
    dga_path = tmp_path / "dga.csv"
    dga_path.write_text(
        ",domain,class\n"
        "0,google.com,legit\n"
        "1,randomalpha.xyz,zeus\n"
        "2,randombravo.xyz,zeus\n"
        "3,malwarecharlie.net,conficker\n"
        "4,sharedalpha.com,zeus\n"
        "5,sharedalpha.net,conficker\n",
        encoding="utf-8",
    )
    tranco_path = tmp_path / "tranco.csv"
    tranco_path.write_text("1,cloudflare.com\n2,wikipedia.org\n", encoding="utf-8")

    frame = load_labeled_dataset(
        str(dga_path), str(tranco_path), max_per_class=3,
    )

    assert {"benign", "ambiguous"}.issubset(set(frame.family))
    assert frame.label.value_counts().to_dict() == {0: 3, 1: 3}
    assert frame.sld.is_unique


def test_character_encoder_uses_fixed_character_sequences():
    encoded = encode_domains(["abc123.com", "google.org"])

    assert encoded.shape == (2, MAX_LENGTH)
    assert encoded.dtype.name == "int32"
    assert encoded[0, 0] != 0
    assert encoded[0, 6] == 0


def test_trained_model_bundle_round_trip(tmp_path):
    engine = InferenceEngine(load_dataset(per_family=20))
    engine.save_artifacts(tmp_path)

    restored = InferenceEngine.from_artifacts(tmp_path)
    prediction = restored.predict("example.com", include_explanation=False)

    assert set(restored.models) == {"LR", "RF"}
    assert restored.dataset_size == engine.dataset_size
    assert set(prediction.models) == set(restored.models)


def test_services_prefer_saved_model_bundle(tmp_path, monkeypatch):
    models_dir = tmp_path / "models"
    engine = InferenceEngine(load_dataset(per_family=20))
    engine.training_source = "test labeled dataset"
    engine.save_artifacts(models_dir)
    monkeypatch.setattr(services, "ROOT", tmp_path)
    monkeypatch.setattr(services, "engine", None)

    loaded = services.load_services()

    assert loaded.training_source == "test labeled dataset"
    assert loaded.dataset_size == engine.dataset_size
