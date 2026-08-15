# Courseware V9 原地重构：Sol Ultra 直接执行计划

> PLAN_VERSION: 5.0-sol-ultra-direct
> DATE: 2026-08-15
> EXECUTION_ENGINE: GPT-5.6 Sol / ultra workflow
> EXECUTION_TOPOLOGY: Ultra 端到端直接执行；无任务卡、无 Owner、无协调者交接
> TARGET: 从当前恢复点连续推进到 M8
> CURRENT_STAGE: M1 / GATE-V recovery
> ACCEPTED_PRODUCT_CURSOR: V04 @ 62cd1a4255f3f2d82fd98b1978fce3392bbc16e6
> BASE_COMMIT: 3e41ec058627d38c4b9f5439b454cc72331e1485
> V9_DONOR_COMMIT: f77ba9e477f9cb496e3219eb58babdb4f4becf7d
> PRODUCT_PROTOCOL: Course Project V9 / Published Course V2 / Runtime API 2/3 / Component API 4
> USER_CONFIRMATION_POLICY: 里程碑是自动检查点，不等待逐次确认
> USER_STOP_POLICY: 仅权限、付费、新依赖、不可恢复破坏、仓库外操作或目标本身不可调和
> VALIDATION_POLICY: 当前变化的最小证据；同一事实不重复证明；M8 才做最终全量
> STATUS: implementation-active

本文件是本仓库唯一长期执行计划。后续全部工作直接交给 GPT-5.6 Sol Ultra 工作流：它自行完成架构判断、内部拆分、实现、审查、Git、本地集成、Gate、失败恢复和阶段记录，并从当前状态连续运行到 M8。

不存在任务卡、ACTIVE_WAVE、Owner、主协调者或逐卡 accepted。Ultra 可以维护很短的临时工作清单，但不得把它扩写成治理系统、任务文档或用户需要跟踪的流程。

---

## 1. 最终目标

在真实存在的原 V8 App、UI、Workspace、Phaser 画布与 CSS 中原地换入 V9 数据和运行内核，使教师继续使用熟悉的产品，同时获得：

1. Course Project V9 唯一可写、可保存、可发布的工程真相源。
2. Published Course V2、Runtime API 2/3 兼容和 Component API 4。
3. Slide、Flow、Spatial 与 Mixed 的真实编辑、保存重开、隔离 Player 和导出闭环。
4. 原 App 是唯一入口；Project V8 只保留显式导入迁移和必要兼容测试。
5. 普通教师界面不暴露协议术语或未接入的 AI 占位入口。
6. 文档、Builder skill、能力卡与最终可达产品一致。
7. 自动化最多证明 engineering candidate；具体课例经真实视觉和互动复核才可称 art candidate，最终 accepted 仍需教师明确验收。

---

## 2. 不可违背的产品合同

### 2.1 原地升级

必须继续使用原有的：

