#!/usr/bin/env python3
"""Shared deterministic primitives for CoursewareCaseManifestV2 tools."""

from __future__ import annotations

import hashlib
import json
import os
import re
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SCHEMA_VERSION = 2
TARGET_PROJECT_SCHEMA_VERSION = 8
PATH_MODES = ("fast", "standard", "high-risk")
ARTIFACT_SPECS = {
    "coursewareContract": {"kind": "file", "path": "01-courseware-contract.md"},
    "presentationScript": {"kind": "file", "path": "02-presentation-script.md"},
    "contentBundle": {"kind": "directory", "path": "content"},
    "visualDirection": {"kind": "file", "path": "visual-direction.md"},
}
REVIEW_PROFILES = {
    "fast": {
        "experience": {
            "covers": ["coursewareContract", "contentBundle", "presentationScript"],
            "dependsOn": [],
            "stage": "experience-review",
        }
    },
    "standard": {
        "contract": {
            "covers": ["coursewareContract", "contentBundle"],
            "dependsOn": [],
            "stage": "contract-review",
        },
        "presentationScript": {
            "covers": ["presentationScript"],
            "dependsOn": ["contract"],
            "stage": "presentation-script-review",
        },
    },
    "high-risk": {
        "contract": {
            "covers": ["coursewareContract", "contentBundle"],
            "dependsOn": [],
            "stage": "contract-review",
        },
        "presentationScript": {
            "covers": ["presentationScript"],
            "dependsOn": ["contract"],
            "stage": "presentation-script-review",
        },
        "visualDirection": {
            "covers": ["visualDirection"],
            "dependsOn": ["presentationScript"],
            "stage": "visual-review",
        },
    },
}
APPROVAL_FIELDS = ("scopeSha256", "approvedBy", "approvedAt", "approvalEvidence")
AUTOMATED_IDENTITY_WORDS = {
    "ai",
    "assistant",
    "automation",
    "bot",
    "builder",
    "chatgpt",
    "claude",
    "codex",
    "copilot",
    "gemini",
    "gpt",
    "llm",
    "model",
    "openai",
    "robot",
    "agent",
}
AUTOMATED_IDENTITY_PHRASES = ("自动化", "智能体", "人工智能", "大模型", "构建器", "机器人")


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def is_automated_identity(value: object) -> bool:
    text = str(value or "").strip().lower()
    if not text:
        return False
    words = {word for word in re.split(r"[^a-z0-9]+", text) if word}
    return bool(words & AUTOMATED_IDENTITY_WORDS) or any(phrase in text for phrase in AUTOMATED_IDENTITY_PHRASES)


