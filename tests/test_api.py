from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health(): assert client.get('/api/health').status_code == 200

def test_predict_and_bad_input():
    response = client.post('/api/predict', json={'domain':'https://github.com/path'})
    assert response.status_code == 200 and 'verdict' in response.json()
    assert client.post('/api/predict', json={'domain':''}).status_code == 422

def test_batch_explain_generate_robustness_points_results_export():
    assert client.post('/api/predict/batch', json={'domains':['google.com','qzv8xk2m1p9r.com']}).status_code == 200
    assert client.post('/api/explain', json={'domain':'google.com'}).status_code == 200
    assert client.post('/api/generate', json={'algorithm':'md5','count':2}).status_code == 200
    assert client.post('/api/robustness', json={'domain':'google.com'}).status_code == 200
    assert client.get('/api/points').status_code == 200
    assert client.get('/api/results').status_code == 200
    assert client.get('/api/export?format=csv').status_code == 200
