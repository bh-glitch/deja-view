#!/usr/bin/env python3
"""Prepare and verify InsightFace buffalo_l weights (owner: Bhavya).

Standard library only. Weights land in models/weights/ (git-ignored); provenance
and checksums live in models/manifest.json (committed).

Run from the repo root through the backend environment (it provides certifi):

  uv run --project backend --locked python scripts/prepare-models.py            # download if missing, verify against manifest
  uv run --project backend --locked python scripts/prepare-models.py --verify   # offline: verify existing files only
  uv run --project backend --locked python scripts/prepare-models.py --record   # (Bhavya) write observed checksums to manifest

The backend never downloads at startup; it loads only the verified local directory.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import ssl
import sys
import urllib.request
import zipfile
from datetime import UTC, datetime
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
MANIFEST = REPO_ROOT / "models" / "manifest.json"
WEIGHTS = REPO_ROOT / "models" / "weights"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _ssl_context() -> ssl.SSLContext:
    # Some Python installs (e.g. python.org macOS builds) ship without CA certs;
    # use certifi's bundle when available. Verification is never disabled.
    try:
        import certifi
    except ImportError:
        return ssl.create_default_context()
    return ssl.create_default_context(cafile=certifi.where())


def download(url: str, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    partial = target.with_suffix(target.suffix + ".part")
    print(f"downloading {url}")
    with urllib.request.urlopen(url, timeout=60, context=_ssl_context()) as response, partial.open("wb") as out:
        total = int(response.headers.get("Content-Length") or 0)
        done = 0
        while chunk := response.read(1 << 20):
            out.write(chunk)
            done += len(chunk)
            if total:
                print(f"\r  {done / 1e6:.1f} / {total / 1e6:.1f} MB", end="", flush=True)
    print()
    partial.replace(target)


def safe_extract(archive: Path, destination: Path) -> list[Path]:
    destination.mkdir(parents=True, exist_ok=True)
    extracted = []
    with zipfile.ZipFile(archive) as zf:
        for member in zf.infolist():
            if member.is_dir():
                continue
            name = Path(member.filename).name  # flatten; reject path traversal
            if not name.endswith(".onnx"):
                continue
            target = destination / name
            with zf.open(member) as src, target.open("wb") as dst:
                while chunk := src.read(1 << 20):
                    dst.write(chunk)
            extracted.append(target)
    return extracted


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify", action="store_true", help="offline verification only")
    parser.add_argument("--record", action="store_true", help="write observed checksums")
    args = parser.parse_args()

    manifest = json.loads(MANIFEST.read_text())
    pack = manifest["pack"]
    archive = WEIGHTS / pack["archive"]["filename"]
    model_dir = WEIGHTS / pack["name"]
    expected_archive = pack["archive"].get("sha256")
    expected_files: dict[str, str] = pack.get("files", {})

    if not args.verify:
        if not archive.exists() and not (model_dir.exists() and expected_files):
            download(pack["archive"]["url"], archive)
        if archive.exists():
            observed = sha256(archive)
            print(f"archive sha256 {observed}")
            if expected_archive and observed != expected_archive and not args.record:
                print(f"ERROR: archive checksum mismatch (expected {expected_archive})")
                return 1
            safe_extract(archive, model_dir)
            if args.record:
                pack["archive"]["sha256"] = observed

    if not model_dir.is_dir():
        print(f"ERROR: {model_dir} missing; run without --verify to download")
        return 1

    observed_files = {p.name: sha256(p) for p in sorted(model_dir.glob("*.onnx"))}
    for name, digest in observed_files.items():
        print(f"{digest}  {name}")

    if args.record:
        pack["files"] = observed_files
        pack["recordedAt"] = datetime.now(UTC).isoformat().replace("+00:00", "Z")
        MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")
        print(f"recorded checksums in {MANIFEST.relative_to(REPO_ROOT)}")
        return 0

    if not expected_files:
        print("ERROR: manifest has no recorded checksums; Bhavya must run --record first")
        return 1
    if observed_files != expected_files:
        print("ERROR: model files do not match models/manifest.json")
        return 1
    print("OK: local buffalo_l weights match models/manifest.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
