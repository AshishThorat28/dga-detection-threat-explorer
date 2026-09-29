from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health(): assert client.get('/api/health').status_code == 200

def test_predict_and_bad_input():
    response = client.post('/api/predict', json={'domain':'https://github.com/path'})
    assert response.status_code == 200 and 'verdict' in response.json()
    assert response.json()['explanation']['attributions']
    assert response.json()['family']['name']
    assert client.post('/api/predict', json={'domain':''}).status_code == 422

def test_batch_explain_generate_robustness_points_results_export():
    assert client.post('/api/predict/batch', json={'domains':['google.com','qzv8xk2m1p9r.com']}).status_code == 200
    assert client.post('/api/explain', json={'domain':'google.com'}).status_code == 200
    assert client.post('/api/generate', json={'algorithm':'md5','count':2}).status_code == 200
    assert client.post('/api/robustness', json={'domain':'google.com'}).status_code == 200
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
