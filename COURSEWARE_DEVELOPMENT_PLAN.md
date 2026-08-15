# Courseware 产品开发总纲

> PLAN_VERSION: 7.0
> DATE: 2026-08-15
> ROLE: 本仓库唯一长期开发计划
> EXECUTION_MODE: 并行 Agent 集群（唯一协调者 + 多执行者 + 单一集成主线）
> CURRENT_STAGE: M5/M6 / Flow 与 Spatial 并行
> CURRENT_PRODUCT_CHECKPOINT: 7f04a8a（M4 Gate）
> CURRENT_PLAN_CHECKPOINT: 8b4513c
> BASE_COMMIT: 3e41ec058627d38c4b9f5439b454cc72331e1485
> V9_DONOR_COMMIT: f77ba9e477f9cb496e3219eb58babdb4f4becf7d
> PRODUCT_PROTOCOL: Course Project V9 / Published Course V2 / Runtime API 2/3 / Component API 4
> STATUS: implementation-active

本文件维护长期目标、不可违背的产品合同、并行任务模式、当前任务板、集成 Gate 与验证预算。详细实施说明放在从属阶段计划中；从属计划不得修改本文件的产品合同与集成协议。

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
| M3 | `6361641` | 完整 Slide 作者闭环：media/text/背景作者链、原子 IME 事务、互动/开发 UI 接 V9、动态作者目标入统一图层、一次手势一次 history、M3 Gate 全证据通过 |
| M4 | `7f04a8a` | Player/Runtime/Component 与课程逻辑：Published Slide 会话生命周期、教师控制器运行合同、Runtime API 2/3、Component API 4、课程状态与恢复单一 owner、M4 Gate 全证据通过 |

产品 accepted cursor 仍是 M1。反重写 diff 基线固定为 `BASE_COMMIT`，不能随阶段移动。

### 3.2 当前已成立事实

- 原 `editorStore` 单一持有 V9 document/history/archive/session；文件生命周期、标题、dirty、关闭和恢复不再以隐藏 V8 工程为真相。
- 原 ScenePanel、SceneStateStrip、底部状态栏、Elements、Nodes、Properties 与 Workspace 的已接能力共用同一 V9 session。
- 场景/状态 CRUD、text/formula/shape、场景/全局/surface Native、选择、多选变换和属性编辑保持一操作一历史。
- 默认入口创建 V9；普通 Open/Recent 只接受 V9；旧工程经显式迁移并强制另存。
- 原顶栏已接通工程检查、整课预览、HTML、网页包和基础 PPTX；PDF、DOCX 仍在后续发布阶段闭合。
- 编辑态只显示工程内教师控制器；全局控制器可选择、缩放下移动、Undo/Redo、保存重开。
- Published V2 已移除废弃的画布外 `.course-nav` 底栏。
- App 壳在 1280×720、1366×768、1920×1080 三档视口贴合窗口；新增元素后无壳层跳动、页面滚动或底部黑区。

### 3.4 M3 Gate 已通过（2026-08-15，`6361641`）

- image/video 插入、素材引用、稳定选择、通用属性、场景背景颜色/素材与保存重开成立（T-IMG）。
- text 画布编辑/富文本/IME 事务一次编辑一次 history，session 绑定 authoring 引用、任何文档变更即失效防串写（T-TEXT）。
- formula/shape/media 属性与 Workspace 视觉同步；resize/rotate/多选/方向键一次手势一次 history，scene/surface/global 与命名状态一致（T-GEST）。
- Runtime/Component 作者目标进入统一图层：稳定 authoringAddress、编辑态与 Phaser proxy 共用同一 V9 只读事实、不投影成假 Native（T-RTGT）。
- Interaction/Automation/Developer/Components 四 Tab 接 V9 command；可达按钮真实执行或明确禁用，不静默写 V8（T-IUI）。
- Published Slide 会话生命周期统一：真实 await 异步 action、失败停链并报教师安全错误、scene/presentation exit/enter 事件、video 媒体事件、WAAPI motion（T-PSES）。
- Runtime API 2/3 编辑宿主链（create 失败清理、API 2 dom 重挂、API 3 capture/checkpoint 屏障）与 Component API 4 全链（多版本显式拒绝、props/hot update 不重建无关实例、fallback/thumbnail/实跑职责分离）成立（T-RT/T-COMP）。
- L3 证据：M3 定向测试、typecheck、受影响 build、代表性 Electron（几何三档 + 试运行 3 条）、`npm test`、preservation 门禁全部通过。

