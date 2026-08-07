# AI 互动课件创作 Skill 设计草案

> 历史归档说明：本文记录 Editor 1.7.0 / Project V7 的 Skill V1 设计，不是当前主干的实现入口。当前主干可继续使用编排阶段，但必须在 `implementation-ready` 后暂停，等待 Project V8 / Runtime API 2 / Component API 4 对应的新实现 Skill。

> 状态：设计已批准，Skill V1 基线已实现；完整课例冷启动验收尚未执行
>
> 适用范围：当前已实现的 PPT 兼容固定画布课件
>
> 目标版本：Skill V1 / Project V7
>
> 设计基线：2026-08-07

本文设计两个相互隔离的 Skill，把“从教学主题到获批体验合同”和“从获批体验合同到 Project V7 成品”变成可重复执行、可中断恢复、可验证的工作流。

本文不表示 Editor 1.x 已经内置 AI、Skill、自动弹框或模型调用，也不增加 Project Schema。Skill 运行在编辑器外部的 AI 创作环境中；课例档案和交接清单属于外部创作制品。

## 1. 第一性目标

### 1.1 最终结果

一个从空白上下文启动的 AI，只获得：

- 用户本次提供的主题和材料；
- 两个 Skill；
- 当前项目规范；
- 已批准并落盘的课例制品；

就能在不依赖旧聊天、不依赖压缩上下文、不参考失败实现的前提下，生成忠实于教学设计和教学呈现脚本的 Project V7 课件，并为每个关键结果提供可追溯证据。

### 1.2 不可妥协的成功条件

1. 聊天记录只用于交流，不作为教学内容或实现要求的唯一真相。
2. 每个阶段先落盘、校验、取得人类批准，再进入下一阶段。
3. AI 只能写入 `draft` 或 `ready-for-review`，不能自行写入 `approved`。
4. 任何获批制品发生内容变化后，原批准立即失效。
5. 实现阶段必须从落盘制品冷启动，不得凭旧对话补全缺失内容。
6. 每个学生可见场景、操作、反馈、分支和文案都能追溯到呈现脚本。
7. 工程测试通过与教学、视觉、体验接受严格分开。
8. 第一次生成结果必须先验收再修补；修补后的成品不能反向证明首轮工作流有效。

### 1.3 当前约束

- 当前产品能力只有固定 1280×720、Project V7、HTML/PDF/PPTX 等既有导出能力。
- Skill 不能自动切换 Codex 的协作模式，也不能伪造结构化选项框。
- 高层教学质量不能完全由静态脚本判断，必须保留人类门禁。
- 结构、引用、哈希、覆盖率和危险公式写法等适合确定性校验。
- 首版不建设知识库检索系统，不把单一数学案例抽象成通用模板。

## 2. 为什么采用两个 Skill

采用两个 Skill，而不是一个从主题直接生成工程的巨型 Skill：

```text
orchestrate-courseware
  主题/材料
    → 决策
    → 教学设计
    → 教学内容规格
    → 教学呈现脚本
    → 视觉方向
    → implementation-ready

build-project-v7-courseware
  implementation-ready
    → 技术映射
    → 核心样片
    → Project V7 整课
    → 导出与证据
    → outcome-review
```

分离后的硬规则：

- 第一个 Skill 不生成 Project、运行时或组件代码。
- 第二个 Skill 不补写教学目标、题目、标准答案或呈现脚本。
- 第二个 Skill 发现交接内容缺失、冲突或不可实现时，必须返回相应审阅阶段。
- 两个 Skill 只通过有版本、有哈希的课例制品交接，不通过聊天摘要交接。

## 3. 共享课例档案

每个非简单课例建立独立目录。建议结构如下：

```text
docs/courseware-cases/<case-id>/
├── case.json
├── decisions.json
├── 00-context.md
├── 01-teaching-design.md
├── 02-content-spec.md
├── 03-presentation-script.md
├── 04-visual-direction.md
├── 05-implementation-handoff.md
├── 06-traceability.json
└── 07-acceptance.md
```

