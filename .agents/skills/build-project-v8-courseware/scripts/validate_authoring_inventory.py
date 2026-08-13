#!/usr/bin/env python3
"""Validate stable Project V8 authoring bindings and optional project ownership."""

from __future__ import annotations

import argparse
import json
import re
import sys
import zipfile
from pathlib import Path
from typing import Any


OWNERSHIPS = {"native-owned", "runtime-owned", "hybrid-owned", "component-composed"}
EDITABILITY = {"visible", "property-only", "blocked"}
KINDS = {"text", "asset", "number", "boolean", "color", "select", "formula"}
RUNTIME_KINDS = {"text", "asset"}
SEGMENT = r"[A-Za-z0-9_.-]+"
BINDING_PATTERNS = [
    re.compile(rf"^native:scene:({SEGMENT}):({SEGMENT}):({SEGMENT})$"),
    re.compile(rf"^native:global:({SEGMENT}):({SEGMENT})$"),
    re.compile(rf"^component:scene:({SEGMENT}):({SEGMENT}):({SEGMENT})$"),
    re.compile(rf"^component:global:({SEGMENT}):({SEGMENT})$"),
    re.compile(rf"^runtime:scene:({SEGMENT}):({'|'.join(sorted(RUNTIME_KINDS))}):({SEGMENT})$"),
    re.compile(rf"^runtime:global:({'|'.join(sorted(RUNTIME_KINDS))}):({SEGMENT})$"),
]
SESSION_MARKERS = ("registered:", "dom:", "targetId")
SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")
SOURCE_PATTERN = re.compile(r"^CNT-\d{3,}(?:[#/:.].+)?$")


def load_project(path: Path) -> dict[str, Any]:
    with zipfile.ZipFile(path) as archive:
        raw = archive.read("project.json")
    value = json.loads(raw.decode("utf-8"))
    if not isinstance(value, dict):
        raise ValueError("project.json root must be an object")
    return value


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate a Project V8 Authoring Inventory")
    parser.add_argument("inventory")
    parser.add_argument("--project")
    parser.add_argument("--target", choices=("engineering-candidate", "accepted"), default="engineering-candidate")
    parser.add_argument("--json", action="store_true", dest="as_json")
    return parser.parse_args()


def value_at_path(value: Any, dotted_path: str) -> tuple[bool, Any]:
    current = value
    for segment in dotted_path.split("."):
        if not isinstance(current, dict) or segment not in current:
            return False, None
        current = current[segment]
    return True, current


def native_field_exists(node: Any, field: str) -> bool:
    if field == "formula":
        return isinstance(node, dict) and node.get("type") == "formula" and all(
            key in node for key in ("formulaId", "accessibleText", "ast")
        )
    return value_at_path(node, field)[0]


def native_kind_matches(node: Any, field: str, kind: str) -> bool:
    if not isinstance(node, dict):
        return False
    node_type = node.get("type")
    if kind == "formula":
        return node_type == "formula" and field in {"formula", "ast", "accessibleText"}
    if kind == "asset":
        return node_type in {"image", "video"} and field in {"assetId", "poster.assetId"}
    if kind == "text":
        return (node_type == "text" and field in {"text", "runs"}) or (
            node_type == "teacher-controller" and field in {"title"}
        )
    if kind == "number":
        return field in {"x", "y", "width", "height", "rotation", "opacity"} or field.startswith("style.")
    if kind in {"boolean", "color", "select"}:
        return field.startswith("style.") or field in {
            "visible", "locked", "playbackInitialVisibility", "includeInStaticExports",
        }
    return False


def validate_runtime_key(
    entity_id: str,
    runtime: Any,
    kind: str,
    key: str,
    errors: list[str],
) -> None:
    if not isinstance(runtime, dict):
        errors.append(f"{entity_id}: runtime is absent")
        return
    collection_name = "assets" if kind == "asset" else "content"
    collection = runtime.get(collection_name)
    if collection_name == "content" and isinstance(collection, dict):
        collection = collection.get("values")
    if not isinstance(collection, dict) or key not in collection:
        errors.append(f"{entity_id}: runtime {kind} key is absent: {key}")


