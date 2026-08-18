#!/usr/bin/env python3
"""Scan runtime/component sources and outputs for unsafe display-fraction shortcuts."""

from __future__ import annotations

import argparse
import json
import re
import sys
import zipfile
from pathlib import Path


TEXT_EXTENSIONS = {
    ".html", ".htm", ".json", ".js", ".mjs", ".cjs", ".ts", ".tsx",
    ".jsx", ".md", ".css", ".svg", ".txt",
}
DIAGONAL_FRACTIONS = set("¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞")
NUMERIC_SLASH = re.compile(r"(?<![\w:/])\d+\s*/\s*\d+(?![\w/])")
FORMULA_CONTEXT = re.compile(
    r"(?:formula|公式|data-formula|formulaId|accessibleText|\b[STAF][a-zA-Z]?\s*\(|=)",
    re.IGNORECASE,
)


def iter_text(path: Path):
    if path.is_dir():
        for child in path.rglob("*"):
            if child.is_file() and child.suffix.lower() in TEXT_EXTENSIONS:
                yield str(child), child.read_text(encoding="utf-8", errors="replace")
        return
    if path.suffix.lower() == ".h5lesson":
        with zipfile.ZipFile(path) as archive:
            for name in archive.namelist():
                if Path(name).suffix.lower() in TEXT_EXTENSIONS:
                    yield f"{path}!{name}", archive.read(name).decode("utf-8", errors="replace")
        return
    if path.suffix.lower() in TEXT_EXTENSIONS:
        yield str(path), path.read_text(encoding="utf-8", errors="replace")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Scan Project V8 formula markup")
    parser.add_argument("paths", nargs="+")
    parser.add_argument("--json", action="store_true", dest="as_json")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    errors: list[dict] = []
    warnings: list[dict] = []
    scanned = 0
    for raw_path in args.paths:
        path = Path(raw_path).resolve()
        if not path.exists():
            errors.append({"path": str(path), "message": "path does not exist"})
            continue
        try:
            for label, text in iter_text(path):
                scanned += 1
                for line_number, line in enumerate(text.splitlines(), start=1):
                    found = sorted(set(line) & DIAGONAL_FRACTIONS)
                    if found:
                        errors.append({
                            "path": label,
                            "line": line_number,
                            "message": "diagonal Unicode fraction glyphs are forbidden for display fractions: " + " ".join(found),
                        })
                    for match in NUMERIC_SLASH.finditer(line):
                        context = line[max(0, match.start() - 80): min(len(line), match.end() + 80)]
                        issue = {
                            "path": label,
                            "line": line_number,
                            "message": f"linear numeric fraction {match.group(0)!r} needs semantic review",
                        }
                        if FORMULA_CONTEXT.search(context) or re.search(r">\s*\d+\s*/\s*\d+\s*<", context):
                            errors.append(issue)
                        else:
                            warnings.append(issue)
        except (OSError, zipfile.BadZipFile) as exc:
            errors.append({"path": str(path), "message": str(exc)})

    report = {
        "validator": "project-v8-formula-markup-v1",
        "pipelineStatus": "passed" if not errors else "failed",
        "outcomeStatus": "pending",
        "filesScanned": scanned,
        "errors": errors,
        "warnings": warnings,
    }
    if args.as_json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print(f"pipeline status: {report['pipelineStatus']}")
        print("outcome status: pending")
        print(f"files scanned: {scanned}")
        for issue in errors:
            print(f"ERROR: {issue['path']}:{issue.get('line', 0)} {issue['message']}")
        for issue in warnings:
            print(f"WARNING: {issue['path']}:{issue.get('line', 0)} {issue['message']}")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
