#!/usr/bin/env python3
"""Initialize a file-backed courseware case without overwriting existing work."""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path


ARTIFACTS = {
    "context": ("00-context.md", "draft"),
    "teachingDesign": ("01-teaching-design.md", "missing"),
    "contentSpec": ("02-content-spec.md", "missing"),
    "presentationScript": ("03-presentation-script.md", "missing"),
    "visualDirection": ("04-visual-direction.md", "missing"),
    "implementationHandoff": ("05-implementation-handoff.md", "missing"),
    "traceability": ("06-traceability.json", "missing"),
    "acceptance": ("07-acceptance.md", "missing"),
}


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Initialize a courseware case directory")
    parser.add_argument("--root", default=".", help="Workspace root; defaults to the current directory")
    parser.add_argument("--cases-dir", default="docs/courseware-cases", help="Case parent relative to root")
    parser.add_argument("--case-id", required=True, help="Stable lowercase ID using letters, digits, and hyphens")
    parser.add_argument("--title", required=True, help="Human-readable courseware title")
    parser.add_argument("--duration-minutes", type=int, required=True, help="Planned total duration")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", args.case_id):
        print("error: --case-id must use lowercase letters, digits, and single hyphens", file=sys.stderr)
        return 2
    if not 1 <= args.duration_minutes <= 600:
        print("error: --duration-minutes must be between 1 and 600", file=sys.stderr)
        return 2

    root = Path(args.root).resolve()
    cases_root = (root / args.cases_dir).resolve()
    try:
        cases_root.relative_to(root)
    except ValueError:
        print("error: --cases-dir must resolve inside --root", file=sys.stderr)
        return 2

    case_dir = cases_root / args.case_id
    if case_dir.exists():
        print(f"error: refusing to overwrite existing case directory: {case_dir}", file=sys.stderr)
        return 1

    template_dir = Path(__file__).resolve().parent.parent / "assets" / "case-templates"
    if not template_dir.is_dir():
        print(f"error: template directory is missing: {template_dir}", file=sys.stderr)
        return 1

    case_dir.mkdir(parents=True)
    replacements = {
        "{{CASE_ID}}": args.case_id,
        "{{TITLE}}": args.title,
        "{{DURATION_MINUTES}}": str(args.duration_minutes),
    }
    try:
        for source in sorted(template_dir.glob("*")):
            if not source.is_file():
                continue
            text = source.read_text(encoding="utf-8")
            for token, value in replacements.items():
                text = text.replace(token, value)
            (case_dir / source.name).write_text(text, encoding="utf-8")

        created_at = now_iso()
        manifest = {
            "schemaVersion": 1,
            "caseId": args.case_id,
            "title": args.title,
            "authoringMode": "ppt-compatible",
            "durationMinutes": args.duration_minutes,
            "stage": "intake",
            "createdAt": created_at,
            "updatedAt": created_at,
            "artifacts": {
                key: {"path": path, "version": "0.1", "status": status}
                for key, (path, status) in ARTIFACTS.items()
            },
            "decisionLogPath": "decisions.json",
            "blockingDecisionIds": [],
        }
        decisions = {"schemaVersion": 1, "caseId": args.case_id, "decisions": []}
        traceability = {
            "schemaVersion": 1,
            "caseId": args.case_id,
            "sourceArtifacts": {},
            "beats": [],
            "implementationObjects": [],
            "coverageExclusions": [],
            "formulas": [],
        }
        write_json(case_dir / "case.json", manifest)
        write_json(case_dir / "decisions.json", decisions)
        write_json(case_dir / "06-traceability.json", traceability)
    except Exception:
        shutil.rmtree(case_dir, ignore_errors=True)
        raise

    print(json.dumps({"status": "initialized", "caseDir": str(case_dir)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