其中 Markdown 保存需要人类阅读、审阅和批准的内容；JSON 只保存状态、结构化决策、引用、哈希与机器可验证映射，不重复保存完整教学正文。

### 3.1 `case.json`

`case.json` 是外部创作流程清单，不是 Project V7 字段。首版建议结构：

```ts
interface CoursewareCaseManifestV1 {
  schemaVersion: 1
  caseId: string
  title: string
  authoringMode: 'ppt-compatible'
  stage:
    | 'intake'
    | 'context-ready'
    | 'awaiting-decisions'
    | 'decision-blocked'
    | 'teaching-design-review'
    | 'content-spec-review'
    | 'presentation-script-review'
    | 'visual-review'
    | 'implementation-ready'
    | 'building-sample'
    | 'sample-review'
    | 'building-full'
    | 'outcome-review'
    | 'accepted'
    | 'rejected'
  artifacts: Record<string, {
    path: string
    version: string
    status: 'missing' | 'draft' | 'ready-for-review' | 'approved' | 'rejected' | 'not-required'
    sha256?: string
    approvedBy?: 'user'
    approvedAt?: string
    notRequiredReason?: string
  }>
  decisionLogPath: string
  blockingDecisionIds: string[]
  sourceCaseId?: string
}
```

约束：

- `approved` 必须绑定当时文件的 SHA-256、用户批准记录和时间。
- 文件内容改变后重新计算哈希；与批准哈希不一致时自动退回 `draft`。
- `implementation-ready` 必须由校验器根据已批准制品派生，不能仅修改字符串取得。
- `accepted` 必须引用真实结果证据和人类结果审阅记录。

### 3.2 恢复与上下文压缩规则

Skill 每次启动、恢复或怀疑上下文被压缩时，必须：

1. 读取 `case.json`；
2. 校验当前文件哈希和批准状态；
3. 只读取当前阶段需要的已批准上游制品和当前草稿；
4. 输出一段简短恢复摘要；
5. 从清单阶段继续，不从聊天记忆推断阶段。

聊天内容与获批文件冲突时，以哈希有效的获批文件为准；若用户明确要求改变内容，先使受影响批准失效并返回对应审阅阶段。

## 4. Skill A：`orchestrate-courseware`

### 4.1 触发描述草案

```yaml
---
name: orchestrate-courseware
description: Design and approve interactive courseware before implementation. Use when Codex receives a teaching topic, lesson plan,教材或素材，需要诊断上下文、向人类提出结构化高影响决策、生成并落盘教学设计、教学内容规格、教学呈现脚本、视觉方向和 implementation-ready 交接记录，或需要恢复、审阅、修订这些创作阶段。不得用于直接生成 Project V7 工程。
---
```

正式实现时统一 frontmatter 语言，避免中英文混杂；此处只展示触发覆盖范围。

### 4.2 输入

- 教学主题或用户材料；
- 年级、学科、时长、使用场景等已知约束；
- 用户指定的权威来源；
- 可选的学科知识包、学科创作说明和素材登记；
- 可选的既有课例档案。

### 4.3 输出

- 完整课例档案中的 `case.json`、`decisions.json`；
- `00-context.md` 至 `05-implementation-handoff.md`；
- 所有审阅状态、批准哈希和未解决阻断项；
- 成功时生成可被第二个 Skill 验证的 `implementation-ready` 状态。

### 4.4 强制执行顺序

#### 阶段 A0：初始化

- 在展开设计前先创建课例目录和 `case.json`。
- 登记用户原始输入，禁止只在聊天中保留题目、约束或附件说明。
- 判断属于完整设计、部分设计、仅主题还是旧课改编。

#### 阶段 A1：上下文与决策

- 建立来源清单、权威顺序、缺失项、冲突和假设。
- 只为高影响不确定项建立 `DecisionPrompt`。
- 调用选择控件前预检宿主能力。
- 宿主不支持结构化选择时，保存同一个 `DecisionPrompt`，进入 `decision-blocked`，不得改成普通文本选项并继续。
- Skill 不能自行切换 Plan/Default 等宿主模式。

