# 互动课件两套 Skill 重构统一方案

- 日期：2026-08-13
- 状态：重构完成；已发布能力闭集的真实 Authoring/Behavior/Evidence 正链与仓库回归通过。W2 原件已稳定转红，绿化必须重新取得人类批准
- 目标：重构 `orchestrate-courseware` 与 `build-project-v8-courseware`，让 `implementation-ready` 真正冻结可实现的教学体验，让 `engineering candidate` 至少代表教师可操作、互动真实、可恢复且可编辑的 HTML 工程候选
- 主产品：固定 1280×720、Project V8 / Runtime API 2 / Runtime Authoring 1 / Component API 4

## 1. 最终裁决

### 1.1 2026-08-13 实施结果

本方案的产品 P0、两套 Skill 协议、统一 Playwright behavior/authoring runner、Inventory/Evidence v2 和关键正负回归已经落地。自动化结果严格停留在工程验证层，不把协议绿色写成课件产品 `art candidate | accepted`。

- 产品：Project Schema/Health/Editor 建立 `playback.controls` 与交付可见控制器的双向不变量；Player 增加不拥有课程状态的顶层教师逃生控制面。
- 编排：模板、reference、parser、validator 和 rubric 已覆盖产品能力、`RESP/TOL/AUTH/ACT/ESC`、三档判定与容量。
- 构建：Development Plan、Implementation State、Inventory v2、Behavior Spec v2、Evidence v2 与 Project/Capability/脚本/计划哈希闭合；候选由总入口现场重建 Editor、重放编辑/四格式导出/行为并重算六门，不信 manifest 自填命令或状态。初次交付物仍按原始字节哈希精确绑定；跨运行重放对 HTML 使用 raw SHA-256，对 Web ZIP、PDF、PPTX 使用格式限定的 canonical fingerprint，消除时间元数据漂移但不忽略语义差异。
- 行为：`npm run run-courseware-behavior` 只经公开 DOM 输入；自动评估、required ACT、教师控制/逃生还必须分别留下 RuntimeHost/PlayerHost 的 `assessment-evaluated`、`action-recorded`、`teacher-escape-recorded` 宿主回执，并按同一 session、连续 sequence、声明顺序、源 scene/state 和 action step 精确匹配。公开 `CustomEvent` 只作可观察反馈，状态注入不满足行为门。
- 作者与导出：`npm run run-courseware-authoring` 已打通精确 binding `native:scene:<scene>:<node>:text` 的真实选中→改→存→关→重开→Player→Editor UI 四格式导出纵切；除该 binding 外的所有 authoring carrier/field 当前均明确 fail-closed。
- 回归：本轮末次全仓 Vitest 为 136 files / 855 tests 全绿；另有 Orchestrate Python 30/30、两套 Skill quick validation、TypeScript typecheck、Capability 一致性、桌面构建、W3 可移植性 7/7、Presenter 离线 Playwright 1/1，以及真实 Authoring generate→verify 和总入口 Evidence 正链各 1/1。测试增长后的数字应以命令输出为准，不沿用旧评估稿计数。
- W2：数学/语文原件在新上游分别稳定返回 47/38 个精确错误；旧 Inventory/Evidence v1 不再能维持 candidate。修改合同与脚本会使当前人类批准 scope 失效，因此未在本轮伪造新批准或覆盖原件。

计划中“先红后绿”的红阶段已完成；绿阶段属于新的课例审批与重建工作，合法前置是用户重新审阅并批准新增合同。Phase 5 已补齐四类新鲜合同的正反向闭包测试，但四类完整 Builder 产物仍应在批量生成前分别做真实前向验收，不能把合同 fixture 写成成品课例。

仍有一个产品外信任边界：当前本地 `approve --approved-by` 只能靠流程约束，不能证明操作者确为人类。生产级审批需要 workspace 外 host 签发并验签的 `trusted-human-approval-receipt-v1`；在宿主提供 signer/trust root 前，不把本地字段表述为不可伪造的人类身份凭据。

当前两套 Skill 的主流程不需要推倒重来。本轮已补上四类可执行合同、产品级教师控制不变量，以及从“文件真实”跨到“行为真实”的可信执行门；未发布载体和外部信任能力继续明确失败关闭。

推荐的最短充分路径是：

1. 先完成教师控制一致性与顶层逃生控制面的产品 P0；Skill 无法修复 Player 合成平面和坏工程自愈。
2. 在现有合同、脚本、开发计划、Inventory 和 evidence manifest 中补齐四类合同，不增加新的默认文档阶段。
3. 保留现有 outcome 枚举，不新增 `behavior-verified` 状态；改由六个机器可计算的 `behaviorGates` 共同约束 `engineering candidate`。
4. 把视觉帧与行为路径彻底分离：状态注入可用于确定性视觉取帧，但不能证明学生完成了真实动作。
5. 用原 W2 数学、语文工程作为负向回归样本，先证明新门禁能稳定拦截，再修复到新基线；最后才做全新冷启动。

这是一项“协议与门禁重构”，不是“给 SKILL.md 再加一批原则”。`SKILL.md` 继续只保留路由、不变量和执行顺序；字段合同进入 references/templates，确定性检查进入 scripts，真实行为进入统一 Playwright harness。

