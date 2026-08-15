# Courseware 产品开发总纲

> PLAN_VERSION: 6.0
> DATE: 2026-08-15
> ROLE: 本仓库唯一长期开发计划
> CURRENT_STAGE: M3 / 完成 Slide 作者闭环
> CURRENT_PRODUCT_CHECKPOINT: b6d1787875339fff8ba03d80cfbf80187c009caa
> CURRENT_PLAN_CHECKPOINT: 8b4513c
> BASE_COMMIT: 3e41ec058627d38c4b9f5439b454cc72331e1485
> V9_DONOR_COMMIT: f77ba9e477f9cb496e3219eb58babdb4f4becf7d
> PRODUCT_PROTOCOL: Course Project V9 / Published Course V2 / Runtime API 2/3 / Component API 4
> STATUS: implementation-active

本文件只维护长期目标、不可违背的产品合同、当前阶段、阶段入口和验证预算。详细实施放在从属阶段计划中；从属计划不得修改本文件的产品合同。

事实优先级如下：用户明确要求与 `AGENTS.md` → 当前源码、Schema 和可复现证据 → 本总纲 → 当前阶段计划 → 项目认知索引。认知索引用于导航，不是第二真相源。

## 1. 最终目标

在真实存在的原 App、UI、Workspace、Phaser 画布与 CSS 中原地换入 V9 数据和运行内核，使教师继续使用熟悉的产品，同时获得：

1. Course Project V9 是唯一可写、可保存、可发布的工程真相源。
2. Published Course V2、Runtime API 2/3 兼容和 Component API 4 成为真实运行合同。
3. Slide、Flow、Spatial 与 Mixed 完成编辑、保存重开、隔离 Player 和发布导出闭环。
4. 原 App 是唯一正式入口；Project V8 只用于显式导入迁移和必要兼容测试。
5. 普通教师界面不暴露协议术语、内部 ID 或未接入的占位入口。
6. 文档、Builder skill、Agent Kit 能力卡与最终可达产品一致。
7. 自动化最多证明 `engineering candidate`；具体课例经真实视觉和互动复核才可称 `art candidate`，`accepted` 必须来自教师明确验收。

## 2. 不可违背的产品合同

### 2.1 原壳原地升级

必须继续使用正式调用链中的原文件：

- `src/renderer/App.tsx`
- `src/renderer/ProductApp.tsx`，且它只能进入同一个原 App
- `src/renderer/ui/TopToolbar.tsx`
- `src/renderer/ui/ScenePanel.tsx`
- `src/renderer/ui/SceneThumbnail.tsx`
- `src/renderer/ui/Workspace.tsx`
- `src/renderer/ui/SceneStateStrip.tsx`
- `src/renderer/ui/RightSidebar.tsx`
- `src/renderer/ui/ElementsTab.tsx`
- `src/renderer/ui/NodesTab.tsx`
- `src/renderer/ui/PropertiesTab.tsx`
- `src/renderer/ui/ComponentsTab.tsx`
- `src/renderer/ui/AutomationTab.tsx`
- `src/renderer/ui/DeveloperTab.tsx`
- `src/renderer/ui/PresenterSettingsEditor.tsx`
- `src/renderer/authoring/stageViewportTransform.ts`
- `src/renderer/phaser/**`
- `src/renderer/styles/globals.css`

永久禁止：

- 新建第二套 App、Shell、Store、Slide Workspace 或产品入口。
- 让 `CourseStudioApp`、`CourseSurfaceCanvas`、`V9EditorShell` 或 donor 前端重新进入正式 import graph。
- 复制 donor 的整套 UI、Store、Canvas、Playback Session 或 CSS。
- 为测试增加只在测试中成立的视觉层、DOM 覆盖层或第二 Player。
- 从只读 View 反建 V9 工程，或同步写 V8/V9 两份工程。
- 用 `src/renderer/converged/**`、替代性 `src/renderer/studio/**`、新 `*EditorApp`、新 `*EditorShell` 包装重写。

Flow 和 Spatial 可以在原中央编辑区使用适合自身语义的内容工作区，但不能成为新产品壳，也不能反向破坏 Slide 的成熟画布交互。

### 2.2 单一数据与运行真相

- Course Project V9 是唯一写入源。
- Editor View、Workspace 输入和 Player payload 都是 V9 的只读投影。
- Phaser proxy 只负责命中、选择和几何变换；隔离 Player 是视觉真相。
- 一次用户操作只产生一次 command、一次 history 和一次 revision。
- 保存、Undo/Redo、选择和 dirty 以真实工程对象与稳定 ID 为准；临时 `hitId` 不能代替 `authoringAddress`。
- Native、Runtime、Component、全局项和教师控制器进入同一图层顺序。
- Runtime/Component 的可编辑文字必须、普通可替换图片应当公开稳定作者目标。
- Project V8 只能显式迁移到 V9，不能成为新建或继续编辑的默认真相。

