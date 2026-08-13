#!/usr/bin/env python3
"""Validate editor-captured Authoring Target geometry for every required entity."""

from __future__ import annotations

import argparse
import json
import math
import re
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Any

from v8_common import load_contract_facts, load_json, sha256_file


SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
SESSION_ID_RE = re.compile(r"^[A-Za-z0-9_.:-]{1,160}$")
OPERATIONS = {
    "select", "edit-content", "edit-value", "replace-asset",
    "move", "resize", "basic-style", "structured-property", "authoring-view",
}
CAPTURE_KEYS = {
    "inventoryEntityId", "persistentBinding", "sceneId", "stateId",
    "sessionTargetId", "selectedTargetId", "selectedBinding", "entryPoint",
    "operations", "renderedBounds", "selectionBounds", "surface",
    "captureMethod", "capturedAt",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate Project V8 Authoring Target snapshots")
    parser.add_argument("snapshot")
    parser.add_argument("--inventory", required=True)
    parser.add_argument("--project", required=True)
    parser.add_argument("--case-dir", required=True)
    parser.add_argument("--target", choices=("implementation", "evidence"), default="implementation")
    parser.add_argument("--json", action="store_true", dest="as_json")
    return parser.parse_args()


def inventory_entities(inventory: dict[str, Any]) -> dict[str, dict[str, Any]]:
    entities: dict[str, dict[str, Any]] = {}
    for entity in inventory.get("globalEntities", []):
        if isinstance(entity, dict) and isinstance(entity.get("id"), str):
            entities[entity["id"]] = {**entity, "_sceneId": None}
    for scene in inventory.get("scenes", []):
        if not isinstance(scene, dict):
            continue
        for entity in scene.get("entities", []):
            if isinstance(entity, dict) and isinstance(entity.get("id"), str):
                entities[entity["id"]] = {**entity, "_sceneId": scene.get("sceneId")}
    return entities


def parse_bounds(value: Any, label: str, errors: list[str]) -> tuple[float, float, float, float] | None:
    if not isinstance(value, dict) or set(value) != {"x", "y", "width", "height"}:
        errors.append(f"{label} must contain exactly x, y, width, height")
        return None
    numbers: list[float] = []
    for key in ("x", "y", "width", "height"):
        item = value.get(key)
        if not isinstance(item, (int, float)) or isinstance(item, bool) or not math.isfinite(item):
            errors.append(f"{label}.{key} must be a finite number")
            return None
        numbers.append(float(item))
    x, y, width, height = numbers
    if x < 0 or y < 0 or width <= 0 or height <= 0 or x + width > 1280 or y + height > 720:
        errors.append(f"{label} must be a positive rectangle inside 1280x720")
        return None
    return x, y, width, height


def intersection_over_union(
    left: tuple[float, float, float, float],
    right: tuple[float, float, float, float],
) -> float:
    lx, ly, lw, lh = left
    rx, ry, rw, rh = right
    intersection_width = max(0.0, min(lx + lw, rx + rw) - max(lx, rx))
    intersection_height = max(0.0, min(ly + lh, ry + rh) - max(ly, ry))
    intersection = intersection_width * intersection_height
    union = lw * lh + rw * rh - intersection
    return intersection / union if union > 0 else 0.0


def required_operations(entity: dict[str, Any], auth: dict[str, str]) -> set[str]:
    operations = {"select"}
    kind = entity.get("kind")
    if kind in {"text", "formula"}:
        operations.add("edit-content")
    elif kind == "asset":
        operations.add("replace-asset")
    else:
        operations.add("edit-value")
    access = auth.get("access")
    if access == "authoring-view":
        operations.add("authoring-view")
    elif access == "structured-property":
        operations.add("structured-property")
    if auth.get("layoutAdjustment") in {"required", "optional"}:
        operations.update({"move", "resize"})
    if auth.get("styleAdjustment") in {"required", "basic"}:
        operations.add("basic-style")
    return operations


def project_document(project_path: Path) -> dict[str, Any]:
    with zipfile.ZipFile(project_path) as archive:
        value = json.loads(archive.read("project.json").decode("utf-8"))
    if not isinstance(value, dict) or value.get("schemaVersion") != 8:
        raise ValueError("snapshot project must be a readable Project V8 archive")
    return value


def native_project_bounds(
    project: dict[str, Any],
    binding: str,
) -> tuple[float, float, float, float] | None:
    parts = binding.split(":")
    if len(parts) < 4 or parts[0] != "native":
        return None
    node: dict[str, Any] | None = None
    if parts[1] == "scene" and len(parts) == 5:
        scene = next(
            (item for item in project.get("scenes", []) if isinstance(item, dict) and item.get("id") == parts[2]),
            None,
        )
        if isinstance(scene, dict):
            node = next(
                (item for item in scene.get("nodes", []) if isinstance(item, dict) and item.get("id") == parts[3]),
                None,
            )
    elif parts[1] == "global" and len(parts) == 4:
        node = next(
            (
                item.get("node") for item in project.get("globalLayer", [])
                if isinstance(item, dict) and isinstance(item.get("node"), dict)
                and item["node"].get("id") == parts[2]
            ),
            None,
        )
    if not isinstance(node, dict):
        return None
    values = tuple(node.get(key) for key in ("x", "y", "width", "height"))
    if any(not isinstance(item, (int, float)) or isinstance(item, bool) for item in values):
        return None
    return tuple(float(item) for item in values)  # type: ignore[return-value]


def validate_snapshot(
    snapshot: Any,
    inventory: dict[str, Any],
    project_path: Path,
    contract: dict[str, Any],
    inventory_hash: str,
    target: str = "implementation",
) -> list[str]:
    errors: list[str] = []
    if not isinstance(snapshot, dict) or snapshot.get("schemaVersion") != 1:
        return ["authoring target snapshot must be a schemaVersion 1 object"]
    unknown_root = sorted(set(snapshot) - {
        "schemaVersion", "caseId", "coursewareContractSha256", "inventorySha256",
        "projectSha256", "viewport", "captures",
    })
    if unknown_root:
        errors.append("snapshot has unsupported fields: " + ", ".join(unknown_root))
    if snapshot.get("caseId") != inventory.get("caseId"):
        errors.append("snapshot caseId does not match Authoring Inventory")
    if snapshot.get("coursewareContractSha256") != contract.get("coursewareContractSha256"):
        errors.append("snapshot coursewareContractSha256 is stale")
    if snapshot.get("inventorySha256") != inventory_hash:
        errors.append("snapshot inventorySha256 is stale")
    project_hash = snapshot.get("projectSha256")
    if not isinstance(project_hash, str) or SHA256_RE.fullmatch(project_hash) is None:
        errors.append("snapshot projectSha256 must be a lowercase SHA-256")
    elif project_hash != sha256_file(project_path):
        errors.append("snapshot projectSha256 does not match the validated Project V8 archive")
    if snapshot.get("viewport") != {"width": 1280, "height": 720}:
        errors.append("snapshot viewport must be exactly 1280x720")

    entities = inventory_entities(inventory)
    project = project_document(project_path)
    required_ids = {
        entity_id for entity_id, entity in entities.items()
        if entity.get("requiredForAcceptance") is True
    }
    captures = snapshot.get("captures")
    if not isinstance(captures, list):
        errors.append("snapshot captures must be an array")
        captures = []
    captured_ids: list[str] = []
    session_ids: set[str] = set()
    for index, capture in enumerate(captures):
        label = f"captures[{index}]"
        if not isinstance(capture, dict):
            errors.append(f"{label} must be an object")
            continue
        unknown = sorted(set(capture) - CAPTURE_KEYS)
        missing = sorted(CAPTURE_KEYS - set(capture))
        if unknown:
            errors.append(f"{label} has unsupported fields: {', '.join(unknown)}")
        if missing:
            errors.append(f"{label} is missing fields: {', '.join(missing)}")
        entity_id = capture.get("inventoryEntityId")
        entity = entities.get(entity_id) if isinstance(entity_id, str) else None
        if entity is None:
            errors.append(f"{label} references unknown inventoryEntityId: {entity_id!r}")
            continue
        captured_ids.append(entity_id)
        if capture.get("persistentBinding") != entity.get("binding"):
            errors.append(f"{label}.persistentBinding does not match {entity_id}")
        if capture.get("selectedBinding") != entity.get("binding"):
            errors.append(f"{label}.selectedBinding does not prove selection of {entity_id}")
        if capture.get("sceneId") != entity.get("_sceneId"):
            errors.append(f"{label}.sceneId does not match {entity_id}")
        state_id = capture.get("stateId")
        if entity.get("_sceneId") is not None and (not isinstance(state_id, str) or not state_id):
            errors.append(f"{label}.stateId is required for a scene entity")
        session_id = capture.get("sessionTargetId")
        if not isinstance(session_id, str) or SESSION_ID_RE.fullmatch(session_id) is None:
            errors.append(f"{label}.sessionTargetId is invalid")
        elif session_id in session_ids:
            errors.append(f"duplicate sessionTargetId: {session_id}")
        else:
            session_ids.add(session_id)
        if capture.get("selectedTargetId") != session_id:
            errors.append(f"{label}.selectedTargetId must equal sessionTargetId")
        expected_entry = {
            "canvas-distinct": "direct-canvas",
            "authoring-view": "authoring-view",
            "property": "structured-property",
        }.get(entity.get("editability"))
        if capture.get("entryPoint") != expected_entry:
            errors.append(f"{label}.entryPoint must be {expected_entry!r}")
        operations = capture.get("operations")
        if not isinstance(operations, list) or any(item not in OPERATIONS for item in operations):
            errors.append(f"{label}.operations contains unsupported values")
            operation_set: set[str] = set()
        elif len(operations) != len(set(operations)):
            errors.append(f"{label}.operations contains duplicates")
            operation_set = set(operations)
        else:
            operation_set = set(operations)
        outcome = entity.get("authoringOutcomeId")
        auth = contract["authoring"].get(outcome, {})
        missing_operations = sorted(required_operations(entity, auth) - operation_set)
        if missing_operations:
            errors.append(f"{label}.operations is missing: {', '.join(missing_operations)}")
        rendered = parse_bounds(capture.get("renderedBounds"), f"{label}.renderedBounds", errors)
        selected = parse_bounds(capture.get("selectionBounds"), f"{label}.selectionBounds", errors)
        if rendered is not None and selected is not None:
            iou = intersection_over_union(rendered, selected)
            if iou <= 0.85:
                errors.append(f"{label} rendered/selection IoU must be > 0.85, got {iou:.6f}")
        if capture.get("surface") != "editor-authoring":
            errors.append(f"{label}.surface must be editor-authoring")
        owner = str(entity.get("binding", "")).split(":", 1)[0]
        expected_capture_method = {
            "native": "native-project-geometry-v1",
            "runtime": "runtime-authoring-contract-v1",
            "component": "component-authoring-contract-v1",
        }.get(owner)
        if capture.get("captureMethod") != expected_capture_method:
            errors.append(
                f"{label}.captureMethod must be {expected_capture_method!r} for {owner!r} binding"
            )
        if owner == "native" and rendered is not None:
            authoritative_bounds = native_project_bounds(project, str(entity.get("binding")))
            if authoritative_bounds is None:
                errors.append(f"{label} cannot resolve native Project geometry")
            elif rendered != authoritative_bounds:
                errors.append(
                    f"{label}.renderedBounds does not equal Project V8 node geometry "
                    f"{authoritative_bounds!r}"
                )
        if target == "evidence":
            errors.append(
                f"{label}: contract/project-derived target metadata is not editor-session evidence; "
                "candidate requires a trusted replayable Editor authoring-session capture runner"
            )
        captured_at = capture.get("capturedAt")
        if not isinstance(captured_at, str):
            errors.append(f"{label}.capturedAt must be an ISO-8601 timestamp")
        else:
            try:
                datetime.fromisoformat(captured_at.replace("Z", "+00:00"))
            except ValueError:
                errors.append(f"{label}.capturedAt must be an ISO-8601 timestamp")

    if len(captured_ids) != len(set(captured_ids)):
        errors.append("each inventory entity may appear in at most one target capture")
    if set(captured_ids) != required_ids:
        errors.append(
            "snapshot must cover every and only required inventory entity; "
            f"missing={sorted(required_ids - set(captured_ids))!r}, "
            f"unexpected={sorted(set(captured_ids) - required_ids)!r}"
        )
    return errors


def main() -> int:
    args = parse_args()
    errors: list[str] = []
    snapshot: dict[str, Any] | None = None
    try:
        snapshot_path = Path(args.snapshot)
        inventory_path = Path(args.inventory)
        project_path = Path(args.project)
        snapshot = load_json(snapshot_path)
        inventory = load_json(inventory_path)
        contract = load_contract_facts(Path(args.case_dir))
        errors.extend(validate_snapshot(
            snapshot,
            inventory,
            project_path,
            contract,
                sha256_file(inventory_path),
                args.target,
            ))
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        errors.append(str(exc))
    report = {
        "validator": "project-v8-authoring-target-snapshot-v1",
        "assurance": (
            "candidate-blocked-without-editor-session-runner"
            if args.target == "evidence"
            else "project-geometry-bound"
            if isinstance(snapshot, dict)
            and all(
                isinstance(item, dict) and str(item.get("persistentBinding", "")).startswith("native:")
                for item in snapshot.get("captures", [])
            )
            else "structural-only"
        ),
        "status": "passed" if not errors else "failed",
        "errors": errors,
    }
    if args.as_json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print(f"status: {report['status']}")
        for error in errors:
            print(f"ERROR: {error}")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