## 2. 核查方法与证据权重

本方案核查了根目录 7 份评估稿、两套当前 Skill 的全文与脚本、编辑器/Player 源码，以及相邻 `courseware-cases` 仓库中的两份真实 W2 工程。

采用以下证据优先级，而不是按模型投票：

1. 当前源码、解包后的 `.h5lesson`、Builder 源码、Inventory、manifest、测试与截图；
2. 能给出可复算路径的实测报告；
3. 源码抽查报告；
4. 仅依据问题说明给出的方案性建议。

因此，Opus 对真实 W2 工程的实测是事实基线；GPTpro 的价值主要是字段结构；GLM、SeedPro、DeepSeek 的价值主要是补充控制器、容量、编辑性与迁移策略。任何报告中的普遍规则仍须经过源码和反例检查。

| 评估稿 | 主要采用 | 主要修正/降级 |
| --- | --- | --- |
| [`opus_evaluate.md`](opus_evaluate.md) | W2 解包事实、控制器四段故障、capture 预填、视觉/行为分证、薄兜底控制面 | “相同 Runtime hash”“空 nodeOverrides”仅作合同相对信号，不作无条件硬错误 |
| [`GPTpro_evaluate.md`](GPTpro_evaluate.md) | 四类跨 Skill 合同、Action/Assessment/Authoring Map、六门禁、分阶段回归 | 不新增 `behavior-verified` outcome；七档 authority 收敛为三档 |
| [`GLM_evaluate.md`](GLM_evaluate.md) | 视觉遮挡与功能阻断双测、编辑性结果合同、控制器自愈与门禁双修 | 不采用仅靠 Phaser depth 解决跨平面问题，也不把全部行为规则留在散文 |
| [`seedpro_evaluate.md`](seedpro_evaluate.md) | 教师导航权威、真实 UI E2E、容量类型下限、Inventory 几何检查 | 不立即全面 DOM 迁移；70% 重叠率和 1.2/1.5 倍仅作政策信号，不作普遍定理 |
| [`deepseek_evaluate.md`](deepseek_evaluate.md) | 六类核心问题收敛、能力缺口与 review scope 失效意识 | 数学 T3/CAS 路线由后续实测推翻，当前止步规范化短答案 |
| [`deepseek_cross_evaluate.md`](deepseek_cross_evaluate.md) | 汇总三方共识、双证控制器、教师逃生与动作真实性组合 | 已被后续 W2 实测修正的部分不作为最终事实 |
| [`deepseek_evaluate_v2.md`](deepseek_evaluate_v2.md) | 以 Opus 为事实基线、W2 红→绿顺序、开发计划归属问题 | “21 条全部硬门禁”重新归并为六个 outcome gate，并剔除误报率高的静态规则 |

## 3. 关键事实核查与修正

| 断言 | 核查结论 | 本方案处理 |
| --- | --- | --- |
| 数学工程有控制器但 `playback.controls: none`，且 `defaultCollapsed: true` | 属实；解包工程复算确认 | Project Schema、Project Health、Builder 和真实 E2E 四层同时拦截 |
| 语文工程无控制器且 `playback.controls: none`，但上游要求教师接管 | 属实 | 上游教师控制合同与 Project 实现做交叉校验，不能只看 Project 自洽 |
| Phaser 控制器位于 canvas `z=2`，scene DOM overlay 位于 `z=3` | 属实 | 采用独立的薄顶层逃生控制面；不把完整 DOM 迁移绑入本轮 |
| Runtime 容器 `pointer-events: none`，视觉遮挡不一定等于点击阻断 | 属实 | 控制器必须同时做截图/几何检查和 `elementFromPoint`/真实点击检查 |
| 交互条件没有“答案”概念 | 基本属实；`INTERACTION_CONDITION_TYPES` 只有 `presentation.in`、`scene.in` | 冻结判定权威；自动判定只能使用已登记能力 |
| 因此全屏 Runtime 是唯一实现方式 | 结论过强 | 当前已有 `runtime.event → presentation.set` 路径；判定可留在 Runtime/Component，稳定内容与状态仍可 Native/Hybrid |
| 两工程各有 14 个 state 且 `nodeOverrides` 全空 | 属实 | 作为合同相对的退化信号，不作为所有 Runtime 场景的无条件硬错误 |
| 数学四幕 Runtime source 哈希相同 | 属实 | 仅作为审查信号；通用 Runtime 复用本身可以是好设计，不能“一样即失败” |
| 语文 capture 在稳定帧预填 `modelAnswer` | 属实 | 视觉帧标记来源；行为证据禁止由 capture 注入，capture 不得制造学习证据 |
| 语文 86 个实体均为 Runtime，54 个 `visible` 多数共享大区域 bounds | 属实 | Inventory 改为结果级访问档位，并要求真实 Authoring target 几何/选择证据 |
| `editRoundTrips.binding` 未按 binding grammar fullmatch | 属实 | evidence v2 强制 fullmatch，并按实际载体覆盖合同要求 |
| artifact kind 可用自定义字符串绕过格式检查 | 属实 | evidence v2 使用闭集 kind，每类有格式/引用检查 |
| 所有 Python 校验器完全未接线 | 只部分成立 | 重构前 `validate_v8_case.py` 与多项 Vitest 已调用部分校验器，但缺少针对任意课例的完整入口，`validate_formula_markup.py` 当时仍是孤立脚本。本轮已将其接入 implementation/evidence 总入口；永久 fixture 进入 `npm test`，实际交付课例显式运行总校验器，不盲目把带参数脚本塞进全局 `npm verify` |
| `03-development-plan.md` 完全无人读取 | 不属实 | 当前总校验器检查标题及脚本/Capability 哈希，但 implementation state/evidence 未绑定计划自身哈希 |