- src/renderer/App.tsx
- src/renderer/ui/**
- src/renderer/ui/Workspace.tsx
- src/renderer/styles/globals.css
- src/renderer/phaser/**
- src/renderer/ProductApp.tsx 到原 App 的唯一入口

禁止：

- 新建第二套 App、Shell、Store、Workspace、Slide Workspace 或产品入口。
- 让 CourseStudioApp、CourseSurfaceCanvas、V9EditorShell 或 donor 的失败前端重新可达。
- 复制整套 donor UI、Store、Canvas、Playback Session 或 CSS。
- 为测试增加仅测试可见的视觉层、DOM 覆盖层或第二 Player。
- 同步写 V8/V9 两份工程，或从只读 View 反向重建工程。

### 2.2 数据与运行边界

- Course Project V9 是唯一写入源。
- Editor View、Workspace 输入和 Player payload 都是 V9 的只读投影。
- Phaser proxy 只负责命中、选择和几何变换；隔离 Player 是视觉真相。
- 一次用户操作只产生一次 command、一次 history 和一次 revision。
- 保存、Undo/Redo、选择和 dirty 以真实工程对象与稳定 ID 为准，不用临时 hitId 代替 authoringAddress。
- Native、Runtime、Component、全局项和教师控制器进入同一图层顺序。
- Runtime/Component 的可编辑文字必须、普通可替换图片应当公开稳定作者目标。
- Project V8 只可显式迁移到 V9，不作为新建或继续编辑的默认真相源。

### 2.3 依赖与范围

- 默认不增加依赖、不改 package/lockfile、Schema 或 IPC。
- 只有当前用户结果无法在既有能力上完成时才考虑新依赖，并先停下取得用户授权。
- 可以修改当前结果真实需要的相邻文件；无需维护预先伪造的文件白名单。
- 不做与当前里程碑无关的清理、格式化、重命名或未来抽象。
- 尚无当前消费者的接口、Adapter、配置、状态机和插件层保持不存在。

---

## 3. 给 Sol Ultra 的直接执行提示词

以下文本是从当前恢复点运行到 M8 的完整执行合同。Ultra 必须把它当成最高优先级的仓库内工作指令。

~~~text
你直接接管本仓库从 CURRENT_STAGE 到 M8 的全部工程工作。你同时负责架构判断、内部拆分、实现、测试、审查、Git、本地集成、Gate、失败恢复和计划状态更新。不要创建任务卡、Owner、协调者角色、交接协议、审批流程或额外治理文档；只维护必要的短期心智清单并持续执行。

先从第一原则确认当前里程碑的用户可见结果、不可妥协条件、真实约束和最短充分路径。现有代码只是候选路径，不是问题定义；但能够复用的成熟路径优先复用。

每次只推进当前里程碑中一个可运行、可二元判断的端到端结果。不要把 helper、Adapter、fixture、文档或测试单独拆成工作单元。完成一个结果后自行审查、提交并立即继续下一个结果；Gate 只是自动检查点，GO 后继续，NO-GO 后自行选择最短恢复路径，不等待用户确认。

严格限制过度设计：
- 只实现当前结果立即需要的行为。
- 优先最小补丁和现有调用链。
- 禁止未来抽象、通用平台、第二套实现、无立即消费者的接口、状态机、配置系统、插件层、批量重构和顺手清理。
- 现有局部重复可以保留；只有当前结果已有至少两个真实消费者且重复阻碍闭环时才抽取。
- 不把更高推理强度转化为更大的范围、更长的报告或更多代码。
- 修改一个大文件时只碰最小局部，禁止整文件重写 Workspace、PropertiesTab 或 editorStore。

严格限制过度诊断：
- 先读当前 diff、直接调用链、首次失败证据和最相关测试，不做全仓泛审计。
- 同一时刻只保留一个主假设。
- 每个根因假设最多一次判别诊断、一次最短修复和一次原失败检查复验。
- 复验失败即丢弃该假设，根据新证据选择 materially different 的下一假设；禁止无变化重跑或换工具重复证明。
- 连续两个假设失败后，不再猜补丁；增加一个能够直接观测真实状态的最小临时 instrumentation，得到事实后修复，并在提交前删除 instrumentation。
- 不生成独立审计报告、风险矩阵、rubric、测试矩阵或第二套验证体系。

严格限制过度检验：
- 实现循环只跑 1–3 个最相关检查。
- 类型边界实际变化才跑 typecheck；对应 bundle 实际变化才跑对应 build。
- 同一 SHA 和覆盖集合上的绿色证据直接复用。
- UI 默认只验证一个 1366×768 真实 Electron/Playwright 主路径和一张结果截图。
- Playwright page.mouse 已通过原 canvas 和保存文件证明写入时，不再追加 SendInput。
- CSS、DOM、viewport 未变化时不跑三尺寸或像素 golden。
- Gate 只做该阶段最小汇总；全量、三尺寸、clean-Windows 和最终导出复核集中到 M8。
- 不为了“更有把握”重复运行同一命令、增加截图或启动另一种工具。

Git 与工作区：
- 先检查 branch、status、diff 和 accepted product cursor。
- 保留用户和外部工具已有的未提交文件；不得用 reset、checkout 或 stash 抹掉它们。
- 当前 dirty diff 先逐项判断属于当前结果、失败实验或无关文件；只清理能够由证据判定的失败实验。
- 每完成一个可见端到端结果或一个里程碑，做一次意图明确的本地 commit；不要为 helper 或计划记录制造微提交。
- 不 push，不修改远端，不执行破坏性历史改写。
- 更新本文件只记录 CURRENT_STAGE、已完成里程碑 SHA 和一个未覆盖风险，不恢复任务卡体系。

内部并行：
- 默认单写入。
- 只有两个工作流依赖相同已提交父节点、无数据/接口/验收依赖、产品与测试文件完全不重叠、无需修改共享高冲突文件时，才可由 Ultra 在最多两个独立 worktree 中并行。
- Ultra 自行创建和回收 worktree，但必须先核验绝对路径与分支；禁止在共享目录并行写。
- 两路结果仍逐个审查、逐个集成、逐个运行受影响检查。
- 当前 M1 脏主工作区禁止并行写入；先完成并提交 GATE-V。

持续运行：
- 普通技术问题自行解决，不向用户转嫁 Store、Adapter、Schema、拆分或测试判断。
- 里程碑完成后自动继续，不等待确认。
- 只有权限、付费、新依赖、不可恢复破坏、仓库外操作或目标本身不可调和才停止并询问用户。
- 到达 M8 后给出一次简洁总结：结果、里程碑 SHA、最终验证、产品质量等级和仍需教师验收的内容。
~~~

---

## 4. 当前恢复点

### 4.1 已集成产品检查点

| 检查点 | SHA | 已成立事实 |
|---|---|---|
| G00 | 8c7a530492e553f8bd1b560a3de598f4da24497c | 从真实 V8 基线建分支 |
| G01 | 05bdee521de2fe3de9de166333aa22b012058b7b | 工程基线 |
| G02 | 378c195f74e562f3ad5e47c494b94e709ccb57dd | 原壳视觉与几何基线 |
| G03 | 14890bb76d5743189114f0ff2d42c85a5aa8a4a2 | 行为映射 |
| G04 | 95fbb13934a17594a7a556f7b2627372d0732d89 | 反重写 verifier |
| G05 | dc190edb6a0d1b7b696e7308effd401d343134a2 | 原 App 唯一可达入口 |
| K00 | eb00ed257dd6a12adf92914e89252063a6bad654 | 直接 V9 新工程 factory |
| V01 | cf01dda082c14356f10853c89cc52aa9ded5d4af | Slide 只读编辑投影 |
| V02 | 49faf2366671b121558142c67a66364aaba6f138 | 稳定选择与 move command |
| V03 | f00c01b1e870dea4db46a3434cbd99daa89deb82 | Workspace 窄注入边界 |
| V04 | 62cd1a4255f3f2d82fd98b1978fce3392bbc16e6 | 精确 query 下 V9 单 backend |

产品 accepted cursor 仍是 V04。V04 之后的计划提交不扩大产品 diff 基线。

### 4.2 当前未提交 M1 纵切

当前工作区包含：

- src/renderer/App.tsx
- src/renderer/course/v9SlideVerticalSlice.ts
- src/renderer/ui/Workspace.tsx
- src/renderer/ui/workspaceSlideAuthoring.ts
- tests/unit/v9SlideVerticalSlice.test.ts
- tests/unit/workspaceSlideAuthoring.test.ts
- tests/e2e/v9SlideVerticalSlice.spec.ts
- 未跟踪的 PLAN_EVALUATION_REPORT.md 是外部只读评审材料，不属于产品结果，默认不提交。

已成立：

- V9 text 已进入隔离 Player 并在进程重开后可见。
- 第一进程真实拖动、Undo/Redo、schemaVersion 9 保存已通过。
- archive 重开后的 text、frame 与稳定 ID 已恢复。
- 相关两个 unit 文件此前 10 个测试通过。
- Electron main 未变化，既有 Electron build 证据可复用。

当前唯一失败：

- 第二进程重开 archive 后再次拖动时 canvas cursor 为 auto。
- DOM elementFromPoint 是 canvas，pointer-events 为 auto，没有 renderer/console error。
- 实际 canvas bounds 约 x=246、y=315.7、w=786、h=442，目标约 x=651.9、y=578.8。
- Player 已显示 text，因此“视觉 payload 缺失”已排除。
- 当前 diff 中“按 documentId 重建 EditorGame + create 后显式 bridge.loadScene”已经复验失败，不能再当作未经验证的修复。
- 下一步必须区分：Phaser proxy/Zone 是否缺失，或 Phaser Scale 的 canvasBounds 在布局位移后陈旧。优先利用现有 trace/源码；证据不足时只做一个直接判别诊断。

M1 完成条件：

1. 第二进程真实 canvas 指针可继续拖动。
2. 保存后 revision=3，frame 约增加 +30/+20，稳定 ID 不变。
3. E2E 无 renderer/console/external error。
4. 临时诊断已删除，失败生命周期实验已清理。
5. typecheck、Renderer build、verify:editor-preservation、git diff --check 通过。
6. GATE-V 只额外汇总一次 npm test。
7. 形成一个 M1 产品 commit，然后立即进入 M2。

---

## 5. M1 到 M8 自动检查点

这些是结果检查点，不是任务卡。Ultra 自行决定内部实现顺序和最短路径。

### M1 — GATE-V：V9 Slide 最小真实闭环

- 原 App/Workspace 显示 V9 Native text。
- 真实 canvas 指针选择与拖动。
- 一次拖动一次 history/revision。
- Undo/Redo。
- schemaVersion 9 archive 保存。
- 完全关闭 Electron 后重开，text/frame/layerItemId 不变并可继续拖动。
- V8 Store 不写入，无第二 backend。
- 一个 1366×768 原壳结果路径。
- Gate 通过后自动进入 M2；失败时 Ultra 自动修最短根因。

### M2 — 单写 V9 与原壳文件生命周期

- 直接 V9 factories、commands 和窄 Editor Port。
- 新建、打开、最近、保存、另存、dirty、窗口标题、关闭确认、Undo/Redo 全部以 V9 为真相源。
- 原顶栏、左栏、状态条、右栏和 Workspace 切到 V9 只读 View/command。
- 默认产品不再依赖 V8 Store 创建或保存新工程。
- V8 只保留显式导入迁移入口。
- 保存重开和原壳代表路径通过。

### M3 — GATE-S：完整 Slide 作者闭环

- Native text、formula、shape、image、video 和教师控制器。
- global/surface/scene 统一 scope、order、visibility、lock 与稳定选择。
- scene CRUD、排序、复制和引用修复。
- 选择、真实拖动、resize、rotate、keyboard nudge 与一次操作一次历史。
- 文字/公式/媒体/形状属性、字体、背景、IME 与缩放下编辑。
- 命名状态、状态覆盖、初始状态、切换和持久化。
- Runtime/Component 载体与公开 authoring target 进入统一图层。
- 互动、媒体和教师控制器可编辑并在隔离 Player 运行。
- 一个代表性 Slide 教师路径与一次阶段汇总通过。

### M4 — Player、Runtime、Component 与课程逻辑闭环

- 隔离 Player 是唯一视觉运行真相，不污染编辑工程或现场运行会话。
- Runtime API 2/3 正确加载、通信、检查、checkpoint 与资源释放。
- Component API 4 package、props、preset、作者目标和 hot update。
- 开发区可编辑普通模块，不在构建脚本中手写巨型动态字符串。
- 课程 location/state/guard/controller 与试运行闭环。
- capture、checkpoint 和恢复不写回 Project。

### M5 — Flow

- Flow 语义结构、层级、表格、公式、媒体、统一图层和稳定选择。
- 真实拖动与一次操作一次历史。
- 属性编辑、状态/互动、Player 和保存重开。
- HTML、PDF、DOCX 对 Flow 的真实导出路径。
- 代表性 Flow 教师路径通过。

### M6 — Spatial

- Spatial pan/zoom、选择、变换、关系、镜头、路径和小地图。
- Native/Runtime/Component/控制器统一图层。
- 状态、互动、Player、保存重开和导出。
- 代表性 Spatial 教师路径通过。
- M5 与 M6 只有满足第 3 节内部并行条件时才可并行，否则串行。

### M7 — GATE-FEATURES：Mixed 与发布导出

- Mixed 中 Slide/Flow/Spatial 导航。
- 跨表面 location/state/guard/controller。
- 完全关闭重开后课程状态和引用一致。
- Published Course V2 真实整课 Player。
- HTML、网页包、PDF、PPTX、DOCX 五类导出至少各完成一次真实样例。
- Runtime 2/3 和 Component 4 兼容路径保持。
- 一个代表性 Mixed 教师路径与一次阶段汇总通过。

### M8 — 最终收敛

- ProductApp 只有原 App 一个入口。
- 新工程、编辑、保存和发布只有 Course Project V9。
- Project V8 只有显式导入迁移和必要兼容测试。
- 删除或断开失败前端、旧顶层协议和不可达占位入口；不做无关代码美化。
- 普通教师 UI 去除 V8/V9/Surface/Native/Runtime/Component 等协议词和未接入 AI 占位。
- docs、USER_GUIDE、build-courseware-project skill、Agent Kit 能力卡与可达产品一致。
- 反重写 verifier、行为映射、保存重开、Player、发布和导出合同一致。
- 完成第 6 节最终验证并提交 M8。
- 输出 engineering candidate 或 art candidate 的真实等级；教师未明确验收前不得写 accepted。

---

## 6. 验证预算

### 6.1 实现循环

- 一个连贯修改后只跑 1–3 个最相关检查。
- 失败先读首次证据；代码未变化不重跑。
- 只在类型边界变化时 typecheck。
- 只构建受影响 bundle。
- UI 只跑一个主视口和一条真实指针路径。
- 临时日志、测试诊断或 instrumentation 在提交前删除。

### 6.2 阶段 Gate

GATE-V、GATE-S、GATE-FEATURES 各自只做：

1. 当前阶段定向测试。
2. typecheck 和受影响 build。
3. 一条代表性真实 Electron 路径。
4. 一次 npm test。
5. git diff --check 与范围审查。

如果同一 SHA 上已有等价绿色证据，直接复用，不为 Gate 重跑。

### 6.3 M8 最终验证

只在 M8 运行一次最终集合：

- npm test
- npm run typecheck
- 受影响的 Renderer、Player、Electron build
- npm run verify:editor-preservation
- 最终真实 Electron E2E
- 三尺寸壳层/golden，仅当最终 CSS/DOM/viewport 与冻结基线相关
- archive、Published V2、Runtime 2/3、Component 4 和五类导出；M7 后相关代码未变则复用 M7 证据
- git diff --check、仓库卫生和无意外未提交产品文件

不得为了提高信心再追加第二轮全量、SendInput、另一浏览器工具或平行审计。

---

## 7. 运行结束条件

Ultra 只有在以下任一情况发生时停止：

1. M8 已完成并给出最终结果。
2. 需要用户批准的新依赖、付费能力或仓库外操作。
3. 必须执行不可恢复的破坏性操作。
4. 目标合同内部不可调和，且已有最小证据证明不存在安全路径。
5. 权限阻止继续。

普通测试失败、复杂 bug、计划局部过时、相邻文件需求、Store/Adapter/Schema 选择或里程碑 NO-GO 都不是停止条件；Ultra 自行修订最短路径并持续推进。
