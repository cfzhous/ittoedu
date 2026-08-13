from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SKILL_DIR = Path(__file__).resolve().parents[1]
SCRIPTS = SKILL_DIR / "scripts"


def tree_hash(path: Path) -> str:
    digest = hashlib.sha256()
    for item in sorted((entry for entry in path.rglob("*") if entry.is_file()), key=lambda entry: entry.as_posix()):
        digest.update(item.relative_to(path).as_posix().encode("utf-8"))
        digest.update(b"\0")
        digest.update(item.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


class V2WorkflowTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)

    def tearDown(self) -> None:
        self.temp.cleanup()

    def run_script(self, name: str, *args: str, expected: int = 0) -> subprocess.CompletedProcess[str]:
        result = subprocess.run(
            [sys.executable, str(SCRIPTS / name), *map(str, args)],
            cwd=self.root,
            text=True,
            encoding="utf-8",
            capture_output=True,
            check=False,
            env={**os.environ, "PYTHONIOENCODING": "utf-8"},
        )
        if result.returncode != expected:
            self.fail(
                f"{name} returned {result.returncode}, expected {expected}\n"
                f"stdout:\n{result.stdout}\nstderr:\n{result.stderr}"
            )
        return result

    def init_case(self, mode: str = "standard", *, with_content: bool = False, case_id: str = "test-case") -> Path:
        args = [
            "--root", str(self.root),
            "--cases-dir", "cases",
            "--case-id", case_id,
            "--title", "分数意义",
            "--brief", "为七年级设计一节十分钟互动课，学生需解释分数的部分—整体关系。",
            "--duration-minutes", "10",
            "--path-mode", mode,
        ]
        if with_content:
            args.append("--with-content")
        self.run_script("init_case.py", *args)
        return self.root / "cases" / case_id

    def write_valid_contract(self, case: Path, *, external_content: bool = False) -> None:
        exact = "| 内容 ID | 精确内容位置 | 用途 |\n| --- | --- | --- |\n| CNT-001 | `content/CNT-001.md` | 核心任务 |"
        if not external_content:
            exact = self.valid_content_item()
        (case / "01-courseware-contract.md").write_text(
            f"""# 课程设计合同

- 课例 ID：`test-case`
- 标题：分数意义
- 路径：测试
- 总时长（分钟）：10
- 状态：draft

## 受众、场景与时间

- 年级/水平：七年级
- 先修知识：整数除法
- 使用场景与语言：教师投影，中文
- 教师与学生控制关系：教师发起，学生作答
- 时间模型：阅读 2 分钟、思考 3 分钟、操作 2 分钟、反馈 2 分钟、总结 1 分钟

## 产品能力剖面

- single-device: required
- single-deviceFallback: none
- single-deviceDecisionRef: none
- teacher-display: required
- teacher-displayFallback: none
- teacher-displayDecisionRef: none
- offline: required
- offlineFallback: none
- offlineDecisionRef: none
- multi-user-aggregation: not-required
- multi-user-aggregationFallback: teacher-observed
- multi-user-aggregationDecisionRef: none

## 学习目标与证据

### OBJ-001 解释部分—整体关系

- 内容边界：同分母单位分数
- 对应证据：EVD-001

### EVD-001 给出有理由的判断

- 学生行为：选择并口头说明整体
- 成功标准：指出整体一致且份数相等
- 不能证明学习的表面行为：只点击选项

## 内容边界与教学序列

- 必须覆盖：整体、等分、部分数量
- 明确不覆盖：分数运算
- 关键困难或误概念：只数涂色块而忽略整体

### STG-001 比较两个图形

- 目的：诊断整体误概念
- 学生任务：判断哪个图能表示四分之一
- 证据：EVD-001
- 预计用时（分钟）：10

## 精确内容

{exact}

## 响应、判定与容量

### RESP-001 选择并说明四分之一

- evidenceRef: EVD-001
- contentRef: CNT-001
- mode: digital-required
- responseType: choice
- requiredForProgress: true
- firstAttemptSeconds: 20
- retrySeconds: 10
- teacherDiscussionSeconds: 15
- authority: finite-auto
- navigationGate: hard
- teacherOverrideRef: ESC-001
- evaluatorCapabilityRef: EVAL-finite-choice-v1
- toleranceCaseRefs: TOL-001, TOL-002, TOL-003, TOL-004, TOL-005, TOL-006
- capacityOverrideDecisionRef: none

## 自动判定容差矩阵

| toleranceCaseId | responseRef | category | input | expected |
| --- | --- | --- | --- | --- |
| TOL-001 | RESP-001 | canonical-correct | A | pass |
| TOL-002 | RESP-001 | correct-variant-1 | a | pass |
| TOL-003 | RESP-001 | correct-variant-2 | 图 A | pass |
| TOL-004 | RESP-001 | blank | EMPTY | fail |
| TOL-005 | RESP-001 | typical-near-miss | B | fail |
| TOL-006 | RESP-001 | substring-false-positive | 答案不是 A | fail |

## 响应容量汇总

- capacityPolicyVersion: 1
- readingObservationSeconds: 525
- sceneTransitionSeconds: 30

## 编辑结果合同

### AUTH-001 核心题面与反馈

- contentRef: CNT-001
- access: authoring-view
- layoutAdjustment: required
- styleAdjustment: basic
- requiredForAcceptance: true

## 评价、反馈与约束

- 评价与反馈总原则：先指出整体，再核对等分
- 安全、版权、离线与交付约束：全部原创且离线
- 必须保留或禁止改写的表述：保留“同一个整体”

## 来源与假设

| 来源 ID | 标题/位置 | 权威级别 | 版本/日期 | 用途 |
| --- | --- | --- | --- | --- |
| SRC-001 | 用户给定教学目标 | authoritative | 2026-08-13 | 目标与术语 |

- 已采用的安全默认值或假设：无
- 冲突与剩余事实风险：无
""",
            encoding="utf-8",
        )

    @staticmethod
    def valid_content_item() -> str:
        return """### CNT-001 判断四分之一

- 教学目的：识别整体和等分条件
- 关联目标与证据：OBJ-001, EVD-001

#### 学习者可见内容

图 A 是一个正方形平均分成四份并涂其中一份；图 B 是两个大小不同的长方形拼在一起并涂较小的一块。请选择能表示四分之一的图，并说明理由。

#### 预期回应与完整解释

选择图 A。四分之一要求先确定同一个整体，再把整体平均分成四份，涂色部分恰好是一份；图 B 的两块不相等，不能仅凭“一块被涂色”判断。

#### 可接受答案与不接受边界

- 可接受替代：指出图 A 四块面积相等且涂一块
- 不接受边界：只说“因为有四块”而不说明等分与整体

#### 典型错误与反馈

- ERR-001 错误表现与成因：选择图 B；只数可见块数
- 首次反馈：请先圈出你认定的完整整体
- 提示升级与修复后证据：比较每一份面积；能重新指出相等四份

#### 难度、先修与来源

- 难度与认知要求：在非典型图形中辨认定义条件
- 先修内容：平均分与面积直观
- 权威来源或原创复核：SRC-001；按用户目标逐项复核

#### 揭示、时间与专业表示

- 揭示顺序：初始只显示两图与问题，作答后显示整体轮廓，完成后显示定义
- 预计用时（分钟）：10
- 公式、符号、单位、图表、媒体与无障碍要求：图形需有文字替代说明
"""

    def write_valid_script(self, case: Path) -> None:
        (case / "02-presentation-script.md").write_text(
            """# 教学呈现脚本

- 课例 ID：`test-case`
- 标题：分数意义
- 路径：测试
- 总时长（分钟）：10
- 状态：draft

## 全课推进与揭示

- 教师/学生控制关系：教师进入任务，学生选择并说明
- 返回、重播、重开与跨场景状态：返回保留本次选择，重播和重开清空
- 信息逐步释放原则：先任务，后轮廓提示，最后定义
- HTML 与静态审阅结果的关系：静态帧使用完成态并保留题面

## 场景与状态脚本

### SCN-001 判断四分之一

- 教学目的：诊断整体与等分概念
- 内容引用：CNT-001
- 目标与证据：OBJ-001, EVD-001
- 场景用时（分钟）：10
- 可达状态：STATE-001, STATE-002, STATE-003

#### 初始与操作前可见

- STATE-001 初始画面：并列显示完整图 A、图 B、逐字题面和两个选择按钮
- 第一次操作前必须可见：两个完整整体、分割边界、涂色区域、选择与说明要求

#### 教师与学生动作

- 教师动作：发起比较并邀请说明
- 学生动作：选择图 A 或图 B，再说出整体与等分理由
- 动作目的：生成 EVD-001 的概念证据

#### 即时反馈、错误与恢复

| 条件 | 即时可见反馈 | 恢复/重试/下一步 |
| --- | --- | --- |
| 选择图 A 并提及整体和等分 | 绿色轮廓标出整体和四个相等部分 | 进入 STATE-003 总结 |
| 选择图 B 或理由缺少等分 | STATE-002 显示两块面积对比和“先圈整体”提示 | 允许重试并再次说明 |

#### 稳定状态与转换

- STATE-002 错误修复态：保持原题，突出不相等两块并显示可操作重试
- STATE-003 稳定结果：图 A 的整体、四等份和其中一份依次标注，旁边显示定义
- 状态转换与返回路径：错误可回初态，成功后可返回检查原选择
- 转入下一场景：本课仅一场景，教师结束总结

#### 信息释放与教师视角

- 初态隐藏与禁止提前给出：定义、正确标记和答案
- 触发后出现：错误时先给轮廓提示，成功后显示完整定义
- 学生视角：始终能看到题面、选择状态和下一步
- 教师检查点/控制：教师可在错误态暂停讨论后允许重试

#### 媒体、声音与关键运动

- 媒体/声音：无
- 表达教学因果的运动：整体轮廓与等分线按解释顺序淡入
- 仅装饰运动：无

#### 可执行动作与教师逃生

##### ACT-001 选择答案

- sceneRef: SCN-001
- actor: student
- kind: click
- target: 可见的图 A 与图 B 选择按钮
- evidenceProduced: RESP-001
- requiredForCompletion: true
- initiallyHiddenContentRefs: CNT-001
- revealedContentRefs: CNT-001
- preActionVisible: false
- errorBehavior: 保留错误选择并显示整体轮廓提示
- retryBehavior: 原选择按钮保持可用并允许重新选择
- revealBehavior: 教师可揭示整体、等分和定义
- stableResult: 选择、理由、整体轮廓和定义稳定可见

##### ESC-001 错误或未完成时接管

- sceneRef: SCN-001
- stateRefs: STATE-001, STATE-002, STATE-003
- actions: retry, reveal, continue-incomplete, scene-picker, previous, replay
- confirmBeforeContinue: true
- independentOfCorrectness: true

#### 证据与静态审阅帧

- 学习证据：选择结果、理由与修复后回答
- 交互前、反馈态、稳定结果态：分别捕获 STATE-001、STATE-002、STATE-003
- HTML 稳定帧：STATE-003
- PDF/PPTX 静态帧及预期差异：STATE-003，无交互但保留题面与结论
""",
            encoding="utf-8",
        )

    def write_valid_visual(self, case: Path) -> None:
        (case / "visual-direction.md").write_text(
            """# 视觉方向与代表性样机

## 视觉目标与避免事项

- 目标：让整体轮廓先于局部涂色成为视觉主体
- 必须避免：装饰卡片、无意义页眉和答案预泄露

## 学科表征与构图

- 核心表征/视觉隐喻：整体外框与等分线
- 层级、字体、色彩、空间密度与专业排版：高对比轮廓和少量说明
- 各场景构图差异：单一核心场景保留三种状态差异

## 核心互动与代表性样机

- 高返工风险：错误反馈是否能指向整体概念
- 代表性样机范围：初态、错误轮廓提示、稳定定义态
- 互动因果与运动：选择触发对应轮廓，不使用装饰运动

## 关键帧、素材与许可

- VIS-001 初始/互动/结果关键帧：三联帧展示 STATE-001 至 STATE-003
- 素材来源、许可与生成路线：原创矢量图形

## 无障碍与静态差异

- 对比度、焦点、替代文本与减弱动画：键盘焦点清楚，图形有文字说明
- HTML、PDF 与 PPTX 的预期差异：静态格式固定在结果态
""",
            encoding="utf-8",
        )

    def prepare_and_approve(self, case: Path, mode: str, *, with_content: bool = False) -> None:
        self.run_script("case_artifact.py", str(case), "ready", "coursewareContract")
        if with_content:
            self.run_script("case_artifact.py", str(case), "ready", "contentBundle")
        if mode == "fast":
            self.run_script("case_artifact.py", str(case), "ready", "presentationScript")
            self.run_script("case_artifact.py", str(case), "review-ready", "experience")
            self.run_script(
                "case_artifact.py", str(case), "approve", "experience",
                "--approved-by", "课程负责人", "--evidence", "用户明确批准聚合范围",
            )
            return
        self.run_script("case_artifact.py", str(case), "review-ready", "contract")
        self.run_script(
            "case_artifact.py", str(case), "approve", "contract",
            "--approved-by", "课程负责人", "--evidence", "用户明确批准合同范围",
        )
        self.run_script("case_artifact.py", str(case), "ready", "presentationScript")
        self.run_script("case_artifact.py", str(case), "review-ready", "presentationScript")
        self.run_script(
            "case_artifact.py", str(case), "approve", "presentationScript",
            "--approved-by", "课程负责人", "--evidence", "用户明确批准呈现脚本范围",
        )
        if mode == "high-risk":
            self.run_script("case_artifact.py", str(case), "ready", "visualDirection")
            self.run_script("case_artifact.py", str(case), "review-ready", "visualDirection")
            self.run_script(
                "case_artifact.py", str(case), "approve", "visualDirection",
                "--approved-by", "课程负责人", "--evidence", "用户明确批准视觉与样机范围",
            )

    def write_cold_start_profile(self, case: Path, profile: str) -> None:
        """Write one fresh contract profile without manufacturing review approval."""

        self.write_valid_contract(case)
        self.write_valid_script(case)
        contract_path = case / "01-courseware-contract.md"
        script_path = case / "02-presentation-script.md"
        contract = contract_path.read_text(encoding="utf-8").replace(
            "- 课例 ID：`test-case`", f"- 课例 ID：`{case.name}`",
        )
        script = script_path.read_text(encoding="utf-8").replace(
            "- 课例 ID：`test-case`", f"- 课例 ID：`{case.name}`",
        )

        if profile == "finite-choice":
            pass
        elif profile == "normalized-short":
            replacements = (
                ("### RESP-001 选择并说明四分之一", "### RESP-001 输入四分之一的规范化短答案"),
                ("- 学生行为：选择并口头说明整体", "- 学生行为：输入四分之一的等值短答案并说明整体"),
                ("- responseType: choice", "- responseType: normalized-short"),
                ("- firstAttemptSeconds: 20", "- firstAttemptSeconds: 35"),
                ("- retrySeconds: 10", "- retrySeconds: 20"),
                ("- teacherDiscussionSeconds: 15", "- teacherDiscussionSeconds: 20"),
                ("- authority: finite-auto", "- authority: normalized-auto"),
                ("- evaluatorCapabilityRef: EVAL-finite-choice-v1", "- evaluatorCapabilityRef: EVAL-normalized-short-v1"),
                ("| TOL-001 | RESP-001 | canonical-correct | A | pass |", "| TOL-001 | RESP-001 | canonical-correct | 1/4 | pass |"),
                ("| TOL-002 | RESP-001 | correct-variant-1 | a | pass |", "| TOL-002 | RESP-001 | correct-variant-1 | 0.25 | pass |"),
                ("| TOL-003 | RESP-001 | correct-variant-2 | 图 A | pass |", "| TOL-003 | RESP-001 | correct-variant-2 | ¼ | pass |"),
                ("| TOL-005 | RESP-001 | typical-near-miss | B | fail |", "| TOL-005 | RESP-001 | typical-near-miss | 1/3 | fail |"),
                ("| TOL-006 | RESP-001 | substring-false-positive | 答案不是 A | fail |", "| TOL-006 | RESP-001 | substring-false-positive | 答案不是 1/4 | fail |"),
                ("- readingObservationSeconds: 525", "- readingObservationSeconds: 495"),
            )
            for old, new in replacements:
                self.assertEqual(contract.count(old), 1, f"normalized-short fixture lost marker: {old}")
                contract = contract.replace(old, new)
            script_replacements = (
                ("##### ACT-001 选择答案", "##### ACT-001 输入规范化短答案"),
                ("- kind: click", "- kind: text-input"),
                ("- target: 可见的图 A 与图 B 选择按钮", "- target: 可见的四分之一短答案输入框"),
            )
            for old, new in script_replacements:
                self.assertEqual(script.count(old), 1, f"normalized-short script lost marker: {old}")
                script = script.replace(old, new)
        elif profile == "human-open-expression":
            replacements = (
                ("### RESP-001 选择并说明四分之一", "### RESP-001 开放解释部分—整体关系"),
                ("- 学生行为：选择并口头说明整体", "- 学生行为：用开放文本解释整体与等分关系"),
                ("- mode: digital-required", "- mode: digital-optional"),
                ("- responseType: choice", "- responseType: open-text"),
                ("- requiredForProgress: true", "- requiredForProgress: false"),
                ("- firstAttemptSeconds: 20", "- firstAttemptSeconds: 90"),
                ("- retrySeconds: 10", "- retrySeconds: 0"),
                ("- teacherDiscussionSeconds: 15", "- teacherDiscussionSeconds: 45"),
                ("- authority: finite-auto", "- authority: human"),
                ("- navigationGate: hard", "- navigationGate: soft"),
                ("- evaluatorCapabilityRef: EVAL-finite-choice-v1", "- evaluatorCapabilityRef: none"),
                ("- toleranceCaseRefs: TOL-001, TOL-002, TOL-003, TOL-004, TOL-005, TOL-006", "- toleranceCaseRefs: none"),
                ("- readingObservationSeconds: 525", "- readingObservationSeconds: 435"),
            )
            for old, new in replacements:
                self.assertEqual(contract.count(old), 1, f"human fixture lost marker: {old}")
                contract = contract.replace(old, new)
            contract = re.sub(r"^\| TOL-\d{3} \|.*\n", "", contract, flags=re.MULTILINE)
            script_replacements = (
                ("##### ACT-001 选择答案", "##### ACT-001 提交开放解释"),
                ("- kind: click", "- kind: text-input"),
                ("- target: 可见的图 A 与图 B 选择按钮", "- target: 可见的开放解释输入框与提交按钮"),
                ("- requiredForCompletion: true", "- requiredForCompletion: false"),
                ("- errorBehavior: 保留错误选择并显示整体轮廓提示", "- errorBehavior: 保留学生原文并显示教师复核提示"),
            )
            for old, new in script_replacements:
                self.assertEqual(script.count(old), 1, f"human script lost marker: {old}")
                script = script.replace(old, new)
        elif profile == "fullscreen-runtime-authoring-view":
            # Orchestration freezes the visible full-screen experience, top-level
            # teacher control, and authoring outcome. Runtime ownership remains a
            # downstream Builder choice rather than a product-profile field.
            replacements = (
                ("- 使用场景与语言：教师投影，中文", "- 使用场景与语言：教师投影的全屏互动界面，中文"),
                ("- 教师与学生控制关系：教师发起，学生作答", "- 教师与学生控制关系：顶层教师控制始终可达，学生在全屏互动界面作答"),
                ("### AUTH-001 核心题面与反馈", "### AUTH-001 全屏核心题面、反馈与隐藏编辑入口"),
            )
            for old, new in replacements:
                self.assertEqual(contract.count(old), 1, f"fullscreen fixture lost marker: {old}")
                contract = contract.replace(old, new)
            self.assertEqual(script.count("- 教师/学生控制关系：教师进入任务，学生选择并说明"), 1)
            script = script.replace(
                "- 教师/学生控制关系：教师进入任务，学生选择并说明",
                "- 教师/学生控制关系：全屏互动时顶层教师控制始终可达，学生选择并说明",
            )
        else:
            self.fail(f"unknown cold-start profile: {profile}")

        contract_path.write_text(contract, encoding="utf-8")
        script_path.write_text(script, encoding="utf-8")

    def test_fresh_cold_start_contract_profiles_are_closed_without_approval(self) -> None:
        profiles = {
            "finite-choice": {
                "authority": "finite-auto",
                "responseType": "choice",
                "evaluator": "EVAL-finite-choice-v1",
                "actionKind": "click",
                "toleranceCount": 6,
            },
            "normalized-short": {
                "authority": "normalized-auto",
                "responseType": "normalized-short",
                "evaluator": "EVAL-normalized-short-v1",
                "actionKind": "text-input",
                "toleranceCount": 6,
            },
            "human-open-expression": {
                "authority": "human",
                "responseType": "open-text",
                "evaluator": "none",
                "actionKind": "text-input",
                "toleranceCount": 0,
            },
            "fullscreen-runtime-authoring-view": {
                "authority": "finite-auto",
                "responseType": "choice",
                "evaluator": "EVAL-finite-choice-v1",
                "actionKind": "click",
                "toleranceCount": 6,
            },
        }
        for index, (profile, expected) in enumerate(profiles.items(), start=1):
            with self.subTest(profile=profile):
                case = self.init_case("fast", case_id=f"cold-start-{index}")
                self.write_cold_start_profile(case, profile)

                parsed_result = self.run_script(
                    "contract_records.py",
                    str(case / "01-courseware-contract.md"),
                    str(case / "02-presentation-script.md"),
                )
                parsed = json.loads(parsed_result.stdout)
                self.assertEqual(parsed["parseErrors"], [])
                response = parsed["records"]["RESP-001"]["fields"]
                action = parsed["records"]["ACT-001"]["fields"]
                escape = parsed["records"]["ESC-001"]["fields"]
                authoring = parsed["records"]["AUTH-001"]["fields"]
                self.assertEqual(response["authority"], expected["authority"])
                self.assertEqual(response["responseType"], expected["responseType"])
                self.assertEqual(response["evaluatorCapabilityRef"], expected["evaluator"])
                self.assertEqual(action["kind"], expected["actionKind"])
                self.assertEqual(action["initiallyHiddenContentRefs"], "CNT-001")
                self.assertEqual(action["revealedContentRefs"], "CNT-001")
                self.assertEqual(action["preActionVisible"], "false")
                self.assertEqual(authoring["access"], "authoring-view")
                self.assertEqual(escape["independentOfCorrectness"], "true")
                self.assertIn("continue-incomplete", escape["actions"])
                self.assertEqual(len(parsed["toleranceCases"]), expected["toleranceCount"])
                if profile == "human-open-expression":
                    self.assertEqual(response["navigationGate"], "soft")
                    self.assertEqual(response["teacherOverrideRef"], "ESC-001")
                if profile == "fullscreen-runtime-authoring-view":
                    self.assertEqual(parsed["productProfile"]["teacher-display"], "required")
                    self.assertNotIn("runtime-owned", parsed["productProfile"])

                result = self.run_script(
                    "validate_case.py", str(case),
                    "--target", "implementation-ready", "--json", expected=1,
                )
                report = json.loads(result.stdout)
                self.assertEqual(
                    report["errors"],
                    ["required review is not approved: experience"],
                    f"{profile} has semantic blockers beyond the intentionally pending human review",
                )
                manifest = json.loads((case / "case.json").read_text(encoding="utf-8"))
                self.assertEqual(manifest["reviews"]["experience"]["status"], "pending")

    def test_fresh_cold_start_contract_profiles_reject_core_boundary_violations(self) -> None:
        cases = (
            (
                "finite-choice",
                "contract",
                lambda text: text.replace(
                    "EVAL-finite-choice-v1", "EVAL-normalized-short-v1",
                ),
                "RESP-001 evaluator EVAL-normalized-short-v1 is incompatible with finite-auto/choice",
            ),
            (
                "normalized-short",
                "script",
                lambda text: text.replace("- kind: text-input", "- kind: click"),
                "ACT-001.kind click is incompatible with digital responseType normalized-short",
            ),
            (
                "human-open-expression",
                "script",
                lambda text: text.replace(
                    "- independentOfCorrectness: true", "- independentOfCorrectness: false",
                ),
                "ESC-001 must remain available independently of response correctness",
            ),
            (
                "fullscreen-runtime-authoring-view",
                "contract",
                lambda text: text.replace("- access: authoring-view", "- access: runtime-internal"),
                "AUTH-001.access has invalid value: runtime-internal",
            ),
        )
        for index, (profile, target, mutate, expected_message) in enumerate(cases, start=1):
            with self.subTest(profile=profile):
                case = self.init_case("fast", case_id=f"cold-start-negative-{index}")
                self.write_cold_start_profile(case, profile)
                path = case / (
                    "01-courseware-contract.md" if target == "contract"
                    else "02-presentation-script.md"
                )
                original = path.read_text(encoding="utf-8")
                mutated = mutate(original)
                self.assertNotEqual(mutated, original, f"{profile} negative mutation did not apply")
                path.write_text(mutated, encoding="utf-8")

                result = self.run_script(
                    "validate_case.py", str(case),
                    "--target", "implementation-ready", "--json", expected=1,
                )
                report = json.loads(result.stdout)
                self.assertIn(expected_message, report["errors"])
                self.assertIn("required review is not approved: experience", report["errors"])
                manifest = json.loads((case / "case.json").read_text(encoding="utf-8"))
                self.assertEqual(manifest["reviews"]["experience"]["status"], "pending")

    def test_fast_initializes_only_three_files_and_aggregate_review(self) -> None:
        case = self.init_case("fast")
        self.assertEqual({path.name for path in case.iterdir()}, {
            "case.json", "01-courseware-contract.md", "02-presentation-script.md",
        })
        manifest = json.loads((case / "case.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["schemaVersion"], 2)
        self.assertEqual(manifest["targetProjectSchemaVersion"], 8)
        self.assertEqual(manifest["pathMode"], "fast")
        self.assertEqual(list(manifest["reviews"]), ["experience"])
        self.assertEqual(manifest["decisions"], [])
        self.assertEqual(manifest["resultStatus"], "pending")
        self.run_script("validate_case.py", str(case), "--target", "draft")

    def test_optional_content_and_high_risk_visual_are_conditional(self) -> None:
        standard = self.init_case("standard", with_content=True, case_id="content-case")
        self.assertTrue((standard / "content" / "CNT-001.md").is_file())
        self.assertFalse((standard / "visual-direction.md").exists())
        high = self.init_case("high-risk", case_id="visual-case")
        self.assertTrue((high / "visual-direction.md").is_file())
        manifest = json.loads((high / "case.json").read_text(encoding="utf-8"))
        self.assertEqual(list(manifest["reviews"]), ["contract", "presentationScript", "visualDirection"])

    def test_decisions_embed_structured_safe_default_and_text_fallback(self) -> None:
        case = self.init_case("standard")
        add = [
            str(case), "add", "--id", "DEC-001", "--stage", "intake",
            "--question", "课堂控制方式？", "--reason", "会改变学生自主程度",
            "--option", "DEC-001-A", "教师发起", "教师控制节奏，学生在任务内操作", "true",
            "--option", "DEC-001-B", "学生自学", "学生自行推进并需要额外导航", "false",
            "--safe-default", "DEC-001-A",
        ]
        self.run_script("case_decision.py", *add)
        self.run_script(
            "case_decision.py", str(case), "answer", "DEC-001",
            "--answered-by", "user-structured", "--selected", "DEC-001-A",
        )
        self.run_script(
            "case_decision.py", str(case), "add", "--id", "DEC-002", "--stage", "intake",
            "--question", "是否允许重试？", "--reason", "会改变反馈闭环",
            "--option", "DEC-002-A", "允许重试", "错误后可修复并重新作答", "true",
            "--option", "DEC-002-B", "不允许", "错误后只显示结论", "false",
            "--safe-default", "DEC-002-A",
        )
        self.run_script(
            "case_decision.py", str(case), "answer", "DEC-002",
            "--answered-by", "safe-default", "--selected", "DEC-002-A",
        )
        self.run_script(
            "case_decision.py", str(case), "add", "--id", "DEC-003", "--stage", "intake",
            "--question", "是否保留学生口头解释？", "--reason", "会改变学习证据",
            "--option", "DEC-003-A", "保留解释", "选择后必须说明整体与等分", "true",
            "--option", "DEC-003-B", "只做选择", "仅记录选择结果", "false",
        )
        manifest = json.loads((case / "case.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["blockingDecisionIds"], ["DEC-003"])
        self.run_script(
            "case_decision.py", str(case), "answer", "DEC-003",
            "--answered-by", "user-text", "--text", "保留口头解释，并记录是否提到整体与等分",
        )
        manifest = json.loads((case / "case.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["blockingDecisionIds"], [])
        self.assertEqual(manifest["decisions"][0]["response"]["answeredBy"], "user-structured")
        self.assertEqual(manifest["decisions"][1]["response"]["answeredBy"], "safe-default")
        self.assertEqual(manifest["decisions"][2]["response"]["answeredBy"], "user-text")

    def test_fast_aggregate_approval_derives_readiness_but_never_accepts(self) -> None:
        case = self.init_case("fast")
        self.write_valid_contract(case)
        self.write_valid_script(case)
        self.prepare_and_approve(case, "fast")
        self.run_script("validate_case.py", str(case), "--target", "implementation-ready", "--promote")
        manifest = json.loads((case / "case.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["stage"], "implementation-ready")
        self.assertEqual(manifest["derivedReadiness"]["status"], "implementation-ready")
        self.assertEqual(manifest["resultStatus"], "pending")
        self.assertFalse((case / "implementation-handoff.md").exists())
        self.run_script("case_artifact.py", str(case), "accept", expected=2)

    def test_automated_identity_cannot_approve_or_accept(self) -> None:
        case = self.init_case("fast")
        self.write_valid_contract(case)
        self.write_valid_script(case)
        self.run_script("case_artifact.py", str(case), "ready", "coursewareContract")
        self.run_script("case_artifact.py", str(case), "ready", "presentationScript")
        self.run_script("case_artifact.py", str(case), "review-ready", "experience")
        result = self.run_script(
            "case_artifact.py", str(case), "approve", "experience",
            "--approved-by", "Codex automation", "--evidence", "自动运行",
            expected=1,
        )
        self.assertIn("automated identities cannot approve", result.stderr)
        manifest = json.loads((case / "case.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["reviews"]["experience"]["status"], "ready-for-review")

        manifest["resultStatus"] = "accepted"
        manifest["humanAcceptance"] = {
            "reviewer": "AI builder",
            "acceptedAt": "2026-08-13T00:00:00+00:00",
            "evidence": "自动结果",
        }
        (case / "case.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        validation = self.run_script("validate_case.py", str(case), "--target", "draft", "--json", expected=1)
        self.assertIn("orchestration resultStatus may only be pending or rejected", validation.stdout)

    def test_standard_requires_two_sequential_approvals(self) -> None:
        case = self.init_case("standard")
        self.write_valid_contract(case)
        self.write_valid_script(case)
        self.run_script("case_artifact.py", str(case), "ready", "coursewareContract")
        self.run_script("case_artifact.py", str(case), "review-ready", "contract")
        self.run_script(
            "case_artifact.py", str(case), "approve", "contract",
            "--approved-by", "课程负责人", "--evidence", "明确批准合同",
        )
        result = self.run_script(
            "validate_case.py", str(case), "--target", "implementation-ready", "--json",
            expected=1,
        )
        self.assertIn("required review is not approved: presentationScript", result.stdout)
        self.run_script("case_artifact.py", str(case), "ready", "presentationScript")
        self.run_script("case_artifact.py", str(case), "review-ready", "presentationScript")
        self.run_script(
            "case_artifact.py", str(case), "approve", "presentationScript",
            "--approved-by", "课程负责人", "--evidence", "明确批准脚本",
        )
        self.run_script("validate_case.py", str(case), "--target", "implementation-ready")

    def test_high_risk_requires_visual_review(self) -> None:
        case = self.init_case("high-risk")
        self.write_valid_contract(case)
        self.write_valid_script(case)
        self.write_valid_visual(case)
        self.prepare_and_approve(case, "high-risk")
        self.run_script("validate_case.py", str(case), "--target", "implementation-ready", "--promote")
        manifest = json.loads((case / "case.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["reviews"]["visualDirection"]["status"], "approved")

    def test_external_content_directory_is_hashed_and_semantically_closed(self) -> None:
        case = self.init_case("standard", with_content=True)
        self.write_valid_contract(case, external_content=True)
        self.write_valid_script(case)
        (case / "content" / "CNT-001.md").write_text(self.valid_content_item(), encoding="utf-8")
        self.prepare_and_approve(case, "standard", with_content=True)
        result = self.run_script(
            "validate_case.py", str(case), "--target", "implementation-ready", "--json", "--promote",
        )
        report = json.loads(result.stdout)
        self.assertEqual(report["exactContentLocations"], {"CNT-001": "content/CNT-001.md"})

    def test_upstream_byte_change_stales_review_and_readiness(self) -> None:
        case = self.init_case("fast")
        self.write_valid_contract(case)
        self.write_valid_script(case)
        self.prepare_and_approve(case, "fast")
        self.run_script("validate_case.py", str(case), "--target", "implementation-ready", "--promote")
        contract = case / "01-courseware-contract.md"
        contract.write_text(contract.read_text(encoding="utf-8") + "\n<!-- changed -->\n", encoding="utf-8")
        result = self.run_script(
            "validate_case.py", str(case), "--target", "implementation-ready", "--promote", "--json",
            expected=1,
        )
        self.assertIn("review scope is stale: experience", result.stdout)
        manifest = json.loads((case / "case.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["reviews"]["experience"]["status"], "stale")
        self.assertEqual(manifest["derivedReadiness"]["status"], "not-ready")
        self.assertTrue(manifest["reviewHistory"])

    def test_file_backed_case_recovers_without_chat_context(self) -> None:
        case = self.init_case("standard")
        self.write_valid_contract(case)
        self.write_valid_script(case)
        self.prepare_and_approve(case, "standard")
        self.run_script("validate_case.py", str(case), "--target", "implementation-ready", "--promote")

        recovered = self.root / "recovered-after-context-compaction"
        shutil.copytree(case, recovered)
        status = self.run_script("case_artifact.py", str(recovered), "status")
        status_value = json.loads(status.stdout)
        self.assertEqual(status_value["stage"], "implementation-ready")
        self.assertTrue(all(row["scopeMatches"] for row in status_value["reviews"]))
        report = self.run_script(
            "validate_case.py", str(recovered), "--target", "implementation-ready", "--json",
        )
        value = json.loads(report.stdout)
        self.assertEqual(value["derivedReadiness"], "implementation-ready")
        self.assertEqual(value["exactContentLocations"], {"CNT-001": "01-courseware-contract.md"})

    def test_decision_change_invalidates_existing_approval(self) -> None:
        case = self.init_case("fast")
        self.write_valid_contract(case)
        self.write_valid_script(case)
        self.prepare_and_approve(case, "fast")
        self.run_script(
            "case_decision.py", str(case), "add", "--id", "DEC-001", "--stage", "intake",
            "--question", "是否允许重试？", "--reason", "改变反馈闭环",
            "--option", "DEC-001-A", "允许", "错误后可修复", "true",
            "--option", "DEC-001-B", "不允许", "错误后结束", "false",
        )
        manifest = json.loads((case / "case.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["reviews"]["experience"]["status"], "stale")
        self.assertEqual(manifest["blockingDecisionIds"], ["DEC-001"])

    def test_missing_exact_content_section_blocks_readiness(self) -> None:
        case = self.init_case("fast")
        self.write_valid_contract(case)
        self.write_valid_script(case)
        contract = case / "01-courseware-contract.md"
        contract.write_text(
            contract.read_text(encoding="utf-8").replace(
                "图 A 是一个正方形平均分成四份并涂其中一份；图 B 是两个大小不同的长方形拼在一起并涂较小的一块。请选择能表示四分之一的图，并说明理由。",
                "[待填写完整题面]",
            ),
            encoding="utf-8",
        )
        self.prepare_and_approve(case, "fast")
        result = self.run_script(
            "validate_case.py", str(case), "--target", "implementation-ready", "--json",
            expected=1,
        )
        self.assertIn("CNT-001 has no completed exact-content section", result.stdout)

    def test_chat_reference_cannot_substitute_for_exact_content(self) -> None:
        case = self.init_case("fast")
        self.write_valid_contract(case)
        self.write_valid_script(case)
        contract = case / "01-courseware-contract.md"
        contract.write_text(
            contract.read_text(encoding="utf-8").replace(
                "图 A 是一个正方形平均分成四份并涂其中一份；图 B 是两个大小不同的长方形拼在一起并涂较小的一块。请选择能表示四分之一的图，并说明理由。",
                "完整题面见聊天记录。",
            ),
            encoding="utf-8",
        )
        self.prepare_and_approve(case, "fast")
        result = self.run_script(
            "validate_case.py", str(case), "--target", "implementation-ready", "--json",
            expected=1,
        )
        self.assertIn("CNT-001 has no completed exact-content section", result.stdout)

    def test_response_capacity_overflow_blocks_readiness(self) -> None:
        case = self.init_case("fast")
        self.write_valid_contract(case)
        self.write_valid_script(case)
        contract = case / "01-courseware-contract.md"
        contract.write_text(
            contract.read_text(encoding="utf-8").replace(
                "readingObservationSeconds: 525", "readingObservationSeconds: 526"
            ),
            encoding="utf-8",
        )
        self.prepare_and_approve(case, "fast")
        result = self.run_script(
            "validate_case.py", str(case), "--target", "implementation-ready", "--json",
            expected=1,
        )
        self.assertIn("response capacity requires 601s", result.stdout)

    def test_human_authority_cannot_hard_lock_navigation(self) -> None:
        case = self.init_case("fast")
        self.write_valid_contract(case)
        self.write_valid_script(case)
        contract = case / "01-courseware-contract.md"
        contract.write_text(
            contract.read_text(encoding="utf-8").replace(
                "authority: finite-auto", "authority: human"
            ),
            encoding="utf-8",
        )
        self.prepare_and_approve(case, "fast")
        result = self.run_script(
            "validate_case.py", str(case), "--target", "implementation-ready", "--json",
            expected=1,
        )
        self.assertIn("uses human authority and cannot be a hard navigation gate", result.stdout)

    def test_automatic_assessment_requires_complete_exact_tolerance_matrix(self) -> None:
        case = self.init_case("fast")
        self.write_valid_contract(case)
        self.write_valid_script(case)
        contract = case / "01-courseware-contract.md"
        contract.write_text(
            contract.read_text(encoding="utf-8").replace(
                "TOL-001, TOL-002, TOL-003, TOL-004, TOL-005, TOL-006",
                "TOL-001, TOL-002, TOL-003, TOL-004, TOL-005",
            ),
            encoding="utf-8",
        )
        self.prepare_and_approve(case, "fast")
        result = self.run_script(
            "validate_case.py", str(case), "--target", "implementation-ready", "--json",
            expected=1,
        )
        self.assertIn("substring-false-positive", result.stdout)
        self.assertIn("tolerance cases are not referenced", result.stdout)

    def test_unknown_response_from_action_blocks_readiness(self) -> None:
        case = self.init_case("fast")
        self.write_valid_contract(case)
        self.write_valid_script(case)
        script = case / "02-presentation-script.md"
        script.write_text(
            script.read_text(encoding="utf-8").replace(
                "evidenceProduced: RESP-001", "evidenceProduced: RESP-999"
            ),
            encoding="utf-8",
        )
        self.prepare_and_approve(case, "fast")
        result = self.run_script(
            "validate_case.py", str(case), "--target", "implementation-ready", "--json",
            expected=1,
        )
        self.assertIn("ACT-001 references unknown response: RESP-999", result.stdout)

    def test_action_reveal_policy_allows_explicit_none(self) -> None:
        case = self.init_case("fast", case_id="reveal-none")
        self.write_valid_contract(case)
        self.write_valid_script(case)
        script = case / "02-presentation-script.md"
        script.write_text(
            script.read_text(encoding="utf-8")
            .replace("initiallyHiddenContentRefs: CNT-001", "initiallyHiddenContentRefs: none")
            .replace("revealedContentRefs: CNT-001", "revealedContentRefs: none")
            .replace(
                "preActionVisible: false",
                "preActionVisible: 完整题面、两个整体、分割线和两个选择按钮",
            )
            .replace("revealBehavior: 教师可揭示整体、等分和定义", "revealBehavior: none"),
            encoding="utf-8",
        )
        self.prepare_and_approve(case, "fast")
        result = self.run_script(
            "validate_case.py", str(case), "--target", "implementation-ready", "--json",
        )
        report = json.loads(result.stdout)
        self.assertEqual(
            report["contractRecordSummary"]["recordIds"]["ACT"],
            ["ACT-001"],
        )

    def test_action_reveal_policy_rejects_leakage_mutations(self) -> None:
        cases = [
            (
                "missing-hidden-field",
                lambda text: text.replace("- initiallyHiddenContentRefs: CNT-001\n", ""),
                "ACT-001 is missing fields: initiallyHiddenContentRefs",
            ),
            (
                "missing-revealed-content",
                lambda text: text.replace(
                    "revealedContentRefs: CNT-001", "revealedContentRefs: none"
                ),
                "revealedContentRefs must be non-empty",
            ),
            (
                "reveal-not-in-initial-set",
                lambda text: text.replace(
                    "initiallyHiddenContentRefs: CNT-001", "initiallyHiddenContentRefs: none"
                ),
                "revealedContentRefs must be a subset of initiallyHiddenContentRefs: CNT-001",
            ),
            (
                "pre-action-claims-visible",
                lambda text: text.replace(
                    "preActionVisible: false", "preActionVisible: 已经显示完整定义"
                ),
                "preActionVisible must be false",
            ),
            (
                "missing-visible-reveal-path",
                lambda text: text.replace(
                    "revealBehavior: 教师可揭示整体、等分和定义",
                    "revealBehavior: none",
                ),
                "revealBehavior must freeze the visible reveal path",
            ),
            (
                "unknown-content",
                lambda text: text
                .replace("initiallyHiddenContentRefs: CNT-001", "initiallyHiddenContentRefs: CNT-999")
                .replace("revealedContentRefs: CNT-001", "revealedContentRefs: CNT-999"),
                "initiallyHiddenContentRefs references unknown content: CNT-999",
            ),
            (
                "content-not-declared-by-scene",
                lambda text: text.replace("- 内容引用：CNT-001", "- 内容引用：none"),
                "initiallyHiddenContentRefs references content not declared by SCN-001: CNT-001",
            ),
            (
                "duplicate-hidden-content",
                lambda text: text.replace(
                    "initiallyHiddenContentRefs: CNT-001",
                    "initiallyHiddenContentRefs: CNT-001, CNT-001",
                ),
                "initiallyHiddenContentRefs contains duplicate IDs",
            ),
        ]
        for index, (name, mutate, expected_message) in enumerate(cases, start=1):
            with self.subTest(name=name):
                case = self.init_case("fast", case_id=f"reveal-audit-{index}")
                self.write_valid_contract(case)
                self.write_valid_script(case)
                script = case / "02-presentation-script.md"
                script.write_text(
                    mutate(script.read_text(encoding="utf-8")),
                    encoding="utf-8",
                )
                self.prepare_and_approve(case, "fast")
                result = self.run_script(
                    "validate_case.py", str(case), "--target", "implementation-ready", "--json",
                    expected=1,
                )
                self.assertIn(expected_message, result.stdout)

    def test_each_scene_requires_an_independent_escape(self) -> None:
        case = self.init_case("fast")
        self.write_valid_contract(case)
        self.write_valid_script(case)
        script = case / "02-presentation-script.md"
        script.write_text(
            script.read_text(encoding="utf-8").replace("##### ESC-001", "##### RECOVERY-NOTE"),
            encoding="utf-8",
        )
        self.prepare_and_approve(case, "fast")
        result = self.run_script(
            "validate_case.py", str(case), "--target", "implementation-ready", "--json",
            expected=1,
        )
        self.assertIn("no ESC-* executable contract records found", result.stdout)
        self.assertIn("scenes lack ESC-* coverage: SCN-001", result.stdout)

    def test_unsupported_required_capability_needs_fallback_or_decision(self) -> None:
        case = self.init_case("fast")
        self.write_valid_contract(case)
        self.write_valid_script(case)
        contract = case / "01-courseware-contract.md"
        contract.write_text(
            contract.read_text(encoding="utf-8")
            .replace("multi-user-aggregation: not-required", "multi-user-aggregation: required")
            .replace("multi-user-aggregationFallback: teacher-observed", "multi-user-aggregationFallback: none"),
            encoding="utf-8",
        )
        self.prepare_and_approve(case, "fast")
        result = self.run_script(
            "validate_case.py", str(case), "--target", "implementation-ready", "--json",
            expected=1,
        )
        self.assertIn("unsupported required capability multi-user-aggregation", result.stdout)

    def test_reverse_audit_mutations_are_rejected(self) -> None:
        cases = [
            (
                "duplicate-objective", "contract",
                lambda text: text + "\n### OBJ-001 duplicate definition\n\n- duplicate: true\n",
                "duplicate OBJ definitions: OBJ-001",
            ),
            (
                "commented-scene-refs", "script",
                lambda text: text
                .replace("- 内容引用：CNT-001", "<!-- - 内容引用：CNT-001 -->")
                .replace("- 目标与证据：OBJ-001, EVD-001", "<!-- - 目标与证据：OBJ-001, EVD-001 -->")
                .replace("动作目的：生成 EVD-001", "动作目的：生成可观察证据")
                .replace("- 学习证据：选择结果、理由与修复后回答", "- 学习证据：选择结果、理由与修复后回答"),
                "SCN-001 has no explicit OBJ-* reference",
            ),
            (
                "unknown-free-prose", "script",
                lambda text: text + "\n自由文本误引 RESP-999, TOL-999, ACT-999, ESC-999, STATE-999。\n",
                "semantic files reference unknown RESP IDs: RESP-999",
            ),
            (
                "unknown-supporting-ids", "contract",
                lambda text: text + "\n自由文本误引 DEC-999, SRC-999, ERR-999, FORM-999, VIS-999。\n",
                "semantic files reference unknown DEC IDs: DEC-999",
            ),
            (
                "content-fragment", "contract",
                lambda text: text.replace("contentRef: CNT-001", "contentRef: CNT-001#not-defined"),
                "unstructured fragments are forbidden",
            ),
            (
                "authority-type-mismatch", "contract",
                lambda text: text.replace("authority: finite-auto", "authority: normalized-auto"),
                "authority normalized-auto is incompatible with responseType choice",
            ),
            (
                "unpublished-evaluator", "contract",
                lambda text: text.replace("EVAL-finite-choice-v1", "EVAL-does-not-exist"),
                "references unpublished evaluator capability: EVAL-does-not-exist",
            ),
            (
                "system-digital-producer", "script",
                lambda text: text.replace("actor: student", "actor: system"),
                "actor must be student",
            ),
            (
                "internal-api-target", "script",
                lambda text: text.replace(
                    "target: 可见的图 A 与图 B 选择按钮",
                    "target: page.evaluate(setPresentationState)",
                ),
                "target exposes an internal API",
            ),
            (
                "retry-only-hard-escape", "script",
                lambda text: text.replace(
                    "actions: retry, reveal, continue-incomplete, scene-picker, previous, replay",
                    "actions: retry",
                ),
                "hard gate override ESC-001 must include continue-incomplete",
            ),
            (
                "hard-escape-other-scene", "script",
                lambda text: text.replace(
                    "##### ESC-001 错误或未完成时接管\n\n- sceneRef: SCN-001",
                    "##### ESC-001 错误或未完成时接管\n\n- sceneRef: SCN-999",
                ),
                "hard gate override ESC-001 must be in the same scene",
            ),
            (
                "foreign-scene-state", "script",
                lambda text: text.replace(
                    "stateRefs: STATE-001, STATE-002, STATE-003",
                    "stateRefs: STATE-001, STATE-002, STATE-003, STATE-999",
                ) + "\n### SCN-002 其他场景\n\n- STATE-999 其他场景状态：只属于 SCN-002\n",
                "references states from another scene: STATE-999",
            ),
            (
                "no-scene-state", "script",
                lambda text: text
                .replace("- STATE-001 初始画面：", "- 初始画面：")
                .replace("- STATE-002 错误修复态：", "- 错误修复态：")
                .replace("- STATE-003 稳定结果：", "- 稳定结果："),
                "SCN-001 has no STATE-* definition",
            ),
            (
                "deferred-explanation", "contract",
                lambda text: text.replace(
                    "选择图 A。四分之一要求先确定同一个整体，再把整体平均分成四份，涂色部分恰好是一份；图 B 的两块不相等，不能仅凭“一块被涂色”判断。",
                    "The complete explanation will be supplied later in class.",
                ),
                "CNT-001 has no completed exact-content section",
            ),
            (
                "self-fallback", "contract",
                lambda text: text
                .replace("multi-user-aggregation: not-required", "multi-user-aggregation: required")
                .replace("multi-user-aggregationFallback: teacher-observed", "multi-user-aggregationFallback: multi-user-aggregation"),
                "cannot claim the unsupported capability itself",
            ),
        ]
        for index, (name, target, mutate, expected_message) in enumerate(cases, start=1):
            with self.subTest(name=name):
                case = self.init_case("fast", case_id=f"audit-{index}")
                self.write_valid_contract(case)
                self.write_valid_script(case)
                path = case / ("01-courseware-contract.md" if target == "contract" else "02-presentation-script.md")
                path.write_text(mutate(path.read_text(encoding="utf-8")), encoding="utf-8")
                self.prepare_and_approve(case, "fast")
                result = self.run_script(
                    "validate_case.py", str(case), "--target", "implementation-ready", "--json",
                    expected=1,
                )
                self.assertIn(expected_message, result.stdout)

    def test_tolerance_inputs_are_unique_and_blank_uses_empty_sentinel(self) -> None:
        for case_id, replacement, expected_message in (
            (
                "same-inputs",
                lambda text: re.sub(
                    r"(\| TOL-\d{3} \| RESP-001 \| [^|]+ \|) [^|]+ (\| (?:pass|fail) \|)",
                    r"\1 SAME \2",
                    text,
                ),
                "all six tolerance inputs must be distinct",
            ),
            (
                "bad-empty",
                lambda text: text.replace("| blank | EMPTY | fail |", "| blank | 空白 | fail |"),
                "blank input must use the exact EMPTY sentinel",
            ),
        ):
            with self.subTest(case_id=case_id):
                case = self.init_case("fast", case_id=case_id)
                self.write_valid_contract(case)
                self.write_valid_script(case)
                contract = case / "01-courseware-contract.md"
                contract.write_text(replacement(contract.read_text(encoding="utf-8")), encoding="utf-8")
                self.prepare_and_approve(case, "fast")
                result = self.run_script(
                    "validate_case.py", str(case), "--target", "implementation-ready", "--json",
                    expected=1,
                )
                self.assertIn(expected_message, result.stdout)

    def test_capacity_override_decision_requires_exact_scope(self) -> None:
        case = self.init_case("fast", case_id="capacity-scope")
        self.write_valid_contract(case)
        self.write_valid_script(case)
        self.run_script(
            "case_decision.py", str(case), "add", "--id", "DEC-001", "--stage", "contract",
            "--question", "是否减少作答时间？", "--reason", "改变容量下限",
            "--scope-ref", "capability:offline",
            "--option", "DEC-001-A", "减少", "将首次作答缩短", "true",
            "--option", "DEC-001-B", "保持", "保持政策下限", "false",
        )
        self.run_script(
            "case_decision.py", str(case), "answer", "DEC-001",
            "--answered-by", "user-structured", "--selected", "DEC-001-A",
        )
        contract = case / "01-courseware-contract.md"
        contract.write_text(
            contract.read_text(encoding="utf-8")
            .replace("firstAttemptSeconds: 20", "firstAttemptSeconds: 1")
            .replace("capacityOverrideDecisionRef: none", "capacityOverrideDecisionRef: DEC-001"),
            encoding="utf-8",
        )
        self.prepare_and_approve(case, "fast")
        result = self.run_script(
            "validate_case.py", str(case), "--target", "implementation-ready", "--json", expected=1,
        )
        self.assertIn("is not scoped to RESP-001#capacity", result.stdout)

    def test_capability_decision_requires_exact_capability_scope(self) -> None:
        case = self.init_case("fast", case_id="capability-scope")
        self.write_valid_contract(case)
        self.write_valid_script(case)
        self.run_script(
            "case_decision.py", str(case), "add", "--id", "DEC-001", "--stage", "contract",
            "--question", "是否要求多人聚合？", "--reason", "改变产品能力",
            "--scope-ref", "RESP-001#capacity",
            "--option", "DEC-001-A", "要求", "需要多人聚合", "true",
            "--option", "DEC-001-B", "不要求", "使用单设备", "false",
        )
        self.run_script(
            "case_decision.py", str(case), "answer", "DEC-001",
            "--answered-by", "user-structured", "--selected", "DEC-001-A",
        )
        contract = case / "01-courseware-contract.md"
        contract.write_text(
            contract.read_text(encoding="utf-8")
            .replace("multi-user-aggregation: not-required", "multi-user-aggregation: required")
            .replace("multi-user-aggregationFallback: teacher-observed", "multi-user-aggregationFallback: none")
            .replace("multi-user-aggregationDecisionRef: none", "multi-user-aggregationDecisionRef: DEC-001"),
            encoding="utf-8",
        )
        self.prepare_and_approve(case, "fast")
        result = self.run_script(
            "validate_case.py", str(case), "--target", "implementation-ready", "--json", expected=1,
        )
        self.assertIn("is not scoped to capability:multi-user-aggregation", result.stdout)

    def test_review_scope_includes_case_identity_and_orchestration_outcome_is_closed(self) -> None:
        case = self.init_case("fast", case_id="scope-identity")
        self.write_valid_contract(case)
        self.write_valid_script(case)
        self.prepare_and_approve(case, "fast")
        manifest_path = case / "case.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["title"] = "未批准的新标题"
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        stale = self.run_script(
            "validate_case.py", str(case), "--target", "implementation-ready", "--json", expected=1,
        )
        self.assertIn("review scope is stale: experience", stale.stdout)

        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["resultStatus"] = "engineering candidate"
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        closed = self.run_script("validate_case.py", str(case), "--target", "draft", "--json", expected=1)
        self.assertIn("orchestration resultStatus may only be pending or rejected", closed.stdout)

    def test_v1_migration_preserves_source_and_inherits_no_approval(self) -> None:
        source = self.root / "legacy"
        source.mkdir()
        files = {
            "00-context.md": "# context\n",
            "01-teaching-design.md": "# design\n",
            "02-content-spec.md": "# content\n### CNT-001 old\n",
            "03-presentation-script.md": "# script\n",
            "04-visual-direction.md": "# visual\n",
            "05-implementation-handoff.md": "# handoff\n",
            "06-traceability.json": "{}\n",
            "07-acceptance.md": "# accepted claim\n",
        }
        artifacts = {}
        for index, (name, body) in enumerate(files.items()):
            (source / name).write_text(body, encoding="utf-8")
            key = list((
                "context", "teachingDesign", "contentSpec", "presentationScript",
                "visualDirection", "implementationHandoff", "traceability", "acceptance",
            ))[index]
            artifacts[key] = {
                "path": name,
                "status": "approved",
                "sha256": hashlib.sha256(body.encode("utf-8")).hexdigest(),
                "approvedBy": "legacy-user",
            }
        (source / "case.json").write_text(json.dumps({
            "schemaVersion": 1,
            "caseId": "legacy-case",
            "title": "旧课例",
            "durationMinutes": 10,
            "artifacts": artifacts,
        }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        (source / "decisions.json").write_text(json.dumps({
            "schemaVersion": 1,
            "decisions": [{"id": "DEC-001", "blocking": True, "response": {"selected": "A"}}],
        }) + "\n", encoding="utf-8")
        before = tree_hash(source)
        audit = self.run_script("migrate_case_v1.py", str(source), "audit")
        self.assertFalse(json.loads(audit.stdout)["migrationPolicy"]["approvalsInherited"])
        destination = self.root / "v2"
        self.run_script(
            "migrate_case_v1.py", str(source), "migrate",
            "--destination", str(destination), "--path-mode", "standard",
        )
        self.assertEqual(before, tree_hash(source))
        self.assertEqual({path.name for path in destination.iterdir()}, {
            "case.json", "01-courseware-contract.md", "02-presentation-script.md", "legacy-v1",
        })
        manifest = json.loads((destination / "case.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["schemaVersion"], 2)
        self.assertEqual(manifest["decisions"], [])
        self.assertTrue(all(review["status"] == "pending" for review in manifest["reviews"].values()))
        self.assertFalse(manifest["migration"]["approvalsInherited"])
        self.assertFalse(manifest["migration"]["decisionsInherited"])
        preserved = manifest["migration"]["preservedLegacy"]
        self.assertEqual(preserved["fileCount"], len([path for path in source.rglob("*") if path.is_file()]))
        self.assertEqual(preserved["treeSha256"], manifest["migration"]["sourceTreeSha256"])
        for original in (path for path in source.rglob("*") if path.is_file()):
            self.assertEqual(
                original.read_bytes(),
                (destination / "legacy-v1" / original.relative_to(source)).read_bytes(),
            )
        self.assertEqual(manifest["derivedReadiness"]["status"], "not-ready")

    def test_skill_routes_request_user_input_without_plan_mode_gate(self) -> None:
        skill = (SKILL_DIR / "SKILL.md").read_text(encoding="utf-8")
        decisions = (SKILL_DIR / "references" / "decision-gates.md").read_text(encoding="utf-8")
        self.assertIn("工具可用即直接调用 `request_user_input`", skill)
        self.assertIn("不检查 Plan mode", skill)
        self.assertIn("Tool absence is not a permanent `decision-blocked` state", decisions)


if __name__ == "__main__":
    unittest.main()