复算的 W2 基线：

| 项目 | 数学 | 语文 |
| --- | ---: | ---: |
| 场景 / Runtime 场景 | 4 / 4 | 4 / 4 |
| Project state / 空 `nodeOverrides` | 14 / 14 | 14 / 14 |
| Inventory 实体 | 15 | 86 |
| Native / Runtime binding | 4 / 11 | 0 / 86 |
| `visible` / `property-only` | 8 / 7 | 54 / 32 |

## 4. 重构后的职责边界

```text
orchestrate-courseware
  冻结 RESP / Assessment / AUTH / ACT+ESC 以及产品能力前提
  ↓ 人类明确批准，scope hash 当前有效
  （当前本地记录可审计但不可验签；生产身份需外部可信 receipt）
validate_case.py
  派生 implementation-ready
  ↓
build-project-v8-courseware
  选择 carrier，生成 Plan / Inventory / Behavior Spec / Project
  ↓
静态校验 + 真实 Player/Editor 行为 harness + 证据校验
  ↓ 六个 behaviorGates 全绿
engineering candidate
  ↓ 视觉与互动实证
art candidate
  ↓ 指定人类对精确 scope 明确验收
accepted
```

边界规则：

- 编排 Skill 不选择 Native、Runtime、Component，也不臆造当前产品能力。
- Builder 不改变采集通道、判定权威、教师接管、编辑结果或容量；发现不可实现时返回编排。
- 产品代码保证教师控制和健康不变量；Skill 不能用第二套影子机制绕过产品缺陷。
- 仓库自动化最多给出 `engineering candidate`；本地 validator 不签发 `art candidate | accepted`，二者需要仓库外可信审阅系统与精确 scope。

## 5. 四类跨 Skill 可执行合同

不新增 Content Spec、Implementation Handoff 或独立合同 JSON。合同记录直接进入现有 Markdown，并由稳定 ID 和固定字段解析；Markdown 全字节已进入现有 review scope hash，因此字段变化会自然使批准失效。

### 5.1 Evidence / Response Contract：`RESP-*`

每个需要观察或收集的响应都建立一个记录，不再把每项学习证据默认变成页面输入。

必填字段：

| 字段 | 允许值/含义 |
| --- | --- |
| `responseId` | `RESP-001` 等稳定 ID |
| `evidenceRef` | 对应 `EVD-*` |
| `contentRef` | 对应 `CNT-*` 或精确子项 |
| `mode` | `digital-required`、`digital-optional`、`oral-check`、`paper-work`、`teacher-observed`、`discussion-only` |
| `responseType` | `choice`、`normalized-short`、`gesture`、`open-text`、`oral`、`paper` 等闭集 |
| `requiredForProgress` | `true | false` |
| `firstAttemptSeconds` | 首答预算 |
| `retrySeconds` | 一次典型修复预算；不适用写 0 |
| `teacherDiscussionSeconds` | 教师检查/讨论预算 |

容量按全课计算：

```text
阅读/观察 + 场景过渡
+ Σ max(声明首答时间, 类型下限)
+ Σ 重试预留
+ Σ 教师检查/讨论
≤ 课例总时长
```

初始类型下限作为可版本化政策值，不写死在 `SKILL.md`：

| 类型 | 首答 | 一次修复 | 教师检查/讨论 |
| --- | ---: | ---: | ---: |
| 有限选择 | 20 秒 | 10 秒 | 15 秒 |
| 规范化短答案 | 35 秒 | 20 秒 | 20 秒 |
| 圈画/拖放/参数操作 | 45 秒 | 20 秒 | 30 秒 |
| 50 字内开放表达 | 90 秒 | 0 秒 | 45 秒 |

低于下限只能由有证据的 `DEC-*` 覆盖。`N/D > 1.5` 或开放表达超过 3 项只作风险 warning，不作为跨学科硬定理；真正的 blocker 是按字段和下限计算后超过总时长。

### 5.2 Assessment Authority Contract

判定只使用三档，避免七值枚举和当前不存在的“数学等价能力”被写成事实：

| authority | 范围 | 可否硬门禁 |
| --- | --- | --- |
| `finite-auto` | 有限选项、枚举、确定配对/排序 | 可以，但必须绑定 `ESC-*` 教师接管 |
| `normalized-auto` | 当前 Capability 明确支持的数字、坐标、短符号等规范化域 | 可以，但必须有 tolerance matrix 与教师接管 |
| `human` | 开放数学解释、证据引用、概括、论证、写作、语义判断 | 不可以；只能记录、自检、同伴或教师判断 |

每个 `RESP-*` 还必须声明：