def canonical_bytes(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sha256_directory(path: Path) -> str:
    files = []
    for candidate in sorted((item for item in path.rglob("*") if item.is_file()), key=lambda item: item.as_posix()):
        files.append({
            "path": candidate.relative_to(path).as_posix(),
            "sha256": sha256_file(candidate),
        })
    return sha256_bytes(canonical_bytes(files))


def write_json_atomic(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def resolve_inside(case_dir: Path, relative_path: str) -> Path:
    candidate = (case_dir / relative_path).resolve()
    try:
        candidate.relative_to(case_dir.resolve())
    except ValueError as exc:
        raise ValueError(f"path escapes case directory: {relative_path}") from exc
    return candidate


def load_manifest(case_dir: Path) -> tuple[Path, dict[str, Any]]:
    manifest_path = case_dir / "case.json"
    if not manifest_path.is_file():
        raise ValueError(f"missing manifest: {manifest_path}")
    value = json.loads(manifest_path.read_text(encoding="utf-8"))
    if value.get("schemaVersion") != SCHEMA_VERSION:
        raise ValueError("case.json is not CoursewareCaseManifestV2")
    if not isinstance(value.get("artifacts"), dict) or not isinstance(value.get("reviews"), dict):
        raise ValueError("case.json is missing V2 artifacts or reviews")
    return manifest_path, value


def save_manifest(path: Path, manifest: dict[str, Any]) -> None:
    manifest["updatedAt"] = now_iso()
    write_json_atomic(path, manifest)


def artifact_current_hash(case_dir: Path, artifact: dict[str, Any]) -> str | None:
    path = resolve_inside(case_dir, str(artifact.get("path", "")))
    kind = artifact.get("kind")
    if kind == "file":
        return sha256_file(path) if path.is_file() else None
    if kind == "directory":
        return sha256_directory(path) if path.is_dir() else None
    raise ValueError(f"unknown artifact kind: {kind!r}")


def artifact_snapshot(case_dir: Path, key: str, artifact: dict[str, Any]) -> dict[str, Any]:
    return {
        "key": key,
        "kind": artifact.get("kind"),
        "path": artifact.get("path"),
        "required": bool(artifact.get("required")),
        "status": artifact.get("status"),
        "sha256": artifact_current_hash(case_dir, artifact),
    }


def decisions_sha256(manifest: dict[str, Any]) -> str:
    return sha256_bytes(canonical_bytes(manifest.get("decisions", [])))


def inputs_sha256(manifest: dict[str, Any]) -> str:
    return sha256_bytes(canonical_bytes(manifest.get("inputs", {})))


def review_scope_payload(
    case_dir: Path,
    manifest: dict[str, Any],
    review_key: str,
    visiting: set[str] | None = None,
) -> dict[str, Any]:
    reviews = manifest["reviews"]
    review = reviews.get(review_key)
    if not isinstance(review, dict):
        raise ValueError(f"unknown review: {review_key}")
    visiting = set() if visiting is None else set(visiting)
    if review_key in visiting:
        raise ValueError(f"review dependency cycle at {review_key}")
    visiting.add(review_key)
    artifacts = manifest["artifacts"]
    covered = {}
    for artifact_key in review.get("covers", []):
        artifact = artifacts.get(artifact_key)
        if not isinstance(artifact, dict):
            raise ValueError(f"review {review_key} covers unknown artifact {artifact_key}")
        covered[artifact_key] = artifact_snapshot(case_dir, artifact_key, artifact)
    dependencies = {}
    for dependency_key in review.get("dependsOn", []):
        dependency = reviews.get(dependency_key)
        if not isinstance(dependency, dict):
            raise ValueError(f"review {review_key} depends on unknown review {dependency_key}")
        dependencies[dependency_key] = {
            "status": dependency.get("status"),
            "currentScopeSha256": review_scope_sha256(case_dir, manifest, dependency_key, visiting),
        }
    return {
        "schemaVersion": SCHEMA_VERSION,
        "caseId": manifest.get("caseId"),
        "title": manifest.get("title"),
        "durationMinutes": manifest.get("durationMinutes"),
        "authoringMode": manifest.get("authoringMode"),
        "targetProjectSchemaVersion": manifest.get("targetProjectSchemaVersion"),
        "pathMode": manifest.get("pathMode"),
        "reviewKey": review_key,
        "inputsSha256": inputs_sha256(manifest),
        "decisionsSha256": decisions_sha256(manifest),
        "artifacts": covered,
        "dependencies": dependencies,
    }


def review_scope_sha256(
    case_dir: Path,
    manifest: dict[str, Any],
    review_key: str,
    visiting: set[str] | None = None,
) -> str:
    return sha256_bytes(canonical_bytes(review_scope_payload(case_dir, manifest, review_key, visiting)))


def expected_reviews(path_mode: str) -> dict[str, Any]:
    if path_mode not in REVIEW_PROFILES:
        raise ValueError(f"unknown pathMode: {path_mode}")
    return {
        key: {
            "required": True,
            "covers": deepcopy(spec["covers"]),
            "dependsOn": deepcopy(spec["dependsOn"]),
            "status": "pending",
        }
        for key, spec in REVIEW_PROFILES[path_mode].items()
    }


def review_order(manifest: dict[str, Any]) -> list[str]:
    profile = REVIEW_PROFILES.get(str(manifest.get("pathMode")), {})
    return list(profile)


def review_stage(manifest: dict[str, Any], review_key: str) -> str:
    profile = REVIEW_PROFILES.get(str(manifest.get("pathMode")), {})
    return str(profile.get(review_key, {}).get("stage", "review"))


def refresh_blocking_decisions(manifest: dict[str, Any]) -> list[str]:
    blocking = []
    for decision in manifest.get("decisions", []):
        if isinstance(decision, dict) and decision.get("blocking") is True and not decision.get("response"):
            blocking.append(str(decision.get("id", "<missing-id>")))
    manifest["blockingDecisionIds"] = blocking
    return blocking


def archive_review(manifest: dict[str, Any], review_key: str, reason: str) -> None:
    review = manifest["reviews"][review_key]
    if review.get("scopeSha256") or any(review.get(field) for field in APPROVAL_FIELDS[1:]):
        manifest.setdefault("reviewHistory", []).append({
            "reviewKey": review_key,
            "status": review.get("status"),
            "scopeSha256": review.get("scopeSha256"),
            "approvedBy": review.get("approvedBy"),
            "approvedAt": review.get("approvedAt"),
            "approvalEvidence": review.get("approvalEvidence"),
            "rejectedAt": review.get("rejectedAt"),
            "rejectionEvidence": review.get("rejectionEvidence"),
            "invalidatedAt": now_iso(),
            "invalidationReason": reason,
        })


def clear_review_state(review: dict[str, Any], status: str, reason: str | None = None) -> None:
    for field in (*APPROVAL_FIELDS, "rejectedAt", "rejectionEvidence", "readyAt"):
        review.pop(field, None)
    review["status"] = status
    if reason:
        review["staleReason"] = reason
    else:
        review.pop("staleReason", None)


def downstream_reviews(manifest: dict[str, Any], initial: set[str]) -> set[str]:
    affected = set(initial)
    changed = True
    while changed:
        changed = False
        for key, review in manifest["reviews"].items():
            if key not in affected and any(dependency in affected for dependency in review.get("dependsOn", [])):
                affected.add(key)
                changed = True
    return affected


def invalidate_reviews(manifest: dict[str, Any], review_keys: set[str], reason: str) -> list[str]:
    affected = downstream_reviews(manifest, review_keys)
    changed = []
    for review_key in review_order(manifest):
        if review_key not in affected:
            continue
        review = manifest["reviews"][review_key]
        if review.get("status") in ("ready-for-review", "approved", "rejected", "stale"):
            archive_review(manifest, review_key, reason)
            clear_review_state(review, "stale", reason)
            changed.append(review_key)
        elif review.get("status") != "pending":
            clear_review_state(review, "pending")
            changed.append(review_key)
    invalidate_readiness(manifest, reason)
    return changed


def invalidate_from_artifact(manifest: dict[str, Any], artifact_key: str, reason: str) -> list[str]:
    direct = {
        review_key
        for review_key, review in manifest["reviews"].items()
        if artifact_key in review.get("covers", [])
    }
    return invalidate_reviews(manifest, direct, reason)


def invalidate_all_reviews(manifest: dict[str, Any], reason: str) -> list[str]:
    return invalidate_reviews(manifest, set(manifest["reviews"]), reason)


def invalidate_readiness(manifest: dict[str, Any], reason: str) -> None:
    manifest["derivedReadiness"] = {
        "status": "not-ready",
        "evaluatedAt": now_iso(),
        "validator": "courseware-case-v2",
        "artifactHashes": {},
        "approvedReviewHashes": {},
        "exactContentLocations": {},
        "blockingReasons": [reason],
    }
    manifest["stage"] = next_stage(manifest, ignore_readiness=True)


def next_stage(manifest: dict[str, Any], ignore_readiness: bool = False) -> str:
    if refresh_blocking_decisions(manifest):
        return "awaiting-decisions"
    if not ignore_readiness and manifest.get("derivedReadiness", {}).get("status") == "implementation-ready":
        return "implementation-ready"
    for review_key in review_order(manifest):
        if manifest["reviews"][review_key].get("status") != "approved":
            return review_stage(manifest, review_key)
    return "readiness-check"


def new_manifest(
    *,
    case_id: str,
    title: str,
    duration_minutes: int,
    path_mode: str,
    brief: str,
    with_content: bool,
) -> dict[str, Any]:
    created_at = now_iso()
    high_risk = path_mode == "high-risk"
    return {
        "schemaVersion": SCHEMA_VERSION,
        "caseId": case_id,
        "title": title,
        "targetProjectSchemaVersion": TARGET_PROJECT_SCHEMA_VERSION,
        "authoringMode": "ppt-compatible",
        "pathMode": path_mode,
        "durationMinutes": duration_minutes,
        "stage": "intake",
        "resultStatus": "pending",
        "createdAt": created_at,
        "updatedAt": created_at,
        "inputs": {
            "originalRequest": brief,
            "sources": [],
            "constraints": [],
            "assumptions": [],
        },
        "artifacts": {
            "coursewareContract": {
                **ARTIFACT_SPECS["coursewareContract"],
                "required": True,
                "status": "draft",
            },
            "presentationScript": {
                **ARTIFACT_SPECS["presentationScript"],
                "required": True,
                "status": "draft",
            },
            "contentBundle": {
                **ARTIFACT_SPECS["contentBundle"],
                "required": False,
                "status": "draft" if with_content else "not-present",
            },
            "visualDirection": {
                **ARTIFACT_SPECS["visualDirection"],
                "required": high_risk,
                "status": "draft" if high_risk else "not-required",
            },
        },
        "reviews": expected_reviews(path_mode),
        "reviewHistory": [],
        "decisions": [],
        "blockingDecisionIds": [],
        "derivedReadiness": {
            "status": "not-ready",
            "evaluatedAt": created_at,
            "validator": "courseware-case-v2",
            "artifactHashes": {},
            "approvedReviewHashes": {},
            "exactContentLocations": {},
            "blockingReasons": ["required reviews have not been approved"],
        },
    }
