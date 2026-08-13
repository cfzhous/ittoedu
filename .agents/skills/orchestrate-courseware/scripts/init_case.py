#!/usr/bin/env python3
"""Initialize a minimal CoursewareCaseManifestV2 case without overwriting work."""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from pathlib import Path
from typing import Any

from courseware_case_v2 import PATH_MODES, new_manifest, write_json_atomic


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Initialize a V2 courseware case")
    parser.add_argument("--root", default=".", help="Workspace root; defaults to current directory")
    parser.add_argument("--cases-dir", default="docs/courseware-cases", help="Case parent relative to root")
    parser.add_argument("--case-id", required=True, help="Stable lowercase ID using letters, digits, and hyphens")
    parser.add_argument("--title", required=True, help="Human-readable courseware title")
    parser.add_argument("--brief", required=True, help="Original teaching request or faithful input summary")
    parser.add_argument("--duration-minutes", type=int, required=True, help="Planned total duration")
    parser.add_argument("--path-mode", choices=PATH_MODES, default="standard")
    parser.add_argument("--with-content", action="store_true", help="Create optional content/CNT-001.md")
    return parser.parse_args()


def render_template(path: Path, replacements: dict[str, str]) -> str:
    text = path.read_text(encoding="utf-8")
    for token, value in replacements.items():
        text = text.replace(token, value)
    return text


def create_case_at(
    case_dir: Path,
    *,
    case_id: str,
    title: str,
    brief: str,
    duration_minutes: int,
    path_mode: str,
    with_content: bool,
    migration: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if case_dir.exists():
        raise ValueError(f"refusing to overwrite existing case directory: {case_dir}")
    template_dir = Path(__file__).resolve().parent.parent / "assets" / "case-templates"
    required_templates = {
        "01-courseware-contract.md",
        "02-presentation-script.md",
        "content-item.md",
        "visual-direction.md",
    }
    missing = sorted(name for name in required_templates if not (template_dir / name).is_file())
    if missing:
        raise ValueError("missing case templates: " + ", ".join(missing))

    replacements = {
        "{{CASE_ID}}": case_id,
        "{{TITLE}}": title,
        "{{DURATION_MINUTES}}": str(duration_minutes),
        "{{PATH_MODE}}": path_mode,
    }
    case_dir.mkdir(parents=True)
    try:
        contract = render_template(template_dir / "01-courseware-contract.md", replacements)
        if with_content:
            exact_content = (
                "| 内容 ID | 精确内容位置 | 用途 |\n"
                "| --- | --- | --- |\n"
                "| CNT-001 | `content/CNT-001.md` | [待填写] |"
            )
        else:
            exact_content = render_template(template_dir / "content-item.md", replacements)
        contract = contract.replace("{{EXACT_CONTENT_SECTION}}", exact_content)
        (case_dir / "01-courseware-contract.md").write_text(contract, encoding="utf-8")
        (case_dir / "02-presentation-script.md").write_text(
            render_template(template_dir / "02-presentation-script.md", replacements),
            encoding="utf-8",
        )
        if with_content:
            content_dir = case_dir / "content"
            content_dir.mkdir()
            (content_dir / "CNT-001.md").write_text(
                render_template(template_dir / "content-item.md", replacements),
                encoding="utf-8",
            )
        if path_mode == "high-risk":
            (case_dir / "visual-direction.md").write_text(
                render_template(template_dir / "visual-direction.md", replacements),
                encoding="utf-8",
            )
        manifest = new_manifest(
            case_id=case_id,
            title=title,
            duration_minutes=duration_minutes,
            path_mode=path_mode,
            brief=brief,
            with_content=with_content,
        )
        if migration is not None:
            manifest["migration"] = migration
        write_json_atomic(case_dir / "case.json", manifest)
        return manifest
    except Exception:
        shutil.rmtree(case_dir, ignore_errors=True)
        raise


def main() -> int:
    args = parse_args()
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", args.case_id):
        print("error: --case-id must use lowercase letters, digits, and single hyphens", file=sys.stderr)
        return 2
    if not 1 <= args.duration_minutes <= 600:
        print("error: --duration-minutes must be between 1 and 600", file=sys.stderr)
        return 2
    if not args.brief.strip():
        print("error: --brief must not be empty", file=sys.stderr)
        return 2

    root = Path(args.root).resolve()
    cases_root = (root / args.cases_dir).resolve()
    try:
        cases_root.relative_to(root)
    except ValueError:
        print("error: --cases-dir must resolve inside --root", file=sys.stderr)
        return 2
    case_dir = cases_root / args.case_id
    try:
        create_case_at(
            case_dir,
            case_id=args.case_id,
            title=args.title,
            brief=args.brief,
            duration_minutes=args.duration_minutes,
            path_mode=args.path_mode,
            with_content=args.with_content,
        )
    except (OSError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    print(json.dumps({"status": "initialized", "schemaVersion": 2, "caseDir": str(case_dir)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