### 3.3 已关闭 P1：新增元素后壳层上弹并露出底部黑区

根因（2026-08-15 经几何诊断确认）：`ProductApp.tsx` 在 `#root` 与 `.app-shell` 之间引入匿名包装 `div`，断开 html → body → #root → 壳的 100% 高度链；`.app-shell` 退化为内容高度（`min-height: 720px` 兜底），视口更高时底部露出窗口背景色，新增元素改变右栏内容高度导致壳纵向跳动。页面无滚动，根节点高度正常。

修复：ProductApp 直接渲染原 App，不加任何包装元素；`v9SlideVerticalSlice` Electron 路径新增 `expectAppShellFillsViewport` 几何断言，断言添加元素前后壳顶对齐视口顶、壳与底部状态栏贴合视口底、`scrollY` 为 0。

已验证：1280×720、1366×768、1920×1080 三档视口添加 text/rectangle/formula 前后壳与底部状态栏贴合窗口底部、几何不变、页面无滚动；工程、history、selection、dirty 与保存语义不受影响。当前无登记的 P1。

### 3.5 M4 Gate 已通过（2026-08-15，`7f04a8a`）

- Published Slide 会话生命周期统一：session 创建/切换/销毁、稳定 layer item 事件、scene/presentation enter/exit、计时/媒体/motion 完成事件、异步 action 真实 await、失败停链并报教师安全错误（T-PSES）。
- 教师控制器运行合同：收展/进度/目录/静音/全屏与状态标签、session-only 拖动与 Alt+方向键、点击拖拽互斥、收起命中收缩、`controls:none` 隐藏、destroy/restart 恢复默认、教师动作单一 owner 管线（T-CTRL）。
- Runtime API 2/3：加载/通信/资源访问/错误隔离/destroy、作者目标、hit field、状态热更新、capture/checkpoint 屏障、API 2/3 各真实路径测试（T-RT）。
- Component API 4：package/版本/manifest/runtime/props/preset/资源加载、多版本显式拒绝、props/hot update 不重建无关实例、fallback/thumbnail/实跑职责分离（T-COMP）。
- 课程状态与恢复：CourseLocation/state/guard/controller 同一课程状态、replay 单语义单元单次进入、restart 整课重置、会话状态不写 archive、checkpoint 不产生 history/dirty、Trial/Preview/HTML 隔离销毁无泄漏（T-CSTATE）。
- L3 证据：M4 定向测试、typecheck、build:player、代表性 Electron 3 条、`npm test`、preservation 门禁全部通过。

## 4. 并行任务模式

开发不再按阶段串行推进，而是由唯一协调者把阶段完成定义拆成任务单元，多执行者并行交付，按依赖序集成进单一主线。阶段 Gate 保留为唯一验收标准，但不再是执行链。

### 4.1 角色

- **协调者（唯一）**：维护 §4.5 任务板，派发任务，声明和调整文件所有权，持有唯一主线集成权，裁决冲突，运行集成 Gate。只有协调者可以改本文件；执行者不得改任务板，不得直接向主线落代码。
- **执行者（多个）**：一个执行者同一时刻只持一个任务单元，只在该任务 owns 范围内工作，完成后向协调者交付分支 diff、L2 证据和范围声明。执行者之间不互相等待、不互相 rebase。
- 教师验收不变：`accepted` 仍只来自教师明确验收。

### 4.2 任务单元

每个任务单元必须在 §4.5 登记：ID、目标、供给的 Gate、依赖、owns 路径集、验证级别、状态（`pending` / `dispatched` / `integrated`）。任务口径直接从从属阶段计划的对应小节切出，不自创范围；执行中发现必要的新工作时只登记建议，由协调者入库后再派发。任务单元是最小可独立验证纵切，不是任务卡流程，不设 Owner 头衔、审批状态机或平行路线图。

### 4.3 文件所有权与共享区

