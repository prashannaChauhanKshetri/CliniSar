"""Tests for the upload checker used by documents and lab result files."""

import pytest
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.common.validators import MAX_UPLOAD_BYTES, validate_upload


@pytest.mark.parametrize(
    ("name", "content"),
    [
        ("report.pdf", b"%PDF-1.7 ..."),
        ("SCAN.PDF", b"%PDF-1.4"),  # upper-case extension
        ("photo.jpg", b"\xff\xd8\xff\xe0 jpeg"),
        ("photo.jpeg", b"\xff\xd8\xff\xe1 jpeg"),
        ("image.png", b"\x89PNG\r\n\x1a\n rest"),
    ],
)
def test_real_pdf_jpg_and_png_files_pass(name, content) -> None:
    file = SimpleUploadedFile(name, content)
    validate_upload(file)
    assert file.read() == content  # the reading position was put back


@pytest.mark.parametrize(
    ("name", "content"),
    [
        ("notes.txt", b"hello"),
        ("archive.zip", b"PK\x03\x04"),
        ("no_extension", b"%PDF"),
        ("fake.pdf", b"<html>"),
        ("fake.png", b"\xff\xd8\xff"),  # JPEG content with a .png name
    ],
)
def test_other_or_disguised_files_fail(name, content) -> None:
    with pytest.raises(ValidationError):
        validate_upload(SimpleUploadedFile(name, content))


def test_exactly_10_mb_is_allowed_one_byte_more_is_not() -> None:
    validate_upload(SimpleUploadedFile("a.pdf", b"%PDF" + b"0" * (MAX_UPLOAD_BYTES - 4)))
    with pytest.raises(ValidationError):
        validate_upload(SimpleUploadedFile("a.pdf", b"%PDF" + b"0" * (MAX_UPLOAD_BYTES - 3)))