def main() -> int:
    args = parse_args()
    errors: list[str] = []
    warnings: list[str] = []
    try:
        inventory = json.loads(Path(args.inventory).read_text(encoding="utf-8"))
        if not isinstance(inventory, dict) or inventory.get("schemaVersion") != 1:
            raise ValueError("inventory must be a schemaVersion 1 object")
        project = load_project(Path(args.project)) if args.project else None
        if project and project.get("schemaVersion") != 8:
            errors.append("project must use Project V8")
        case_id = inventory.get("caseId")
        if not isinstance(case_id, str) or not case_id:
            errors.append("caseId is required")
        project_path_value = inventory.get("projectPath")
        if not isinstance(project_path_value, str) or not project_path_value:
            errors.append("projectPath is required")
        elif isinstance(case_id, str) and project_path_value != f"project/{case_id}.h5lesson":
            errors.append("projectPath must be project/<caseId>.h5lesson")
        elif args.project and Path(args.project).name != Path(project_path_value).name:
            errors.append("--project does not match inventory projectPath")
        generated_from = inventory.get("generatedFrom")
        if not isinstance(generated_from, dict):
            errors.append("generatedFrom is required")
        else:
            for key in ("presentationScriptSha256", "capabilityIndexSha256"):
                if not isinstance(generated_from.get(key), str) or not SHA256_PATTERN.fullmatch(generated_from[key]):
                    errors.append(f"generatedFrom.{key} must be a lowercase SHA-256")
        scene_map = {
            scene.get("id"): scene
            for scene in (project.get("scenes", []) if project else [])
            if isinstance(scene, dict)
        }
        global_nodes = {
            item.get("node", {}).get("id"): item.get("node")
            for item in (project.get("globalLayer", []) if project else [])
            if isinstance(item, dict) and isinstance(item.get("node"), dict)
        }
        seen_ids: set[str] = set()
        seen_bindings: set[str] = set()

        def validate_entity(entity: Any, expected_scope: str, scene_id: str | None = None) -> None:
            if not isinstance(entity, dict):
                errors.append(f"{scene_id or 'global'}: entity must be an object")
                return
            entity_id = entity.get("id")
            binding = entity.get("binding")
            editability = entity.get("editability")
            label = entity.get("label")
            kind = entity.get("kind")
            source_ref = entity.get("sourceRef")
            if not isinstance(entity_id, str) or not entity_id:
                errors.append(f"{scene_id or 'global'}: entity has no stable id")
                return
            if entity_id in seen_ids:
                errors.append(f"duplicate entity id: {entity_id}")
            seen_ids.add(entity_id)
            if not isinstance(label, str) or not label.strip():
                errors.append(f"{entity_id}: label is required")
            if kind not in KINDS:
                errors.append(f"{entity_id}: invalid kind")
            if not isinstance(source_ref, str) or not SOURCE_PATTERN.fullmatch(source_ref):
                errors.append(f"{entity_id}: sourceRef must locate one CNT-* definition")
            if not isinstance(binding, str) or not any(pattern.fullmatch(binding) for pattern in BINDING_PATTERNS):
                errors.append(f"{entity_id}: invalid persistent binding {binding!r}")
                return
            if any(marker.lower() in binding.lower() for marker in SESSION_MARKERS):
                errors.append(f"{entity_id}: session-local target id is forbidden")
            if binding in seen_bindings:
                errors.append(f"duplicate persistent binding: {binding}")
            seen_bindings.add(binding)
            if editability not in EDITABILITY:
                errors.append(f"{entity_id}: invalid editability")
            if editability == "blocked":
                limitation = entity.get("limitation")
                if not isinstance(limitation, str) or not limitation.strip():
                    errors.append(f"{entity_id}: blocked entry needs limitation")
                if entity.get("requiredForAcceptance") is True:
                    message = f"{entity_id}: required content remains blocked"
                    (errors if args.target == "accepted" else warnings).append(message)

            parts = binding.split(":")
            owner = parts[0]
            scope = parts[1]
            if scope != expected_scope:
                errors.append(f"{entity_id}: {scope} binding is listed in {expected_scope} inventory")
                return
            if owner == "runtime" and kind != parts[-2]:
                errors.append(f"{entity_id}: runtime binding kind does not match entity kind")
            if not project:
                return
            if scope == "scene":
                bound_scene_id = parts[2]
                if bound_scene_id != scene_id:
                    errors.append(f"{entity_id}: binding scene does not match inventory scene")
                bound_scene = scene_map.get(bound_scene_id, {})
                if owner in ("native", "component"):
                    node_id = parts[3]
                    node = next((item for item in bound_scene.get("nodes", []) if isinstance(item, dict) and item.get("id") == node_id), None)
                    if node is None:
                        errors.append(f"{entity_id}: bound node is absent")
                    elif owner == "component":
                        if node.get("type") != "external-component":
                            errors.append(f"{entity_id}: component binding points to non-component node")
                        elif not value_at_path(node.get("props"), parts[4])[0]:
                            errors.append(f"{entity_id}: component property is absent: {parts[4]}")
                    elif not native_field_exists(node, parts[4]):
                        errors.append(f"{entity_id}: native field is absent: {parts[4]}")
                    elif not native_kind_matches(node, parts[4], str(kind)):
                        errors.append(f"{entity_id}: native binding field does not match entity kind")
                elif owner == "runtime":
                    validate_runtime_key(entity_id, bound_scene.get("runtime"), parts[3], parts[4], errors)
            elif scope == "global":
                if owner in ("native", "component"):
                    node_id = parts[2]
                    node = global_nodes.get(node_id)
                    if node is None:
                        errors.append(f"{entity_id}: global node is absent")
                    elif owner == "component":
                        if node.get("type") != "external-component":
                            errors.append(f"{entity_id}: global component binding points to non-component node")
                        elif not value_at_path(node.get("props"), parts[3])[0]:
                            errors.append(f"{entity_id}: global component property is absent: {parts[3]}")
                    elif not native_field_exists(node, parts[3]):
                        errors.append(f"{entity_id}: global native field is absent: {parts[3]}")
                    elif not native_kind_matches(node, parts[3], str(kind)):
                        errors.append(f"{entity_id}: global native binding field does not match entity kind")
                elif owner == "runtime":
                    validate_runtime_key(entity_id, project.get("globalRuntime"), parts[2], parts[3], errors)

        scenes = inventory.get("scenes")
        if not isinstance(scenes, list):
            errors.append("scenes must be an array")
            scenes = []
        for scene_entry in scenes:
            if not isinstance(scene_entry, dict):
                errors.append("scene entry must be an object")
                continue
            scene_id = scene_entry.get("sceneId")
            if not isinstance(scene_id, str) or not scene_id:
                errors.append("scene entry has no sceneId")
                continue
            if scene_entry.get("ownership") not in OWNERSHIPS:
                errors.append(f"{scene_id}: invalid ownership")
            if project and scene_id not in scene_map:
                errors.append(f"{scene_id}: scene is absent from project")
            entities = scene_entry.get("entities")
            if not isinstance(entities, list):
                errors.append(f"{scene_id}: entities must be an array")
                continue
            for entity in entities:
                validate_entity(entity, "scene", scene_id)
        if project:
            inventory_scene_ids = {
                item.get("sceneId") for item in scenes if isinstance(item, dict) and isinstance(item.get("sceneId"), str)
            }
            project_scene_ids = set(scene_map)
            missing = sorted(project_scene_ids - inventory_scene_ids)
            extra = sorted(inventory_scene_ids - project_scene_ids)
            if missing:
                errors.append("inventory has no entry for project scenes: " + ", ".join(missing))
            if extra:
                errors.append("inventory contains unknown scenes: " + ", ".join(extra))
        global_entities = inventory.get("globalEntities")
        if not isinstance(global_entities, list):
            errors.append("globalEntities must be an array")
            global_entities = []
        for entity in global_entities:
            validate_entity(entity, "global")
    except (OSError, ValueError, json.JSONDecodeError, KeyError, zipfile.BadZipFile) as exc:
        errors.append(str(exc))

    report = {
        "validator": "project-v8-authoring-inventory-v1",
        "status": "passed" if not errors else "failed",
        "errors": errors,
        "warnings": warnings,
    }
    if args.as_json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print(f"status: {report['status']}")
        for error in errors:
            print(f"ERROR: {error}")
        for warning in warnings:
            print(f"WARNING: {warning}")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
