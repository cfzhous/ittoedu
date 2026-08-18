# AI 互动课件 Skill 设计与迁移说明（历史背景）

> **状态：历史文档（2026-08-13）。** 当前机器执行权威是 [`orchestrate-courseware`](../.agents/skills/orchestrate-courseware/SKILL.md) 与 [`build-courseware-project`](../.agents/skills/build-courseware-project/SKILL.md)。下文中的 Project V8、Hash 批准、`implementation-ready` 和 `build-project-v8-courseware` 已过时。
>
> 本文只解释当时的设计理由、边界和从 Skill V1 的迁移关系，不复制第二套可执行流程。
>
> Editor 1.7.0 / Project V7 的原始 Skill V1 设计由 Git 标签 `internal-prototype-1.7.0` 保存。

## 1. 第一性目标

一个从干净上下文启动的 AI，只依赖用户材料、当前两个 Skill、课例档案和仓库机器合同，也应能够：

- 在不依赖旧聊天或失败实现的情况下恢复任务；
- 让人类只判断会实质改变教学和成品的高影响取舍；
- 冻结精确教学内容、场景/状态呈现和必要视觉方向；
- 在批准仍与当前内容哈希一致时派生实现就绪；
- 通过真实 Project V8 API 构建或局部修补可编辑工程；
- 分别报告工程管线与用户可感知结果，不让自动化冒充人类接受。

设计同时优化 AI 创作友好度：通用工作流保持薄、可恢复、按需加载；学科规则和单次额外要求由用户材料、学科 Skill 或本次提示词补充，而不是持续堆进通用 Skill。

## 2. 为什么保留两个 Skill

```text
orchestrate-courseware
  输入与来源
    → 高影响决策
    → 课程设计合同与精确内容
    → 场景/状态呈现脚本
    → 可选高风险视觉方向
    → 哈希批准与派生 implementation-ready

build-project-v8-courseware
  当前有效的 implementation-ready
    → Capability 预检
    → 载体所有权与 Authoring Inventory
    → 风险纵切
    → Project V8 构建或 stable-ID Patch
    → Player、导出与真实性证据
    → 人类结果验收
```

分离的目的不是增加阶段，而是隔离两类责任：

- 编排 Skill 决定教什么、学生看见和执行什么、反馈是什么；不选择组件、Runtime 或 Project 节点。
- Builder 决定如何用当前软件能力承载已批准体验；不补写题目、答案、解释、教学目标或用户可见取舍。
- Builder 发现内容或可感知设计缺口时返回编排，不能在实现层静默猜写。
- 两者通过可校验的课例文件交接，聊天记录或压缩摘要不能成为唯一真相。

## 3. 编排 V2：最薄充分课例

### 3.1 最小制品

新课例最少只需要：

```text
<case-dir>/
├── case.json
├── 01-courseware-contract.md
└── 02-presentation-script.md
```

只有精确内容较大、来源独立或需要逐字追溯时才增加 `content/*.md`；只有高风险路径才增加 `visual-direction.md`。决策直接嵌入 `case.json`，不另建 `decisions.json`。`implementation-ready` 是校验器派生状态，不是手写交接文件。追踪和验收也不得另建平行真相取代 Builder Inventory 与证据清单。

### 3.2 三条自适应路径

| 路径 | 适用输入 | 人类 review scope |
| --- | --- | --- |
| `fast` | 目标、证据、逐字内容、呈现意图和关键取舍已经闭合 | `experience` 集中批准 |
| `standard` | 多数新课例；内容或呈现仍需收敛 | 先 `contract`，再 `presentationScript` |
| `high-risk` | 核心互动、视觉主体、定制素材或静态差异具有高返工风险 | 标准路径外增加 `visualDirection` |

路径只减少无决策价值的往返，不降低精确内容、可恢复性或哈希批准要求。文件数量和批准次数不是质量指标。

### 3.3 决策与 `request_user_input`

每次只保留最重要的 1–3 个高影响问题，并先以稳定 Decision ID 写入 `case.json`：