### 2.3 作者检查、试运行与整课预览分离

- `AuthoringInspectHost` 常驻编辑画布，只负责作者渲染、命中和稳定地址，不承担真实课程会话。
- `TrialRunSession` 从当前 V9 snapshot 构建 Published Course V2，从当前 location/state 启动；停止即销毁，不改 Project、history、revision、selection 或 viewport。
- `FullPreviewWindow` 复用现有 standalone HTML → `openPreview` → previewWindow 链。
- 禁止把编辑 Host 原地切换成 playback、复用上次运行实例、让 Player 普通事件直接改编辑工程，或从 Player DOM/Canvas 反序列化工程。

### 2.4 教师可见交互合同

| 区域 | 必须保留的行为 |
|---|---|
| 顶部 | 新建、打开、保存、撤销、重做、当前位置试运行、整课预览、导出；不随意改变顺序和密度 |
| 左侧 | 固定一级“全局层”；幻灯片缩略图；场景排序、重命名、复制、删除；有内容时显示“当前内容共用” |
| 中央 | 1280×720 Slide 逻辑画布；缩放、平移、点选、框选、Shift 多选、移动、八向缩放、旋转、方向键微调、双击编辑、吸附 |
| 状态条 | 基础画面与命名状态始终在画布下方；新增、复制、重命名、设初始、设缩略图、删除 |
| 右侧 | 简洁/专业模式；元素、图层、属性；专业模式中的互动与开发 |
| 开发 | Runtime 源码/内容/素材、Component manifest/runtime/props、Object/Rules JSON、校验、错误和预览 |
| 教师控制器 | 全局层中的真实作者对象；可编辑、可恢复；编辑态按钮不执行，试运行中正确导航、收展和移动 |
| 底部状态 | 状态、选择、缩放、dirty 与错误可见；普通错误不暴露内部标识 |

冻结区域必须在 1280×720、1366×768、1920×1080 三档窗口及简洁/专业模式中留在可视区。侧栏只能在自身滚动，不能撑高 App 壳并挤出场景状态条、缩放控件或底部状态栏。

教师看到“幻灯片”“全局层”“当前内容共用”“基础画面/命名状态”，不看到 V8、V9、Surface、Native、Runtime、Component（专业开发区例外）、API、Manifest、Package ID、Layer Item ID、authoringAddress、targetId、revision、JSON Pointer、AI Patch。

### 2.5 迁移与兼容边界

- 迁移采用影子构建、逐簇切换和一次正式切换，不做大爆炸重写，也不双写。
- V9 command 先于旧 UI 接线；兼容 View 只读，不能进入 history、archive、export。
- 原 `useEditorStore` 导入路径可以保留以降低迁移风险，但同一个 Store 内只能有一个当前工程真相。
- donor 只能摘取纯模型或单项算法，不能成为前端母体。
- `projectTypes.ts`、`projectSchema.ts` 中被 V9 Native 内容实际复用的中性类型不能因文件名带 V8 而误删。
- 默认不增加依赖，不改 package/lockfile、Schema 或 IPC；确实无法在既有能力上完成时，先取得用户授权。

## 3. 当前恢复点

### 3.1 已集成检查点

| 检查点 | SHA | 已成立事实 |
|---|---|---|
| G00–G05 | `8c7a530` … `dc190ed` | 原工程、视觉、行为与反重写基线；原 App 唯一入口 |
| K00 | `eb00ed2` | 直接 V9 新工程 factory |
| V01–V04 | `cf01dda` … `62cd1a4` | Slide 只读投影、稳定选择/移动、Workspace 窄注入、单 backend |
| M1 | `ecad7a1` | V9 text 的 Player、拖动、Undo/Redo、保存、完全重开和继续拖动 |
| M2-A–M2-D | `77a7a79` … `e04d017` | V9 生命周期和 Store 所有权；原壳高度、状态栏、场景与状态 UI |
| M2-E–M2-H | `b010947` … `cc8c6c4` | 场景 Native、Properties、默认 V9、导出、全局控制器和工程检查 |
| M2 | `cc8c6c4` | 默认 V9 单写生命周期及原壳主要区域 Gate |
| M3-A | `b6d1787` | surface Native 作者闭环、共享显示、统一顺序、陈旧目标拒绝和保存重开 |

产品 accepted cursor 仍是 M1。反重写 diff 基线固定为 `BASE_COMMIT`，不能随阶段移动。

