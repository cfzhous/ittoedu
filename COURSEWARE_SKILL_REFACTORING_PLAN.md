# Courseware V9 原地重构：Sol Ultra 直接执行计划

> PLAN_VERSION: 5.1-sol-ultra-direct-guarded
> DATE: 2026-08-15
> EXECUTION_ENGINE: GPT-5.6 Sol / ultra workflow
> EXECUTION_TOPOLOGY: Ultra 端到端直接执行；无任务卡、无 Owner、无协调者交接
> TARGET: 从当前恢复点连续推进到 M8
> CURRENT_STAGE: M2 / V9 single-write lifecycle
> ACCEPTED_PRODUCT_CURSOR: M1 @ ecad7a17a36faab6c42916b0b291ef61ddff69c8
> BASE_COMMIT: 3e41ec058627d38c4b9f5439b454cc72331e1485
> V9_DONOR_COMMIT: f77ba9e477f9cb496e3219eb58babdb4f4becf7d
> PRODUCT_PROTOCOL: Course Project V9 / Published Course V2 / Runtime API 2/3 / Component API 4
> USER_CONFIRMATION_POLICY: 里程碑是自动检查点，不等待逐次确认
> USER_STOP_POLICY: 仅权限、付费、新依赖、不可恢复破坏、仓库外操作或目标本身不可调和
> VALIDATION_POLICY: 当前变化的最小证据；同一事实不重复证明；M8 才做最终全量
> ANTI_REWRITE_GATE: preservation verifier + behavior map + original-shell golden
> REWRITE_DECISION: 任一原文件删除/替代、正式入口偏离原 App 或禁止结构可达，立即 NO-GO
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

### 2.4 不可删除、重命名或替代的原前端文件

下列文件必须在原路径原地演进；文件名存在不是充分条件，它们还必须继续位于正式可达调用链中：

