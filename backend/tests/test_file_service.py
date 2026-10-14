import uuid
import pytest
from app.services.file_service import delete_job_files
from app.config import settings


def test_delete_job_files_valid_uuid(tmp_path, monkeypatch):
    test_uuid = str(uuid.uuid4())
    base_storage = tmp_path / "storage"
    upload_dir = base_storage / "uploads"
    stems_dir = base_storage / "stems"
    scores_dir = base_storage / "scores"
    exports_dir = base_storage / "exports"

    upload_dir.mkdir(parents=True)
    stems_dir.mkdir(parents=True)
    scores_dir.mkdir(parents=True)
    exports_dir.mkdir(parents=True)

    monkeypatch.setattr(settings, "STORAGE_BASE_PATH", str(base_storage))

    job_dir = upload_dir / test_uuid
    job_dir.mkdir()
    dummy_file = job_dir / "test.txt"
    dummy_file.write_text("hello")

    assert dummy_file.exists()
    delete_job_files(test_uuid)
    assert not job_dir.exists()


@pytest.mark.parametrize(
    "invalid_id",
    [
        "..",
        "../..",
        "/etc/passwd",
        "../../uploads",
        "invalid-uuid-string",
        "12345",
        "",
    ],
)
def test_delete_job_files_invalid_id_raises(invalid_id, tmp_path, monkeypatch):
    base_storage = tmp_path / "storage"
    upload_dir = base_storage / "uploads"
    upload_dir.mkdir(parents=True)

    monkeypatch.setattr(settings, "STORAGE_BASE_PATH", str(base_storage))

    with pytest.raises(ValueError):
        delete_job_files(invalid_id)

    # Ensure upload_dir was not deleted or modified
    assert upload_dir.exists()