- `navigationGate: hard | soft | none`；
- `teacherOverrideRef: ESC-* | none`；
- `evaluatorCapabilityRef`：自动档必须指向当前 Capability 或批准的标准组件；
- `toleranceCaseRefs`：自动档的正反例矩阵。

硬规则：

- `human` 只能是 `soft | none`，不得成为唯一导航条件。
- 当前不引 CAS，不设置 `symbolic-equivalence` 档。将来若发布真实、可解释且可测试的等价能力，再通过能力与合同版本升级引入。
- 当前正式调用路径是 `src/shared/assessmentEvaluators.ts` 经 `ctx.assessment.evaluate` 暴露，并由 Capability Index 登记；Builder 不得另写正则或仅靠同名事件冒充 `normalized-auto`。

### 5.3 Authoring Outcome Contract：`AUTH-*`

上游只冻结结果，不指定载体：

| 字段 | 允许值/含义 |
| --- | --- |
| `authoringId` | `AUTH-001` 等稳定 ID |
| `contentRef` | `CNT-*` 精确内容或子项 |
| `access` | `direct-canvas`、`authoring-view`、`structured-property`、`developer-only` |
| `layoutAdjustment` | `required | optional | none` |
| `styleAdjustment` | `required | basic | none` |
| `requiredForAcceptance` | 是否属于候选/验收必达项 |

默认原则：稳定标题、题面、正文、标签、核心反馈、教师提示和公式至少需要结构化入口；经常移动、缩放或重排的内容需要 `direct-canvas | authoring-view`；复杂算法内部和不可配置装饰才可 `developer-only`。

Builder 可以用 Native、Runtime、Hybrid 或 Component 达成同一结果。若实现把获批的 `direct-canvas` 降为 `structured-property`，必须返回编排取得明确取舍，不能只写进 `differences` 后放行。

### 5.4 Required Action / Teacher Escape Contract：`ACT-*`、`ESC-*`

每个脚本要求的真实学生/教师动作建立 `ACT-*`：

- `actor: student | teacher | system`；
- `kind: click | select | text-input | formula-input | drag | sort | circle-text | highlight | parameter-change | oral | paper | teacher-command`；
- `target`；
- `evidenceProduced: RESP-* | none`；
- `requiredForCompletion`；
- 操作前必须可见信息、错误/重试/揭示和稳定结果。

每幕至少建立一个 `ESC-*`，覆盖错误、空白和未完成状态：

- 适用 `STATE-*`；
- `retry | reveal | continue-incomplete | scene-picker | previous | replay` 中至少一项；
- 是否先提示“未完成仍继续”；
- 不得依赖学生先答对或 `human` 响应被机器判对。

`RESP-*`、`AUTH-*`、`ACT-*`、`ESC-*` 加入稳定 ID 白名单、未知引用检查和 review rubric。不要用“关键词扫描全班/多人/分布”代替能力合同；合同新增显式产品剖面：`single-device`、`teacher-display`、`offline`、`multi-user-aggregation` 等，并要求每个非当前能力有降级或 blocking decision。

## 6. 必须先完成的产品 P0

Skill 重构开始前可先写测试与合同，但在以下 P0 通过前，不应签发新的 `engineering candidate`。

### P0-1 Project 控制一致性

修改位置：

- `src/shared/projectSchema.ts`
- `src/shared/projectHealth.ts`
- `src/renderer/project/createProject.ts`
- `src/renderer/store/editorStore.ts`
- `src/renderer/ui/PropertiesTab.tsx`

不变量：

1. `playback.controls === "canvas"` 必须存在至少一个交付态可用的 `teacher-controller`。
2. 存在交付态可见的 `teacher-controller` 时，`playback.controls` 不得为 `none`。
3. `ensureTeacherController()` 命中已有节点时也修复 controls，而不是只定位。
4. Builder 默认走 `createProject()` 的完整控制器路径；确需自定义时必须显式设置 controls，不依赖 `includeDefaultController` 的隐式副作用。
5. Schema 负责阻断，Project Health 提供可定位错误码和修复建议，Properties UI 在制造冲突前明确警示。

### P0-2 薄顶层教师逃生控制面

采用 Opus/GPTpro 的第三条路：保留 Project 中的 `TeacherControllerNode` 和现有 Phaser 作者真相，本轮只增加一个独立于 scene DOM overlay 的最小 DOM 逃生条，不重写完整 `renderTeacherController.ts`。

要求：

- 使用现有 `playback.presenter.enabled` 激活交付态教师逃生能力，不新增伪造 Project 字段；
- 位于内容层之上，`pointer-events: auto`，至少提供上一幕、下一幕/带未完成继续、场景目录、重播；
- 上一幕、重播、目录不受 scene navigation guard 阻断；下一幕被 guard 拦截时必须给出明确“未完成仍继续”确认，确认后使用现有 `bypassNavigationGuards` 路径，不得死锁；
- capture/authoring/static export 中明确排除，不污染 PDF/PPTX/静态帧；
- 保留键盘/翻页笔语义，并验证焦点在输入控件时仍存在可发现的鼠标/触控逃生路径。

完整 DOM 化教师控制器是后续产品重构，不作为本轮 Skill 重构前置条件。

