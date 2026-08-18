---
name: orchestrate-courseware
description: 将 teaching topic、教材、教案、题目、课程标准或既有课件收敛为可恢复、可哈希批准的互动课件体验合同；design, review, persist, and derive implementation readiness before Project V8 implementation. Use when Codex needs to诊断输入、询问高影响选择、冻结精确教学内容、编写场景/状态呈现脚本、处理高风险视觉方向、恢复课例档案或安全审计 V1 课例。不得用此 Skill 选择工程载体、生成 Project/代码/导出或自动授予 accepted。
---

# 互动课件创作编排

把聊天输入变成可由冷启动实现者恢复的体验合同。聊天只是传输通道；`case.json` 与获批 Markdown 是真相。

## 不变量

1. 先建立或恢复课例，再写实质内容。
2. 先确定目标、证据与精确内容，再冻结学生看见、执行、如何提交证据、由谁判定、如何逃生和得到的反馈；不要先选组件、Runtime 或页面模板。
3. 只询问会实质改变结果的问题。工具可用即直接调用 `request_user_input`，不检查 Plan mode。
4. 人类批准必须绑定当前 review scope SHA-256。输入、决策或覆盖制品变化时使该审批及下游审批失效。
5. `implementation-ready` 只由 V2 校验器派生；它不是独立文档或人工批准。
6. 不从聊天摘要、旧实现、模板或失败样机补写缺失内容。
7. 本 Skill 不选择技术载体、不写 Project/运行时/组件代码、不执行导出，也不把自动化结果写成 `accepted`。

## 1. 建立或恢复 V2 课例

新课例先判断路径：

- `fast`：用户材料已闭合目标、证据、逐字内容和呈现意图，可一次集中批准；
- `standard`：先批准课程设计合同，再批准呈现脚本；默认选择；
- `high-risk`：标准路径外，视觉、核心互动、复杂行为或错误反馈有高返工风险，增加视觉/样机批准。

初始化：

```text
python <skill-dir>/scripts/init_case.py --root <workspace> --case-id <id> --title <title> --brief <request-summary> --duration-minutes <n> --path-mode <fast|standard|high-risk> [--with-content]
```

最小只创建 `case.json`、`01-courseware-contract.md` 和 `02-presentation-script.md`。内容较大或需逐字追溯时才用 `--with-content`；只有 `high-risk` 创建 `visual-direction.md`。

恢复时运行：

```text
python <skill-dir>/scripts/case_artifact.py <case> status
python <skill-dir>/scripts/validate_case.py <case> --target draft --json
```

报告当前路径、阶段、阻断决策、失效审批和最早需修订范围；从文件继续。创建、恢复、变更路径或迁移 V1 时阅读 [artifact-contracts.md](references/artifact-contracts.md)。

## 2. 处理实质决策

把每轮最重要的 1–3 个问题先嵌入 `case.json`。需要提问、默认或文本降级时阅读 [decision-gates.md](references/decision-gates.md)，并使用 `case_decision.py`。

- `request_user_input` 存在：直接呈现 2–3 个互斥选项，收到有效回答立即落盘；
- 工具不存在但已有安全默认：记录 `safe-default` 后继续；
- 工具不存在且没有安全默认：保留 blocking 决策，用一个简短等价文本问题暂停；收到回答后记录 `user-text`；
- 不建立永久 `decision-blocked` 状态，不因宿主能力缺失丢弃同一决策 ID。

## 3. 编写课程设计合同

在 `01-courseware-contract.md` 冻结：

- 受众、先修、场景、时长与教师/学生控制；
- `OBJ-* → EVD-* → STG-*` 覆盖；
- 显式产品能力剖面，以及每个 `EVD-*` 的 `RESP-*` 采集通道、容量和三档 assessment authority；
- 每个 `CNT-*` 的 `AUTH-*` 编辑结果，不预选 Native、Runtime、Component 或具体属性面板；
- 内容边界、困难、误概念、评价、约束、来源和假设；
- 每个 `CNT-*` 的逐字可见内容、答案/产出、完整解释、替代与拒绝边界、错误与反馈、难度、先修、揭示、时间和专业表示。

精确内容可位于合同、脚本或 `content/*.md`，但只能定义一次，必须由 `CNT-*` 定位，且不能依赖旧聊天。数学、诵读、文学证据等学科专有规则从相应学科 Skill/用户材料取得；通用 Skill 不臆造学科约束。

