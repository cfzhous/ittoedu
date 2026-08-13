#!/usr/bin/env python3
"""Persist material decisions inside CoursewareCaseManifestV2."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

from courseware_case_v2 import (
    invalidate_all_reviews,
    load_manifest,
    next_stage,
    now_iso,
    refresh_blocking_decisions,
    save_manifest,
)


ANSWERED_BY = ("user-structured", "user-text", "safe-default")


def boolean(value: str) -> bool:
    lowered = value.lower()
    if lowered in ("true", "yes", "1"):
        return True
    if lowered in ("false", "no", "0"):
        return False
    raise ValueError("expected true or false")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Manage embedded V2 case decisions")
    parser.add_argument("case_dir")
    subparsers = parser.add_subparsers(dest="command", required=True)

    add = subparsers.add_parser("add")
    add.add_argument("--id", required=True)
    add.add_argument("--stage", required=True)
    add.add_argument("--question", required=True)
    add.add_argument("--reason", required=True)
    add.add_argument("--non-blocking", action="store_true")
    add.add_argument("--min-selections", type=int, default=1)
    add.add_argument("--max-selections", type=int, default=1)
    add.add_argument(
        "--option",
        action="append",
        nargs=4,
        metavar=("ID", "LABEL", "DESCRIPTION", "RECOMMENDED"),
        required=True,
        help="Repeat 2-3 times; RECOMMENDED is true or false",
    )
    add.add_argument("--safe-default", help="Option ID usable only when the host tool is unavailable")

    answer = subparsers.add_parser("answer")
    answer.add_argument("decision_id")
    answer.add_argument("--answered-by", choices=ANSWERED_BY, required=True)
    answer.add_argument("--selected", action="append", default=[])
    answer.add_argument("--text")

    subparsers.add_parser("status")
    return parser.parse_args()


def find_decision(manifest: dict, decision_id: str) -> dict:
    matches = [decision for decision in manifest["decisions"] if decision.get("id") == decision_id]
    if len(matches) != 1:
        raise ValueError(f"expected exactly one decision {decision_id}, found {len(matches)}")
    return matches[0]


def main() -> int:
    args = parse_args()
    case_dir = Path(args.case_dir).resolve()
    try:
        manifest_path, manifest = load_manifest(case_dir)
        if not isinstance(manifest.get("decisions"), list):
            raise ValueError("case.json decisions must be an array")

        if args.command == "status":
            refresh_blocking_decisions(manifest)
            print(json.dumps({
                "stage": manifest.get("stage"),
                "blockingDecisionIds": manifest.get("blockingDecisionIds"),
                "decisions": manifest["decisions"],
            }, ensure_ascii=False, indent=2))
            return 0

        if args.command == "add":
            if not re.fullmatch(r"DEC-\d{3,}", args.id):
                raise ValueError("decision --id must match DEC-001")
            if any(decision.get("id") == args.id for decision in manifest["decisions"]):
                raise ValueError(f"duplicate decision ID: {args.id}")
            if not 2 <= len(args.option) <= 3:
                raise ValueError("a structured decision must contain 2-3 options")
            if not 1 <= args.min_selections <= args.max_selections <= 3:
                raise ValueError("selection bounds must satisfy 1 <= min <= max <= 3")
            options = []
            option_ids = set()
            recommendation_count = 0
            for option_id, label, description, recommended_text in args.option:
                if option_id in option_ids:
                    raise ValueError(f"duplicate option ID: {option_id}")
                if not option_id.startswith(args.id + "-"):
                    raise ValueError(f"option ID must be scoped by {args.id}: {option_id}")
                recommended = boolean(recommended_text)
                recommendation_count += int(recommended)
                option_ids.add(option_id)
                options.append({
                    "id": option_id,
                    "label": label,
                    "description": description,
                    "recommended": recommended,
                })
            if recommendation_count > 1:
                raise ValueError("at most one option may be recommended")
            if options[0]["recommended"] is not True:
                raise ValueError("the recommended option must be first")
            if args.safe_default and args.safe_default not in option_ids:
                raise ValueError("--safe-default must name one of the options")
            manifest["decisions"].append({
                "schemaVersion": 1,
                "id": args.id,
                "stage": args.stage,
                "question": args.question,
                "reason": args.reason,
                "blocking": not args.non_blocking,
                "minSelections": args.min_selections,
                "maxSelections": args.max_selections,
                "options": options,
                "safeDefaultOptionId": args.safe_default,
                "response": None,
                "createdAt": now_iso(),
            })
            invalidate_all_reviews(manifest, f"decision added: {args.id}")
            refresh_blocking_decisions(manifest)
            manifest["stage"] = next_stage(manifest)
            save_manifest(manifest_path, manifest)
            print(json.dumps({"status": "pending", "decisionId": args.id, "stage": manifest["stage"]}, ensure_ascii=False))
            return 0

        decision = find_decision(manifest, args.decision_id)
        option_ids = {option.get("id") for option in decision.get("options", [])}
        selected = list(dict.fromkeys(args.selected))
        if any(option_id not in option_ids for option_id in selected):
            raise ValueError("--selected contains an unknown option ID")
        if args.answered_by == "user-text":
            if not args.text or not args.text.strip():
                raise ValueError("user-text answers require --text")
        else:
            if not decision.get("minSelections", 1) <= len(selected) <= decision.get("maxSelections", 1):
                raise ValueError("selected option count violates the decision bounds")
        if args.answered_by == "safe-default":
            safe_default = decision.get("safeDefaultOptionId")
            if not safe_default:
                raise ValueError("decision has no safe default; pause for a user answer")
            if selected != [safe_default]:
                raise ValueError("safe-default answer must select the recorded safe default")

        previous = decision.get("response")
        decision["response"] = {
            "selectedOptionIds": selected,
            "text": args.text,
            "answeredBy": args.answered_by,
            "answeredAt": now_iso(),
        }
        reason = f"decision response {'changed' if previous else 'recorded'}: {args.decision_id}"
        invalidate_all_reviews(manifest, reason)
        refresh_blocking_decisions(manifest)
        manifest["stage"] = next_stage(manifest)
        save_manifest(manifest_path, manifest)
        print(json.dumps({
            "status": "answered",
            "decisionId": args.decision_id,
            "answeredBy": args.answered_by,
            "stage": manifest["stage"],
        }, ensure_ascii=False))
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