#### 阶段 A2：教学设计

- 明确受众、先修、目标、证据、困难、策略、教学序列和总时长。
- 建立“目标 → 学习证据 → 教学阶段”覆盖关系。
- 不得选择 Project 节点、组件或运行时。
- 结构校验通过后才能提交人类审阅。

#### 阶段 A3：教学内容规格

这一层是 Skill V1 相对现有规范的关键增强。它冻结“到底教什么”，防止呈现脚本和实现阶段临时编题。

每个 `ContentItem` 至少包含：

- 稳定内容 ID、教学目的和关联目标；
- 完整学习者可见题面、全部已知条件和必要图示说明；
- 标准答案、完整推理链和允许的替代路径；
- 典型错误、错误成因、反馈原则和提示升级；
- 年级难度依据、认知要求和先修关系；
- 出现时机、答案揭示策略和预计用时；
- 权威来源或“本课例原创且已复核”记录；
- 公式、符号、单位、图表和媒体的语义要求。

内容规格必须给出整课容量表，说明各环节预计用时、学生实际思考时间和总时长。页面数、点击数和动画时长不能代替教学容量。

#### 阶段 A4：教学呈现脚本

每个 `PresentationBeat` 除现有规范字段外，首版增加：

- `contentItemIds`：引用哪些已批准内容；
- `timeBudget`：教师讲解、学生操作和反馈分别耗时；
- `requiredVisibleBeforeAction`：学生操作前必须已经看见的信息；
- `revealPolicy`：哪些结论不能提前出现；
- `teacherCheckpoint`：何时由教师控制推进；
- `objectiveAndEvidenceRefs`：该节拍服务的目标与证据。

硬规则：

- 学生第一次操作前必须具备完成操作所需的全部信息。
- 不允许没有教学贡献的孤立分类、排序、拖拽或选择。
- 最终总结只能归纳前面已经形成的证据。
- 每个错误分支必须给出诊断、反馈和恢复路径。
- 每个节拍必须有有意义的 HTML 稳定态和 PDF/PPTX 静态审阅帧。

#### 阶段 A5：视觉方向

- 根据风险判断必须审阅、简化审阅或 `not-required`。
- 固定主体、层级、构图差异、学科视觉语言、互动因果和避免事项。
- 关键帧只作为目标参考，不能作为完成证据。
- 不把统一页眉、卡片、页码和底栏当作默认质量方案。

#### 阶段 A6：交接

- 生成技术无关的体验合同摘要。
- 引用所有获批文件的版本、路径和 SHA-256。
- 列出权威内容、可编辑要求、交付格式、静态差异和验收证据。
- 运行全部编排校验器；失败时不得写入 `implementation-ready`。

### 4.5 Skill A 失败状态

| 状态 | 触发条件 | 允许动作 |
| --- | --- | --- |
| `decision-blocked` | 宿主不能呈现结构化选择 | 保存 Prompt，等待切换宿主模式 |
| `source-conflict` | 权威来源或用户材料冲突 | 呈现影响，请人类裁决 |
| `content-incomplete` | 题面、答案、难度或时长不完整 | 留在内容规格阶段修订 |
| `review-rejected` | 人类拒绝当前制品 | 根据意见修订并生成新版本 |
| `stale-approval` | 文件哈希与批准哈希不一致 | 自动撤销下游 readiness |
| `implementation-impact` | 后续技术限制要求改变体验 | 返回相应设计/脚本/视觉阶段 |

这些是编排诊断，不写入 Project V7。

## 5. Skill B：`build-project-v7-courseware`

### 5.1 触发描述草案

