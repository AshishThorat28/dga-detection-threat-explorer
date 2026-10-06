from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health(): assert client.get('/api/health').status_code == 200

def test_static_files_use_application_paths(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    assert client.get('/').status_code == 200
    assert client.get('/static/index.html').status_code == 200

def test_predict_and_bad_input():
    response = client.post('/api/predict', json={'domain':'https://github.com/path'})
    assert response.status_code == 200 and 'verdict' in response.json()
    assert response.json()['explanation']['attributions']
    assert response.json()['family']['name']
    assert client.post('/api/predict', json={'domain':''}).status_code == 422

def test_batch_explain_generate_robustness_points_results_export():
    assert client.post('/api/predict/batch', json={'domains':['google.com','qzv8xk2m1p9r.com']}).status_code == 200
    assert client.post('/api/predict/batch', json={'domains':['x' * 254]}).status_code == 422
    assert client.post('/api/explain', json={'domain':'google.com'}).status_code == 200
    assert client.post('/api/generate', json={'algorithm':'md5','count':2}).status_code == 200
    assert client.post('/api/robustness', json={'domain':'google.com'}).status_code == 200
    assert client.post('/api/robustness', json={'domain':'x' * 254}).status_code == 422
    assert client.get('/api/points').status_code == 200
    assert client.get('/api/results').status_code == 200
    assert client.get('/api/export?format=csv').status_code == 200

def test_research_endpoints():
    explanation = client.post('/api/explain', json={'domain':'qzv8xk2m1p9r.com'})
    assert explanation.status_code == 200
    assert explanation.json()['model'] == 'LR local linear attribution'
    assert explanation.json()['attributions']

    adversarial = client.post('/api/adversarial', json={
        'domain':'google.com', 'length':20, 'randomness':0.8,
        'digit_ratio':0.2, 'vowel_ratio':0.3, 'meaningful_word':'safe', 'seed':7,
    })
    assert adversarial.status_code == 200
    assert len(adversarial.json()['modified_domain'].split('.')[0]) == 20
    assert 'entropy' in adversarial.json()['feature_changes']

    simulation = client.post('/api/simulate', json={
        'algorithm':'lcg', 'count':3, 'benign_count':3,
    })
    assert simulation.status_code == 200
    assert simulation.json()['generated'] == 3
    assert simulation.json()['false_positives'] <= 3
    assert simulation.json()['false_negatives'] <= 3

    unseen = client.post('/api/experiments/unseen', json={
        'train_families':['random','hex'], 'unseen_families':['lcg'], 'per_family':20,
    })
    assert unseen.status_code == 200
    result = unseen.json()
    assert result['per_family'][0]['unseen_family'] == 'lcg'
    assert result['per_family'][0]['benign_controls'] > 0
    assert set(result['known_macro']) == {'accuracy','precision','recall','f1'}
    assert 'generalization_gap' in result

def test_evasion_loop_and_retrain():
    loop = client.post('/api/evasion/loop', json={
        'algorithm': 'lcg', 'count': 4, 'rounds': 2, 'tries_per_domain': 3, 'seed': 42,
    })
    assert loop.status_code == 200
    body = loop.json()
    assert len(body['rounds']) == 3  # rounds=2 -> round 0..2
    assert body['rounds'][0]['detection_rate'] >= body['rounds'][-1]['detection_rate']
    assert 'evasive_samples' in body

    direct = client.post('/api/evasion/loop', json={
        'domains': ['qzv8xk2m1p9r.com', 'xkq91zz4ab12.net'], 'rounds': 1, 'tries_per_domain': 2,
    })
    assert direct.status_code == 200

    evasives = body['evasive_samples'][:4] or ['cloudsignal12.com']
    retrain = client.post('/api/evasion/retrain', json={'evasive_domains': evasives})
    assert retrain.status_code == 200
    assert retrain.json()['after']['detection_rate'] >= retrain.json()['before']['detection_rate']
    assert client.post('/api/evasion/retrain', json={'evasive_domains': []}).status_code == 422

def test_game_sample():
    response = client.get('/api/game/sample?count=4&seed=7')
    assert response.status_code == 200
    body = response.json()
    assert body['count'] == 4
    assert {s['label'] for s in body['samples']} == {'LEGITIMATE', 'DGA'}
    assert all('model_verdict' in s and 'model_probability' in s for s in body['samples'])
    assert 0.0 <= body['model_accuracy'] <= 1.0
    assert client.get('/api/game/sample?count=1').status_code == 422

def test_typosquat_endpoint():
    flagged = client.post('/api/typosquat', json={'domain': 'amozon.in'})
    assert flagged.status_code == 200
    assert flagged.json()['flagged'] is True
    assert flagged.json()['brand'] == 'amazon'

    exact = client.post('/api/typosquat', json={'domain': 'amazon.in'})
    assert exact.json()['flagged'] is True
    assert exact.json()['distance'] == 0

    clean = client.post('/api/typosquat', json={'domain': 'qzv8xk2m1p9r.com'})
    assert clean.json()['flagged'] is False

    leet = client.post('/api/typosquat', json={'domain': 'paypa1.com'})
    assert leet.json()['flagged'] is True

    assert client.post('/api/typosquat', json={'domain': ''}).status_code == 422

def test_predict_includes_typosquat():
    response = client.post('/api/predict', json={'domain': 'amozon.in'})
    assert response.status_code == 200
    body = response.json()
    assert body['typosquat']['flagged'] is True
    assert body['verdict'] == 'DGA'  # lookalike override, not DGA-shaped
    assert body['risk'] == 'HIGH'
    assert any('lookalike' in w for w in body['warnings'])
    exact = client.post('/api/predict', json={'domain': 'amazon.in'})
    assert exact.json()['verdict'] == 'LEGITIMATE'  # exact brand match keeps model verdict
    clean = client.post('/api/predict', json={'domain': 'github.com'})
    assert clean.json()['typosquat']['flagged'] is False
