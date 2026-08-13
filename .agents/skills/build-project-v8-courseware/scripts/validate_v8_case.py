#!/usr/bin/env python3
"""Validate Builder inputs and the persisted V8 implementation contract."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import zipfile
from pathlib import Path

from v8_common import (
    load_contract_facts,
    load_json,
    sha256_file,
    utf8_process_options,
    validate_capabilities,
    validate_case_readiness,
    within,
)


REQUIRED_PLAN_HEADINGS = (
    "## 工程级不变量",
    "## 场景—状态实现矩阵",
    "## 意图—作者入口—结果映射",
    "## 共享机制",
    "## Runtime / Component 合同",
    "## 行为门禁映射",
    "## 任务图",
    "## 验收矩阵",
)
CONTENT_ID_PATTERN = re.compile(r"^(CNT-\d{3,})(?:[#/:.].+)?$")


def validate_assessment_carriers(
    project_path: Path,
    behavior_spec: dict,
    editor_root: Path,
    target: str,
    errors: list[str],
    blocked_capabilities: list[str],
) -> None:
    """Validate published Runtime calls structurally; evidence replays host-owned traces.

    TypeScript token/call matching prevents comments or string literals from impersonating
    API calls. It intentionally does not claim reachability; the evidence target separately
    requires RuntimeHost assessment/action records caused by the declared browser step.
    """
    with zipfile.ZipFile(project_path) as archive:
        project = json.loads(archive.read("project.json").decode("utf-8"))
    runtime_sources: list[str] = []
    if isinstance(project, dict):
        global_runtime = project.get("globalRuntime")
        if isinstance(global_runtime, dict) and isinstance(global_runtime.get("source"), str):
            runtime_sources.append(global_runtime["source"])
        for scene in project.get("scenes", []):
            runtime = scene.get("runtime") if isinstance(scene, dict) else None
            if isinstance(runtime, dict) and isinstance(runtime.get("source"), str):
                runtime_sources.append(runtime["source"])
    typescript_scanner = editor_root / "node_modules" / "typescript" / "dist" / "ast" / "scanner.js"
    syntax_kind = editor_root / "node_modules" / "typescript" / "dist" / "enums" / "syntaxKind.enum.js"
    observed_calls: set[str] = set()
    observed_action_calls: set[tuple[str, str, str | None]] = set()
    if runtime_sources and typescript_scanner.is_file() and syntax_kind.is_file():
        ast_probe = r"""
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const sources = JSON.parse(fs.readFileSync(0, 'utf8'));
const { createScanner } = await import(pathToFileURL(process.argv[1]).href);
const { SyntaxKind } = await import(pathToFileURL(process.argv[2]).href);
const foundEvaluators = new Set();
const foundActions = [];
for (const source of sources) {
  const scanner = createScanner(true, undefined, source);
  const tokens = [];
  for (;;) {
    const kind = scanner.scan();
    tokens.push({ kind, value: scanner.getTokenValue() });
    if (kind === SyntaxKind.EndOfFile) break;
  }
  const name = (token, value) => token?.kind === SyntaxKind.Identifier && token.value === value;
  for (let i = 0; i + 6 < tokens.length; i += 1) {
    if (name(tokens[i], 'ctx') && tokens[i + 1].kind === SyntaxKind.DotToken &&
        name(tokens[i + 2], 'assessment') && tokens[i + 3].kind === SyntaxKind.DotToken &&
        name(tokens[i + 4], 'evaluate') && tokens[i + 5].kind === SyntaxKind.OpenParenToken &&
        tokens[i + 6].kind === SyntaxKind.OpenBraceToken) {
      let depth = 0;
      for (let j = i + 6; j < tokens.length; j += 1) {
        if (tokens[j].kind === SyntaxKind.OpenBraceToken) depth += 1;
        if (tokens[j].kind === SyntaxKind.CloseBraceToken) depth -= 1;
        const propertyName = tokens[j].kind === SyntaxKind.Identifier || tokens[j].kind === SyntaxKind.StringLiteral;
        if (depth === 1 && propertyName && tokens[j].value === 'evaluatorId' &&
            tokens[j + 1]?.kind === SyntaxKind.ColonToken && tokens[j + 2]?.kind === SyntaxKind.StringLiteral) {
          foundEvaluators.add(tokens[j + 2].value);
        }
        if (depth === 0) break;
      }
    }
    if (name(tokens[i], 'ctx') && tokens[i + 1].kind === SyntaxKind.DotToken &&
        name(tokens[i + 2], 'evidence') && tokens[i + 3].kind === SyntaxKind.DotToken &&
        name(tokens[i + 4], 'recordAction') && tokens[i + 5].kind === SyntaxKind.OpenParenToken &&
        tokens[i + 6].kind === SyntaxKind.OpenBraceToken) {
      let depth = 0;
      const fields = {};
      for (let j = i + 6; j < tokens.length; j += 1) {
        if (tokens[j].kind === SyntaxKind.OpenBraceToken) depth += 1;
        if (tokens[j].kind === SyntaxKind.CloseBraceToken) depth -= 1;
        const propertyName = tokens[j].kind === SyntaxKind.Identifier || tokens[j].kind === SyntaxKind.StringLiteral;
        if (depth === 1 && propertyName && ['actId', 'actionKind', 'responseId'].includes(tokens[j].value) &&
            tokens[j + 1]?.kind === SyntaxKind.ColonToken && tokens[j + 2]?.kind === SyntaxKind.StringLiteral) {
          fields[tokens[j].value] = tokens[j + 2].value;
        }
        if (depth === 0) break;
      }
      if (fields.actId && fields.actionKind) foundActions.push(fields);
    }
  }
}
process.stdout.write(JSON.stringify({evaluators:[...foundEvaluators].sort(),actions:foundActions}));
"""
        result = subprocess.run(
            ["node", "--input-type=module", "-e", ast_probe, str(typescript_scanner), str(syntax_kind)],
            input=json.dumps(runtime_sources),
            **utf8_process_options(),
        )
        if result.returncode == 0:
            try:
                parsed_calls = json.loads(result.stdout)
                if isinstance(parsed_calls, dict):
                    evaluators = parsed_calls.get("evaluators")
                    if isinstance(evaluators, list):
                        observed_calls = {item for item in evaluators if isinstance(item, str)}
                    actions = parsed_calls.get("actions")
                    if isinstance(actions, list):
                        observed_action_calls = {
                            (item["actId"], item["actionKind"], item.get("responseId"))
                            for item in actions
                            if isinstance(item, dict)
                            and isinstance(item.get("actId"), str)
                            and isinstance(item.get("actionKind"), str)
                            and (item.get("responseId") is None or isinstance(item.get("responseId"), str))
                        }
            except json.JSONDecodeError:
                pass
    auto_response_ids: list[str] = []
    for assessment in behavior_spec.get("assessments", []):
        if not isinstance(assessment, dict) or assessment.get("mode") not in {
            "finite-auto", "normalized-auto",
        }:
            continue
        response_id = assessment.get("responseId")
        evaluator_id = assessment.get("evaluatorRef")
        auto_response_ids.append(str(response_id))
        if not isinstance(evaluator_id, str) or evaluator_id not in observed_calls:
            errors.append(
                f"{response_id}: automatic assessment requires a Runtime/hybrid producer that "
                f"contains a real ctx.assessment.evaluate({{evaluatorId: {evaluator_id!r}, ...}}) AST call; "
                "comments/string tokens do not count and pure native content has no "
                "published declarative evaluator action"
            )
    for test in behavior_spec.get("tests", []):
        if not isinstance(test, dict) or test.get("gate") != "requiredActions":
            continue
        refs = test.get("contractRefs") if isinstance(test.get("contractRefs"), list) else []
        act_refs = [ref for ref in refs if isinstance(ref, str) and ref.startswith("ACT-")]
        response_refs = [ref for ref in refs if isinstance(ref, str) and ref.startswith("RESP-")]
        expected = (
            act_refs[0] if len(act_refs) == 1 else "",
            test.get("actionKind") if isinstance(test.get("actionKind"), str) else "",
            response_refs[0] if len(response_refs) == 1 else None,
        )
        if expected not in observed_action_calls:
            errors.append(
                f"{test.get('id')}: required action needs a Runtime producer containing a real "
                f"ctx.evidence.recordAction({{actId: {expected[0]!r}, actionKind: {expected[1]!r}, "
                f"responseId: {expected[2]!r}, event}}) call; comments/strings and pure native content do not count"
            )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate a Project V8 courseware implementation case")
    parser.add_argument("--case-dir", required=True)
    parser.add_argument("--editor-root", required=True)
    parser.add_argument("--target", choices=("entry", "implementation", "evidence", "accepted"), default="implementation")
    parser.add_argument("--json", action="store_true", dest="as_json")
    return parser.parse_args()


def validate_inventory_provenance(
    case_dir: Path,
    case: dict,
    capability_hash: str,
    development_plan_hash: str,
    contract_hash: str,
    errors: list[str],
) -> tuple[dict, str | None]:
    artifacts = case.get("artifacts")
    script = artifacts.get("presentationScript") if isinstance(artifacts, dict) else None
    script_hash = script.get("sha256") if isinstance(script, dict) else None
    readiness = case.get("derivedReadiness")
    readiness_hashes = readiness.get("artifactHashes") if isinstance(readiness, dict) else None
    readiness_script_hash = (
        readiness_hashes.get("presentationScript") if isinstance(readiness_hashes, dict) else None
    )
    if not isinstance(script_hash, str) or script_hash != readiness_script_hash:
        errors.append("case readiness does not bind the current presentation script hash")

    inventory = load_json(case_dir / "implementation" / "authoring-inventory.json")
    if inventory.get("schemaVersion") != 2:
        errors.append("Authoring Inventory must use schemaVersion 2")
    case_id = case.get("caseId")
    if inventory.get("caseId") != case_id:
        errors.append("Authoring Inventory caseId does not match case.json")
    if inventory.get("projectPath") != f"project/{case_id}.h5lesson":
        errors.append("Authoring Inventory projectPath does not match the case project")
    generated_from = inventory.get("generatedFrom")
    if not isinstance(generated_from, dict):
        errors.append("Authoring Inventory generatedFrom is missing")
    else:
        if generated_from.get("coursewareContractSha256") != contract_hash:
            errors.append("Authoring Inventory uses a stale courseware contract hash")
        if generated_from.get("presentationScriptSha256") != script_hash:
            errors.append("Authoring Inventory uses a stale presentation script hash")
        if generated_from.get("capabilityIndexSha256") != capability_hash:
            errors.append("Authoring Inventory uses a stale Capability Index hash")
        if generated_from.get("developmentPlanSha256") != development_plan_hash:
            errors.append("Authoring Inventory uses a stale development plan hash")

    exact_locations = readiness.get("exactContentLocations") if isinstance(readiness, dict) else None
    if not isinstance(exact_locations, dict) or not exact_locations:
        errors.append("case readiness has no exact content locations")
        exact_locations = {}
    else:
        for content_id, relative in exact_locations.items():
            if not isinstance(content_id, str) or not isinstance(relative, str):
                errors.append("case exact content locations must map string IDs to paths")
                continue
            try:
                location = within(case_dir, case_dir / relative)
            except ValueError as exc:
                errors.append(str(exc))
                continue
            if not location.exists():
                errors.append(f"exact content location is missing: {content_id}")

    entities: list[object] = []
    global_entities = inventory.get("globalEntities")
    if isinstance(global_entities, list):
        entities.extend(global_entities)
    scenes = inventory.get("scenes")
    if isinstance(scenes, list):
        for scene in scenes:
            if isinstance(scene, dict) and isinstance(scene.get("entities"), list):
                entities.extend(scene["entities"])
    for entity in entities:
        if not isinstance(entity, dict):
            continue
        source_ref = entity.get("sourceRef")
        match = CONTENT_ID_PATTERN.fullmatch(source_ref) if isinstance(source_ref, str) else None
        if match and match.group(1) not in exact_locations:
            errors.append(
                f"Authoring Inventory sourceRef has no exact approved content location: {source_ref}"
            )
    return inventory, script_hash if isinstance(script_hash, str) else None


def main() -> int:
    args = parse_args()
    errors: list[str] = []
    warnings: list[str] = []
    blocked_capabilities: list[str] = []
    trusted_execution: list[dict[str, object]] = []
    case_dir = Path(args.case_dir).resolve()
    editor_root = Path(args.editor_root).resolve()
    skill_dir = Path(__file__).resolve().parent.parent
    try:
        case = validate_case_readiness(case_dir, skill_dir, editor_root=editor_root)
        contract = load_contract_facts(case_dir, case=case, skill_dir=skill_dir)
        contract_hash = contract["coursewareContractSha256"]
        unsupported_physical_actions = sorted(
            action_id for action_id, fields in contract.get("actions", {}).items()
            if isinstance(fields, dict) and fields.get("kind") in {"oral", "paper"}
        )
        if args.target in {"evidence", "accepted"} and unsupported_physical_actions:
            blocked_capabilities.append("trusted-physical-action-receipt-v1")
            errors.append(
                "oral/paper requiredActions need an external trusted physical-observation receipt; "
                f"the browser runner cannot witness them: {unsupported_physical_actions!r}"
            )
        _, capability_hash = validate_capabilities(editor_root)
        if args.target != "entry":
            plan_path = case_dir / "03-development-plan.md"
            plan = plan_path.read_text(encoding="utf-8")
            development_plan_hash = sha256_file(plan_path)
            _, presentation_hash = validate_inventory_provenance(
                case_dir, case, capability_hash, development_plan_hash, contract_hash, errors
            )
            for heading in REQUIRED_PLAN_HEADINGS:
                if heading not in plan:
                    errors.append(f"development plan is missing heading: {heading}")
            if "[待填写" in plan or "[待实现者填写" in plan:
                errors.append("development plan still contains placeholders")
            if capability_hash not in plan:
                errors.append("development plan does not bind the current Capability Index hash")
            if presentation_hash is not None and presentation_hash not in plan:
                errors.append("development plan does not bind the current presentation script hash")
            if contract_hash not in plan:
                errors.append("development plan does not bind the current courseware contract hash")

            state = load_json(case_dir / "implementation" / "implementation-state.json")
            if state.get("schemaVersion") != 2:
                errors.append("implementation state must use schemaVersion 2")
            if state.get("capabilityIndexSha256") != capability_hash:
                errors.append("implementation state uses a stale Capability Index hash")
            if state.get("presentationScriptSha256") != presentation_hash:
                errors.append("implementation state uses a stale presentation script hash")
            if state.get("coursewareContractSha256") != contract_hash:
                errors.append("implementation state uses a stale courseware contract hash")
            if state.get("developmentPlanSha256") != development_plan_hash:
                errors.append("implementation state uses a stale development plan hash")
            behavior_spec_path = case_dir / "implementation" / "behavior-spec.json"
            if not behavior_spec_path.is_file():
                errors.append("behavior spec is missing")
            else:
                behavior_spec_hash = sha256_file(behavior_spec_path)
                if state.get("behaviorSpecSha256") != behavior_spec_hash:
                    errors.append("implementation state uses a stale behavior spec hash")
                behavior_spec = load_json(behavior_spec_path)
                if behavior_spec.get("caseId") != case.get("caseId"):
                    errors.append("behavior spec caseId does not match case.json")
                if behavior_spec.get("presentationScriptSha256") != presentation_hash:
                    errors.append("behavior spec uses a stale presentation script hash")
                if behavior_spec.get("developmentPlanSha256") != development_plan_hash:
                    errors.append("behavior spec uses a stale development plan hash")
                if behavior_spec.get("coursewareContractSha256") != contract_hash:
                    errors.append("behavior spec uses a stale courseware contract hash")
                behavior_result = subprocess.run([
                    sys.executable,
                    "-X",
                    "utf8",
                    str(skill_dir / "scripts" / "validate_behavior_spec.py"),
                    str(behavior_spec_path),
                    "--case-dir",
                    str(case_dir),
                    "--capability-index",
                    str(editor_root / "artifacts" / "ai-capabilities" / "index.json"),
                    "--json",
                ], **utf8_process_options())
                if behavior_result.returncode != 0:
                    errors.append("Behavior Spec failed: " + (behavior_result.stdout.strip() or behavior_result.stderr.strip()))
            if state.get("status") not in ("implemented", "verified"):
                errors.append("implementation state must be implemented or verified")
            project_hash = state.get("currentProjectSha256")
            project_path = within(case_dir, case_dir / "project" / f"{case.get('caseId')}.h5lesson")
            if not project_path.is_file():
                errors.append("Project V8 archive is missing")
            elif project_hash != sha256_file(project_path):
                errors.append("implementation state project hash is stale")
            else:
                npm = "npm.cmd" if sys.platform == "win32" else "npm"
                project_result = subprocess.run([
                    npm,
                    "run",
                    "--silent",
                    "validate:project",
                    "--",
                    str(project_path),
                ], cwd=editor_root, **utf8_process_options())
                if project_result.returncode != 0:
                    errors.append("Project validation failed: " + (project_result.stdout.strip() or project_result.stderr.strip()))
                if behavior_spec_path.is_file():
                    validate_assessment_carriers(
                        project_path,
                        load_json(behavior_spec_path),
                        editor_root,
                        args.target,
                        errors,
                        blocked_capabilities,
                    )
                validator = skill_dir / "scripts" / "validate_authoring_inventory.py"
                inventory_result = subprocess.run([
                    sys.executable,
                    "-X",
                    "utf8",
                    str(validator),
                    str(case_dir / "implementation" / "authoring-inventory.json"),
                    "--project",
                    str(project_path),
                    "--case-dir",
                    str(case_dir),
                    "--target",
                    "accepted" if args.target == "accepted" else "engineering-candidate",
                    "--json",
                ], **utf8_process_options())
                if inventory_result.returncode != 0:
                    errors.append("Authoring Inventory failed: " + (inventory_result.stdout.strip() or inventory_result.stderr.strip()))
                inventory_path = case_dir / "implementation" / "authoring-inventory.json"
                inventory_hash = sha256_file(inventory_path)
                if state.get("authoringInventorySha256") != inventory_hash:
                    errors.append("implementation state uses a stale Authoring Inventory hash")
                snapshot_path = case_dir / "implementation" / "authoring-target-snapshot.json"
                if not snapshot_path.is_file():
                    errors.append("authoring target snapshot is missing")
                else:
                    snapshot_hash = sha256_file(snapshot_path)
                    if state.get("authoringTargetSnapshotSha256") != snapshot_hash:
                        errors.append("implementation state uses a stale authoring target snapshot hash")
                    snapshot_result = subprocess.run([
                        sys.executable,
                        "-X",
                        "utf8",
                        str(skill_dir / "scripts" / "validate_authoring_target_snapshot.py"),
                        str(snapshot_path),
                        "--inventory",
                        str(inventory_path),
                        "--project",
                        str(project_path),
                        "--case-dir",
                        str(case_dir),
                        "--target",
                        "implementation",
                        "--json",
                    ], **utf8_process_options())
                    if snapshot_result.returncode != 0:
                        errors.append(
                            "Authoring Target snapshot failed: "
                            + (snapshot_result.stdout.strip() or snapshot_result.stderr.strip())
                        )
                formula_result = subprocess.run([
                    sys.executable,
                    "-X",
                    "utf8",
                    str(skill_dir / "scripts" / "validate_formula_markup.py"),
                    str(case_dir / "implementation"),
                    str(project_path),
                    "--json",
                ], **utf8_process_options())
                if formula_result.returncode != 0:
                    errors.append("Formula markup failed: " + (formula_result.stdout.strip() or formula_result.stderr.strip()))

        if args.target in ("evidence", "accepted"):
            evidence_result = subprocess.run([
                sys.executable,
                "-X",
                "utf8",
                str(skill_dir / "scripts" / "validate_evidence.py"),
                str(case_dir / "evidence" / "evidence-manifest.json"),
                "--structural-only",
                "--editor-root",
                str(editor_root),
                "--json",
            ], **utf8_process_options())
            if evidence_result.returncode != 0:
                errors.append("evidence manifest failed: " + (evidence_result.stdout.strip() or evidence_result.stderr.strip()))
            else:
                evidence = load_json(case_dir / "evidence" / "evidence-manifest.json")
                evidence_inputs = evidence.get("inputs")
                if not isinstance(evidence_inputs, dict):
                    errors.append("evidence inputs are missing")
                else:
                    expected_inputs = {
                        "coursewareContractSha256": contract_hash,
                        "presentationScriptSha256": presentation_hash,
                        "capabilityIndexSha256": capability_hash,
                        "developmentPlanSha256": development_plan_hash,
                        "behaviorSpecSha256": state.get("behaviorSpecSha256"),
                        "projectSha256": state.get("currentProjectSha256"),
                    }
                    for key, expected in expected_inputs.items():
                        if evidence_inputs.get(key) != expected:
                            errors.append(f"evidence input is stale: {key}")
                if evidence.get("pipelineStatus") != "passed":
                    errors.append("evidence target requires pipelineStatus passed")
                if args.target == "evidence" and evidence.get("outcomeStatus") != "engineering candidate":
                    errors.append(
                        "local evidence target requires exactly engineering candidate; "
                        "art/accepted promotion belongs to an external trusted review system"
                    )
                if args.target == "accepted" and evidence.get("outcomeStatus") != "accepted":
                    errors.append("accepted target requires accepted human outcome")
                if args.target == "accepted":
                    errors.append(
                        "accepted cannot be issued by the local Builder validator; "
                        "an external trusted human-acceptance service must promote the exact evidence scope"
                    )
                behavior_report_path = case_dir / "evidence" / "behavior-report.json"
                authoring_report_path = case_dir / "evidence" / "authoring-session-report.json"
                authoring_session = (
                    load_json(authoring_report_path) if authoring_report_path.is_file() else None
                )
                if authoring_session is None:
                    blocked_capabilities.append("editor-authoring-session-replay-v1")
                    errors.append("authoring session report is missing for trusted replay")
                else:
                    exporter = authoring_session.get("exporter")
                    deliveries = exporter.get("deliveries") if isinstance(exporter, dict) else None
                    delivery_paths = {
                        kind: item.get("path")
                        for kind, item in deliveries.items()
                        if isinstance(kind, str) and isinstance(item, dict)
                    } if isinstance(deliveries, dict) else {}
                    expected_delivery_kinds = {"html", "webPackage", "pdf", "pptx"}
                    if (
                        set(delivery_paths) != expected_delivery_kinds
                        or any(not isinstance(item, str) for item in delivery_paths.values())
                    ):
                        blocked_capabilities.append("trusted-project-export-replay-v1")
                        errors.append("authoring session report has no complete four-format delivery binding")
                    else:
                        npm = "npm.cmd" if sys.platform == "win32" else "npm"
                        build_argv = [npm, "run", "--silent", "build:desktop"]
                        build_result = subprocess.run(
                            build_argv, cwd=editor_root, **utf8_process_options()
                        )
                        trusted_execution.append({
                            "kind": "editor-build",
                            "argv": build_argv,
                            "cwd": str(editor_root),
                            "exitCode": build_result.returncode,
                        })
                        if build_result.returncode != 0:
                            blocked_capabilities.append("editor-build-current-replay-v1")
                            errors.append(
                                "trusted editor build failed: "
                                + (build_result.stdout.strip() or build_result.stderr.strip())
                            )
                        else:
                            tsx_cli = editor_root / "node_modules" / "tsx" / "dist" / "cli.mjs"
                            authoring_runner = editor_root / "scripts" / "run-courseware-authoring.ts"
                            authoring_argv = [
                                "node.exe" if sys.platform == "win32" else "node",
                                str(tsx_cli),
                                "--tsconfig", str(editor_root / "tsconfig.json"),
                                str(authoring_runner),
                                "--case-dir", str(case_dir),
                                "--editor-root", str(editor_root),
                                "--inventory", "implementation/authoring-inventory.json",
                                "--project", f"project/{case.get('caseId')}.h5lesson",
                                "--delivery-html", delivery_paths["html"],
                                "--delivery-web-package", delivery_paths["webPackage"],
                                "--delivery-pdf", delivery_paths["pdf"],
                                "--delivery-pptx", delivery_paths["pptx"],
                                "--report", "evidence/authoring-session-report.json",
                                "--verify-report",
                            ]
                            authoring_replay = subprocess.run(
                                authoring_argv, cwd=editor_root, **utf8_process_options()
                            )
                            trusted_execution.append({
                                "kind": "editor-authoring-session",
                                "argv": authoring_argv,
                                "cwd": str(editor_root),
                                "exitCode": authoring_replay.returncode,
                            })
                            if authoring_replay.returncode != 0:
                                blocked_capabilities.append("editor-authoring-session-replay-v1")
                                errors.append(
                                    "authoring session trusted replay failed: "
                                    + (authoring_replay.stdout.strip() or authoring_replay.stderr.strip())
                                )
                if behavior_report_path.is_file():
                    behavior_report = load_json(behavior_report_path)
                    report_target = behavior_report.get("target")
                    target_path = report_target.get("path") if isinstance(report_target, dict) else None
                    if not isinstance(target_path, str):
                        errors.append("behavior report has no replayable target path")
                    else:
                        tsx_cli = editor_root / "node_modules" / "tsx" / "dist" / "cli.mjs"
                        runner = editor_root / "scripts" / "run-courseware-behavior.ts"
                        replay_result = subprocess.run([
                            "node.exe" if sys.platform == "win32" else "node",
                            str(tsx_cli),
                            "--tsconfig",
                            str(editor_root / "tsconfig.json"),
                            str(runner),
                            "--case-dir",
                            str(case_dir),
                            "--spec",
                            "implementation/behavior-spec.json",
                            "--target",
                            target_path,
                            "--report",
                            "evidence/behavior-report.json",
                            "--verify-report",
                        ], cwd=editor_root, **utf8_process_options())
                        trusted_execution.append({
                            "kind": "behavior-runner",
                            "argv": [
                                "node.exe" if sys.platform == "win32" else "node",
                                str(tsx_cli), "--tsconfig", str(editor_root / "tsconfig.json"),
                                str(runner), "--case-dir", str(case_dir),
                                "--spec", "implementation/behavior-spec.json",
                                "--target", target_path,
                                "--report", "evidence/behavior-report.json", "--verify-report",
                            ],
                            "cwd": str(editor_root),
                            "exitCode": replay_result.returncode,
                        })
                        if replay_result.returncode != 0:
                            blocked_capabilities.append("behavior-replay-v2")
                            errors.append(
                                "behavior report trusted replay failed: "
                                + (replay_result.stdout.strip() or replay_result.stderr.strip())
                            )
                else:
                    errors.append("behavior report is missing for trusted replay")
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        errors.append(str(exc))

    outcome_status = (
        "engineering candidate"
        if not errors and args.target == "evidence"
        else "pending"
    )
    report = {
        "validator": "build-project-v8-courseware-v2",
        "target": args.target,
        "pipelineStatus": "passed" if not errors else "failed",
        "outcomeStatus": outcome_status,
        "blockedCapabilities": sorted(set(blocked_capabilities)),
        "trustedExecution": trusted_execution,
        "errors": errors,
        "warnings": warnings,
    }
    if args.as_json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print(f"pipeline status: {report['pipelineStatus']}")
        print(f"outcome status: {outcome_status}")
        for error in errors:
            print(f"ERROR: {error}")
        for warning in warnings:
            print(f"WARNING: {warning}")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