- 同一文件同一时刻只允许一个活跃任务深改；派发前协调者按 owns 集合做交集检查。
- 共享热点文件（`Workspace.tsx`、`editorStore`、`PropertiesTab.tsx`、`globals.css`、`PublishedCourseApp.ts`、`SlideSurfaceHost.ts` 等正式调用链文件）只允许窄接口增量；两个任务同时需要同一共享文件时，协调者串行派发，或由协调者亲自完成共享部分后再放行。
- 测试文件随任务 owns 走；`tests/contracts/**`、冻结视觉基线与 `scripts/verify-editor-preservation.ts` 属反重写禁区，任何任务不得改写。

### 4.4 隔离与集成

- 每个任务一个 worktree：`output/worktrees/<task-id>`，分支 `task/<task-id>`，从登记时的主线 SHA 切出。
- 执行者交付 = 分支 diff + 定向 L2 证据 + 范围声明；协调者先审范围，再验证证据。
- 协调者按依赖序集成：互不触及的批次可同时评审，但串行落主线；每落一批跑受影响定向测试。
- 冲突由协调者回源裁决：以已集成主线为准，被推翻的一方基于新主线重派，不在主线之外长期分叉。

### 4.5 当前任务板

可立即并行派发（依赖已满足，owns 两两无交集；标 ★ 者属后续阶段供给，与 M3 在途任务无文件交集，前置并行）：

| ID | 目标（口径见从属计划） | 供给 | 依赖 | owns | 状态 |
|---|---|---|---|---|---|
| T-IMG | image/video 插入、素材引用、稳定选择、通用属性、保存重开；场景背景颜色与背景素材（M3-B3.1/2） | M3 | 无 | 媒体作者链与对应测试 | integrated |
| T-TEXT | text 正文/富文本/IME 事务，一次编辑一次 history（M3-B3.3） | M3 | 无 | 文本编辑链与对应测试 | integrated |
| T-RTGT | Runtime/Component 作者目标进入统一图层（M3-B4） | M3 | 无 | authoring host、hit/address 映射、Nodes/Properties 窄边界 | integrated |
| T-IUI | 原 Interaction/Automation/Developer/Components 逐项接 V9（M3-B5） | M3 | 无 | 右栏四个 Tab 与对应 commands | integrated |
| T-GEST | formula/shape/media 属性视觉同步；resize/rotate/多选/方向键跨 scope/state 一次手势一次 history（M3-B3.4/5） | M3 | T-IMG、T-TEXT | 手势/属性同步链与对应测试 | integrated |
| T-PSES ★ | Published Slide 会话生命周期统一（M4-A） | M4 | 无（M3-B1/B2 已集成） | `src/player/**` Slide 会话链 | integrated |
| T-RT ★ | Runtime API 2/3 全链（M4-C） | M4 | 无 | Runtime host 链与对应测试 | integrated |
| T-COMP ★ | Component API 4 全链（M4-D） | M4 | 无 | Component host 链与对应测试 | integrated |

依赖队列（条件满足后由协调者派发）：

| ID | 目标 | 供给 | 依赖 | 状态 |
|---|---|---|---|---|
| T-CTRL | 教师控制器运行合同（M4-B） | M4 | T-PSES | integrated |
| T-CSTATE | 课程状态与恢复（M4-E） | M4 | T-PSES、T-CTRL | integrated |

M5/M6 任务板（协调者已按 §4.5 规范拆出并登记）：

