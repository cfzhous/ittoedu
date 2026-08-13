#!/usr/bin/env python3
"""Validate evidence hashes and prevent automation from granting acceptance."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import unicodedata
import zipfile
from pathlib import Path, PurePosixPath

from v8_common import sha256_file, within


OUTCOMES = {"unusable", "placeholder", "engineering candidate", "art candidate", "accepted"}
PIPELINE_STATUSES = {"not-run", "failed", "passed"}
DELIVERY_ARTIFACT_KINDS = {
    "project", "html", "web-package", "pdf", "pptx", "screenshot", "contact-sheet", "recording",
}
AUTOMATION_REVIEWERS = {"automation", "codex", "chatgpt", "gpt", "ai", "builder", "agent"}
AUTOMATION_REVIEWER_PHRASES = {
    "人工智能", "大模型", "自动化", "自动审批", "自动验收", "智能体", "机器人", "聊天机器人",
}
ARTIFACT_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
ARTIFACT_KIND_RE = re.compile(r"^[a-z][a-z0-9-]*$")
SHA256_RE = re.compile(r"^[a-f0-9]{64}$", re.IGNORECASE)
SCENE_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$")
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
RECORDING_EXTENSIONS = {".mp4", ".m4v", ".mov", ".webm", ".mkv", ".avi"}
MAX_INSPECTED_ZIP_MEMBER_BYTES = 16 * 1024 * 1024


def canonical_sha256(value: object) -> str:
    payload = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def acceptance_scope(value: dict) -> str:
    return canonical_sha256({
        "schemaVersion": value.get("schemaVersion"),
        "caseId": value.get("caseId"),
        "pipelineStatus": value.get("pipelineStatus"),
        "outcomeStatus": value.get("outcomeStatus"),
        "inputs": value.get("inputs"),
        "commands": value.get("commands"),
        "artifacts": value.get("artifacts"),
        "editRoundTrips": value.get("editRoundTrips"),
        "sceneEvidence": value.get("sceneEvidence"),
        "requiredFrames": value.get("requiredFrames"),
        "differences": value.get("differences"),
        "remainingRisks": value.get("remainingRisks"),
    })


def reviewer_is_automated(reviewer: str) -> bool:
    normalized = unicodedata.normalize("NFKC", reviewer).casefold()
    ascii_tokens = set(re.findall(r"[a-z0-9]+", normalized))
    if ascii_tokens & AUTOMATION_REVIEWERS:
        return True
    if re.search(r"(?<![a-z0-9])a[\W_]*i(?![a-z0-9])", normalized):
        return True
    compact = re.sub(r"\s+", "", normalized)
    return any(phrase in compact for phrase in AUTOMATION_REVIEWER_PHRASES)


def portable_relative_path(relative: str) -> PurePosixPath:
    if "\\" in relative:
        raise ValueError("artifact path must use portable '/' separators")
    pure = PurePosixPath(relative)
    if not relative or pure.is_absolute() or re.match(r"^[A-Za-z]:", relative):
        raise ValueError("artifact path must be relative to caseRoot")
    if any(part in {"", ".", ".."} for part in pure.parts):
        raise ValueError("artifact path must not contain empty, '.' or '..' segments")
    return pure


def read_head_tail(path: Path, size: int = 1024 * 1024) -> tuple[bytes, bytes, int]:
    length = path.stat().st_size
    with path.open("rb") as handle:
        head = handle.read(size)
        if length <= size:
            return head, head, length
        handle.seek(max(0, length - size))
        return head, handle.read(size), length


def zip_index(archive: zipfile.ZipFile) -> tuple[dict[str, zipfile.ZipInfo], list[str]]:
    members: dict[str, zipfile.ZipInfo] = {}
    folded_names: set[str] = set()
    errors: list[str] = []
    for info in archive.infolist():
        name = info.filename
        pure = PurePosixPath(name)
        if (
            not name
            or "\\" in name
            or pure.is_absolute()
            or any(part in {"", ".", ".."} for part in pure.parts)
        ):
            errors.append(f"unsafe ZIP member path: {name!r}")
            continue
        folded = name.casefold()
        if folded in folded_names:
            errors.append(f"duplicate ZIP member path: {name}")
            continue
        folded_names.add(folded)
        members[name] = info
        if info.flag_bits & 0x1:
            errors.append(f"encrypted ZIP member is not allowed: {name}")
    return members, errors


def read_zip_member(
    archive: zipfile.ZipFile,
    members: dict[str, zipfile.ZipInfo],
    name: str,
) -> bytes:
    info = members.get(name)
    if info is None:
        raise ValueError(f"ZIP member is missing: {name}")
    if info.is_dir() or info.file_size <= 0:
        raise ValueError(f"ZIP member is empty: {name}")
    if info.file_size > MAX_INSPECTED_ZIP_MEMBER_BYTES:
        raise ValueError(f"ZIP member is too large to inspect safely: {name}")
    return archive.read(info)


def validate_project_artifact(path: Path) -> list[str]:
    errors: list[str] = []
    if path.suffix.lower() != ".h5lesson":
        errors.append("project artifact must use the .h5lesson extension")
        return errors
    try:
        with zipfile.ZipFile(path) as archive:
            members, zip_errors = zip_index(archive)
            errors.extend(zip_errors)
            try:
                project = json.loads(read_zip_member(archive, members, "project.json").decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError, ValueError, RuntimeError, zipfile.BadZipFile) as exc:
                errors.append(f"invalid Project V8 project.json: {exc}")
                return errors
            if not isinstance(project, dict) or project.get("schemaVersion") != 8:
                errors.append("project.json must declare Project Schema V8")
            if not isinstance(project, dict) or not isinstance(project.get("id"), str) or not project.get("id"):
                errors.append("project.json must contain a non-empty project id")
            if not isinstance(project, dict) or not isinstance(project.get("scenes"), list) or not project.get("scenes"):
                errors.append("project.json must contain at least one scene")
    except (OSError, zipfile.BadZipFile, zipfile.LargeZipFile) as exc:
        errors.append(f"project artifact is not a readable ZIP container: {exc}")
    return errors


def project_scene_ids(path: Path) -> set[str] | None:
    try:
        with zipfile.ZipFile(path) as archive:
            members, zip_errors = zip_index(archive)
            if zip_errors:
                return None
            project = json.loads(read_zip_member(archive, members, "project.json").decode("utf-8"))
        if not isinstance(project, dict) or project.get("schemaVersion") != 8:
            return None
        scenes = project.get("scenes")
        if not isinstance(scenes, list) or not scenes:
            return None
        identifiers = [scene.get("id") for scene in scenes if isinstance(scene, dict)]
        if len(identifiers) != len(scenes) or any(
            not isinstance(scene_id, str) or not SCENE_ID_RE.fullmatch(scene_id)
            for scene_id in identifiers
        ):
            return None
        return set(identifiers)
    except (OSError, UnicodeDecodeError, json.JSONDecodeError, ValueError, RuntimeError, zipfile.BadZipFile):
        return None


def validate_html_artifact(path: Path) -> list[str]:
    if path.suffix.lower() not in {".html", ".htm"}:
        return ["html artifact must use the .html or .htm extension"]
    try:
        head, tail, length = read_head_tail(path)
        if length < 32:
            return ["html artifact is implausibly small"]
        # Chunk boundaries can split a multi-byte code point in a large HTML file.
        # Replacement decoding preserves the structural tag check without a false
        # rejection at that inspection boundary.
        head_text = head.decode("utf-8-sig", errors="replace").casefold()
        tail_text = tail.decode("utf-8", errors="replace").casefold()
    except OSError as exc:
        return [f"html artifact is not readable: {exc}"]
    errors: list[str] = []
    if "<html" not in head_text:
        errors.append("html artifact has no opening <html> element")
    if "</html>" not in tail_text:
        errors.append("html artifact has no closing </html> element")
    return errors


def validate_web_package(path: Path) -> list[str]:
    errors: list[str] = []
    if path.suffix.lower() != ".zip":
        errors.append("web-package artifact must use the .zip extension")
        return errors
    required = ("index.html", "course-data.js", "player/player.iife.js", "player/player.css")
    try:
        with zipfile.ZipFile(path) as archive:
            members, zip_errors = zip_index(archive)
            errors.extend(zip_errors)
            contents: dict[str, bytes] = {}
            for name in required:
                try:
                    contents[name] = read_zip_member(archive, members, name)
                except (ValueError, RuntimeError, zipfile.BadZipFile) as exc:
                    errors.append(str(exc))
            index_html = contents.get("index.html")
            if index_html is not None:
                try:
                    index_text = index_html.decode("utf-8-sig").casefold()
                    if "<html" not in index_text or "</html>" not in index_text:
                        errors.append("web-package index.html is not a complete HTML document")
                except UnicodeDecodeError as exc:
                    errors.append(f"web-package index.html is not UTF-8: {exc}")
    except (OSError, zipfile.BadZipFile, zipfile.LargeZipFile) as exc:
        errors.append(f"web-package artifact is not a readable ZIP container: {exc}")
    return errors


def validate_pdf_artifact(path: Path) -> list[str]:
    if path.suffix.lower() != ".pdf":
        return ["pdf artifact must use the .pdf extension"]
    head, tail, length = read_head_tail(path, 4096)
    errors: list[str] = []
    if length < 32 or not head.startswith(b"%PDF-"):
        errors.append("pdf artifact has no valid PDF header")
    if b"%%EOF" not in tail.rstrip()[-1024:]:
        errors.append("pdf artifact has no PDF end marker")
    return errors


def validate_pptx_artifact(path: Path) -> list[str]:
    errors: list[str] = []
    if path.suffix.lower() != ".pptx":
        errors.append("pptx artifact must use the .pptx extension")
        return errors
    required = ("[Content_Types].xml", "_rels/.rels", "ppt/presentation.xml")
    try:
        with zipfile.ZipFile(path) as archive:
            members, zip_errors = zip_index(archive)
            errors.extend(zip_errors)
            contents: dict[str, bytes] = {}
            for name in required:
                try:
                    contents[name] = read_zip_member(archive, members, name)
                except (ValueError, RuntimeError, zipfile.BadZipFile) as exc:
                    errors.append(str(exc))
            content_types = contents.get("[Content_Types].xml", b"").lower()
            relationships = contents.get("_rels/.rels", b"").lower()
            presentation = contents.get("ppt/presentation.xml", b"").lower()
            if content_types and b"presentationml.presentation.main+xml" not in content_types:
                errors.append("pptx content types do not declare a presentation document")
            if relationships and b"officedocument" not in relationships:
                errors.append("pptx root relationships have no Office document target")
            if presentation and b"<p:presentation" not in presentation:
                errors.append("pptx presentation.xml has no presentation root")
    except (OSError, zipfile.BadZipFile, zipfile.LargeZipFile) as exc:
        errors.append(f"pptx artifact is not a readable OOXML ZIP container: {exc}")
    return errors


def jpeg_dimensions(data: bytes) -> tuple[int, int] | None:
    if len(data) < 4 or not data.startswith(b"\xff\xd8\xff"):
        return None
    index = 2
    sof_markers = {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}
    while index + 4 <= len(data):
        if data[index] != 0xFF:
            index += 1
            continue
        while index < len(data) and data[index] == 0xFF:
            index += 1
        if index >= len(data):
            break
        marker = data[index]
        index += 1
        if marker in {0xD8, 0xD9, 0x01} or 0xD0 <= marker <= 0xD7:
            continue
        if index + 2 > len(data):
            break
        segment_length = int.from_bytes(data[index:index + 2], "big")
        if segment_length < 2 or index + segment_length > len(data):
            break
        if marker in sof_markers and segment_length >= 7:
            height = int.from_bytes(data[index + 3:index + 5], "big")
            width = int.from_bytes(data[index + 5:index + 7], "big")
            return width, height
        index += segment_length
    return None


def image_dimensions(path: Path) -> tuple[int, int] | None:
    data = path.read_bytes()
    suffix = path.suffix.lower()
    if suffix == ".png":
        if (
            len(data) >= 45
            and data.startswith(b"\x89PNG\r\n\x1a\n")
            and data[8:12] == b"\x00\x00\x00\x0d"
            and data[12:16] == b"IHDR"
            and data[-12:-8] == b"\x00\x00\x00\x00"
            and data[-8:-4] == b"IEND"
        ):
            return int.from_bytes(data[16:20], "big"), int.from_bytes(data[20:24], "big")
        return None
    if suffix in {".jpg", ".jpeg"}:
        if not data.endswith(b"\xff\xd9"):
            return None
        return jpeg_dimensions(data)
    if (
        suffix == ".webp"
        and len(data) >= 30
        and data[:4] == b"RIFF"
        and data[8:12] == b"WEBP"
        and int.from_bytes(data[4:8], "little") + 8 <= len(data)
    ):
        chunk = data[12:16]
        if chunk == b"VP8X":
            return 1 + int.from_bytes(data[24:27], "little"), 1 + int.from_bytes(data[27:30], "little")
        if chunk == b"VP8L" and data[20] == 0x2F:
            bits = int.from_bytes(data[21:25], "little")
            return (bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1
        if chunk == b"VP8 " and len(data) >= 30 and data[23:26] == b"\x9d\x01\x2a":
            return int.from_bytes(data[26:28], "little") & 0x3FFF, int.from_bytes(data[28:30], "little") & 0x3FFF
    return None


def validate_image_artifact(path: Path, kind: str) -> list[str]:
    if path.suffix.lower() not in IMAGE_EXTENSIONS:
        return [f"{kind} artifact must use PNG, JPEG or WebP"]
    try:
        dimensions = image_dimensions(path)
    except OSError as exc:
        return [f"{kind} artifact is unreadable: {exc}"]
    if dimensions is None or dimensions[0] <= 0 or dimensions[1] <= 0:
        return [f"{kind} artifact has no recognizable image header and dimensions"]
    return []


def mp4_top_level_boxes(path: Path) -> tuple[list[tuple[bytes, int]], bool]:
    length = path.stat().st_size
    boxes: list[tuple[bytes, int]] = []
    offset = 0
    with path.open("rb") as handle:
        while offset < length:
            if length - offset < 8:
                return boxes, False
            handle.seek(offset)
            header = handle.read(16)
            if len(header) < 8:
                return boxes, False
            size = int.from_bytes(header[:4], "big")
            box_type = header[4:8]
            header_size = 8
            if size == 1:
                if len(header) < 16:
                    return boxes, False
                size = int.from_bytes(header[8:16], "big")
                header_size = 16
            elif size == 0:
                size = length - offset
            if size < header_size or offset + size > length:
                return boxes, False
            boxes.append((box_type, size))
            offset += size
    return boxes, offset == length


def validate_recording_artifact(path: Path) -> list[str]:
    suffix = path.suffix.lower()
    if suffix not in RECORDING_EXTENSIONS:
        return ["recording artifact must use MP4/MOV, WebM/Matroska or AVI"]
    head, _, length = read_head_tail(path, 4096)
    valid = False
    if suffix in {".mp4", ".m4v", ".mov"} and len(head) >= 16 and head[4:8] == b"ftyp":
        boxes, structurally_valid = mp4_top_level_boxes(path)
        box_sizes = {box_type: size for box_type, size in boxes}
        valid = (
            structurally_valid
            and boxes[0][0] == b"ftyp"
            and box_sizes.get(b"ftyp", 0) >= 16
            and box_sizes.get(b"moov", 0) > 8
            and box_sizes.get(b"mdat", 0) > 8
        )
    elif suffix in {".webm", ".mkv"}:
        valid = head.startswith(b"\x1a\x45\xdf\xa3") and b"webm" in head.lower()
    elif suffix == ".avi":
        valid = len(head) >= 12 and head[:4] == b"RIFF" and head[8:12] == b"AVI "
    return [] if valid else ["recording artifact has no recognizable media container header"]


def validate_delivery_artifact(kind: str, path: Path) -> list[str]:
    if kind == "project":
        return validate_project_artifact(path)
    if kind == "html":
        return validate_html_artifact(path)
    if kind == "web-package":
        return validate_web_package(path)
    if kind == "pdf":
        return validate_pdf_artifact(path)
    if kind == "pptx":
        return validate_pptx_artifact(path)
    if kind in {"screenshot", "contact-sheet"}:
        return validate_image_artifact(path, kind)
    if kind == "recording":
        return validate_recording_artifact(path)
    return []


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate a Project V8 evidence manifest")
    parser.add_argument("manifest")
    parser.add_argument("--json", action="store_true", dest="as_json")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    errors: list[str] = []
    try:
        manifest_path = Path(args.manifest).resolve()
        value = json.loads(manifest_path.read_text(encoding="utf-8"))
        if not isinstance(value, dict) or value.get("schemaVersion") != 1:
            raise ValueError("evidence manifest must use schemaVersion 1")
        outcome = value.get("outcomeStatus")
        if outcome not in OUTCOMES:
            errors.append(f"invalid outcomeStatus: {outcome!r}")
        pipeline_status = value.get("pipelineStatus")
        if pipeline_status not in PIPELINE_STATUSES:
            errors.append(f"invalid pipelineStatus: {pipeline_status!r}")
        candidate_or_higher = outcome in {"engineering candidate", "art candidate", "accepted"}
        case_root_value = value.get("caseRoot", "..")
        if case_root_value != "..":
            errors.append("caseRoot must be exactly '..' from the evidence directory")
            case_root_value = ".."
        if manifest_path.parent.name != "evidence":
            errors.append("evidence manifest must live in the case evidence/ directory")
        case_root = (manifest_path.parent / case_root_value).resolve()
        artifacts = value.get("artifacts")
        if not isinstance(artifacts, list):
            errors.append("artifacts must be an array")
            artifacts = []
        seen_ids: set[str] = set()
        seen_paths: dict[str, str] = {}
        delivered_kinds: set[str] = set()
        artifact_paths_by_id: dict[str, str] = {}
        artifact_kinds_by_id: dict[str, str] = {}
        artifact_hashes_by_id: dict[str, str] = {}
        delivered_project_scene_ids: set[str] | None = None
        for artifact in artifacts:
            if not isinstance(artifact, dict):
                errors.append("artifact entry must be an object")
                continue
            artifact_id = artifact.get("id")
            relative = artifact.get("path")
            expected_hash = artifact.get("sha256")
            artifact_kind = artifact.get("kind")
            if not isinstance(artifact_id, str) or not ARTIFACT_ID_RE.fullmatch(artifact_id):
                errors.append("artifact id is required and must be a portable stable identifier")
                continue
            if artifact_id in seen_ids:
                errors.append(f"duplicate artifact id: {artifact_id}")
            seen_ids.add(artifact_id)
            if not isinstance(artifact_kind, str) or not ARTIFACT_KIND_RE.fullmatch(artifact_kind):
                errors.append(f"{artifact_id}: kind is required and must be a portable lower-case identifier")
            else:
                delivered_kinds.add(artifact_kind)
                artifact_kinds_by_id.setdefault(artifact_id, artifact_kind)
            if not isinstance(relative, str) or not isinstance(expected_hash, str):
                errors.append(f"{artifact_id}: path and sha256 are required")
                continue
            if not SHA256_RE.fullmatch(expected_hash):
                errors.append(f"{artifact_id}: sha256 must contain 64 hexadecimal characters")
            else:
                artifact_hashes_by_id.setdefault(artifact_id, expected_hash.lower())
            try:
                portable = portable_relative_path(relative)
                path = within(case_root, case_root.joinpath(*portable.parts))
            except ValueError as exc:
                errors.append(f"{artifact_id}: {exc}")
                continue
            path_key = str(path).casefold()
            reused_by = seen_paths.get(path_key)
            if reused_by is not None:
                errors.append(f"duplicate artifact path: {relative} is already used by {reused_by}")
            else:
                seen_paths[path_key] = artifact_id
            artifact_paths_by_id[artifact_id] = relative
            if not path.is_file():
                errors.append(f"{artifact_id}: evidence file is missing")
            else:
                if SHA256_RE.fullmatch(expected_hash) and sha256_file(path) != expected_hash.lower():
                    errors.append(f"{artifact_id}: evidence hash is stale")
                if candidate_or_higher and isinstance(artifact_kind, str):
                    format_errors = validate_delivery_artifact(artifact_kind, path)
                    for format_error in format_errors:
                        errors.append(f"{artifact_id}: {format_error}")
                    if artifact_kind == "project" and not format_errors:
                        delivered_project_scene_ids = project_scene_ids(path)

        if candidate_or_higher:
            if pipeline_status != "passed":
                errors.append("candidate or accepted outcome requires pipelineStatus passed")
            missing_kinds = sorted(DELIVERY_ARTIFACT_KINDS - delivered_kinds)
            if missing_kinds:
                errors.append("delivery evidence is missing artifact kinds: " + ", ".join(missing_kinds))
            commands = value.get("commands")
            if not isinstance(commands, list) or not commands:
                errors.append("candidate or accepted outcome requires command evidence")
            else:
                for index, command in enumerate(commands):
                    if not isinstance(command, dict):
                        errors.append(f"commands[{index}] must be an object")
                        continue
                    if not str(command.get("command") or "").strip():
                        errors.append(f"commands[{index}] has no command")
                    if command.get("exitCode") != 0:
                        errors.append(f"commands[{index}] did not pass")
            round_trips = value.get("editRoundTrips")
            if not isinstance(round_trips, list) or not round_trips:
                errors.append("candidate or accepted outcome requires a real edit round trip")
            else:
                for index, round_trip in enumerate(round_trips):
                    if not isinstance(round_trip, dict):
                        errors.append(f"editRoundTrips[{index}] must be an object")
                        continue
                    for key in ("binding", "beforeProjectSha256", "afterProjectSha256", "evidenceArtifactIds"):
                        if key not in round_trip:
                            errors.append(f"editRoundTrips[{index}] is missing {key}")
                    before_hash = round_trip.get("beforeProjectSha256")
                    after_hash = round_trip.get("afterProjectSha256")
                    if not isinstance(before_hash, str) or not SHA256_RE.fullmatch(before_hash):
                        errors.append(f"editRoundTrips[{index}] has invalid beforeProjectSha256")
                    if not isinstance(after_hash, str) or not SHA256_RE.fullmatch(after_hash):
                        errors.append(f"editRoundTrips[{index}] has invalid afterProjectSha256")
                    if isinstance(before_hash, str) and before_hash == after_hash:
                        errors.append(f"editRoundTrips[{index}] did not change the project bytes")
                    evidence_ids = round_trip.get("evidenceArtifactIds")
                    if not isinstance(evidence_ids, list) or not evidence_ids or any(item not in seen_ids for item in evidence_ids):
                        errors.append(f"editRoundTrips[{index}] references missing evidence artifacts")
                    elif len(evidence_ids) != len(set(evidence_ids)):
                        errors.append(f"editRoundTrips[{index}] repeats evidence artifact ids")
            scene_evidence = value.get("sceneEvidence")
            declared_scenes: dict[str, str] = {}
            if not isinstance(scene_evidence, list) or not scene_evidence:
                errors.append("candidate or accepted outcome requires sceneEvidence declarations")
            else:
                for index, scene in enumerate(scene_evidence):
                    if not isinstance(scene, dict):
                        errors.append(f"sceneEvidence[{index}] must be an object")
                        continue
                    scene_id = scene.get("sceneId")
                    scene_type = scene.get("sceneType")
                    if not isinstance(scene_id, str) or not SCENE_ID_RE.fullmatch(scene_id):
                        errors.append(f"sceneEvidence[{index}] has no portable sceneId")
                        continue
                    if scene_id in declared_scenes:
                        errors.append(f"duplicate sceneEvidence declaration: {scene_id}")
                    if scene_type not in {"interactive", "static"}:
                        errors.append(f"sceneEvidence[{index}] has invalid sceneType")
                        continue
                    declared_scenes[scene_id] = scene_type
                if delivered_project_scene_ids is not None:
                    declared_scene_ids = set(declared_scenes)
                    missing_scene_declarations = sorted(delivered_project_scene_ids - declared_scene_ids)
                    unknown_scene_declarations = sorted(declared_scene_ids - delivered_project_scene_ids)
                    if missing_scene_declarations:
                        errors.append(
                            "sceneEvidence is missing Project V8 scenes: "
                            + ", ".join(missing_scene_declarations)
                        )
                    if unknown_scene_declarations:
                        errors.append(
                            "sceneEvidence declares scenes absent from Project V8: "
                            + ", ".join(unknown_scene_declarations)
                        )
            required_frames = value.get("requiredFrames")
            if not isinstance(required_frames, list) or not required_frames:
                errors.append("candidate or accepted outcome requires requiredFrames evidence")
            else:
                seen_frame_keys: set[tuple[str, str]] = set()
                seen_frame_artifacts: set[str] = set()
                seen_frame_hashes: set[str] = set()
                roles_by_scene: dict[str, set[str]] = {}
                for index, frame in enumerate(required_frames):
                    if not isinstance(frame, dict):
                        errors.append(f"requiredFrames[{index}] must be an object")
                        continue
                    scene_id = frame.get("sceneId")
                    role = frame.get("role")
                    artifact_id = frame.get("artifactId")
                    if not isinstance(scene_id, str) or not scene_id:
                        errors.append(f"requiredFrames[{index}] has no sceneId")
                    if role not in ("pre-interaction", "feedback", "stable-result", "static-stable"):
                        errors.append(f"requiredFrames[{index}] has invalid role")
                    if not isinstance(artifact_id, str) or artifact_id not in seen_ids:
                        errors.append(f"requiredFrames[{index}] references missing artifact")
                    elif artifact_id not in artifact_paths_by_id:
                        errors.append(f"requiredFrames[{index}] artifact has no validated path")
                    elif artifact_kinds_by_id.get(artifact_id) != "screenshot":
                        errors.append(f"requiredFrames[{index}] must reference a screenshot artifact")
                    elif artifact_id in seen_frame_artifacts:
                        errors.append(f"requiredFrames[{index}] reuses a screenshot from another frame slot")
                    elif artifact_hashes_by_id.get(artifact_id) in seen_frame_hashes:
                        errors.append(f"requiredFrames[{index}] reuses identical screenshot bytes")
                    else:
                        seen_frame_artifacts.add(artifact_id)
                        artifact_hash = artifact_hashes_by_id.get(artifact_id)
                        if artifact_hash is not None:
                            seen_frame_hashes.add(artifact_hash)
                    key = (str(scene_id), str(role))
                    if key in seen_frame_keys:
                        errors.append(f"duplicate required frame: {scene_id}/{role}")
                    seen_frame_keys.add(key)
                    if isinstance(scene_id, str) and isinstance(role, str):
                        roles_by_scene.setdefault(scene_id, set()).add(role)
                    if isinstance(scene_id, str) and scene_id not in declared_scenes:
                        errors.append(f"requiredFrames[{index}] scene is not declared in sceneEvidence")
                for scene_id, scene_type in declared_scenes.items():
                    expected_roles = (
                        {"pre-interaction", "feedback", "stable-result"}
                        if scene_type == "interactive"
                        else {"static-stable"}
                    )
                    actual_roles = roles_by_scene.get(scene_id, set())
                    missing_roles = sorted(expected_roles - actual_roles)
                    unexpected_roles = sorted(actual_roles - expected_roles)
                    if missing_roles:
                        errors.append(
                            f"sceneEvidence {scene_id} is missing required frame roles: {', '.join(missing_roles)}"
                        )
                    if unexpected_roles:
                        errors.append(
                            f"sceneEvidence {scene_id} has roles inconsistent with {scene_type}: "
                            + ", ".join(unexpected_roles)
                        )

        current_scope = acceptance_scope(value)

        acceptance = value.get("humanAcceptance")
        if outcome == "accepted":
            if not isinstance(acceptance, dict):
                errors.append("accepted outcome requires humanAcceptance")
            else:
                for key in ("reviewer", "approvedAt", "approvalEvidence", "explicitOpinion"):
                    if not isinstance(acceptance.get(key), str) or not acceptance.get(key).strip():
                        errors.append(f"humanAcceptance is missing {key}")
                if acceptance.get("decision") != "accepted":
                    errors.append("humanAcceptance decision must be accepted")
                reviewer = str(acceptance.get("reviewer", "")).strip()
                if reviewer_is_automated(reviewer):
                    errors.append("automation cannot be the acceptance reviewer")
                if acceptance.get("scopeSha256") != current_scope:
                    errors.append("humanAcceptance scopeSha256 does not match the current evidence scope")
        elif acceptance is not None and isinstance(acceptance, dict) and acceptance.get("decision") == "accepted":
            errors.append("human acceptance record and outcomeStatus disagree")
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        errors.append(str(exc))

    report = {
        "validator": "project-v8-evidence-v1",
        "status": "passed" if not errors else "failed",
        "currentAcceptanceScopeSha256": current_scope if "current_scope" in locals() else None,
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