```yaml
---
name: build-project-v7-courseware
description: Implement, validate, and export an approved interactive courseware experience as a Project V7 lesson. Use only when a courseware case has a hash-valid implementation-ready handoff and Codex needs to map approved presentation beats to scenes, states, native nodes, interactions, runtimes, components, exports, traceability, and outcome evidence. Refuse to invent or repair missing teaching content during implementation.
---
```

### 5.2 启动前硬门禁

Skill B 首先运行交接校验，不直接读取旧聊天：

- `case.json` 存在且 Schema 有效；
- 教学设计、内容规格、呈现脚本均为 `approved`；
- 获批哈希与当前文件一致；
- 没有未解决阻断决策；
- 视觉方向已批准或有有效的 `not-required` 理由；
- 交接记录引用的版本、素材和交付格式存在；
- Project V7 规范版本与当前仓库一致。

任何一项失败都必须停止实现并报告应返回的阶段。

### 5.3 技术映射

每个呈现节拍建立双向映射：

| 脚本项 | Project V7 实现 |
| --- | --- |
| `beatId` | Scene ID、State ID |
| 可见内容 | TextNode、Runtime content key 或 Component props key |
| 学生动作 | Node/Component/Runtime 触发 |
| 即时反馈 | Interaction、State 或瞬态效果 |
| 错误分支 | 可达状态和恢复路径 |
| 稳定结束态 | 命名状态 |
| 静态审阅帧 | thumbnail/PDF/PPTX 捕获策略 |
| 学习证据 | 事件和结果证据路径 |

`06-traceability.json` 必须同时支持：

- 从脚本找到实现；
- 从任一学生可见实现反查脚本依据；
- 识别缺失脚本项；
- 识别没有脚本依据的新增互动或文案。

### 5.4 承载方式选择门禁

按以下顺序选择最短充分承载方式：

1. 稳定且需直接编辑的画面：原生节点与命名状态。
2. 可枚举的触发—条件—动作：声明式交互。
3. 当前课例专属的连续行为、算法判定或瞬态视觉：场景/全局运行时。
4. 会复用、需参数化或有独立生命周期价值的能力：组件。

每个组件必须记录组件化理由。仅“代码较多”“互动复杂”或“以后可能复用”不构成充分理由。一次性数学实验、课程专属联动或单幕复杂交互默认优先使用运行时；稳定题面、说明、反馈和总结默认使用原生节点。

### 5.5 公式与学科排版合同

- 内容规格中的每个公式必须有稳定 Formula ID 和显示语义。
- 展示分数不得使用 `½`、`⅓` 等斜线 Unicode 分数字符冒充竖式分数。
- 需要竖式分数时使用结构化分子、分数线和分母；不得只用普通文本 `/` 替代。
- 上标、下标、根式、向量、分段函数和单位按内容规格实现。
- 可编辑文字与结构化公式的边界必须登记；静态后备不得形成另一套数学文本。
- HTML、PDF 和 PPTX 分别进行实际截图验收；源代码扫描只能发现部分错误，不能代替视觉检查。

### 5.6 实现节奏

1. 冷启动读取获批制品并生成技术映射。
2. 先实现最高风险的核心样片。
3. 对照呈现脚本、视觉目标和公式排版进行样片门禁。
4. 样片未达到 `art candidate` 或未获人工视觉批准时停止扩展。
5. 批量实现剩余节拍，并持续更新追踪矩阵。
6. 运行 Project、互动、生命周期、离线和导出验证。
7. 生成结果证据和差异报告，进入 `outcome-review`。
8. 只有人类接受后才能写入 `accepted`。

### 5.7 Skill B 失败状态

| 状态 | 触发条件 | 返回位置 |
| --- | --- | --- |
| `handoff-invalid` | 缺失、未批准、哈希失效或引用错误 | Skill A 对应阶段 |
| `traceability-gap` | 脚本与实现无法双向覆盖 | 技术映射/实现阶段 |
| `sample-rejected` | 核心样片未获视觉或互动批准 | 样片阶段，禁止扩展 |
| `script-change-required` | 技术限制要求改变学生体验 | 呈现脚本审阅 |
| `content-change-required` | 发现题目、答案或难度问题 | 内容规格审阅 |
| `pipeline-failed` | Schema、构建、互动或导出失败 | 实现阶段 |
| `outcome-rejected` | 实际教学、视觉或体验未获接受 | 按反馈退回相应阶段 |