| ID | 目标（口径见从属计划） | 供给 | 依赖 | owns | 状态 |
|---|---|---|---|---|---|
| T-FLOW-VIEW | M5-A 原壳 Flow 只读投影：稳定块遍历/轮廓/位置标签与表、公式、媒体、共享图层物化；FlowWorkspace/FlowOutlinePanel 组件 | M5 | 无 | `src/renderer/course/flowEditorView.ts`、`src/renderer/ui/FlowWorkspace.tsx`、`src/renderer/ui/FlowOutlinePanel.tsx` 与对应测试 | pending |
| T-FLOW-CMD | M5-B Flow 作者命令与历史切片：增删/复制/移动/重排/嵌套移动一次手势一次 history，陈旧目标拒绝、ID 再生成、选择恢复 | M5 | 无（与 T-FLOW-VIEW 并行，接口由协调者固定） | `src/renderer/course/flowEditorCommands.ts`、`src/renderer/course/flowEditorSlice.ts` 与对应测试 | pending |
| T-FLOW-PROPS | M5-B Flow 插入面板与属性文档控件：全部块类型插入、段落/列表/表格/媒体/公式/代码/提示块/章节/组件属性编辑 | M5 | T-FLOW-CMD | `src/renderer/ui/FlowElementsTab.tsx`、`src/renderer/ui/FlowPropertiesTab.tsx` 与对应测试 | pending |
| T-SPAT-VIEW | M6-A Spatial 作者只读模型与世界坐标命令：统一全局/表面/世界图层、camera home/frames、semanticZoom、世界坐标选择/变换、一次手势一次 history、会话相机不入历史 | M6 | 无 | `src/renderer/course/spatialEditorView.ts`、`src/renderer/course/spatialEditorCommands.ts` 与对应测试 | pending |
| T-SPAT-WORKSPACE | M6-B/M6-C Spatial 工作区：会话 pan/zoom-at-cursor、minimap、culling、世界内容接受 camera transform、屏幕空间控件不随世界缩放、节点增选移缩放旋转手势 | M6 | T-SPAT-VIEW | `src/renderer/ui/SpatialWorkspace.tsx`、`src/renderer/ui/spatialWorkspaceAuthoring.ts`、`src/renderer/ui/SpatialLayerInspector.tsx` 与对应测试 | pending |
| T-SPAT-CAMERA | M6-B 镜头帧与语义缩放作者链：镜头创建/重命名/排序/切换/删除持久化；semanticZoom 规则编辑；会话相机与持久镜头分离 | M6 | T-SPAT-VIEW | `src/renderer/course/spatialCameraCommands.ts`、`src/renderer/ui/SpatialCameraPanel.tsx` 与对应测试 | pending |
| T-PLAYER-FLOW | M5-C FlowSurfaceHost 异步更新与销毁竞态修复；保持统一图层/教师控制器/捕获顺序 | M5 | 无 | `src/player/surfaces/flow/FlowSurfaceHost.ts` 与 `tests/unit/flowUnifiedLayers.test.tsx` | pending |
| T-PLAYER-SPATIAL | M6-C/M6-D SpatialSurfaceHost 运行合同：全局/表面教师控制器与 session 控件留在屏幕空间、控制器单 owner/静音/全屏/progress、动态捕获不再退化为静态占位 | M6 | 无 | `src/player/surfaces/spatial/SpatialSurfaceHost.ts`、`src/player/surfaces/spatial/spatialModel.ts` 与对应测试 | pending |
| T-FLOW-TARGETS | M5-B Flow 互动、状态与 Runtime/Component 作者目标：Flow 位置 globalInteractions 试运行执行/检查态惰性、稳定 block/图层目标 | M5 | T-FLOW-CMD、T-FLOW-VIEW、T-PLAYER-FLOW | `src/player/surfaces/flow/FlowSurfaceHost.ts` 中目标报告边界与对应测试 | pending |
| T-SPAT-RELATIONS | M6-A/M6-B Spatial 路径与关系：共享 Schema/Types 最小增量、路径/关系命令与编辑器、稳定 ID 与悬空引用拒绝 | M6 | T-SPAT-VIEW | `src/renderer/course/spatialPathCommands.ts`、`src/renderer/ui/SpatialPathEditor.tsx`、`src/shared/courseProjectTypes.ts`、`src/shared/courseProjectSchema.ts` 中路径/关系最小边界与对应测试 | pending |
| T-PUB-APP | M6-D PublishedCourseApp 接入 Spatial 单一 owner 教师动作/playbackControls/initialMuted 与镜头恢复 | M6 | T-PLAYER-SPATIAL | `src/player/PublishedCourseApp.ts` 中 Spatial 窄接线与对应测试 | pending |
| T-M5M6-STORE | 共享热点串行集成第一步：editorStore 增加 Flow/Spatial 会话选择、块/图层/镜头/语义缩放/路径命令、Flow/Spatial surface 创建；保持 Slide 一操作一 history 回归 | M5/M6 | 上述 Flow/Spatial 模块任务 | `src/renderer/store/editorStore.ts`、`src/renderer/course/v9SlideVerticalSlice.ts` 窄边界与对应测试 | pending |
| T-M5M6-SHELL | 共享热点串行集成第二步：App/Workspace/ScenePanel/RightSidebar/TopToolbar 接入 Flow 与 Spatial 编辑路由与正式 PDF/DOCX 菜单；不动 Store 真相 | M5/M6 | T-M5M6-STORE | `src/renderer/App.tsx`、`src/renderer/ui/Workspace.tsx`、`src/renderer/ui/ScenePanel.tsx`、`src/renderer/ui/RightSidebar.tsx`、`src/renderer/ui/TopToolbar.tsx` 与对应测试 | pending |

