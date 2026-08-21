from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Any

import pandas as pd

from api.signal_model.validation import build_input_failure_report, run_locked_validation


def _sha256(path: Path) -> str | None:
    if not path.exists():
        return None
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _git_commit() -> str | None:
    try:
        return subprocess.run(
            ["git", "rev-parse", "HEAD"],
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return None


def atomic_json_write(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    encoded = json.dumps(value, indent=2, sort_keys=True, allow_nan=False) + "\n"
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=path.parent, delete=False
    ) as handle:
        handle.write(encoded)
        temporary = Path(handle.name)
    os.replace(temporary, path)


def _comparable(report: dict[str, Any]) -> dict[str, Any]:
    release = report.get("release", {})
    return {
        "dataset": report.get("dataset"),
        "fold_boundaries": report.get("fold_boundaries"),
        "release": {
            "approved": release.get("approved"),
            "threshold": release.get("threshold"),
            "baseline_win_rate": release.get("baseline_win_rate"),
            "metrics": release.get("metrics"),
            "failures": release.get("failures"),
        },
        "artifact_checksum": report.get("artifact_checksum"),
    }


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the locked signal-model validation")
    parser.add_argument("--market", choices=("IN", "US"), required=True)
    parser.add_argument("--dataset")
    parser.add_argument("--model-version", required=True)
    parser.add_argument("--report", required=True)
    parser.add_argument("--artifact", required=True)
    parser.add_argument("--compare-report")
    parser.add_argument("--input-failure")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    comparison = (
        json.loads(Path(args.compare_report).read_text(encoding="utf-8"))
        if args.compare_report
        else None
    )
    if args.input_failure:
        report = build_input_failure_report(
            args.market,
            args.model_version,
            args.input_failure,
            code_commit=_git_commit(),
        )
        atomic_json_write(Path(args.report), report)
        print(json.dumps(report["release"], indent=2))
        return 2
    if not args.dataset:
        raise SystemExit("--dataset is required unless --input-failure is supplied")
    dataset_path = Path(args.dataset)
    manifest_path = dataset_path.with_suffix(".manifest.json")
    frame = pd.read_csv(dataset_path, compression="gzip")
    result = run_locked_validation(
        frame,
        market=args.market,
        model_version=args.model_version,
        dataset_hash=_sha256(dataset_path),
        dataset_manifest_hash=_sha256(manifest_path),
        code_commit=_git_commit(),
    )
    report_path = Path(args.report)
    atomic_json_write(report_path, result.report)
    if comparison is not None:
        if _comparable(result.report) != _comparable(comparison):
            print(json.dumps({"status": "mismatch", "report": str(report_path)}))
            return 3
    if not result.report["release"]["approved"]:
        print(json.dumps(result.report["release"], indent=2))
        return 2
    atomic_json_write(Path(args.artifact), result.artifact)
    print(json.dumps(result.report["release"], indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