### P0-3 统一真实行为 harness

在仓库提供永久、可复跑的 Playwright 行为执行器，而不是让每个课例临时复制 spec 后删除。

已落地产物：

- `implementation/behavior-spec.json`：由 `ACT-*`、`ESC-*` 和 Assessment Map 派生；
- 标准步骤闭集：`click | fill | press | select-option | check | drag | wait-visible | reload`；断言闭集：`visible | hidden | text | value | attribute | count | enabled | url`；
- 执行报告记录 spec/contract/script/plan/target/runner hash、步骤/断言、公开 witnessed events、宿主 evidence、截图和 runtime errors；
- 行为路径禁止 `page.evaluate(setPresentationState)`、直接 emit 完成事件或测试专用“完成”接口；视觉定位路径可用状态注入，但必须标 `state-injection`。

不要把 agent-browser 固化为唯一执行器；仓库内 Playwright harness 可版本化、可进 CI、可复跑，更适合作为协议真相。Agent/browser 工具可用于人工探索和补充复核。

## 7. `orchestrate-courseware` 文件级重构

| 文件 | 改动 |
| --- | --- |
| `.agents/skills/orchestrate-courseware/SKILL.md` | 只补四类合同、产品能力前提和返回 Builder 的不变量；保持短小，不内嵌完整字段表 |
| `references/artifact-contracts.md` | 增加 `RESP/AUTH/ACT/ESC` 记录格式、稳定 ID、交叉引用和哈希失效语义 |
| 新增 `references/response-assessment-authoring.md` | 放完整枚举、容量政策、三档判定与反例；由 SKILL.md 直接链接，保持一层引用 |
| `references/review-rubrics.md` | 人类审阅增加采集通道、容量、判定权威、编辑结果、能力假设、动作与逃生六项 |
| `assets/case-templates/01-courseware-contract.md` | 加产品剖面、RESP/Assessment、AUTH 与容量汇总，不新增独立文档 |
| `assets/case-templates/02-presentation-script.md` | 场景内增加 ACT、ESC、响应引用和真实行为/视觉帧区分 |
| `scripts/contract_records.py`（新增） | 确定性解析四类记录，避免继续把复杂正则堆进已接近 500 行的 `validate_case.py` |
| `scripts/validate_case.py` | 调用记录解析器，校验引用、容量、authority/gate 组合、能力前提和每幕逃生；阻止不闭合案例晋级 |
| `scripts/courseware_case_v2.py` | 仅增加稳定 ID/必要辅助，不把四类合同复制进 `case.json` |
| `tests/test_v2_workflow.py` | 更新正向 fixture，并新增超容量、human 硬锁、未知 ACT/RESP、缺 ESC、未批准能力等负例 |

`case.json.schemaVersion` 可保持 2：真相仍是原有 Markdown，现有 review scope 已覆盖其全部字节。旧案例缺新合同会变为 `not-ready`；补写后文件哈希变化，自然要求重新批准。不要自动继承旧审批。

## 8. `build-project-v8-courseware` 文件级重构

| 文件 | 改动 |
| --- | --- |
| `.agents/skills/build-project-v8-courseware/SKILL.md` | 增加“先读四合同、行为与视觉分证、六门禁全绿才可 candidate”的不可妥协规则；不塞 schema 全文 |
| `references/carrier-selection.md` | 从“能实现”升级为 Experience Fit + Authoring Fit 双合同；不设 Native/Runtime 比例 |
| 新增 `references/assessment-behavior.md` | 记录 authority 到 evaluator、ACT 到真实控件、ESC 到教师命令的实现规则 |
| `references/authoring-inventory.md` | Inventory schema v2；状态改为 `canvas-distinct | authoring-view | property | developer | blocked`，绑定 `AUTH-*` 和几何证据 |
| `references/development-plan-contract.md` | 增加 Response/Assessment Map、Action Map、Teacher Escape Map、Authoring Coverage 四张表 |
| `references/runtime-implementation.md` | 要求 Runtime 只承担必要行为/动态层；自动档引用正式 evaluator；human 只记录不硬判；语义事件连接 Project 稳定状态 |
| `references/export-and-evidence.md` | evidence schema v2、视觉/行为分离、六门禁、闭集 artifact/command、精确 acceptance scope |
| `assets/case-templates/03-development-plan.md` | 加四张映射表和行为测试派生位置 |
| `scripts/init_v8_implementation.py` | 初始化 Inventory v2、evidence v2、behavior spec 骨架和 plan hash 槽位 |
| `scripts/validate_authoring_inventory.py` | binding fullmatch；对照 `AUTH-*`；校验访问档位、必达项、几何证据和载体实际存在性 |
| `scripts/validate_behavior_spec.py`（新增） | 校验 ACT/ESC/RESP 覆盖、步骤闭集、禁止内部 API、spec/report hash 和 witnessed events |
| `scripts/validate_evidence.py` | 计算六个 gates；artifact kind 闭集；拒绝自报 commands；校验行为/宿主 receipt、authoring replay 与 acceptance scope v2 |
| `scripts/validate_v8_case.py` | 在 `implementation` 阶段先跑静态/行为 spec；在 `evidence` 阶段现场重建并重放 authoring/export/behavior，输出 `trustedExecution`；绑定 development plan 自身哈希 |
| `scripts/validate_formula_markup.py` | 已接入 `validate_v8_case.py` 的 implementation/evidence 总入口；公式标记失败会阻断总校验，不再是孤立脚本 |