## 6. 确定性校验器

Skill V1 不依赖模型记忆完成以下硬检查。建议先实现一个统一入口，再按模块拆分：

```text
validate-courseware-case
├── manifest
├── decisions
├── teaching-design
├── content-spec
├── presentation-script
├── handoff
├── traceability
└── formula-markup
```

### 6.1 可确定性阻断的内容

- 必需文件、标题、字段、ID 和引用缺失；
- 目标没有学习证据，内容没有关联目标；
- 节拍没有引用内容项或没有稳定结束态；
- 学生动作前的必要信息清单为空；
- 分支没有恢复或下一步；
- 各阶段时长缺失或总时长明显不一致；
- 阻断决策未解决；
- 批准哈希失效；
- 脚本节拍未映射或实现对象没有脚本来源；
- 学生可见文字没有登记入口；
- 展示公式出现禁用的斜线分数字符；
- `accepted` 缺少人类、时间和真实证据。

### 6.2 不能伪装成确定性通过的内容

以下只能生成审阅报告，不能自动批准：

- 教学目标是否真正有价值；
- 题目难度是否恰当；
- 45 分钟课堂是否真实成立；
- 互动是否促进理解而非增加操作；
- 视觉是否专业、清晰、有学科表现力；
- 学生是否能从实际画面理解任务；
- HTML 与 PPTX/PDF 差异是否可接受。

校验报告必须分别输出 `pipeline status` 和 `outcome status`。

## 7. Skill 资源规划

两个 Skill 的 `SKILL.md` 只保存核心执行顺序、硬停止条件和资源路由，控制在较短篇幅。详细内容按需加载。

仓库权威源结构：

```text
.agents/skills/
├── orchestrate-courseware/
│   ├── SKILL.md
│   ├── agents/openai.yaml
│   ├── references/
│   │   ├── artifact-contracts.md
│   │   ├── decision-gates.md
│   │   └── review-rubrics.md
│   ├── scripts/
│   │   ├── init-case.*
│   │   └── validate-case.*
│   └── assets/
│       └── case-templates/
└── build-project-v7-courseware/
    ├── SKILL.md
    ├── agents/openai.yaml
    ├── references/
    │   ├── carrier-selection.md
    │   ├── traceability-contract.md
    │   └── formula-typography.md
    ├── scripts/
    │   ├── validate-handoff.*
    │   ├── validate-traceability.*
    │   └── validate-formula-markup.*
    └── assets/
        └── implementation-templates/
```

现有规范继续作为项目权威参考，不把全文复制进 Skill：

- `docs/AI_COURSEWARE_ORCHESTRATION.md`
- `docs/AI_COURSEWARE_AUTHORING.md`
- 运行时、组件与发布规范

Skill 的权威源位于本仓库 `.agents/skills/` 并纳入版本控制；该路径同时是 Codex 的仓库级发现入口。根目录启动脚本按目录哈希把权威副本幂等同步到当前用户的 `.agents/skills/`，用于跨工作区调用。个人目录不是唯一真相，后续修改必须先更新并验证仓库权威源，再同步安装。

## 8. 学科能力的挂载方式

首版两个 Skill 保持跨学科，不内置“动点题应该怎么教”。未来按需挂载：

```text
通用 Skill
  + subject-knowledge/<subject>/<level>
  + subject-authoring-guide/<subject>/<level>
  + approved-assets
  + accepted-case-index
```

学科包负责事实、课程标准、难度标尺、典型错误、表征方式和学科排版；通用 Skill 负责流程、制品、门禁和追踪。学科包不能跳过本次教学设计批准，也不能直接决定页面模板。

高中数学包未来至少应覆盖：