- 宿主暴露 `request_user_input` 时直接调用，不检查 Plan mode；
- 工具不可用但存在真正安全的默认值时记录 `safe-default`；
- 工具不可用且无安全默认值时保留 blocking 决策，用一个简短等价文本问题暂停，回答后记录 `user-text`；
- 工具短暂缺失不生成永久 `decision-blocked` 流程，也不更换同一决策 ID。

结构化选项框是宿主交互能力，不表示 Editor 1.x 内置模型调用或 AI 面板。

### 3.4 哈希批准与派生就绪

人类批准绑定当前 review scope 的 SHA-256。输入、决策、覆盖制品或上游 scope 变化时，直接批准及其下游批准失效并保留审计历史。只有 V2 校验器确认以下条件后才能派生 `implementation-ready`：

- 路径要求的制品语义闭合且哈希当前有效；
- 精确内容位置明确，无需从聊天或旧实现补写；
- 没有 unresolved blocking decision；
- 当前路径要求的人类 reviews 均绑定有效 scope。

AI、Codex、agent、builder、bot 或自动化身份不得作为人类批准人。

## 4. Project V8 Builder

### 4.1 入口门禁

Builder 首先重跑 V2 `implementation-ready` 校验和 `check:ai-capabilities`，确认 Capability Index 的真实 TypeScript Headless 入口。脚本、批准、内容或 Capability 哈希失效时立即返回编排；不得调用归档 V7 Skill、手写巨型 Project JSON 或建立影子 DSL。

### 4.2 结果优先的载体选择

每个场景按成品质量和编辑责任选择：

- `native-owned`：稳定文字、公式、图片、图形、视频、命名状态和常规映射；
- `runtime-owned`：一次性复杂连续互动或定制可视化；
- `hybrid-owned`：原生稳定内容与 Runtime 瞬态机制共同承担；
- `component-composed`：确有跨课复用责任、版本和公开参数的能力。

“代码复杂”“视觉重要”或“未来可能复用”都不足以强制组件化。先完成最高风险纵切，再批量扩展全课。

### 4.3 Authoring Inventory 与局部 Patch

Builder 为所有必须可编辑的人工文字、素材和关键参数维护 `implementation/authoring-inventory.json`，记录稳定 scene/global 绑定、编辑状态、来源和当前哈希。`registered:*`、`dom:*`、会话 `targetId` 等临时标识不得作为持久绑定。

首次完整生成后冻结工程路径、稳定 ID 和 SHA-256。人类在编辑器中修改后，后续变更通过 `implementation/patch.ts` 保留既有 scene/node/binding ID；不得从初始 Builder 整课覆盖人类修改。

### 4.4 真实验证与证据

至少覆盖：

- Project V8 Schema、工程健康、公式和 Inventory 校验；
- 打开、编辑、保存、关闭、重开与稳定 ID Patch；
- 真实 Player 和离线单 HTML、网页包；
- PDF、PPTX 静态差异与对象/快照检查；
- 每个互动幕的交互前、关键反馈、稳定结果三帧；
- 每个静态幕的稳定帧、整课 contact sheet 和核心互动录屏。

真实性校验应拒绝伪格式、重复路径、相同帧字节、场景证据缺失和自动化验收身份。Headless 绿色不能替代像素、互动或人工产品判断。

## 5. 质量状态边界

| 状态 | 含义 | 谁可签发 |
| --- | --- | --- |
| `unusable` | 无法完成核心使用 | 自动化或人类 |
| `placeholder` | 机制或内容仍是占位 | 自动化或人类 |
| `engineering candidate` | 结构、构建和机器门禁成立 | 自动化最高等级 |
| `art candidate` | 已有真实视觉/互动证据，等待最终接受 | 基于证据的审阅流程 |
| `accepted` | 指定人类对精确证据范围给出明确接受意见 | 仅人类 |

管线状态与结果状态必须分别报告。测试通过、文件存在或导出成功最多证明 `engineering candidate`，不能自动升级为 `accepted`。

## 6. 权威源、发现与安装

仓库 `.agents/skills/` 是两个 Skill 的权威源码和项目级发现入口。安装器将受管理副本事务性同步到当前用户 `.agents/skills/`，并用树签名区分幂等更新、用户修改和来源不明目录。

当前安装器只管理：