M3/M4 任务板已清空。M5/M6 任务板由协调者按 §4.5 规范拆出后在本节登记；M5 与 M6 默认并行（表面 owns 不重叠，共享边界窄接口串行），各表面内部保持纵切顺序。M7-B 集成后五类导出按格式并行派发。M8-A/B/C 在 M7 Gate 后并行，M8-D 最后单独运行。

### 4.6 集成 Gate

§5 的里程碑完成定义是唯一验收标准。Gate 在供给它的全部任务到达 `integrated` 后由协调者运行一次 L3；Gate 判定仍按 M3 → M4 → M5/M6 → M7 → M8 次序，前置并行只提前产出任务，不提前判定 Gate。

## 5. 里程碑完成定义

### M3 — 完整 Slide 作者闭环（Gate 通过，2026-08-15，`6361641`）

供给任务：T-IMG、T-TEXT、T-GEST、T-RTGT、T-IUI（M3-B0/B1/B2 已集成）。

- 原壳上弹/底部黑区 P1 已修复。
- text、formula、shape、image、video、背景和教师控制器可在原 Workspace 作者链中工作。
- global/surface/scene 统一 scope、order、visibility、lock 和稳定选择。
- Scene、状态、变换、属性、字体、IME、互动和媒体保持一操作一历史。
- Runtime/Component 的可作者目标进入统一图层，不用构建脚本绕行。
- `scene.interactions` 的 Native 点击、条件和 action 在隔离 Player 与最小 Published Slide 中真实执行。
- “当前位置试运行”使用独立 Published snapshot，会话停止即销毁。

### M4 — Player、Runtime、Component 与课程逻辑（Gate 通过，2026-08-15，`7f04a8a`）

供给任务：T-PSES、T-CTRL、T-RT、T-COMP、T-CSTATE。

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

并行条款：

- 执行者只对自己任务跑 L2，不得自行跑全量测试、preservation 或三尺寸 visual。
- Electron/E2E 类验证使用本机单一会话资源，由协调者在集成时统一串行运行；执行者以 vitest、typecheck、受影响 build 为主。
- 协调者每集成一批只跑受影响定向测试；L3 每 Gate 一次，不随任务批次重复。

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
3. 用户可见路径最多一条代表性 Electron E2E（由协调者在集成窗口运行）。
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

并行执行不豁免任何产品合同与反重写门禁。两个任务对同一事实给出冲突证据时，以已集成主线为准，另一方由协调者基于新主线重派。

开发只在以下情况停下并请求用户决定：

1. 需要新增依赖、付费能力或仓库外操作。
2. 必须执行不可恢复的破坏性操作。
3. 权限阻止继续。
4. 产品合同内部不可调和，且已有最小证据证明不存在安全路径。

普通测试失败、复杂 bug、任务冲突、相邻文件需求或阶段 NO-GO 不是停止条件；应回到首次证据并选择最短安全路径。

## 8. 接手入口

协调者依次阅读：

1. [`AGENTS.md`](AGENTS.md)
2. 本总纲的产品合同、当前恢复点、任务板与集成协议
3. 当前 [M3 阶段计划](docs/plans/M3_SLIDE_AUTHORING_PLAN.md)
4. [`PROJECT_COGNITION_INDEX.md`](PROJECT_COGNITION_INDEX.md)
5. `git status --short` 与 `output/worktrees/` 中各任务分支状态

执行者只读：

1. 本总纲 §2 产品合同与 §4.3 所有权规则
2. 自己的任务行（§4.5）与从属阶段计划对应小节
3. owns 范围内的当前源码

不要先读全仓库、全量测试或 donor 前端；先从认知索引的“改什么看哪里”进入实际代码。
