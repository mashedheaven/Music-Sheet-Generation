"""Tests for file_service.py and path resolution security."""

from pathlib import Path
import pytest

from app.config import settings
from app.services.file_service import get_absolute_path


def test_get_absolute_path_valid():
    """Test get_absolute_path with valid relative paths."""
    rel_path = "uploads/test_file.wav"
    abs_path = get_absolute_path(rel_path)
    base_dir = Path(settings.STORAGE_BASE_PATH).resolve()

    assert abs_path == base_dir / "uploads/test_file.wav"
    assert abs_path.is_relative_to(base_dir)


@pytest.mark.parametrize(
    "traversal_path",
    [
        "../../etc/passwd",
        "../secret.txt",
        "/etc/passwd",
        "uploads/../../etc/passwd",
        "uploads/../..",
    ],
)
def test_get_absolute_path_traversal_prevention(traversal_path: str):
    """Test get_absolute_path raises ValueError on path traversal attempts."""
    with pytest.raises(ValueError, match="Path traversal attempt detected"):
        get_absolute_path(traversal_path)