编写记录前阅读 [response-assessment-authoring.md](references/response-assessment-authoring.md)。开放解释、证据引用、概括、论证和写作使用 `human`，不得机器硬锁；自动档必须绑定真实 evaluator capability、容差矩阵和 `ESC-*`。容量按版本化类型下限、重试、讨论、阅读/观察和切换总计，超过课时即阻断。

## 4. 编写场景/状态呈现脚本

在 `02-presentation-script.md` 为每个 `SCN-*` 写清：

- 引用的 `CNT-*`、`OBJ-*`、`EVD-*` 与用时；
- 初态和第一次操作前的完整可见信息；
- 教师/学生动作、即时反馈、成功/错误/未完成/重试/揭示与恢复；
- 每个真实动作的 `ACT-*` 与每幕覆盖空白、错误、未完成态的 `ESC-*`；
- 由动作触发的信息释放用 ACT 的 `initiallyHiddenContentRefs → revealedContentRefs` 冻结，不用自由文本声称“不会提前给出”；
- 可达 `STATE-*`、稳定结果、转换、返回、重播和重开；
- 信息逐步释放、学生视角与教师检查点；
- 交互前、反馈态、稳定结果态，以及 HTML/PDF/PPTX 静态审阅帧。

动作必须服务目标、误概念修复或学习证据，数字响应必须由真实 `ACT-*` 产生，教师逃生不得依赖学生先答对或 human 响应被机器判对。脚本不得选择 Project 节点、组件、Runtime 或渲染技术。

## 5. 高风险视觉方向

仅对 `high-risk` 编写 `visual-direction.md`：冻结主体表征、层级、构图差异、专业排版、互动因果、代表性样机、`VIS-*` 关键帧、素材许可、无障碍和静态差异。视觉方向是用户可感知设计，不是技术载体选择。

## 6. 准备并取得人类 review approval

审阅前阅读 [review-rubrics.md](references/review-rubrics.md)。先使覆盖制品 ready，再使 review-ready：

```text
python <skill-dir>/scripts/case_artifact.py <case> ready <artifact-key>
python <skill-dir>/scripts/case_artifact.py <case> review-ready <review-key>
```

向用户展示 scope hash、需判断的摘要、批准后解锁内容及失效条件。只有用户明确批准该精确范围后运行：

```text
python <skill-dir>/scripts/case_artifact.py <case> approve <review-key> --approved-by <named-human> --evidence <explicit-approval>
```

`fast` 批准 `experience`；`standard` 依次批准 `contract`、`presentationScript`；`high-risk` 再批准 `visualDirection`。不得制造 reviewer/evidence，不得把 Codex、AI、agent、builder、bot 或自动化身份写成人类审批人，不得用自动校验代替批准。

## 7. 派生实现就绪

所有路径审批完成后运行：

```text
python <skill-dir>/scripts/validate_case.py <case> --target implementation-ready --promote [--capability-index <editor-root>/artifacts/ai-capabilities/index.json]
```

只有精确内容、`RESP/AUTH/ACT/ESC` 引用、产品能力、容量与判定权威均语义闭合，无 unresolved blocking decision，且制品哈希与 review scope 当前有效时，校验器才把 `case.json.stage` 和 `derivedReadiness.status` 写成 `implementation-ready`。失败时保留 `not-ready`、具体 blocker 和最早返工阶段。

在编辑器仓库根目录运行时会自动发现 Capability Index；安装在用户目录的
Skill 或课例位于仓库外时，传显式 `--capability-index`，不把用户主目录
猜成 editor root。

随后交给 `$build-project-v8-courseware`。Builder 必须保持获批的采集通道、assessment authority、教师接管、编辑结果和容量；若当前能力不能实现、需要降级 `AUTH-*` 或出现新的用户可见取舍，返回本 Skill 追加/更新决策和受影响制品，不得在实现阶段猜写或仅记 `differences` 放行。

## V1 输入

V1 只能作为未批准输入。先运行 `migrate_case_v1.py <v1-case> audit`；需要迁移时创建全新 V2 目录，并把原始字节完整保存在只读证据目录 `legacy-v1/`。迁移不得继承 V1 批准、决策响应、readiness 或 acceptance，必须完成语义重整和全部当前路径审批。