- `orchestrate-courseware`
- `build-project-v8-courseware`

旧 `build-project-v7-courseware` 只有在受本项目管理且字节仍等于已知官方树时才可安全退役。修改过、来源不明或清单外副本必须保留并报告；安装器不会静默删除 `%USERPROFILE%\.codex\skills` 中的历史副本。

## 7. V1 到 V2/V8 的迁移关系

| 历史 V1 做法 | 当前做法 |
| --- | --- |
| 固定七份 Markdown/JSON 制品 | 最小三文件；内容与视觉按需要增加 |
| 固定教学设计→内容规格→呈现→视觉批准流 | `fast | standard | high-risk` 自适应 review scopes |
| 独立 `decisions.json` 和永久 `decision-blocked` | `case.json` 嵌入稳定决策；工具恢复后沿用同一 ID |
| 依赖 Plan mode 才能展示选项框 | `request_user_input` 可用即直接调用 |
| 手写 `implementation-ready` handoff | V2 校验器根据内容、决策、制品和批准哈希派生 |
| 独立追踪与 acceptance Markdown | Builder development plan、Authoring Inventory、证据清单和人类记录 |
| Project V7 Builder | 只面向 Project V8 的真实 TypeScript Builder |
| 实现后整课重生成 | 人工编辑后按稳定 ID 局部 Patch |
| 静态检查可近似代表成品 | 强制真实 Player、四格式、逐幕帧、contact sheet 和录屏 |

V1 课例只能作为未批准输入。迁移时先审计，把原始字节完整保存在新 V2 目录的 `legacy-v1/`，且不继承旧批准、决策响应、readiness 或 acceptance。

## 8. 学科与知识扩展

通用 Skill 只承担跨学科的不变量：目标—证据—内容—呈现闭合、高影响决策、哈希失效、实现边界、结果证据和人类门禁。数学公式、文学证据、诵读、实验安全、区域课标和其他专有要求来自：

1. 用户本次材料与明确要求；
2. 任务相关的学科 Skill；
3. 本次提示词中可追溯的补充规则。

扩展必须在课例合同或脚本中留下来源与用户可审阅结果，但不扩张通用 case schema、常驻阶段或组件体系。只有多个已接受课例证明稳定复用责任后，才讨论模板或组件晋升。

## 9. 当前验证状态与后续门禁

W1 的实现与自动化证据见 [课件工作流 W1 验证记录](reviews/COURSEWARE_WORKFLOW_W1_VERIFICATION_20260813.md)，W3 的同机隔离可移植性增量见 [W3 Windows / 离线可移植性验证记录](reviews/W3_WINDOWS_PORTABILITY_VERIFICATION_20260813.md)，完整路线见根目录 [COURSEWARE_DEVELOPMENT_PLAN.md](../COURSEWARE_DEVELOPMENT_PLAN.md)。当前边界是：

- 编排 V2、V8 Builder、前向夹具、真实性证据和受管安装迁移已达到 `engineering candidate`；
- 前向夹具只证明机制，不计入产品验收；
- W2 的数学、语文新课例仍须取得有效用户决策、完成真实制品，并由指定人类分别达到 `accepted`；
- W3 已自动证明目录版/Portable 同机隔离启动、工程断源移动重开和单 HTML/网页包离线移动；仍须另一台真正干净 Windows 的首次启动与可见冒烟，且只有在 W2 和其余全链路/文档门禁成立后才能接受；
- Flow、Project V9、混合表面和 Spatial 2D 属于后续里程碑，不得写成当前生成能力。

## 10. 维护规则

修改工作流时按以下顺序维护：

1. 先更新仓库权威 Skill、reference、模板、脚本和确定性测试；
2. 同步 Capability Index、Schema 或源码事实，但不在 Skill 中复制完整长合同；
3. 更新本文、编排规范、创作接入规范、README 与用户指南中的人类解释；
4. 运行 Skill 测试、能力检查、相关软件测试、链接检查和 `git diff --check`；
5. 分别记录管线等级、结果等级、未解除的人类门禁和历史副本处置。

不得把尚未实现的表面、未获批准的 RFC、自动化推荐项或历史 V1 能力写成当前事实。
