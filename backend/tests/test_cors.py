from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_cors_allowed_origin_and_method_preflight():
    headers = {
        "Origin": "http://localhost:5173",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
    }
    response = client.options("/api/jobs", headers=headers)
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert "POST" in response.headers["access-control-allow-methods"]

def test_cors_disallowed_method_preflight():
    headers = {
        "Origin": "http://localhost:5173",
        "Access-Control-Request-Method": "PUT",
    }
    response = client.options("/api/jobs", headers=headers)
    # When method is disallowed in Starlette/FastAPI CORSMiddleware preflight:
    # `access-control-allow-methods` header should not be present in response or disallowed
    assert "access-control-allow-methods" not in response.headers or "PUT" not in response.headers.get("access-control-allow-methods", "")

def test_cors_disallowed_header_preflight():
    headers = {
        "Origin": "http://localhost:5173",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "X-Custom-Disallowed-Header",
    }
    response = client.options("/api/jobs", headers=headers)
    # When header is disallowed, access-control-allow-headers should not contain the disallowed header
    assert "X-Custom-Disallowed-Header" not in response.headers.get("access-control-allow-headers", "")
