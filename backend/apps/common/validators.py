"""Checks for uploaded files: only PDF, JPG and PNG, at most 10 MB."""

from pathlib import Path

from django.core.exceptions import ValidationError

MAX_UPLOAD_BYTES = 10 * 1024 * 1024

# The first bytes every real file of that type starts with ("magic numbers").
# Checking them stops, for example, a program renamed to report.pdf.
SIGNATURES = {
    ".pdf": [b"%PDF"],
    ".png": [b"\x89PNG\r\n\x1a\n"],
    ".jpg": [b"\xff\xd8\xff"],
    ".jpeg": [b"\xff\xd8\xff"],
}


def validate_upload(file) -> None:
    """Refuse files that are too large, have another extension, or whose content lies."""
    if file.size > MAX_UPLOAD_BYTES:
        raise ValidationError("The file is larger than 10 MB.")

    extension = Path(file.name).suffix.lower()
    if extension not in SIGNATURES:
        raise ValidationError("Only PDF, JPG and PNG files are allowed.")

    start = file.read(8)
    file.seek(0)  # put the reading position back so the file can still be saved
    if not any(start.startswith(signature) for signature in SIGNATURES[extension]):
        raise ValidationError(f"The file content is not a real {extension[1:].upper()} file.")
