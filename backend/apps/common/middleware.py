"""The project's one custom middleware: request logging."""

import logging
import time
import uuid

logger = logging.getLogger("clinisar.requests")


class RequestLogMiddleware:
    """Gives every request an id and logs its method, path, status code and duration.

    The id is returned in the X-Request-ID header, so a user's error report can be
    matched to the exact line in the server log.
    """

    def __init__(self, get_response) -> None:
        self.get_response = get_response

    def __call__(self, request):
        request_id = uuid.uuid4().hex
        started = time.monotonic()

        response = self.get_response(request)

        duration_ms = (time.monotonic() - started) * 1000
        response["X-Request-ID"] = request_id
        logger.info(
            "%s %s %s %.0fms id=%s",
            request.method,
            request.path,
            response.status_code,
            duration_ms,
            request_id,
        )
        return response
