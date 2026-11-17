"""pytest settings shared by every back-end test."""

import pytest


@pytest.fixture(autouse=True)
def temporary_media_folder(settings, tmp_path) -> None:
    """Send files uploaded during tests to a throwaway folder instead of backend/media."""
    settings.MEDIA_ROOT = tmp_path