- src/renderer/App.tsx
- src/renderer/ui/TopToolbar.tsx
- src/renderer/ui/ScenePanel.tsx
- src/renderer/ui/SceneThumbnail.tsx
- src/renderer/ui/Workspace.tsx
- src/renderer/ui/SceneStateStrip.tsx
- src/renderer/ui/RightSidebar.tsx
- src/renderer/ui/ElementsTab.tsx
- src/renderer/ui/NodesTab.tsx
- src/renderer/ui/PropertiesTab.tsx
- src/renderer/ui/ComponentsTab.tsx
- src/renderer/ui/AutomationTab.tsx
- src/renderer/ui/DeveloperTab.tsx
- src/renderer/ui/PresenterSettingsEditor.tsx
- src/renderer/authoring/stageViewportTransform.ts
- src/renderer/phaser/**
- src/renderer/styles/globals.css

ProductApp.tsx 最终只能渲染同一个原 App。Flow 和 Spatial 可以在原中央编辑区拥有适合自己的内容工作区，但不得成为新产品壳，也不得反向改写 Slide 的成熟画布交互。

### 2.5 永久禁止的重写结构与路线

以下结构一旦出现即视为反重写 Gate 失败，不因测试通过而接受：

- ConvergedEditorApp、任何新 *EditorApp 或 *EditorShell。
- 新 Slide Workspace、src/renderer/converged/** 或替代原 UI 的 src/renderer/studio/**。
- 以 CourseStudioApp、CourseSurfaceCanvas 或 V9EditorShell 为母体重建产品。
- 用 course-studio.css 覆盖原壳。
- 新建多组 slice、Context Provider、service/plugin/command 框架替代现成前端。
- 为新壳建立 converged*.test 自证成功。
- 从 donor 新建壳再移植 V8 UI。
- 保留 CourseStudioApp 再逐步仿制 V8。
- 让 Project V8 继续作为最终默认编辑协议。

唯一允许的路线是：以 3e41ec0 的原 App/ui/Workspace/Phaser/CSS 为前端基线，原地换入 Course Project V9；f77ba9e 只提供按函数或纯模型摘取的逻辑参考。

这不是风格偏好，而是已有 Git 证据：3e41ec0→f77ba9e 删除了原 App、约 4,200 行 editorStore、约 2,700 行 Workspace、TopToolbar/ScenePanel/SceneStateStrip/RightSidebar/Properties/Developer 等整套 UI、Phaser 编辑链及大量高价值测试，并新建了 V9EditorShell、CourseStudioApp 和另一套 Canvas/CSS。以 donor 为壳再“移植 V8”就是再次重写前端，永久否决。

### 2.6 教师可见交互冻结合同

| 区域 | 必须保留的行为 |
|---|---|
| 顶部 | 新建、打开、保存、撤销、重做、当前位置试运行、整课预览、导出；不随意改变顺序和密度 |
| 左侧 | 固定一级“全局层”；幻灯片缩略图；拖动排序、重命名、复制、删除 |
| 中央 | 1280×720 Slide 逻辑画布；缩放、平移、点选、框选、Shift 多选、移动、八向缩放、旋转、方向键微调、双击编辑、吸附 |
| 状态条 | 基础画面与命名状态始终在画布下方；新增、复制、重命名、设初始、设缩略图、删除 |
| 右侧 | 简洁/专业模式；元素、图层、属性；专业模式中的互动与开发；普通教师不看到协议分层 |
| 字体与样式 | 字体搜索、完整列表、系统检测、自定义字体、文字颜色、高亮、文本框背景/透明度/圆角与完整排版 |
| 开发 | Runtime 源码/内容/素材、Component manifest/runtime/props、Object/Rules JSON、校验、错误和预览 |
| 教师控制器 | 全局层中的真实作者对象；可编辑、可恢复；编辑态按钮不执行，试运行中正确导航和收展 |
| 底部状态 | 状态、选择、缩放、dirty 与错误可见；普通错误不暴露内部 ID/API 方法名 |

教师概念映射必须保持：

- Slide scene 显示为“幻灯片”，不显示 Surface/Scene。
- project.globalLayerItems 显示为固定一级“全局层”。
- surfaceLayerItems 只在需要时显示为“当前内容共用”，不得取代全局层。
- scene layerItems 是当前幻灯片内容。
- presentation.states 与 overrides 显示为画布下方状态条。
- CourseLocation 只作为内部导航事实，教师看到幻灯片、讲义位置、镜头或目录名称。
- 所有 Native、Runtime、Component 和教师控制器参加同一图层、命中和选择链。

普通教师界面不得出现：V8、V9、Surface、Native、Runtime、Component（专业开发区例外）、API、Manifest、Package ID、Layer Item ID、authoringAddress、targetId、revision、JSON Pointer、AI Patch 或尚未接入的 AI 引用按钮。

### 2.7 冻结数据迁移与运行架构

迁移采用“影子构建、单次切换”，不得大爆炸重写，也不得双写：

1. V9 document、history、location、selection、archive 和只读 View 先独立成立。
2. 兼容 View 只机械投影旧 UI 暂时需要的读取形状；不可写、不可持久化、不可进入 history/archive/export。
3. 每个旧 action 先有等价 V9 command，再切换对应原组件。
4. 启动参数只能选择一个 backend；一次操作绝不能同时写 V8/V9。
5. 原 useEditorStore 导入路径可以暂时保留以降低切换风险，但不得因此新增 Provider 生命周期。
6. Slide 合同成立后单次切换正式 V9 backend，再逐步删除无消费者的兼容层与 V8 默认 backend。

作者检查和试运行必须分离：

- AuthoringInspectHost 常驻编辑画布，只负责作者渲染、命中和稳定地址，不承担真实课程会话。
- TrialRunSession 从当前 V9 snapshot 构建 Published Course V2，从当前 location/state 启动，停止即销毁，不改 Project/history/revision/selection/viewport。
- FullPreviewWindow 复用现有 standalone HTML → openPreview → previewWindow 链。
- 禁止编辑 Host 原地切 inspect/playback、复用上次运行实例、让 Player 普通事件直接改编辑器，或从 Player DOM/Canvas 反序列化工程。

### 2.8 Donor 摘取边界

| 功能 | 允许参考/摘取 | 永久禁止 |
|---|---|---|
| V9 协议 | frame/runtime 收窄、Flow level、Spatial relations/zoom、Published label 的局部差异 | 整体覆盖 types/schema/model |
| Native factory | text → formula/shape → image → video → controller 逐项 | 整体复制大型 courseStudioModel |
| Slide Host | unified order、hit、capture、controller、interaction、media 的单项算法 | 复制 CourseSurfaceCanvas |
| Runtime/Component | mount、hit field、checkpoint、hot update 算法 | 复制强耦合 editor dynamic host |
| Flow | flowListStructure、纯 move model、Host/export 增量 | 复制 FlowBlockEditor UI |
| Spatial | viewport/zoom/relations 纯模型、Host/export 增量 | 复制 SpatialAuthoringPanels UI |
| 互动/声音 | 纯 model、Player controller/audio 增量 | 复制整套 Course Studio 面板 |
| 发布 | producer、consumer、schema 同时闭合 | 只改一端或整体替换 Published App |

以下文件或模块永远不能作为前端 donor：CourseStudioApp.tsx、CourseSurfaceCanvas.tsx、V9EditorShell.tsx、course-studio.css、CourseElementPalette、CourseLayerPanel、CourseSceneThumbnail、CourseSoundLibrary、SpatialAuthoringPanels、V9CourseLogicEditor、V9InteractionEditor、FlowBlockEditor、整套 CourseTransformOverlay UI、CourseStudioPlaybackSession。

K00 已经完成直接 V9 新工程 factory；不得再次为此复制 donor 模型。projectTypes.ts/projectSchema.ts 中被 V9 Native 内容实际复用的中性类型不能按文件名误删。

---

## 3. 给 Sol Ultra 的直接执行提示词

以下文本是从当前恢复点运行到 M8 的完整执行合同。Ultra 必须把它当成最高优先级的仓库内工作指令。

~~~text
你直接接管本仓库从 CURRENT_STAGE 到 M8 的全部工程工作。你同时负责架构判断、内部拆分、实现、测试、审查、Git、本地集成、Gate、失败恢复和计划状态更新。不要创建任务卡、Owner、协调者角色、交接协议、审批流程或额外治理文档；只维护必要的短期心智清单并持续执行。

先从第一原则确认当前里程碑的用户可见结果、不可妥协条件、真实约束和最短充分路径。现有代码只是候选路径，不是问题定义；但能够复用的成熟路径优先复用。

每次只推进当前里程碑中一个可运行、可二元判断的端到端结果。不要把 helper、Adapter、fixture、文档或测试单独拆成工作单元。完成一个结果后自行审查、提交并立即继续下一个结果；Gate 只是自动检查点，GO 后继续，NO-GO 后自行选择最短恢复路径，不等待用户确认。

严格限制过度设计：
- §2.4–§2.8 是机械硬约束，不得以“更现代”“更统一”“更容易测试”重新解释；任何方案触碰禁止结构立即放弃。
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
- 每次准备提交前检查相对 BASE_COMMIT 的 name-status；§2.4 文件出现 D/R、新 App/Shell/Workspace 或正式入口偏离原 App 时禁止提交。
- 保留用户和外部工具已有的未提交文件；不得用 reset、checkout 或 stash 抹掉它们。
- 当前 dirty diff 先逐项判断属于当前结果、失败实验或无关文件；只清理能够由证据判定的失败实验。
- 不得通过删除、弱化或改写 preservation verifier、behavior map、既有高价值测试或 golden 来让重写路线变绿。
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
| M1 | ecad7a17a36faab6c42916b0b291ef61ddff69c8 | 原 App 中 V9 text 的 Player、拖动、Undo/Redo、保存、完全重开与继续拖动闭环 |

产品 accepted cursor 是 M1。反重写 diff 基线仍固定为 BASE_COMMIT。

### 4.2 当前 M2 恢复点

M1 已完成并通过：

- 隔离 Player 文字随 move、Undo、Redo 同步，Phaser proxy 与 Player 视觉不分叉。
- 第一进程真实拖动、Undo/Redo、schemaVersion 9 保存；完全关闭后重开并继续拖动，revision=3 且稳定 ID 不变。
- typecheck、Renderer build、147 个测试文件/923 个测试、8 个 Agent Kit 测试、反重写门禁与 diff 检查通过。
- M1 产品提交为 `ecad7a17a36faab6c42916b0b291ef61ddff69c8`。

当前唯一未覆盖风险：精确 V9 backend 的顶栏生命周期控件、关闭 dirty、archive sidecar 和跨启动恢复已闭合，未接 V9 的工程检查/预览/导出已明确禁用；正式启动与左栏、状态条、右栏等其余原 UI 仍以 V8 Store 为真相源，M2 必须继续切到同一个 V9 document/history/archive，禁止双写或从兼容 View 反建工程。

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

### 5.9 机械能力验收清单

以下各行是里程碑完成前必须二元核对的产品事实，不是任务、执行顺序或提交单位。Ultra 不得因为实现路径不同而省略；若源码已具备，只需用最小证据确认，不重复实现。

#### V9 公共内核与文件生命周期

| 能力组 | 必须成立 |
|---|---|
| Factory | fixture、测试 producer 和产品新建都直接生成 V9；text、formula/shape、image、video、controller 逐类有直接 factory |
| Scope/order | global/surface/scene/world 有统一 scope/order command 与引用安全 |
| Slide scene | 新增、复制、排序、定位、重命名、删除和引用修复为原子操作 |
| Slide state | CRUD、initial、thumbnail、override、order 和引用修复为原子操作 |
| Flow model | block/list/location、0–5 层级与移动具有纯模型和引用修复 |
| Spatial model | world、relations、camera、path 与唯一 viewport 常量 |
| Mixed model | location、course state、guard 与跨表面 action 一致 |
| History/file | V9 history、dirty、archive new/open/save/reopen 完整；V8 只走显式迁移 |
| Publish | Published V2 producer/schema/label/assets 同时闭合，不能只改 producer 或 consumer |

#### 原 UI 数据切换

| 原组件/区域 | 必须成立 |
|---|---|
| TopToolbar | 文件、Undo/Redo、预览、导出走 V9；位置、快捷键和视觉密度不变 |
| ScenePanel/Thumbnail | 全局层仍是固定一级入口；幻灯片 CRUD、排序与缩略图状态走 V9 |
| SceneStateStrip | 基础/命名状态、initial/thumbnail 与原交互不变 |
| RightSidebar/tabs | 简洁/专业、元素、图层、属性、互动、开发继续使用原组件 |
| Properties | 原控件设计不重写；公共选择与提交边界写 V9 command |
| Workspace | 原 stageViewportTransform、Phaser bridge、选择、命中和变换手感继续工作 |
| App lifecycle | new/open/recent/save/save-as/dirty/recovery/title/current location 全走 V9 |
| Backend switch | 正式产品启动后只运行 V9；开发 flag 和临时兼容 facade 在无消费者后删除 |

#### Slide 成熟交互

| 能力组 | 必须成立 |
|---|---|
| 渲染 | text、shape、formula、image、video、Runtime、Component、controller 在原画布真实可见 |
| 命中 | 点选、稳定 layerItemId、Runtime/Component 内公开 field 命中 |
| 变换 | 鼠标移动、方向键微调、八向 resize、rotate、角度吸附；一次手势一次 history |
| 多选 | 框选、Shift 多选、锁定语义与批量变换 |
| 吸附 | 8px、中心、边缘吸附与 Alt 临时关闭 |
| 文字 | 双击编辑、富文本、IME、Ctrl+Enter/失焦提交、缩放下定位 |
| 图片/视频 | 命中、替换、裁切、导入、素材闭包和保存重开 |
| 公式/形状 | 原位或属性编辑，显示、Player 和导出一致 |
| 插入 | text/shape/formula 连续插入；image/video/Component 导入当前画布 |
| 图层 | Nodes 与画布选择双向同步；显隐、锁定、order、scope move、多选操作统一 |
| 幻灯片 | 新增、复制、排序、删除、重命名，缩略图使用 initial/thumbnail 有效状态 |
| 状态 | CRUD、设初始、设缩略图、override/order/background 与 base 可预测编辑 |
| 全局层 | 固定一级、切场景稳定、上下文灰化不可误选；当前内容共用不得取代全局层 |
| 字体样式 | 搜索、系统检测、完整列表、预览、自定义字体、颜色、高亮、背景/透明度/圆角和排版 |
| 剪贴板 | copy/paste/delete 后 interaction/state/order 引用正确修复 |
| 互动 | 原 InteractionEditor 的 click/scene/state/media/rule/trigger/action 写 V9 |
| 控制器 | 原 PresenterSettings 作者属性与恢复；编辑态只选中/变换，按钮不执行导航 |

#### Player、专业开发与课程逻辑

| 能力组 | 必须成立 |
|---|---|
| Player lifecycle | 从当前 location/state 新建隔离 Published Player；停止、restart、连续运行无泄漏 |
| 编辑隔离 | 运行不改变 Project、history、selection、viewport；编辑 Host 不切 playback |
| 控制器运行 | 导航、收展、目录、静音、全屏在 Player 正确工作 |
| Snapshot | 默认不回写；显式保存时只写结构化可作者状态，一次事务；不支持动态状态用中文说明 |
| DeveloperTab | 继续使用原 DeveloperTab，选择来自 V9，保留 Runtime/Object/Rules/Component 区域 |
| Runtime | API 2/3 source 校验、编辑、撤销、content、assets、fallback、错误、作者预览和公开地址 |
| Component | API 4 manifest/runtime/props/assets/static preview、包校验、内部命中、hot update/checkpoint |
| 声音媒体 | 原媒体区课程声音库、试听、用途与删除引用保护 |
| 课程逻辑 | variables、conditions、navigation guards、global interactions 与跨表面 action |
| 诊断 | 面向教师的中文错误与发布差异；内部详情折叠；普通 UI 不出现 AI 入口 |

#### Flow

| 能力组 | 必须成立 |
|---|---|
| 壳层位置 | 使用原壳左侧大纲和中央内容区，不成为新 App/Shell |
| 内容 | 段落、标题、引用、提示、列表、0–5 层级、表格、公式 |
| 媒体 | 图片、音频、视频、Component 和分节 |
| 编辑 | 画布直接编辑与属性面板同步；缩进/减少缩进；跨节真实鼠标拖动一次 history |
| 稳定性 | 失焦不取消正在进行的手势；保存重开结构与位置一致 |
| 统一层 | global/surface 浮动层、教师控制器和 scope |
| Player/export | 隔离 Flow Player、当前位置导航、HTML/PDF 与 DOCX 语义列表/表格/公式/媒体后备 |

#### Spatial

| 能力组 | 必须成立 |
|---|---|
| 坐标 | 原壳中央区只有一个 world↔screen 变换，支持 pan/zoom/fit |
| 编辑 | 点选、框选、多选、move、resize、rotate、text edit |
| 关系 | relation、label、普通/箭头连线 |
| 镜头 | 首页、镜头新增/定位/重命名/排序/删除 |
| 路径 | 教学路径、小地图和语义缩放 |
| 统一层 | global/surface/world 图层与教师控制器 |
| Player/export | location/camera 一致的隔离 Player；HTML/PDF/PPTX 的 effective layer 与静态排除规则一致 |

#### Mixed、质量与清理

| 能力组 | 必须成立 |
|---|---|
| Navigation | Slide→Flow→Spatial 的 CourseLocation 导航 |
| Cross-surface | global layer/controller visibility、course state、guard、action 与当前 location 一致 |
| Reopen | 保存、完全关闭、重开后 location/state/camera/reference 一致 |
| Whole-course | 整课隔离 Player 与 restart |
| Export | HTML、网页包、PDF、PPTX、DOCX；capture 不污染编辑 Project 或运行会话 |
| Behavior | 原高价值行为全部 keep 或有明确 replacement；不得静默删除 |
| Visual | 原壳结构、字体、状态条、控制器和三档布局在 M8 机械通过 |
| Samples | 至少一份覆盖 Slide/Flow/Spatial/Mixed 的真实课例完成构建、保存重开、Player 与五类导出 |
| Reachability | 原 App 唯一正式入口；CourseStudio 失败前端和替代测试按可达性簇删除 |
| Legacy | V8 默认编辑真相源和 Published V1 临时路径删除；显式 V8 导入与 Runtime 2/3 兼容保留 |

---

## 6. 验证预算

### 6.1 反重写机械门禁

以下资产已在 G02–G04 建立并冻结：

- scripts/verify-editor-preservation.ts
- tests/contracts/v8-behavior-map.json
- 原 V8 壳层三尺寸 golden 与 geometry 证据
- verifier 的三个必失败负例：删除 Workspace、新增 ConvergedEditorApp、ProductApp 重新导入 CourseStudioApp

verifier 必须继续机械断言：

1. §2.4 核心文件相对 BASE_COMMIT 不得出现 D 或 R。
2. 不存在 converged/**、替代 studio/**、新 *EditorApp/*EditorShell 或新 Slide Workspace。
3. ProductApp → 原 App → TopToolbar/ScenePanel/Workspace/SceneStateStrip/RightSidebar 正式可达。
4. CourseStudioApp、V9EditorShell、CourseSurfaceCanvas 在正式产品 import graph 中不可达。
5. .app-shell、顶部、左栏、中央、canvas viewport、canvas stage、状态条、右栏和底部状态栏同时存在。
6. 1280×720 逻辑画布以及 1366×768、1920×1080 壳层不存在页面级溢出或区域遮挡。
7. 壳层 golden 通过；动态画布区只能使用既有 mask。
8. tests 中不存在 .skip、.todo、.only。
9. behavior map 中没有未映射删除。

Ultra 不得删除、弱化或绕过 verifier 和负例。behavior map 只有在旧行为被当前产品协议明确退休且已有 replacement test 时才可改，并必须记录原因；golden 不得为了接受新壳而更新。

### 6.2 原高价值行为测试

| 既有测试 | 必须继续保护的合同 |
|---|---|
| tests/unit/editorStore.test.ts | scene/layer/state/history/native CRUD、一次变换一次历史、剪贴板 |
| globalEditorStore.test.ts | 全局层、控制器、作用范围、全局互动 |
| globalLayerUi.test.tsx | 固定全局入口、场景切换、全局组件/属性 |
| sceneStateUi.test.tsx | 状态条、状态角色、覆盖、缩略图状态 |
| stageViewportTransform.test.ts | 1280×720、50%–200%、fit、pan、坐标换算 |
| editorFormattingUi.test.tsx | 字体、背景、富文本、IME、缩放下编辑 |
| simpleEditorMode.test.tsx | 简洁/专业模式与渐进显示 |
| developerMode.test.tsx | Runtime/Component 开发工作区与历史 |
| mediaTab.test.tsx | 素材、声音、视频与音频设置 |
| componentPropertiesEditor.test.tsx | Component props、preset、嵌套内容 |
| presenterSettingsUi.test.tsx | 教师控制器、快捷键、修复入口 |
| interactionEditor.test.tsx | 互动、动作、规则、场景/状态/媒体 |

保留原 describe/it 的行为含义，只替换 V9 fixture、Store 或 Adapter。不得删除或弱化断言来适配新实现；Runtime API 2/3 兼容必须保留。Flow/Spatial/Mixed 是新增能力，可新增专属测试，但不能建立一套与原 UI 隔离的平行自证体系。

### 6.3 实现循环

- 一个连贯修改后只跑 1–3 个最相关检查。
- 失败先读首次证据；代码未变化不重跑。
- 只在类型边界变化时 typecheck。
- 只构建受影响 bundle。
- UI 只跑一个主视口和一条真实指针路径。
- 临时日志、测试诊断或 instrumentation 在提交前删除。

### 6.4 阶段 Gate

GATE-V、GATE-S、GATE-FEATURES 各自只做：

1. 当前阶段定向测试。
2. typecheck 和受影响 build。
3. 一条代表性真实 Electron 路径。
4. 一次 npm test。
5. git diff --check 与范围审查。
6. 本阶段触及 App/ui/Workspace/Phaser/CSS、ProductApp 或正式 import graph 时运行一次 verify:editor-preservation。

如果同一 SHA 上已有等价绿色证据，直接复用，不为 Gate 重跑。

### 6.5 M8 最终验证

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