### 8.1 Development Plan 的最终归属

`03-development-plan.md` 继续是 Builder 内部执行合同，不进入上游 `ARTIFACT_SPECS`，也不要求用户为工程细节重新批准。

但必须：

- 在 `implementation-state.json` 增加 `developmentPlanSha256`；
- evidence inputs 绑定同一 plan hash；
- plan/script/Capability/Project 任一变化使实现和证据失效；
- plan 发现任何用户可见取舍时返回编排，修改获批合同/脚本并重新走人类审批。

这比“把计划纳入上游 review hash”更符合职责边界，也消除了当前计划变化不使证据失效的盲区。

### 8.2 Authoring 几何证明

不采用统一“重叠度必须低于 70%”硬阈值。该阈值会误伤合法叠层和不同 authoring view。

采用更可靠的组合门禁：

1. `canvas-distinct | authoring-view` 的静态 target snapshot 只能证明 Project 结构/几何；候选还必须由当前总入口的真实 Editor replay 证明选择与持久化；
2. 同一 scene/view 中多个内容项使用相同或近相同大区域 bounds 时失败；IoU 高于 0.85 只有在显式 `overlapGroup` 且不会同时可见时允许；
3. 所有 `requiredForAcceptance` 目标必须能通过真实点击/选择回报正确 binding；
4. `property` 必须有稳定属性入口；`developer`/`blocked` 不能承载合同要求的普通教师可编辑内容。

## 9. `engineering candidate` 的六个机器门禁

不新增 outcome 状态。evidence manifest v2 记录证据，校验器计算结果；不能靠 Builder 自填 `passed`。

| Gate | 必须证明 |
| --- | --- |
| `teacherControl` | Behavior Spec 声明的源场景/状态中，顶层控制可见、在视口内、可真实点击；声明顺序与宿主 `teacher-escape-recorded` 的 requested/completed、源 scene/state、step 和结果逐项一致，公开事件只作观察 |
| `teacherEscape` | 每个 `ESC-*` 在错误/空白/未完成态可执行；guard 被拦时有明确 confirmation-required 并可继续，且 requested→confirmation-required/completed 必须由同一宿主 session 的连续有序 ledger 证明 |
| `requiredActions` | 每个 required `ACT-*` 由真实控件路径产生与 ACT/RESP/scene/step 对齐的 host-owned `action-recorded`；公开 witnessed event 只作补充观察 |
| `assessmentTolerance` | 每个自动响应覆盖标准正确、至少两种正确变体、空白、典型近错、关键词/子串假阳性，且真实调用登记 evaluator 留下宿主回执；human 响应证明只记录、不硬锁 |
| `authoringOutcome` | 每个 required `AUTH-*` 达到获批访问等级；可信 Editor replay 完成改→存→关→重开→Player/HTML 更新。当前仅 native scene text 有正路径，其他 adapter 缺失即失败关闭 |
| `responseCapacity` | 实现的必答单元与获批 `RESP-*` 一致，预算未超时；不得用自动预填或测试加速掩盖超载 |

候选条件：

```text
pipelineStatus == passed
AND 六个 behaviorGates 均由校验器计算为 passed
AND 无 P0 blocker
AND outcomeStatus == engineering candidate
AND humanAcceptance == null
```

### 9.1 静态门禁

- 四合同引用与容量闭合；
- authority/gate/override 组合合法；
- Project 控制器与 controls 一致；
- plan、Inventory、behavior spec、Project、Capability 与呈现脚本哈希闭合；
- Inventory binding fullmatch，访问等级与实际 carrier/target 对应；
- artifact kind 闭集，manifest `commands` 必须为空；只有总入口当前进程产生的 `trustedExecution` 可作为命令执行证据；
- evidence slot 只能引用预期 kind，不能用自定义 kind 绕过格式检查；
- capture 与 behavior provenance 明确。

### 9.2 真实浏览器门禁

- 对每个互动幕的 pre-interaction、至少一个 error/feedback、stable-result 状态检查顶层控制；
- 视觉检查与功能检查分别执行，不能互相推断；
- ACT 行为从脚本初态通过 `click | fill | press | select-option | check | drag` 等闭集路径到达；
- ESC 在输入焦点、错误答案、空白和未完成条件下可用；
- 自动判定跑 tolerance matrix；
- Editor 中选择目标、修改、保存、重开，再核对 Player/HTML；
- 行为报告保留 witnessed events、host evidence、步骤后时序、截图和 runtime errors；录屏属于外部 art 审阅材料，不是本地 engineering 门的自证字段。

### 9.3 人类门禁

- 载体/编辑能力降级是否接受；
- 教学有效性、课堂节奏、视觉品质和开放表达质量；
- `accepted` 的具名审阅人、时间、精确 scope hash、证据和明确意见。

## 10. 不采纳或降级为信号的建议

