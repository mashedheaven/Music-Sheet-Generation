"""Tests for CORS configuration and preflight requests."""

from fastapi.testclient import TestClient


class TestCORSConfiguration:
    """Tests for CORS headers and preflight handling."""

    def test_cors_preflight_allowed_method_and_header(self, client: TestClient):
        """Preflight OPTIONS request with allowed method and header should succeed."""
        response = client.options(
            "/api/health",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "Content-Type, Authorization",
            },
        )
        assert response.status_code == 200
        assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"
        assert "POST" in response.headers.get("access-control-allow-methods", "")

    def test_cors_preflight_disallowed_method(self, client: TestClient):
        """Preflight OPTIONS request with disallowed method (e.g. PUT or PATCH) should not allow method."""
        response = client.options(
            "/api/health",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "PUT",
            },
        )
        # FastApi / Starlette CORSMiddleware returns 400 or does not include allow-methods header for invalid request method
        allow_methods = response.headers.get("access-control-allow-methods", "")
        assert "PUT" not in allow_methods

    def test_cors_preflight_disallowed_header(self, client: TestClient):
        """Preflight OPTIONS request with disallowed header should not allow header."""
        response = client.options(
            "/api/health",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "X-Custom-Malicious-Header",
            },
        )
        allow_headers = response.headers.get("access-control-allow-headers", "")
        assert "X-Custom-Malicious-Header" not in allow_headers

    def test_cors_unallowed_origin(self, client: TestClient):
        """Request from untrusted origin should not receive Access-Control-Allow-Origin header."""
        response = client.get(
            "/api/health",
            headers={"Origin": "http://evil-attacker.com"},
        )
        assert response.headers.get("access-control-allow-origin") is None
