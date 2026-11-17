"""Tests for RequestLogMiddleware."""

import logging
import re


def test_every_response_has_a_request_id(client) -> None:
    first = client.get("/api/docs/")
    second = client.get("/api/docs/")
    assert re.fullmatch(r"[0-9a-f]{32}", first["X-Request-ID"])
    assert first["X-Request-ID"] != second["X-Request-ID"]


def test_error_responses_also_have_a_request_id(client) -> None:
    response = client.get("/no-such-page/")
    assert response.status_code == 404
    assert "X-Request-ID" in response


def test_request_is_logged_with_method_path_status_duration_and_id(client, caplog) -> None:
    with caplog.at_level(logging.INFO, logger="clinisar.requests"):
        response = client.get("/api/v1/auth/me/")

    messages = [r.getMessage() for r in caplog.records if r.name == "clinisar.requests"]
    assert len(messages) == 1
    pattern = r"GET /api/v1/auth/me/ 401 \d+ms id=" + response["X-Request-ID"]
    assert re.fullmatch(pattern, messages[0])