| 建议 | 裁决与原因 |
| --- | --- |
| 本轮完整迁移 TeacherController 到 DOM | 不采纳；先做薄顶层逃生面，完整迁移牵动 800+ 行渲染、作者预览、无障碍和 capture，应另立产品任务 |
| 引入 CAS 或自动语义判分 | 不采纳；当前 W2 失败由字符串规范化和职责错误导致，且开放表达不应硬判 |
| Native/Runtime 硬比例 | 不采纳；可凑数且惩罚合理 Runtime，改按 `AUTH-*` 结果门禁 |
| Runtime source 跨场景同哈希即失败 | 不采纳为硬门禁；共享实现可以是正确复用，仅在结合分支大脚本、编辑能力退化时报警 |
| `nodeOverrides` 全空即失败 | 不采纳为通用硬门禁；Runtime-owned 状态可合法存在，只有与获批稳定状态/编辑合同冲突时失败 |
| 所有 `visible` bounds 重叠必须低于 70% | 不采纳；改用真实 target snapshot、近重复检测、view/overlapGroup 和选择回报 |
| 新增 `behavior-verified` outcome | 不采纳；避免状态迁移涟漪，用 candidate 的六个必要子条件表达 |
| 把 `03-development-plan.md` 纳入人类 review scope | 不采纳；绑定 Builder implementation/evidence scope，用户可见变化仍返回上游 |
| 立即增加 `state.equals` 条件 | 延后到 P1 spike；现有 semantic runtime event 已能连接稳定 Project 状态，新增条件并不提供归一化能力 |
| 将所有 Python case validator 直接塞入 `npm verify` | 不采纳；全局 verify 无具体 case 参数。应以永久正负 fixture 覆盖校验器，并让每个交付显式运行总校验入口 |
| 继续扩大正则/同义词表 | 不采纳；会同时扩大假阳性和假阴性 |
| 围绕 PPTX 对象级编辑做 P0 重构 | 不采纳；HTML 是主产品，PDF/PPTX 保持可读、完整、差异诚实即可 |

## 11. 实施顺序与每阶段退出条件

### Phase 0：冻结失败基线

状态：完成。

- 保留两份 W2 基线原件、Builder/manifest 和当前 validator 输出；既有视觉材料仅按原始文件留档，不虚构截图或录屏证据；
- 建立不修改原件的回归 fixture/清单；
- 记录当前能错误取得 `engineering candidate` 的路径。

退出条件：基线可重复解包、验证和复现，不依赖聊天摘要。

### Phase 1：产品教师控制 P0

状态：完成；顶层逃生面、控制一致性、自愈、Shadow DOM 输入保护和源场景事件时序已有回归。

- 先写 Project 一致性、坏状态自愈、top escape plane、guard override、capture exclusion 的测试；
- 再修改 Schema/Health/Editor/Player；
- 覆盖真实 DOM 鼠标点击、键盘/翻页笔和输入焦点；触控命中语义由单元测试覆盖，不把 Electron 无法可信合成的触控事件写成真实 E2E 结论。

退出条件：数学坏工程被 Schema/Health 阻断但新版 Player 仍有可发现逃生；合法全屏 Runtime 工程在所有 required states 中控制面可见、可点、可继续且不污染静态导出。

### Phase 2：Skill 1 合同协议

状态：完成；四类合同、能力/容量政策、引用图谱、审批哈希链与 30 个 workflow 回归已落地。

- 实现四类记录、模板、parser、validator 和 review rubric；
- 保持 case schema v2 与现有哈希审批机制；
- 用最小正向 fixture 和 W2 负向 fixture 回归。

退出条件：正向课例可重新批准并派生 readiness；原 W2 因缺合同/容量/authority/ESC 精确失败，而不是泛化报错。

### Phase 3：Skill 2 实现与证据协议

状态：核心协议与可信执行主链完成；只有精确 binding `native:scene:<scene>:<node>:text` 已有真实 authoring 正路径，其他 native/global/field 以及 runtime/component/property/authoring-view 均按能力缺口失败关闭。

- 升级 Plan、Inventory v2、evidence v2；
- 落地统一 behavior harness、六门禁和 plan hash；
- 将新 validator 的正负 fixture 接入现有 Vitest/Python 测试链。

退出条件：仅 Schema/导出/三张图全绿不能再取得 candidate；状态注入只能获得视觉证据，不能满足行为 gate。

### Phase 4：W2 红→绿回归

状态：红阶段完成，绿阶段未执行。原因是合同/脚本变化依法使原批准失效；没有新的人类批准就不能重建并宣称 candidate。

- 重开两课的合同/脚本，重新冻结 RESP、authority、AUTH、ACT、ESC 与容量；
- 获得新的精确人类批准；
- 修 Builder/Project，不覆盖失败基线；
- 跑完整候选门禁。

数学必须证明：响应容量已缩减或改采集通道；开放理由不硬锁；规范化能力有真实来源；教师控制可达。语文必须证明：脚本要求的圈画/选择/输入有真实动作，capture 不预填学习证据，开放结论不硬锁，稳定内容达到获批编辑等级。

退出条件：两课均在新协议下达到 `engineering candidate`；人工未验收前仍不得写 `accepted`。

### Phase 5：冷启动与前向验证

