#!/usr/bin/env python3
"""Validate bidirectional presentation-script to Project V7 traceability."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import zipfile
from pathlib import Path


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_project(path: Path) -> dict:
    if path.suffix.lower() == ".h5lesson":
        with zipfile.ZipFile(path) as archive:
            return json.loads(archive.read("project.json").decode("utf-8"))
    value = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(value, dict) and "project" in value and isinstance(value["project"], dict):
        return value["project"]
    return value


def collect_project_ids(project: dict) -> dict[str, set[str]]:
    result = {"scene": set(), "state": set(), "node": set(), "interaction": set(), "runtime": set()}
    for scene in project.get("scenes", []) or []:
        if not isinstance(scene, dict):
            continue
        scene_id = scene.get("id")
        if scene_id:
            result["scene"].add(str(scene_id))
        for state in (scene.get("presentation") or {}).get("states", []) or []:
            if isinstance(state, dict) and state.get("id"):
                result["state"].add(str(state["id"]))
        for node in scene.get("nodes", []) or []:
            if isinstance(node, dict) and node.get("id"):
                result["node"].add(str(node["id"]))
        for interaction in scene.get("interactions", []) or []:
            if isinstance(interaction, dict) and interaction.get("id"):
                result["interaction"].add(str(interaction["id"]))
        if scene.get("runtime"):
            result["runtime"].add(f"scene:{scene_id}:runtime")

    for item in project.get("globalLayer", []) or []:
        if not isinstance(item, dict):
            continue
        node = item.get("node") if isinstance(item.get("node"), dict) else item
        if node.get("id"):
            result["node"].add(str(node["id"]))
    for interaction in project.get("globalInteractions", []) or []:
        if isinstance(interaction, dict) and interaction.get("id"):
            result["interaction"].add(str(interaction["id"]))
    if project.get("globalRuntime"):
        result["runtime"].add("global:runtime")
    return result


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate courseware traceability")
    parser.add_argument("case_dir")
    parser.add_argument("--project", help="Project JSON or .h5lesson to verify ID coverage")
    parser.add_argument("--json", action="store_true", dest="as_json")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    case_dir = Path(args.case_dir).resolve()
    errors: list[str] = []
    warnings: list[str] = []
    try:
        manifest = json.loads((case_dir / "case.json").read_text(encoding="utf-8"))
        trace = json.loads((case_dir / "06-traceability.json").read_text(encoding="utf-8"))
        script_text = (case_dir / "03-presentation-script.md").read_text(encoding="utf-8")
        content_text = (case_dir / "02-content-spec.md").read_text(encoding="utf-8")
    except (OSError, json.JSONDecodeError) as exc:
        print(f"error: cannot read traceability inputs: {exc}", file=sys.stderr)
        return 1

    if trace.get("schemaVersion") != 1:
        errors.append("06-traceability.json must use schemaVersion 1")
    if trace.get("caseId") != manifest.get("caseId"):
        errors.append("traceability caseId does not match case.json")

    approved = manifest.get("artifacts", {})
    sources = trace.get("sourceArtifacts") or {}
    for key in ("teachingDesign", "contentSpec", "presentationScript"):
        artifact = approved.get(key, {})
        source = sources.get(key, {})
        if source.get("sha256") != artifact.get("sha256") or source.get("version") != artifact.get("version"):
            errors.append(f"traceability sourceArtifacts is stale or missing for {key}")
    visual = approved.get("visualDirection", {})
    if visual.get("status") == "approved":
        source = sources.get("visualDirection", {})
        if source.get("sha256") != visual.get("sha256") or source.get("version") != visual.get("version"):
            errors.append("traceability sourceArtifacts is stale or missing for visualDirection")

    script_beats = set(re.findall(r"^### (BEAT-\d{3,})\b", script_text, re.MULTILINE))
    trace_beats = trace.get("beats") if isinstance(trace.get("beats"), list) else []
    mapped_ids: list[str] = [str(item.get("beatId")) for item in trace_beats if isinstance(item, dict)]
    duplicate_beats = sorted({item for item in mapped_ids if mapped_ids.count(item) > 1})
    if duplicate_beats:
        errors.append("duplicate traceability beat entries: " + ", ".join(duplicate_beats))
    mapped_set = set(mapped_ids)
    if script_beats - mapped_set:
        errors.append("script beats without traceability: " + ", ".join(sorted(script_beats - mapped_set)))
    if mapped_set - script_beats:
        errors.append("traceability references unknown beats: " + ", ".join(sorted(mapped_set - script_beats)))

    field_kind = {
        "sceneIds": "scene",
        "stateIds": "state",
        "nodeIds": "node",
        "interactionIds": "interaction",
        "runtimeIds": "runtime",
    }
    covered: dict[str, set[str]] = {kind: set() for kind in field_kind.values()}
    for item in trace_beats:
        if not isinstance(item, dict):
            errors.append("traceability beats must be objects")
            continue
        beat_id = str(item.get("beatId", "<missing>"))
        for required in ("sceneIds", "stateIds", "evidencePaths"):
            value = item.get(required)
            if not isinstance(value, list) or not value:
                errors.append(f"{beat_id} requires a non-empty {required}")
        if not item.get("staticReview"):
            errors.append(f"{beat_id} requires staticReview")
        for field, kind in field_kind.items():
            values = item.get(field, [])
            if isinstance(values, list):
                covered[kind].update(str(value) for value in values)

    objects = trace.get("implementationObjects") if isinstance(trace.get("implementationObjects"), list) else []
    object_keys: list[tuple[str, str]] = []
    kind_alias = {"component": "node"}
    for item in objects:
        if not isinstance(item, dict):
            errors.append("implementationObjects entries must be objects")
            continue
        object_id = str(item.get("id", ""))
        kind = str(item.get("kind", ""))
        if not object_id or not kind:
            errors.append("implementation object requires id and kind")
            continue
        object_keys.append((kind, object_id))
        target_kind = kind_alias.get(kind, kind)
        if target_kind in covered:
            covered[target_kind].add(object_id)
        beat_ids = item.get("beatIds", [])
        if item.get("learnerFacing") is True and (not isinstance(beat_ids, list) or not beat_ids):
            errors.append(f"learner-facing object {object_id} has no beatIds")
        unknown = set(str(value) for value in beat_ids or []) - script_beats
        if unknown:
            errors.append(f"object {object_id} references unknown beats: {', '.join(sorted(unknown))}")
        if kind in ("runtime", "component") and not item.get("carrierReason"):
            errors.append(f"{kind} {object_id} requires carrierReason")
    duplicates = sorted({f"{kind}:{object_id}" for kind, object_id in object_keys if object_keys.count((kind, object_id)) > 1})
    if duplicates:
        errors.append("duplicate implementation objects: " + ", ".join(duplicates))

    exclusions = trace.get("coverageExclusions") if isinstance(trace.get("coverageExclusions"), list) else []
    excluded: dict[str, set[str]] = {kind: set() for kind in covered}
    for item in exclusions:
        if not isinstance(item, dict) or not item.get("id") or not item.get("kind") or not item.get("reason"):
            errors.append("coverage exclusion requires id, kind, and reason")
            continue
        kind = kind_alias.get(str(item["kind"]), str(item["kind"]))
        if kind in excluded:
            excluded[kind].add(str(item["id"]))

    content_formulas = set(re.findall(r"\bFORM-\d{3,}\b", content_text))
    formulas = trace.get("formulas") if isinstance(trace.get("formulas"), list) else []
    mapped_formulas: set[str] = set()
    unsafe_representations = {"unicode-diagonal", "plain-slash", "plain-text-fraction"}
    for formula in formulas:
        if not isinstance(formula, dict) or not formula.get("formulaId"):
            errors.append("formula trace entry requires formulaId")
            continue
        formula_id = str(formula["formulaId"])
        mapped_formulas.add(formula_id)
        if formula_id not in content_formulas:
            errors.append(f"traceability references unknown formula: {formula_id}")
        if formula.get("representation") in unsafe_representations:
            errors.append(f"unsafe formula representation for {formula_id}: {formula.get('representation')}")
        if not formula.get("implementationIds") or not formula.get("evidencePaths"):
            errors.append(f"formula {formula_id} requires implementationIds and evidencePaths")
    if content_formulas - mapped_formulas:
        warnings.append("content formulas without implementation mapping: " + ", ".join(sorted(content_formulas - mapped_formulas)))

    if args.project:
        try:
            project = load_project(Path(args.project).resolve())
            if project.get("schemaVersion") != 7:
                errors.append("delivered project must use schemaVersion 7")
            project_ids = collect_project_ids(project)
            for kind, values in covered.items():
                unknown = values - project_ids[kind]
                if unknown:
                    errors.append(f"traceability references unknown {kind} IDs: " + ", ".join(sorted(unknown)))
            for kind, values in excluded.items():
                unknown = values - project_ids[kind]
                if unknown:
                    errors.append(f"coverage exclusions reference unknown {kind} IDs: " + ", ".join(sorted(unknown)))
            for kind, values in project_ids.items():
                uncovered = values - covered[kind] - excluded[kind]
                if uncovered:
                    errors.append(f"Project {kind} IDs lack traceability or exclusion: " + ", ".join(sorted(uncovered)))
        except (OSError, KeyError, zipfile.BadZipFile, json.JSONDecodeError) as exc:
            errors.append(f"cannot inspect Project: {exc}")
    else:
        warnings.append("No --project supplied; actual Project ID coverage was not checked.")

    report = {
        "validator": "courseware-traceability-v1",
        "pipelineStatus": "passed" if not errors else "failed",
        "outcomeStatus": "pending",
        "errors": errors,
        "warnings": warnings,
    }
    if args.as_json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print(f"pipeline status: {report['pipelineStatus']}")
        print("outcome status: pending")
        for error in errors:
            print(f"ERROR: {error}")
        for warning in warnings:
            print(f"WARNING: {warning}")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