- 年级与复习阶段难度标尺；
- 典型题型、关键思想和先修关系；
- 完整解题与证明质量要求；
- 图、式、数、形联动的呈现原则；
- 公式、坐标系、函数图象和几何标注规范；
- 常见伪高中难度、机械分类和无效互动警示。

它不属于两个通用 Skill 的首版实现范围。

## 9. 冷启动验收设计

### 9.1 失败案例 0

当前《高中数学动点问题专题课》保留为流程失败案例，不继续打磨后作为成功证据。记录的问题至少包括：

- 脚本没有冻结完整题面和初始信息；
- 内容量和难度没有通过专门门禁；
- 实现只对齐状态骨架，没有对齐呈现语义；
- 大量内容被不必要地组件化；
- 分数使用斜线 Unicode 字符；
- 工程测试没有验证脚本忠实度。

### 9.2 Skill V1 前向测试

Skill 实现后执行一次不泄漏答案的冷启动测试：

1. 使用新任务或等价空白上下文。
2. 只提供原始主题、两个 Skill、项目规范和本轮产生的课例档案。
3. 不提供当前失败实现、诊断结论或期望页面答案。
4. 每个阶段按 Skill 取得人类批准。
5. 首次完整生成后冻结结果并评分，不先人工修补。
6. 对照验收量表报告首轮通过项和失败项。
7. 修订 Skill 后重新从干净档案启动，不沿用失败实现。

首个数学案例通过只能说明首个案例闭环。至少再用一个不同学科、不同互动机制的案例通过，才评估通用工作流有效性；至少两个独立接受案例出现稳定重复后，才讨论模板或组件晋升。

## 10. Skill V1 范围

### 必须实现

- 两个 Skill 的触发和硬边界；
- 课例初始化、阶段恢复和批准失效；
- 教学内容规格阶段；
- DecisionPrompt 持久化与 `decision-blocked`；
- Markdown 制品模板；
- `case.json`、批准哈希和交接校验；
- 呈现脚本结构校验；
- 脚本—实现追踪矩阵；
- 公式排版静态扫描；
- 冷启动首轮验收流程。

### 暂不实现

- 编辑器内置 AI 或自动弹框；
- 自动切换 Codex 协作模式；
- 在线知识库、向量检索或素材市场；
- 长文本、无限画布或混合模式；
- 自动判断成品视觉已接受；
- 自动把案例晋升为模板或组件；
- 对旧失败课件做自动迁移或美化。

## 11. 实施与验证顺序

1. 已确认本文的双 Skill 边界与课例档案结构。
2. 已确认 `.agents/skills/` 仓库权威源与用户级自动安装副本策略。
3. 已使用 `skill-creator` 初始化两个 Skill。
4. 已实现 `orchestrate-courseware`、Markdown 模板、批准哈希、失效传播和课例结构校验。
5. 已实现 `build-project-v7-courseware`、交接、追踪和公式危险写法校验。
6. 已完成临时课例的正向/反向结构测试，并证明公式扫描能拒绝当前数学失败案例中的斜线分数字符。
7. 待使用一个仅主题输入走到真实 `implementation-ready`，不进入工程实现。
8. 待在干净上下文中重跑高中数学案例并冻结首轮结果。
9. 根据失败证据修订 Skill，而不是只修课件。
10. 完成第二个独立学科案例后再评估通用性。

## 12. 已批准的设计决定

1. 采用两个 Skill，而不是单一端到端 Skill。
2. 把 `02-content-spec.md` 设为教学设计与呈现脚本之间的强制门禁。
3. 每次批准绑定文件哈希，文件变化自动失效。
4. 把当前数学课例固定为失败案例 0，不继续修补后充当 Skill 成功证据。
5. Skill 的权威源放在本仓库，并安装/同步到用户 Skill 目录。

批准时间：2026-08-07。本次 Skill 建设没有修改现有数学课件生成脚本；后续完整课例必须通过冷启动流程重新产生，不能从失败实现继续修补。