### 3.2 当前已成立事实

- 原 `editorStore` 单一持有 V9 document/history/archive/session；文件生命周期、标题、dirty、关闭和恢复不再以隐藏 V8 工程为真相。
- 原 ScenePanel、SceneStateStrip、底部状态栏、Elements、Nodes、Properties 与 Workspace 的已接能力共用同一 V9 session。
- 场景/状态 CRUD、text/formula/shape、场景/全局/surface Native、选择、多选变换和属性编辑保持一操作一历史。
- 默认入口创建 V9；普通 Open/Recent 只接受 V9；旧工程经显式迁移并强制另存。
- 原顶栏已接通工程检查、整课预览、HTML、网页包和基础 PPTX；PDF、DOCX 仍在后续发布阶段闭合。
- 编辑态只显示工程内教师控制器；全局控制器可选择、缩放下移动、Undo/Redo、保存重开。
- Published V2 已移除废弃的画布外 `.course-nav` 底栏。

### 3.3 当前首要 P1：新增元素后壳层上弹并露出底部黑区

观察到：在默认编辑器添加元素后，中央画布和主区域向上跳动，底部状态栏下方出现大块黑色页面区域。截图表明黑区位于应用壳之后，不属于课件画布内容。

当前只登记事实，不预判根因。优先核对 `html/body/#root/.app-shell/.app-main` 的高度、grid min-content、页面滚动以及新增元素触发的重排。

修复验收：

1. 添加 text/formula/shape 前后，App 壳和底部状态栏都贴合窗口底部，不出现页面级黑区。
2. 画布、状态条、缩放控件与底部状态栏不发生非预期纵向跳动。
3. 页面本身无滚动；右栏或状态列表只在自身容器滚动。
4. 1280×720、1366×768、1920×1080 至少在阶段 Gate 覆盖；修复循环只用一个复现视口。
5. 不改变 Project、history、selection、dirty 或保存语义。

首次诊断只采集添加前后的 `window.innerHeight` 以及 html、body、root、app-shell、app-main、workspace、state strip、status bar 的 bounding rect/scrollHeight，不先扩大到全量 E2E。

## 4. 阶段计划

| 阶段 | 状态 | 从属计划 | 结果 Gate |
|---|---|---|---|
| M1 | 完成 | 本文件检查点 | 最小 V9 Slide 保存重开闭环 |
| M2 | 完成 | 本文件检查点 | 默认 V9 单写生命周期与原壳主要区域 |
| M3 | 进行中 | [Slide 作者闭环](docs/plans/M3_SLIDE_AUTHORING_PLAN.md) | Native/媒体/互动/作者目标与真实试运行 |
| M4 | 未开始 | [Player、Runtime 与 Component](docs/plans/M4_PLAYER_RUNTIME_COMPONENT_PLAN.md) | 隔离 Player、课程逻辑、动态载体与控制器运行合同 |
| M5–M6 | 未开始 | [Flow 与 Spatial](docs/plans/M5_M6_FLOW_SPATIAL_PLAN.md) | 两类表面的编辑、Player、保存重开与导出 |
| M7–M8 | 未开始 | [发布与最终收敛](docs/plans/M7_M8_DELIVERY_HARDENING_PLAN.md) | Mixed、五类导出、文档能力卡和最终 Gate |

阶段计划是当前阶段的实施说明，不是新的治理体系。阶段内只维护结果、依赖、最短纵切、验收和剩余风险；不创建任务卡、Owner、审批状态或平行路线图。

## 5. 里程碑完成定义

### M3 — 完整 Slide 作者闭环

- 原壳上弹/底部黑区 P1 已修复。
- text、formula、shape、image、video、背景和教师控制器可在原 Workspace 作者链中工作。
- global/surface/scene 统一 scope、order、visibility、lock 和稳定选择。
- Scene、状态、变换、属性、字体、IME、互动和媒体保持一操作一历史。
- Runtime/Component 的可作者目标进入统一图层，不用构建脚本绕行。
- `scene.interactions` 的 Native 点击、条件和 action 在隔离 Player 与最小 Published Slide 中真实执行。
- “当前位置试运行”使用独立 Published snapshot，会话停止即销毁。

### M4 — Player、Runtime、Component 与课程逻辑

- Runtime API 2/3 与 Component API 4 的加载、通信、作者目标、checkpoint、hot update 和释放成立。
- location/state/guard/controller 在独立试运行中成立，不污染编辑工程。
- Slide 教师控制器完成导航、收展、session-only 移动、目录、重播、静音和全屏；Flow/Spatial 后续复用同一运行合同。
- 互动事件、媒体、动作链、课程重启和恢复具有单一运行 owner。