状态：四类新鲜合同 profile 的闭包与核心反例已覆盖；四类完整 Builder/视觉成品前向验收尚未全部执行。

至少使用四类未泄漏预期答案的任务：

1. Native 为主的有限选择课；
2. Hybrid 的规范化短答案课；
3. 开放表达 + 教师接管课；
4. 全屏 Runtime + 顶层控制 + 隐藏 authoring view 课。

按 `skill-creator` 的 forward-test 原则，用新鲜上下文、原始材料和最小任务提示运行；不把已知 bug、期望修复或参考答案泄漏给执行者。输出与临时制品隔离，评估后清理，避免下一轮污染。

退出条件：正向任务通过、蓄意负例被拦、未见新的普遍误报，才允许继续批量生成课例。

## 12. 测试与接线清单

必须覆盖：

- `python .agents/skills/orchestrate-courseware/tests/test_v2_workflow.py`；
- `tests/unit/projectV8CoursewareSkill.test.ts`；
- `tests/unit/projectV8CoursewareForwardFixtures.test.ts`；
- `tests/unit/projectV8CoursewareEndToEnd.test.ts`；
- `tests/unit/projectV8EvidenceAuthenticity.test.ts`；
- 新增控制平面与 behavior harness 的 Playwright spec；
- `npm run check:ai-capabilities`、`npm run typecheck`、定向 Vitest、定向 Playwright；
- 每个实际课例运行 `validate_v8_case.py --target evidence`，而不是假设仓库 `npm verify` 自动知道 case 路径。

Skill 文件完成后还必须：

1. 用 `skill-creator/scripts/quick_validate.py` 分别验证两个 Skill；
2. 重新生成或核对 `agents/openai.yaml`，确保触发描述仍与职责一致；
3. 运行 `scripts/install-courseware-skills.ps1` 的安装器测试，确认仓库权威副本与用户安装副本安全同步；
4. 检查 SKILL.md 仍低于 500 行、任务需要的 references 可从 SKILL 直达、无循环追链和 README/CHANGELOG 等冗余文件。

## 13. 迁移规则

- 旧 case 不自动补写 RESP/AUTH/ACT/ESC，不继承语义猜测；新 validator 将其置为 `not-ready`。
- 修改合同或脚本后，现有 scope hash 自动失效，必须重新获得具名人类批准。
- 当前本地 approval 记录仍是可审计声明，不是密码学身份凭据；宿主未提供签名 receipt 时不得把它描述为不可伪造。
- Authoring Inventory v1 与 evidence manifest v1 可保留为历史证据，但不能在新 validator 下签发 candidate；重新实现时生成 v2 派生元数据。
- 旧 `engineering candidate` 不自动升级或延续；其 `humanAcceptance: null` 保持不变。
- W2 原件只读保留，修复版使用新工程/新 evidence scope，便于证明门禁确实从红变绿。
- Project 仍严格使用 V8 / Runtime API 2 / Runtime Authoring 1 / Component API 4；本方案不宣称未发布字段或无限画布、多表面协议已存在。

## 14. 重构完成定义

完整路线的最终完成条件与当前状态如下：

1. **完成**：产品 P0 让教师控制不再依赖场景内容层，并能从任意未完成态逃生；
2. **完成**：四类合同进入模板、references、validator 和人类 rubric，且参与现有哈希失效链；
3. **核心完成、能力闭集诚实**：Plan、Inventory、Behavior Spec、Project、Evidence 与批准输入/Capability 哈希闭合；只有已发布 adapter 可通过；
4. **完成**：六个行为门禁由 validator、真实 runner 和宿主 receipt 重算，不接受 manifest 自填字符串；
5. **完成**：视觉状态注入、公开观察事件与宿主行为证明分层，不再互相冒充；
6. **红阶段完成，绿阶段待人类审批**：两份原 W2 已稳定失败；未经新批准不修改原件、不宣称 candidate；
7. **合同级完成、成品级待扩展**：四类新鲜 profile 与负例已验证，四类完整 Builder/视觉课件仍需逐类真实前向验收；
8. **完成**：Pipeline status 与 outcome status 分开报告；本地不签发 `art candidate | accepted`。

外部依赖与能力边界：生产级人类审批身份还需要宿主提供 `trusted-human-approval-receipt-v1` 的 signer/trust root；当前 authoring 正路径仅覆盖 `native:scene:<scene>:<node>:text`，除此以外的全部 authoring binding/carrier/field 都需要按真实 Editor UI 逐类发布；`oral | paper` 非数字动作还没有可重放的 Browser step 或外部教师观察 receipt，不能作为 required ACT 取得本地候选。`art candidate | accepted` 只能由仓库外可信人类审阅系统对精确 scope 提升，前者还需要真实视觉/互动证据；上游目前也没有可独立派生 `recordingRequired` 的结构化合同字段。Runner 的离线结论限于进程级阻断与本次零外连观察，不冒充 OS 网络命名空间或防火墙隔离。这些能力缺失时一律失败关闭，不以模板、JSON、DOM 点击或说明文字冒充完成。

因此，管线仅在已发布能力闭集内最多签发 `engineering candidate`；文件存在、Schema 绿色或导出成功本身从不等于产品完成。
