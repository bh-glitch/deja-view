"""Phase 1 probe: saved data survives a real process restart (owner: Arnav).

Each step runs in a fresh Python interpreter against the same tmp_path database,
so nothing is carried over in memory.
"""

from __future__ import annotations

import json
import subprocess
import sys
import textwrap
from pathlib import Path

from app.config import BACKEND_DIR

_PRELUDE = textwrap.dedent(
    """
    import json, sys
    from pathlib import Path
    from uuid import UUID
    from app.db import repository
    from app.db.database import Database
    from tests import db_support
    # Test stand-ins for Bhavya's not-yet-implemented validators (see db_support).
    repository.validate_embedding = db_support.strict_validate_embedding
    repository.check_enrollment_coherence = db_support.accept_coherence
    db = Database(Path(sys.argv[1]))
    db.initialize()
    """
)

_WRITE = _PRELUDE + textwrap.dedent(
    """
    person = repository.create_person(db, db_support.person_request(), db_support.TEST_MODEL)
    repository.create_conversation(db, db_support.conversation_request(person.id))
    print(json.dumps({"personId": str(person.id)}))
    """
)

_READ = _PRELUDE + textwrap.dedent(
    """
    person_id = UUID(sys.argv[2])
    detail = repository.get_person_detail(db, person_id)
    gallery = repository.load_gallery(db, db_support.TEST_MODEL)
    print(json.dumps({
        "detail": detail.model_dump(mode="json"),
        "galleryShape": [list(e.embeddings.shape) for e in gallery.entries],
        "firstValue": float(gallery.entries[0].embeddings[0][0]),
    }))
    """
)


def _run(script: str, *args: str) -> dict:
    completed = subprocess.run(
        [sys.executable, "-c", script, *args],
        cwd=BACKEND_DIR,
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert completed.returncode == 0, completed.stderr
    return json.loads(completed.stdout.strip().splitlines()[-1])


def test_people_embeddings_and_conversations_survive_restart(tmp_path: Path) -> None:
    from tests.db_support import unit_vectors

    path = str(tmp_path / "restart-fixture.db")
    written = _run(_WRITE, path)
    read = _run(_READ, path, written["personId"])

    detail = read["detail"]
    assert detail["person"]["id"] == written["personId"]
    assert detail["person"]["displayName"] == "Alex Demo"
    assert len(detail["conversations"]) == 1
    assert detail["latestCue"] == "Ask how the robot arm demo went."
    assert read["galleryShape"] == [[3, 512]]
    assert abs(read["firstValue"] - unit_vectors(3, 1)[0][0]) < 1e-6