### M5 — Flow

- Flow 语义结构、层级、表格、公式、媒体、统一图层、稳定选择、属性、状态和互动成立。
- Player、保存重开以及 HTML/PDF/DOCX 的 Flow 路径成立。

### M6 — Spatial

- Spatial pan/zoom、选择、变换、关系、镜头、路径、小地图、状态和互动成立。
- world 内容接受 camera transform；全局教师控制器使用 viewport/session 坐标，不随世界平移缩放。
- Player、保存重开和导出成立。

### M7 — Mixed 与发布导出

- Mixed 跨表面 location/state/guard/controller 成立。
- Published Course V2 是真实整课 Player；HTML/网页包不注入废弃外层导航。
- HTML、网页包、PDF、PPTX、DOCX 各有一个真实样例。

### M8 — 最终收敛

- ProductApp 只有原 App 一个入口；默认编辑、保存和发布只有 Course Project V9。
- V8 只保留显式导入和必要兼容测试；失败前端、不可达占位和旧顶层协议断开。
- 普通教师 UI 去除内部协议词和无效入口。
- docs、USER_GUIDE、Builder skill、Agent Kit 能力卡与可达产品一致。
- 给出真实 outcome 等级；教师未明确验收前不得写 `accepted`。

## 6. 验证预算

验证是风险控制，不是工作量证明。同一 SHA 的等价绿色证据直接复用；代码、环境和失败条件未变化时不得重复运行。

### L0 — 文档或索引变更

只运行：

1. Markdown 链接和真实路径检查。
2. JSON 解析。
3. `git diff --check` 与范围审查。

不运行 typecheck、build、Vitest、Electron 或视觉 Gate。

### L1 — 开发循环

- 一个连贯修改默认只跑 1 个最相关命令；只有首个命令不能覆盖改动时才增加第 2 个。
- 只有导出类型、Schema、IPC 或跨包接口变化时才跑相关 typecheck。
- 只构建受影响 bundle。
- UI 调试只用一个主视口和一条真实指针路径。
- E2E 失败后先读首份 trace/截图，只定向复跑一次；不得转为全套测试碰运气。

### L2 — 可提交纵切

只要求：

1. 该纵切的定向单测。
2. 受影响类型边界或 bundle 的检查（确实涉及才运行）。
3. 用户可见路径最多一条代表性 Electron E2E。
4. `git diff --check`、临时诊断清理和范围审查。

默认不运行 `npm test`、全量 Electron、三尺寸视觉或 preservation visual。

### L3 — 阶段 Gate

每个阶段、每个最终 SHA 只运行一次：

1. 当前阶段定向测试。
2. `npm run typecheck` 和受影响 build。
3. 一条代表性 Electron 路径。
4. `npm test`。
5. 仅在触及 App/ui/Workspace/Phaser/CSS、ProductApp 或正式 import graph 时运行 preservation；仅在布局相关时运行三尺寸 visual。
6. `git diff --check` 与仓库卫生检查。

### L4 — M8 最终验证

只在 M8 运行一次最终集合：全量测试、typecheck、相关 Renderer/Player/Electron build、反重写 Gate、最终 Electron、必要的三尺寸视觉、archive/Published/Runtime/Component 与五类导出。

不得为了“更放心”追加第二轮全量、另一浏览器工具、平行审计或重复截图。若 M7 后相关代码未变，M8 复用 M7 的发布证据。

## 7. 反重写与停止条件

`scripts/verify-editor-preservation.ts`、`tests/contracts/v8-behavior-map.json` 和冻结视觉基线不得被删除、弱化或用测试入口旁路。behavior map 只有在旧行为被产品协议明确退休且已有 replacement test 时才能更新；golden 不能为了接受新壳而修改。

开发只在以下情况停下并请求用户决定：

1. 需要新增依赖、付费能力或仓库外操作。
2. 必须执行不可恢复的破坏性操作。
3. 权限阻止继续。
4. 产品合同内部不可调和，且已有最小证据证明不存在安全路径。

普通测试失败、复杂 bug、相邻文件需求或阶段 NO-GO 不是停止条件；应回到首次证据并选择最短安全路径。

## 8. 接手入口

新 Agent 依次阅读：

1. [`AGENTS.md`](AGENTS.md)
2. 本总纲的当前恢复点与产品合同
3. 当前 [M3 阶段计划](docs/plans/M3_SLIDE_AUTHORING_PLAN.md)
4. [`PROJECT_COGNITION_INDEX.md`](PROJECT_COGNITION_INDEX.md)
5. `git status --short` 与任务相关源码

不要先读全仓库、全量测试或 donor 前端；先从认知索引的“改什么看哪里”进入实际代码。
