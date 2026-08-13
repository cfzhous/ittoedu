#!/usr/bin/env python3
"""Manage V2 artifact hashes and exact-scope human review approvals."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from courseware_case_v2 import (
    artifact_current_hash,
    archive_review,
    clear_review_state,
    invalidate_from_artifact,
    invalidate_readiness,
    is_automated_identity,
    load_manifest,
    next_stage,
    now_iso,
    resolve_inside,
    review_order,
    review_scope_sha256,
    save_manifest,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Manage V2 courseware artifacts and review scopes")
    parser.add_argument("case_dir")
    subparsers = parser.add_subparsers(dest="command", required=True)

    ready = subparsers.add_parser("ready")
    ready.add_argument("artifact_key")

    review_ready = subparsers.add_parser("review-ready")
    review_ready.add_argument("review_key")

    approve = subparsers.add_parser("approve")
    approve.add_argument("review_key")
    approve.add_argument("--approved-by", required=True, help="Named human reviewer; automation must not invent this")
    approve.add_argument("--evidence", required=True, help="Explicit approval evidence for this exact scope")

    reject = subparsers.add_parser("reject")
    reject.add_argument("review_key")
    reject.add_argument("--evidence", required=True)

    invalidate = subparsers.add_parser("invalidate")
    invalidate.add_argument("artifact_key")
    invalidate.add_argument("--reason", required=True)

    subparsers.add_parser("status")
    return parser.parse_args()


def require_artifact(manifest: dict, key: str) -> dict:
    artifact = manifest["artifacts"].get(key)
    if not isinstance(artifact, dict):
        raise ValueError(f"unknown artifact: {key}")
    return artifact


def require_review(manifest: dict, key: str) -> dict:
    review = manifest["reviews"].get(key)
    if not isinstance(review, dict):
        raise ValueError(f"unknown review for pathMode {manifest.get('pathMode')}: {key}")
    return review


def artifact_is_ready(case_dir: Path, artifact: dict) -> bool:
    current_hash = artifact_current_hash(case_dir, artifact)
    if current_hash is None:
        return artifact.get("status") in ("not-present", "not-required") and not artifact.get("required")
    return artifact.get("status") == "ready-for-review" and artifact.get("sha256") == current_hash


def review_dependencies_are_current(case_dir: Path, manifest: dict, review: dict) -> None:
    for dependency_key in review.get("dependsOn", []):
        dependency = require_review(manifest, dependency_key)
        if dependency.get("status") != "approved":
            raise ValueError(f"upstream review is not approved: {dependency_key}")
        current_scope = review_scope_sha256(case_dir, manifest, dependency_key)
        if dependency.get("scopeSha256") != current_scope:
            raise ValueError(f"upstream review scope is stale: {dependency_key}")


def main() -> int:
    args = parse_args()
    case_dir = Path(args.case_dir).resolve()
    try:
        manifest_path, manifest = load_manifest(case_dir)

        if args.command == "status":
            artifact_rows = []
            for key, artifact in manifest["artifacts"].items():
                current_hash = artifact_current_hash(case_dir, artifact)
                artifact_rows.append({
                    "key": key,
                    "status": artifact.get("status"),
                    "required": bool(artifact.get("required")),
                    "currentSha256": current_hash,
                    "hashMatches": artifact.get("sha256") in (None, current_hash),
                })
            review_rows = []
            for key in review_order(manifest):
                review = manifest["reviews"][key]
                current_scope = review_scope_sha256(case_dir, manifest, key)
                review_rows.append({
                    "key": key,
                    "status": review.get("status"),
                    "currentScopeSha256": current_scope,
                    "scopeMatches": review.get("scopeSha256") in (None, current_scope),
                })
            print(json.dumps({
                "stage": manifest.get("stage"),
                "resultStatus": manifest.get("resultStatus"),
                "derivedReadiness": manifest.get("derivedReadiness"),
                "artifacts": artifact_rows,
                "reviews": review_rows,
            }, ensure_ascii=False, indent=2))
            return 0

        if args.command == "ready":
            key = args.artifact_key
            artifact = require_artifact(manifest, key)
            path = resolve_inside(case_dir, str(artifact.get("path", "")))
            current_hash = artifact_current_hash(case_dir, artifact)
            if current_hash is None:
                raise ValueError(f"artifact path does not exist: {path}")
            old_hash = artifact.get("sha256")
            invalidated = []
            if old_hash != current_hash or artifact.get("status") != "ready-for-review":
                invalidated = invalidate_from_artifact(manifest, key, f"artifact changed or re-opened: {key}")
            artifact["status"] = "ready-for-review"
            artifact["sha256"] = current_hash
            artifact["readyAt"] = now_iso()
            artifact.pop("invalidationReason", None)
            manifest["stage"] = next_stage(manifest)
            save_manifest(manifest_path, manifest)
            print(json.dumps({
                "status": "ready-for-review",
                "artifact": key,
                "sha256": current_hash,
                "invalidatedReviews": invalidated,
            }, ensure_ascii=False))
            return 0

        if args.command == "invalidate":
            key = args.artifact_key
            artifact = require_artifact(manifest, key)
            artifact["status"] = "draft"
            artifact.pop("sha256", None)
            artifact.pop("readyAt", None)
            artifact["invalidationReason"] = args.reason
            invalidated = invalidate_from_artifact(manifest, key, args.reason)
            manifest["stage"] = next_stage(manifest)
            save_manifest(manifest_path, manifest)
            print(json.dumps({"status": "draft", "artifact": key, "invalidatedReviews": invalidated}, ensure_ascii=False))
            return 0

        review_key = args.review_key
        review = require_review(manifest, review_key)

        if args.command == "review-ready":
            for artifact_key in review.get("covers", []):
                artifact = require_artifact(manifest, artifact_key)
                if not artifact_is_ready(case_dir, artifact):
                    raise ValueError(f"covered artifact is not current and ready: {artifact_key}")
            review_dependencies_are_current(case_dir, manifest, review)
            current_scope = review_scope_sha256(case_dir, manifest, review_key)
            if review.get("scopeSha256") not in (None, current_scope) or review.get("status") == "approved":
                archive_review(manifest, review_key, "review scope reopened")
            clear_review_state(review, "ready-for-review")
            review["scopeSha256"] = current_scope
            review["readyAt"] = now_iso()
            invalidate_readiness(manifest, f"review awaiting approval: {review_key}")
            manifest["stage"] = next_stage(manifest)
            save_manifest(manifest_path, manifest)
            print(json.dumps({"status": "ready-for-review", "review": review_key, "scopeSha256": current_scope}, ensure_ascii=False))
            return 0

        if args.command == "approve":
            if review.get("status") != "ready-for-review":
                raise ValueError("review must be ready-for-review before approval")
            for artifact_key in review.get("covers", []):
                if not artifact_is_ready(case_dir, require_artifact(manifest, artifact_key)):
                    raise ValueError(f"covered artifact changed or is not ready: {artifact_key}")
            review_dependencies_are_current(case_dir, manifest, review)
            current_scope = review_scope_sha256(case_dir, manifest, review_key)
            if review.get("scopeSha256") != current_scope:
                raise ValueError("review scope changed after it was presented; run review-ready again")
            if not args.approved_by.strip() or not args.evidence.strip():
                raise ValueError("human reviewer and explicit evidence must not be empty")
            if is_automated_identity(args.approved_by):
                raise ValueError("approved-by must identify a human; automated identities cannot approve")
            review.update({
                "status": "approved",
                "scopeSha256": current_scope,
                "approvedBy": args.approved_by.strip(),
                "approvedAt": now_iso(),
                "approvalEvidence": args.evidence.strip(),
            })
            invalidate_readiness(manifest, f"readiness must be re-derived after approval: {review_key}")
            manifest["stage"] = next_stage(manifest)
            save_manifest(manifest_path, manifest)
            print(json.dumps({"status": "approved", "review": review_key, "scopeSha256": current_scope}, ensure_ascii=False))
            return 0

        if args.command == "reject":
            current_scope = review_scope_sha256(case_dir, manifest, review_key)
            archive_review(manifest, review_key, "human rejection")
            clear_review_state(review, "rejected")
            review.update({
                "scopeSha256": current_scope,
                "rejectedAt": now_iso(),
                "rejectionEvidence": args.evidence,
            })
            invalidate_readiness(manifest, f"review rejected: {review_key}")
            manifest["stage"] = next_stage(manifest)
            save_manifest(manifest_path, manifest)
            print(json.dumps({"status": "rejected", "review": review_key}, ensure_ascii=False))
            return 0
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
