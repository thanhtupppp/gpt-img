from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_endpoint_returns_service_metadata():
    response = client.get("/healthz")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "piecs-gateway",
        "api_version": "v1",
    }


def test_health_response_includes_server_generated_request_id():
    response = client.get("/healthz", headers={"X-Request-ID": "attacker-controlled-value"})

    assert response.status_code == 200
    assert response.headers["X-Request-ID"] != "attacker-controlled-value"
    assert len(response.headers["X-Request-ID"]) == 36


def test_validation_errors_use_stable_error_envelope():
    response = client.post("/healthz", json={"unexpected": True})

    assert response.status_code == 405
