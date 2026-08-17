# AI-native 轻量编辑器：分阶段执行级计划

> PARENT: [`COURSEWARE_DEVELOPMENT_PLAN.md`](../../COURSEWARE_DEVELOPMENT_PLAN.md)
> PLAN_VERSION: 1.2
> UPDATED: 2026-08-16
> STATUS: P0–P2 历史完成记录；P3–P6 需求来源（派发已迁移）
> EXECUTION_MODE: P0–P2 串行历史；P3–P6 已迁移到文件独占的并行 lane
> PRODUCT_PROTOCOL: Course Project V9 / Published Course V2 / Runtime API 2/3 / Component API 4
> AI_POLICY: 当前版本不增加编辑器内可见 AI 能力，不调用模型；只预留未来外部协作所需的非可见接口
> START_TASK: 见 [`AI_NATIVE_PARALLEL_00_INDEX.md`](AI_NATIVE_PARALLEL_00_INDEX.md)
> PARALLEL_TASK_INDEX: [`AI_NATIVE_PARALLEL_00_INDEX.md`](AI_NATIVE_PARALLEL_00_INDEX.md)

这是一份从属于产品总纲的实现计划，不是第二份产品路线图。P0–P2 的状态与完成记录继续有效；P3–P6 已由 [`AI_NATIVE_PARALLEL_00_INDEX.md`](AI_NATIVE_PARALLEL_00_INDEX.md) 及其 lane 文档接管。本文 P3–P6 正文只保留需求来源，不再用于领取、依赖判断或测试派发。若计划与当前源码冲突，以源码、Schema 和可复现证据为准。

旧的 `M3`–`M8` 计划只用于追溯已经形成的工程基础，不得与本文并行派发，也不得拿旧任务状态替代当前验收。

## 1. 最终结果与最短充分路线

### 1.1 目标结果

交付一个 AI-native 的轻量课件编辑器：编辑器外的既有流程可负责整课生成；当前编辑器只提供点选、拖动、基础文字和属性修正、试运行、撤销、保存及导出，并为未来外部 AI 协作保留非可见接口。

当前阶段不建设 PowerPoint、Word、Figma 或 Notion 级手动编辑能力，也不建设内置聊天、模型账号、Provider、任务队列或 Agent 仪表盘。

### 1.2 不可妥协的成功标准

- 继续以 Course Project V9 为唯一写入真相，不因 UI 收敛升级 V10。
- 原 `App.tsx`、原 Store、原 Workspace 和原文件生命周期保持唯一正式入口。
- 默认教师控制器始终只在 `project.globalLayerItems` 中保存一份。
- 在 Slide、Flow、Spatial 当前页面点选控制器后，作者修改都写回同一个全局对象。
- 一次教师提交只产生一次 history 和一次 revision；撤销只撤销该次提交。
- Trial/Player 内移动、折叠等会话操作不写回工程。
- 纯 Slide、纯 Flow、纯 Spatial 与 Mixed 只从现有 `locations/surfaces` 推导，不持久化 `projectMode`。
- Flow 只补正文就地编辑和轻量结构操作，不扩成富文本排版系统。
- 为未来外部 AI 输出保留稳定 `authoringAddress`、revision、锁定、history 与保存重开边界；当前不提供编辑器内的复制、导入或应用流程。
- 自动化通过只能称 `engineering candidate`；可见结果必须真实复核后才能称 `art candidate`。

### 1.3 阶段依赖

| 阶段 | 可见结果 | 必须先完成 |
|---|---|---|
| P0 | 复核当前源码基线 | 无 |
| P1 | 真实 Player 的三处生产接线闭合 | P0 |
| P2 | 任意页面编辑同一个全局控制器；共享层页面可安全隐藏 | P1 |
| P3 | 纯课做减法，Mixed 保持稳定课程流程 | P2 |
| P4 | Flow 正文可直接输入，结构操作保持轻量 | P3 |
| P5 | 外部 AI 接口预留（无可见能力） | P4 |
| P6 | 保存、发布、导出、文档与真实体验收口 | P5 |

不得跳过 P1 直接做界面，也不得跳过 P2 先隐藏全局层入口。否则控制器会变成“能看到但不能可靠修改”，执行者容易用复制到 Scene 的错误方案补洞。

## 2. 给执行 AI 的固定工作协议

### 2.1 每次只领取一个任务包

1. 先运行 `git status --short`，记录已有修改和未跟踪文件。
2. 只读取当前任务的“必读文件”和直接依赖，不先遍历或重构全仓库。
3. 先执行任务列出的只读预检；源码事实不成立时停止实现，修订计划或弹窗询问。
4. 只修改任务列出的主要文件。确因类型或测试需要触及相邻文件时，在交付记录中解释原因。
5. 先跑任务级定向测试，再决定是否需要 typecheck、build 或 E2E；开发循环不默认跑全量验证。
6. 所有验收项同时成立后，才能把任务状态改为 `DONE`。测试通过但真实行为未验证时，状态保持 `IN_PROGRESS`。
7. 不顺手修复无关问题，不格式化无关文件，不覆盖用户和其他 AI 的工作。

### 2.2 必须保留的现有修改

工作树不保证干净。当前已存在的根文档修改和评估原稿属于用户上下文。除非任务明确要求，不修改或删除：

- `EVALUATION_REPORT.md`
- `GPTpro_Evaluation.md`
- `UIUX_ASSESSMENT_AND_FOUR_MODE_DESIGN.md`
- 与当前任务无关的任何已修改或未跟踪文件

### 2.3 全阶段禁止项

- 不新增 V10、迁移系统或持久化四模式字段。
- 不把控制器复制到 Scene、Flow surface、Spatial world、命名状态或运行时快照。
- 不新增第二 Shell、第二 Store、第二 Workspace 或新的产品入口。
- 不把 `CourseStudioApp.tsx` 接回正式入口；只允许提取其中已经验证的纯函数或窄逻辑。
- 不新增依赖、框架、插件层、状态机、审批流、模板平台或通用 command framework。
- 不内置模型调用、聊天栏、Provider、账号、计费、联网策略或对话历史。
- 不新增 AI 上下文复制、Patch 文件选择、影响确认或应用按钮；接口预留不得进入教师可见 UI。
- 不用 `as any`、静默 catch、测试专用生产分支或修改快照来掩盖真实失败。
- 不把 Phaser proxy、Player DOM 或导出 HTML 反序列化成工程真相。
- 不把 Spatial 的屏幕控制器放入 world transform，也不使用 inverse-scale CSS 补偿。
- 不把锁定解释成继承、冻结、审批或待应用状态；它只是写保护。
- 不为了“以后可能需要”抽取跨 Surface 大型编辑框架。

### 2.4 必须弹窗询问用户的情形

只有出现下列高影响分歧时暂停并询问；普通命名、测试文件位置和小型 CSS 选择自行采用最小方案：

1. 必须改 Course Project Schema、Published Schema、协议版本或迁移语义。
2. 必须增加依赖、IPC channel、第二入口、第二 Store/Workspace 或广泛重构才能继续。
3. 需要删除历史文件、批量迁移工程或执行不可逆操作。
4. 当前源码与本文的产品合同相反，且存在两条会改变用户体验或数据语义的可行路线。
5. 无法同时满足“控制器全局唯一”和“任意页面可编辑”，需要改变其持久化语义。
6. 阶段 Gate 连续三次因同一个外部条件失败，且没有可继续进行的只读诊断。

提问时只描述一个决策，给出推荐选项、影响范围和为什么不能安全自行假设。

### 2.5 任务交付格式

每个任务结束都使用以下格式，不能只说“已完成”：

```text
任务：P?-??
状态：DONE / IN_PROGRESS / BLOCKED
可见结果：用户现在能做什么
修改文件：逐项列出
关键不变量：如何证明没有复制控制器、没有新增 Schema 等
验证：命令 + 结果
Pipeline status：unusable / placeholder / engineering candidate
Outcome status：unusable / placeholder / engineering candidate / art candidate / accepted
未完成风险：没有则写“无已知阻断”
下一任务：只列一个直接后继
```

## 3. 当前源码基线

本文在 2026-08-16 基于 `85dd3cd60a5f04beccf235c1ebab21d4badae286` 及当前文档工作树完成审计。执行任何任务前仍必须重新运行 P0，因为后续提交可能已经改变事实。

### 3.1 已成立的基础

- `src/renderer/ProductApp.tsx` 只进入原 `App.tsx`。
- Store 的 V9 session/history/archive 已承载 Slide、Flow、Spatial 和 Mixed。
- Slide 已有画布选择、变换、文字编辑、状态与统一图层基础链。
- Flow 已有块模型、结构命令、属性编辑、作者叠层和 Player；正文尚未就地输入。
- Spatial 已有 world 变换、pan/zoom、镜头、路径、关系、小地图和 Player。
- `deriveCourseProjectAuthoringInventorySnapshot`、`applyCourseAuthoringPatch`、选择桥与 Patch 文件选择 IPC 已存在。
- 默认 `teacher-controller` 由 `courseStudioModel.ts` 创建在 `project.globalLayerItems` 中。
- `PublishedCourseApp` 是教师控制器运行动作的单一执行者。

### 3.2 已由源码确认的缺口

1. `PublishedCourseApp.ts` 创建 `SpatialSurfaceHost` 时没有传 `audioChangeSource` 和 `courseProgressSource`。
2. `PublishedCourseApp.ts` 的目录仍传 `scenes: this.#pickerScenes()`，只覆盖 Slide scene，未使用 `ScenePickerOverlay` 已支持的 `locations`。
3. `App.tsx` 在 `surfaceId` 或 `activeCameraFrameId` 变化时都清空 `spatialSessionCamera`，可能覆盖镜头切换刚回传的真实位姿。
4. Slide 作者 snapshot 与可选层按当前 `editingScope` 过滤；场景页不能直接选择全局控制器。
5. Flow 已渲染 global/surface 叠层并可按 ID 选择，但没有把控制器属性和变换写回全局对象的作者桥。
6. Spatial editor view 已列出 global/surface/world 层，但 `SpatialWorkspace` 只接收并变换 `surface.world.layerItems`。
7. 旧 Workspace 仍残留“AI 引用”可见入口；V9 原壳未提供稳定上下文发布或“应用 AI Patch”闭环。P5-00 必须先删除该遗留入口与可见 AI 文案，P5 后续只预留纯接口与安全边界。

## 4. 状态总表

状态只允许 `READY`、`IN_PROGRESS`、`DONE`、`BLOCKED`。只有直接依赖全部 `DONE` 的任务才能变为 `READY`。

| ID | 任务 | 依赖 | 初始状态 |
|---|---|---|---|
| P0-01 | 复核源码与测试基线 | 无 | DONE |
| P1-01 | Spatial 控制器音频/进度生产接线 | P0-01 | DONE |
| P1-02 | Mixed 课程目录改用 location | P1-01 | DONE |
| P1-03 | Spatial 会话相机 reset 时序 | P1-02 | DONE |
| P1-G | 生产真相阶段 Gate | P1-03 | DONE |
| P2-01 | 全局控制器显式命令目标 | P1-G | DONE |
| P2-02 | Slide 当前页作者入口 | P2-01 | DONE |
| P2-03 | Flow 当前页作者入口 | P2-02 | DONE |
| P2-04 | Spatial 屏幕空间作者入口 | P2-03 | DONE |
| P2-05 | 隐藏共享层页面并收敛轻量入口 | P2-04 | DONE |
| P2-G | 全局控制器跨 Surface Gate | P2-05 | DONE |
| P3-01 | 推导纯课/Mixed 视图形态 | P2-G | BLOCKED |
| P3-02 | 左栏按内容做减法 | P3-01 | BLOCKED |
| P3-03 | 右栏、术语与状态反馈收敛 | P3-02 | BLOCKED |
| P3-04 | 侧栏收起与最小视觉收敛 | P3-03 | BLOCKED |
| P3-G | 轻量壳层阶段 Gate | P3-04 | BLOCKED |
| P4-01 | Flow 标题/正文就地编辑 | P3-G | BLOCKED |
| P4-02 | Flow 常用文本与结构操作收敛 | P4-01 | BLOCKED |
| P4-G | Flow 轻量编辑 Gate | P4-02 | BLOCKED |
| P5-00 | 清除既有可见 AI 入口与文案 | P4-G | BLOCKED |
| P5-01 | V9 稳定选择/上下文接口合同（非可见） | P5-00 | BLOCKED |
| P5-02 | 单目标 Patch 安全边界接口（非可见） | P5-01 | BLOCKED |
| P5-03 | 批量外部协作占位边界（不实现协议） | P5-02 | BLOCKED |
| P5-G | 外部 AI 接口预留 Gate | P5-03 | BLOCKED |
| P6-01 | Mixed 与发布导出真实样例 | P5-G | BLOCKED |
| P6-02 | 文档、Skill、能力卡与死入口核对 | P6-01 | BLOCKED |
| P6-G | 最终工程与体验 Gate | P6-02 | BLOCKED |

## 5. P0：执行前基线复核

### P0-01 — 复核源码与测试基线

**目标**：确认本文列出的七项源码事实仍成立，防止较弱执行者根据过期行号盲改。

**只读预检**：

```powershell
git status --short
git rev-parse HEAD
rg -n "new SpatialSurfaceHost|audioChangeSource|courseProgressSource|new ScenePickerOverlay|pickerScenes" src/player/PublishedCourseApp.ts
rg -n "setSpatialSessionCamera\(null\)|activeCameraFrameId" src/renderer/App.tsx
rg -n "teacher-controller|selectableLayers|buildV9SlideWorkspaceSnapshot" src/renderer/course/v9SlideVerticalSlice.ts
rg -n "globalLayerItems|surfaceLayerItems" src/renderer/course/flowEditorView.ts src/renderer/course/spatialEditorView.ts
rg -n "selectCourseFlowLayer|transformCourseSpatialLayers|updateCourseSpatialLayer" src/renderer/store/editorStore.ts src/renderer/App.tsx
```

**允许修改**：本任务默认不改产品代码。若事实已变化，只更新本文的“当前源码基线”和状态表，并说明证据。

**验收**：

- 七项事实逐项标记“仍存在 / 已闭合 / 已被其他实现替代”。
- 记录当前 HEAD 和已有工作树修改。
- 确认下一任务是仍未完成的最前置任务，而不是机械执行 `P1-01`。

**退出条件**：若三项 P1 缺口都已被可靠修复并有真实产品测试，可直接把对应任务标为 `DONE`，但必须运行 P1-G，不能仅凭代码外观跳过 Gate。

## 6. P1：生产真相收口

### P1-01 — 接通 Spatial 控制器的音频与课程进度

**可见结果**：真实 Published/Trial Spatial 中，声音按钮随全课静音状态刷新；课程进度显示全部 location、当前位置和适用的 Slide 状态名。

**必读文件**：

- `src/player/PublishedCourseApp.ts`
- `src/player/surfaces/spatial/SpatialSurfaceHost.ts`
- `tests/unit/spatialSurfaceHostCtrl.test.ts`
- `tests/unit/publishedCourseSpatial.test.ts`

**主要修改文件**：

- `src/player/PublishedCourseApp.ts`
- `tests/unit/publishedCourseSpatial.test.ts`

**实现合同**：

1. 给生产创建的 `SpatialSurfaceHost` 传 `audioChangeSource: this.events`。
2. 传入 `courseProgressSource`，其 location 顺序必须直接来自 `this.#locations`，名称使用 location 的教师可读 label。
3. `getCurrentLocationId` 读取 `this.#currentLocationId`，不得复制一份独立进度状态。
4. `getStateLabel` 只在当前 Slide host 有命名 presentation state 时返回其名称；Flow/Spatial 没有状态名时返回 `null`。
5. 保持 `PublishedCourseApp` 单一执行控制器动作；不得在 Host 增加第二套导航或静音逻辑。
6. Host destroy 后现有音频订阅释放合同必须继续成立。

**必须补的产品级断言**：

- 通过 `PublishedCourseApp` 启动 Spatial 工程，而不是直接 new Host。
- 点击声音按钮后，同一控制器文字从“开”变“关”或反向变化。
- 导航到下一个 location 后，进度从 `1 / N` 变为 `2 / N`。
- 测试至少包含一个非 Spatial location，证明总数是全课 location 数而非镜头数。

**定向验证**：

```powershell
npx vitest run tests/unit/spatialSurfaceHostCtrl.test.ts tests/unit/publishedCourseSpatial.test.ts
npm run build:player
```

**禁止**：不修改 `SpatialSurfaceHost` 的公开合同，除非预检证实现有合同无法使用；不硬编码场景数组或状态名。

### P1-02 — Mixed 课程目录改用 location

**可见结果**：Player 的“课程目录”按课程顺序列出 Slide、Flow、Spatial，选择任一项都经过统一导航守卫。

**必读文件**：

- `src/player/PublishedCourseApp.ts`
- `src/player/ScenePickerOverlay.ts`
- `tests/unit/scenePanelSurfaceNav.test.tsx`
- `tests/unit/scenePickerOverlay.test.ts`

**主要修改文件**：

- `src/player/PublishedCourseApp.ts`
- 扩展 `tests/unit/coursePublishPipeline.test.ts` 中已有的 Mixed 集成夹具；不得为相同事实复制一套测试工程

**实现合同**：

1. `PublishedCourseApp` 给 `ScenePickerOverlay` 传 location 列表，不再传 slide-only `#pickerScenes()`。
2. 每个条目至少携带稳定 location ID、教师可读名称和 kind；顺序与 `project.locations` 完全一致。
3. `onSelect` 直接调用 `navigate(locationId, entryPoint)`，不得先转换成 scene ID。
4. `bypassNavigationGuards` 仍只在作者强制跳转时使用；普通控制器目录继续遵守 guard。
5. deep link、next、previous、restart 与目录继续共享同一 `#currentLocationId`。
6. 若 `#pickerScenes()` 变成未使用私有函数，删除该函数和无用类型 import；不修改旧 `PlayerApp` 的 legacy scene 模式。

**必须补的产品级断言**：

- Mixed fixture 包含至少一个 Slide、一个 Flow、一个 Spatial location。
- 打开目录后恰好按顺序看到三种条目。
- 点击 Flow 和 Spatial 条目后，`app.currentLocationId` 分别变为对应 location ID。
- guard 阻断时当前位置不变；作者 bypass 时允许到达。

**定向验证**：

```powershell
npx vitest run tests/unit/scenePickerOverlay.test.ts tests/unit/scenePanelSurfaceNav.test.tsx tests/unit/coursePublishPipeline.test.ts
npm run build:player
```

**禁止**：不把 location kind 存成新模式字段，不为三种 Surface 建三套目录组件。

### P1-03 — 修正 Spatial 会话相机 reset 时序

**可见结果**：切换到已保存镜头后，“从当前画面添加”和“设为首页镜头”使用镜头实际位姿，不回退到旧 home。

**必读文件**：

- `src/renderer/App.tsx` 中 `spatialSessionCamera` effect、相机面板和 Workspace 组装
- `src/renderer/ui/SpatialWorkspace.tsx`
- `tests/unit/spatialCameraSession.test.tsx`
- `tests/e2e/v9SpatialAuthoring.spec.ts`

**主要修改文件**：

- `src/renderer/App.tsx`
- `tests/unit/spatialCameraSession.test.tsx`
- `tests/e2e/v9SpatialAuthoring.spec.ts`

**实现合同**：

1. 切换到不同 Spatial surface 时清空壳层 session camera。
2. 同一 surface 内 `activeCameraFrameId` 变化时不得由 App effect 清空刚由 Workspace 回传的 frame pose。
3. `SpatialWorkspace` 继续负责把持久镜头 pose 应用到 viewport，并通过 `onCameraChange` 回传一次。
4. pan/zoom 仍是 session-only；只有“设为首页”或“新增镜头”等显式命令写工程。
5. 不引入第二份 camera store，不把 camera session 持久化进 V9。

**必须补的断言**：

- 同一 surface 从 frame A 切到 frame B 后，App 相机面板得到 B 的 x/y/zoom。
- 随后点击“从当前画面添加”或“设为首页”，保存值等于 B，不等于旧 home。
- 切换到另一个 surface 后 session camera 正确重置。

**定向验证**：

```powershell
npx vitest run tests/unit/spatialCameraSession.test.tsx
npm run typecheck
npm run prepare:e2e
npx playwright test tests/e2e/v9SpatialAuthoring.spec.ts
```

**禁止**：不新增全局相机状态机，不用延时器掩盖 effect 顺序。

### P1-G — 生产真相阶段 Gate

**执行内容**：

1. 运行 P1 三个任务的全部定向测试。
2. 运行 `npm run typecheck` 与 `npm run build:player`。
3. 用一个真实 Mixed 工程进入 Trial/Player：
   - 在 Spatial 中切换静音并观察标签刷新；
   - 查看全课进度；
   - 目录依次进入 Slide、Flow、Spatial；
   - 切换镜头后保存当前画面。
   - 优先使用 `tests/e2e/v9MixedTrialRun.spec.ts` 的真实 iframe 路径；它必须从 Spatial 当前位置启动，而不是只在宿主单测中构造 Surface。
4. 记录截图或短视频；自动化截图只能证明路径发生，不自动判定视觉质量。

**Gate 通过标准**：三项真实缺口均在生产入口闭合，单测不再是唯一证据；无第二动作执行者、无新 Schema、无 location 副本。

## 7. P2：全局控制器作者入口迁移

### P2-01 — 建立显式的全局控制器命令目标

**可见结果**：不切换 `editingScope` 页面，也能安全选择和修改 `project.globalLayerItems` 中的控制器。

**必读文件**：

- `src/renderer/course/v9SlideVerticalSlice.ts`
- `src/renderer/store/editorStore.ts`
- `src/shared/courseProjectModel.ts`
- `tests/unit/v9SlideVerticalSlice.test.ts`
- `tests/unit/editorStoreV9Ownership.test.ts`

**主要修改文件**：

- `src/renderer/course/v9SlideVerticalSlice.ts`
- `src/renderer/store/editorStore.ts`
- 对应两个定向测试文件

**目标合同**：使用窄目标，不新增通用命令框架。建议沿用以下信息形状；如现有类型可无损表达则复用现有类型：

```ts
interface CourseGlobalControllerTarget {
  sessionId: string
  locationId: string
  projectRevision: number
  source: 'global'
  layerItemId: string
}
```

提供或复用三个窄动作：

- `selectCourseGlobalController(target)`
- `transformCourseGlobalController(target, transform)`
- `updateCourseGlobalController(target, patch)`

**实现合同**：

1. 每次提交校验 session、当前 location、captured revision、`source: 'global'` 和稳定 ID。
2. 目标必须解析到 `project.globalLayerItems` 中的 Native `teacher-controller`；其他全局项不得误入该命令。
3. 变换和内容修改只改这一份全局 item，不改任一 scene/surface/world 数组。
4. 几何/内容命令在 item locked 时拒绝；显式解锁操作可以只修改 locked 字段。
5. 每个成功动作一次 history、一次 revision；无变化 patch 不产生 history。
6. 命令不把当前页面切到 `editingScope: 'global'`，也不清空当前 Surface 上下文。
7. 选择属于编辑器 session，不写入工程。

**必须补的断言**：

- 从 Slide、Flow、Spatial location 捕获的 target 都能解析同一 ID。
- 修改后 `globalLayerItems` 数量不变，三个本地 item 数组完全不变。
- stale revision、stale session、错误 source、非控制器 ID、locked item 都安全拒绝。
- 成功一次后 revision `+1`，Undo 一次恢复；Redo 一次重放。

**定向验证**：

```powershell
npx vitest run tests/unit/v9SlideVerticalSlice.test.ts tests/unit/editorStoreV9Ownership.test.ts
npm run typecheck
```

### P2-02 — 在 Slide 当前页面点选和编辑全局控制器

**可见结果**：教师停留在场景画布即可点选控制器、拖动/缩放并编辑常用属性；场景内容保持可见。

**必读文件**：

- `src/renderer/course/v9SlideVerticalSlice.ts`
- `src/renderer/App.tsx`
- `src/renderer/ui/Workspace.tsx`
- `src/renderer/ui/workspaceSlideAuthoring.ts`
- `src/renderer/ui/NodesTab.tsx`
- `src/renderer/ui/PropertiesTab.tsx`
- `tests/unit/globalLayerUi.test.tsx`
- `tests/unit/v9SlideLayerSession.test.ts`

**主要修改文件**：上述生产文件中实现所需的最小集合及对应测试。

**实现合同**：

1. `buildV9SlideWorkspaceSnapshot` 在 scene 作者画面中加入有效可见的全局控制器 authoring proxy，同时保留 scene 内容。
2. snapshot 明确给出该 proxy 的 `source: 'global'` 元数据；不得只靠 ID 命名猜 scope。
3. Workspace 的 selection/transform 回调把全局控制器事件送到 P2-01 命令，scene 节点仍走原命令。
4. 多选不得混合 global controller 与 scene 节点做一次群组变换；遇到混合选择时保持当前选择并给教师可读提示。
5. Properties 中显示“全课控制器，本次修改将应用到整门课”；不显示 Scope、路径或内部 ID。
6. 复用现有控制器属性 UI；若必须抽取，只抽一个无 Store 的 `TeacherControllerInspector` 展示组件，不复制三套表单。
7. 控制器按钮在编辑态 inert，不执行导航、静音或重启。

**必须补的断言**：

- scene scope 下 snapshot 同时包含 scene 节点和控制器。
- 点击控制器不会把 `editingScope` 改为 global。
- 拖动一次只改 global frame、revision `+1`。
- 修改标题/样式后一次 Undo 恢复。
- scene 内不存在新增控制器副本。

**定向验证**：

```powershell
npx vitest run tests/unit/globalLayerUi.test.tsx tests/unit/v9SlideVerticalSlice.test.ts tests/unit/v9SlideLayerSession.test.ts
npm run typecheck
```

### P2-03 — 在 Flow 当前页面点选和编辑全局控制器

**可见结果**：教师在讲义画面直接点选控制器并移动或修改属性，修改立即影响同一个全局对象。

**必读文件**：

- `src/renderer/course/flowEditorView.ts`
- `src/renderer/ui/FlowWorkspace.tsx`
- `src/renderer/ui/RightSidebar.tsx`
- `src/renderer/App.tsx`
- `tests/unit/flowUnifiedLayerEntry.test.tsx`
- `tests/unit/flowUnifiedLayers.test.tsx`

**主要修改文件**：

- `src/renderer/ui/FlowWorkspace.tsx`
- `src/renderer/ui/RightSidebar.tsx`
- `src/renderer/App.tsx`
- 对应测试；只有复用控制器属性展示需要时才触及新窄组件

**实现合同**：

1. 保留现有 global/surface authoring overlay；选择回调必须携带 `source`，不能只把 ID 当成本地 Flow layer。
2. global `teacher-controller` 选择走 P2-01；surface 普通层继续保持原有选择行为。
3. 给控制器提供轻量拖动位置能力；一次 pointer gesture 在 pointer-up 提交一次，不在 pointer-move 写 history。
4. 尺寸、旋转、样式、按钮与显隐可在共用控制器属性组件中修改；不建设 Flow 专用控制器模型。
5. Flow 文档滚动不改变控制器持久 frame；仅作者明确拖动时写回。
6. hidden/locked 控制器仍可从扁平图层列表定位，但 hidden 不伪装成画布可见，locked 不可拖动。

**必须补的断言**：

- overlay 点击回传 `{source: 'global', layerItemId}` 或等价显式目标。
- 拖动一次只写一次 history；移动前的 Flow block 完全不变。
- 右栏提示全课影响范围，并能修改同一控制器标题或 compact。
- Slide 中再次查看时能看到 Flow 提交的修改。

**定向验证**：

```powershell
npx vitest run tests/unit/flowUnifiedLayerEntry.test.tsx tests/unit/flowUnifiedLayers.test.tsx tests/unit/flowWorkspace.test.tsx
npm run typecheck
```

### P2-04 — 在 Spatial 屏幕空间点选和编辑全局控制器

**可见结果**：控制器浮在空间画布的屏幕层，可点选和变换，但不随 world pan/zoom 缩放。

**必读文件**：

- `src/renderer/course/spatialEditorView.ts`
- `src/renderer/ui/SpatialWorkspace.tsx`
- `src/renderer/ui/SpatialLayerInspector.tsx`
- `src/renderer/App.tsx`
- `tests/unit/spatialSurfaceHost.test.ts`
- `tests/unit/spatialCameraSession.test.tsx`
- `tests/unit/spatialEditorView.test.ts`

**主要修改文件**：

- `src/renderer/ui/SpatialWorkspace.tsx`
- `src/renderer/ui/SpatialLayerInspector.tsx` 或共用控制器属性组件
- `src/renderer/App.tsx`
- 对应测试

**实现合同**：

1. App 从 `SpatialEditorView.layers` 中显式筛出有效的 global teacher-controller，作为 screen-layer authoring 输入传给 Workspace。
2. controller DOM/author proxy 必须位于 world `<g data-spatial-world>` 外部。
3. 控制器不进入 world item map、culling、minimap、path、relation 或 semantic zoom。
4. 屏幕层拖动/缩放使用 viewport 像素，不除以 camera zoom；pointer-up 走 P2-01 命令一次提交。
5. world item 仍走 `transformCourseSpatialLayers`；screen controller 绝不能送进该命令。
6. 右栏根据 selected target source 选择全局控制器属性或 world layer inspector，不用 ID 猜测。
7. 作者控制器外观可以是轻量 inert 预览，但按钮不得在编辑态执行。

**必须补的断言**：

- camera 0.5x、1x、2x 及平移后，控制器屏幕 rect 的宽高和位置不因 camera 改变。
- world item 的屏幕 rect 正常随 camera 改变。
- 拖动控制器只改 `globalLayerItems`；拖动 world item 只改 `surface.world.layerItems`。
- 控制器不出现在 minimap 和 world transform 中。

**定向验证**：

```powershell
npx vitest run tests/unit/spatialEditorView.test.ts tests/unit/spatialCameraSession.test.tsx tests/unit/spatialSurfaceHost.test.ts tests/unit/spatialWorkspaceAuthoring.test.ts
npm run typecheck
```

### P2-05 — 隐藏共享层页面并收敛轻量入口

**可见结果**：普通教师不再看到独立“全局层/当前内容共用”页面；控制器仍可在当前页面和图层列表中定位、修改。

**前置硬条件**：P2-02、P2-03、P2-04 的作者链和测试全部通过。未满足时禁止执行本任务。

**必读文件**：

- `src/renderer/ui/ScenePanel.tsx`
- `src/renderer/ui/NodesTab.tsx`
- `src/renderer/ui/RightSidebar.tsx`
- `src/renderer/App.tsx`
- `tests/unit/scenePanelDocumentControl.test.tsx`
- `tests/unit/globalLayerUi.test.tsx`

**实现合同**：

1. V9 普通路径不渲染 `global-layer-entry` 与 `surface-layer-entry`。
2. 底层 `globalLayerItems`、`surfaceLayerItems`、effective visibility、order、导出与兼容代码全部保留。
3. Slide/Flow/Spatial 的扁平图层列表显示当前 location 的有效项；来源用“全课内容/当前讲义共用”等教师语言表示。
4. 全局控制器条目提供“定位控制器”；调用后选择并把目标滚入或置于当前可视区，不复制、不重建控制器。
5. 非控制器共享项若尚无手工命令，只允许选择、查看影响范围；不得新增 AI 引用复制、导入或 Patch 应用入口，也不得显示会静默失败的可编辑控件。
6. 可暂时保留 Store 的 `editingScope` 和 legacy 兼容入口，不能为删字段扩大重构。
7. 所有普通提示移除“Scope、globalLayerItems、surfaceLayerItems、Layer Item ID”等协议词。

**必须补的断言**：

- V9 ScenePanel 查不到两个共享层页面入口。
- 从任一 Surface 点击“定位控制器”能选中同一稳定 ID。
- 隐藏入口前后保存的 archive 中 global/surface 数据字节语义一致。
- legacy/V8 显式导入测试不因 UI 减法失效。

**定向验证**：

```powershell
npx vitest run tests/unit/scenePanelDocumentControl.test.tsx tests/unit/globalLayerUi.test.tsx tests/unit/flowUnifiedLayerEntry.test.tsx tests/unit/editorShellMultiSurface.test.tsx
npm run test:compat
npm run typecheck
```

### P2-G — 全局控制器跨 Surface Gate

新增或改造 `tests/e2e/v9GlobalControllerAndHealth.spec.ts`，使用一个包含 Slide、Flow、Spatial 的 Mixed 工程，验证完整纵切：

1. 工程初始只有一个 global `teacher-controller`。
2. 在 Slide 当前页拖动它，revision 只增加一次。
3. 切到 Flow，选中同一 ID，修改标题或 compact。
4. 切到 Spatial，在非 1x camera 下移动控制器，控制器不随 world 缩放。
5. Undo 一次只撤销最后一次修改；Redo 恢复。
6. 保存、完全关闭、重开后，三种 Surface 显示同一最终设置。
7. archive 中仍只有一个 global controller，scene/surface/world 中都没有复制品。
8. 进入 Trial，拖动或折叠控制器；退出后工程 revision、dirty 和持久 frame 不变。
9. 普通 UI 不再出现独立全局层/当前内容共用入口。

**Gate 命令**：

```powershell
npm run typecheck
npx vitest run tests/unit/v9SlideVerticalSlice.test.ts tests/unit/globalLayerUi.test.tsx tests/unit/flowUnifiedLayerEntry.test.tsx tests/unit/spatialEditorView.test.ts
npm run prepare:e2e
npx playwright test tests/e2e/v9GlobalControllerAndHealth.spec.ts
```

## 8. P3：按内容自适应的轻量壳层

### P3-01 — 纯函数推导纯课与 Mixed

**可见结果**：界面能可靠判断当前课程只需 Slide、Flow、Spatial 中的一种，还是需要 Mixed 流程。

**主要修改文件**：

- 新建 `src/renderer/course/courseEditorLayout.ts`
- 新建 `tests/unit/courseEditorLayout.test.ts`
- `src/renderer/App.tsx` 只接入推导结果，不保存它

**实现合同**：

1. 返回值只允许 `'slide' | 'flow' | 'spatial' | 'mixed'`。
2. 从 `project.locations` 引用到的 surface type 去重推导；Schema 合法但没有 location 的孤立 surface 不应误触发 Mixed。
3. 多个同类型 surface 仍是纯类型。
4. 新增/删除 location 后自然重算，不写入工程、不进 history、不加 migration。
5. 非法缺失 surface 由现有 Schema/health 报告处理；UI 推导不偷偷修复工程。

**测试矩阵**：单 Slide、多 Slide、单 Flow、多 Flow、单 Spatial、多 Spatial、三种两两 Mixed、三种全有。

**定向验证**：

```powershell
npx vitest run tests/unit/courseEditorLayout.test.ts
npm run typecheck
```

### P3-02 — 左栏按内容做减法

**可见结果**：纯课只显示其主要导航；Mixed 始终显示课程顺序，不随当前内容更换左栏骨架。

**主要修改文件**：

- `src/renderer/ui/ScenePanel.tsx`
- `src/renderer/App.tsx`
- `tests/unit/scenePanelSurfaceNav.test.tsx`
- `tests/unit/editorShellMultiSurface.test.tsx`

**实现合同**：

| 推导结果 | 左栏只保留 |
|---|---|
| slide | 幻灯片缩略图与状态相关入口 |
| flow | 讲义大纲 |
| spatial | 镜头/视角列表 |
| mixed | 按 `project.locations` 顺序的课程流程 |

- 纯 Flow/Spatial 不渲染空的“场景”区域、全局层入口或添加其他 Surface 的重复按钮。
- Mixed 切换 location 时 `course-location-nav` DOM 骨架保持稳定，只更新 active 项和当前内容工作区。
- 添加/删除/复制沿用已有窄命令；不建设模板选择器或四模式向导。
- 普通标签用“幻灯片、讲义、空间画布、课程流程”，不显示 `Flow/Spatial/Surface/location` 英文协议词。

**定向验证**：

```powershell
npx vitest run tests/unit/scenePanelSurfaceNav.test.tsx tests/unit/editorShellMultiSurface.test.tsx
npm run typecheck
```

### P3-03 — 收敛右栏、术语与状态反馈

**可见结果**：教师始终在“元素、图层、属性”三个高频入口工作，能看见选择、坐标/缩放、保存和禁用原因。

**主要修改文件**：

- `src/renderer/ui/RightSidebar.tsx`
- `src/renderer/ui/TopToolbar.tsx`
- `src/renderer/App.tsx`
- 受影响的 `ElementsTab/NodesTab/PropertiesTab/Flow*/Spatial*` 窄文件
- 对应组件测试

**实现合同**：

1. 简洁模式只保留“元素、图层、属性”；开发、组件、互动等仍在显式专业入口，不定义默认工作流。
2. 无能力的面板显示教师可读原因，不挂载会写错模型的 legacy 控件。
3. 简洁模式仍显示选中目标、x/y/宽高或 Flow 块位置、Spatial zoom、保存状态和错误反馈。
4. 清理普通 UI 中的 `FLOW 讲义`、`SPATIAL 空间`、`Surface`、`Scope`、V9、Runtime API 等工程词。
5. 不隐藏必要坐标来换取“看起来简单”；复杂属性可以折叠，当前反馈不能消失。

**定向验证**：按实际触及组件选择最相关 Vitest，并运行 `npm run typecheck`。

### P3-04 — 侧栏收起与最小视觉收敛

**可见结果**：1366×768 下中央内容明显成为主体；教师可独立收起左右栏，重新展开不丢选择。

**主要修改文件**：

- `src/renderer/App.tsx`
- `src/renderer/styles/globals.css`
- 左右栏容器对应组件测试

**实现合同**：

1. 左右栏折叠只属于 UI session，不写工程、不进 history。
2. 折叠按钮键盘可达，有 `aria-expanded` 与明确名称。
3. 只统一当前可见区域的字阶、间距、边框、圆角和核心颜色；不做全量 token 迁移或 CSS 重写。
4. 不改变 1280×720 课件逻辑坐标；壳层响应式缩放与内容数据分离。
5. 不为三种 Surface 分别建立三套壳层 CSS。

**定向验证**：组件测试 + `npm run build:renderer`。

### P3-G — 轻量壳层阶段 Gate

准备四个最小工程：纯 Slide、纯 Flow、纯 Spatial、Mixed。分别在 1280×720、1366×768、1920×1080 复核：

- 左栏是否只显示当前任务；Mixed 骨架是否稳定。
- 中央内容是否为视觉主体。
- 右栏高频三入口是否一致且没有错误模型写入。
- 左右栏折叠/展开是否保留选择和 session camera。
- 普通 UI 是否无协议词泄漏。
- 每个工程能完成“找到内容 → 修改 → 当前位置试运行 → Undo → 保存”。

至少保留 1366×768 的四张真实截图。只有人工确认布局可用后，Outcome 才能从 `engineering candidate` 提升为 `art candidate`。

## 9. P4：Flow 轻量正文编辑

### P4-01 — 标题与正文就地编辑

**可见结果**：在讲义工作区直接编辑 heading 和 paragraph，不必先去右栏找输入框。

**必读文件**：

- `src/renderer/ui/FlowWorkspace.tsx`
- `src/renderer/course/flowEditorView.ts`
- `src/renderer/store/editorStore.ts` 的 `updateCourseFlowBlock`
- `tests/unit/flowWorkspace.test.tsx`
- `tests/unit/flowStructuralEntry.test.tsx`

**主要修改文件**：

- `src/renderer/ui/FlowWorkspace.tsx`
- `src/renderer/App.tsx`
- 对应测试

**实现合同**：

1. 双击或选中后按 Enter 进入编辑；blur 或 `Ctrl+Enter` 提交；Escape 取消。
2. 中文输入法 composition 期间不得提交或触发结构快捷键。
3. 输入过程只存组件 draft；一次提交调用一次 `updateCourseFlowBlock`，产生一次 history/revision。
4. 文本未变化时不提交。
5. block ID、父级、顺序和其他字段保持不变。
6. locked/readOnly/生命周期 busy 时不能进入编辑，并显示可理解原因。
7. 不引入富文本依赖、Markdown 解析器、工具条或通用文档编辑内核。

**定向验证**：

```powershell
npx vitest run tests/unit/flowWorkspace.test.tsx tests/unit/flowStructuralEntry.test.tsx tests/unit/flowEditorCommands.test.ts
npm run typecheck
```

### P4-02 — 常用文本和结构操作收敛

**可见结果**：quote 与 list item 可直接改文字；删除、复制、上移/下移和层级操作只在当前块选中或 hover 时出现，不挤占正文。

**主要修改文件**：

- `src/renderer/ui/FlowWorkspace.tsx`
- `src/renderer/ui/FlowOutlinePanel.tsx`
- `src/renderer/ui/FlowPropertiesTab.tsx`（只保留未适合就地编辑的属性）
- 对应测试

**实现合同**：

1. quote 正文和 list item 沿用 P4-01 的同一 draft/commit 语义。
2. 表格、公式、媒体、组件和复杂 callout 继续由右栏或后续经批准的外部协作处理；当前不增加 AI 入口，也不做单元格富编辑。
3. 结构按钮上下文显示，键盘 Delete/Ctrl+D/Alt+Arrow 只有在非文字编辑状态时触发。
4. 删除、复制、移动每次只产生一次 history；错误父级移动安全拒绝。
5. Player 和导出继续消费同一 Flow blocks，不新增编辑专用副本。

**定向验证**：

```powershell
npx vitest run tests/unit/flowWorkspace.test.tsx tests/unit/flowStructuralEntry.test.tsx tests/unit/flowUnifiedLayerEntry.test.tsx
npm run typecheck
```

### P4-G — Flow 轻量编辑 Gate

用一个含标题、段落、引用、列表、表格、媒体的代表讲义完成：

1. 就地修改标题、段落、引用和一个列表项。
2. 复制、移动、删除一个块。
3. 确认每个提交一次 Undo 即恢复。
4. 保存、完全关闭、重开后内容和块 ID 一致。
5. 当前位置试运行、HTML、PDF、DOCX 显示相同正文。
6. 正文区没有常驻大型工具条，没有表格/Word 级排版能力膨胀。

阶段 E2E 优先扩展现有 Flow 真实路径；不要为每个块类型建立一个 Electron spec。

## 10. P5：外部 AI 接口预留（无可见能力）

### P5-00 — 清除既有可见 AI 入口与文案

**可见结果**：当前教师界面不出现“AI 引用”“AI 修改引用”、AI 协作说明或其 Clipboard 触发器。稳定地址、inventory 与 Patch 的纯接口继续作为未接入的内部/兼容能力保留；本任务不新增任何 AI 功能。

**必读文件**：

- `src/renderer/ui/Workspace.tsx`
- `src/renderer/ui/DesignTokensEditor.tsx`
- `src/renderer/authoring/aiSelectionReference.ts`，只确认纯 helper 可保留而不接入 UI
- `tests/unit/designTokens.test.tsx`

**主要修改文件**：

- `src/renderer/ui/Workspace.tsx`
- `src/renderer/ui/DesignTokensEditor.tsx`
- `tests/unit/designTokens.test.tsx` 及确有必要的最小 UI 审计测试

**实现合同**：

1. 删除 `Workspace.tsx` 中可见的“AI 引用”按钮，以及仅为该按钮服务的 `copyAiReferenceFor`、`navigator.clipboard` 调用和无用 import；不得以隐藏 CSS、feature flag、快捷键或菜单保留可重新暴露的入口。
2. 保留 `aiSelectionReference.ts` 等纯 helper，但正式 Workspace、App、工具栏、右栏和属性面板不得导入或调用它来形成可见能力。
3. 将 Design Tokens 提示改为：`只保存稳定 ID、名称和值，便于统一取色与字体；不承载叙述性美术方向，也不会自动改写已有节点。`
4. 不修改 Schema、Store、IPC、authoringAddress、inventory、Patch 模型、history donor 文件或任何网络/模型逻辑。
5. 不新增 Clipboard、文件选择、Patch 应用、确认框、聊天、模型入口或批量工作流。

**必须补的断言**：

- 正式 UI 中不存在“AI 引用”“AI 修改引用”“可直接粘贴给 Codex”及其 Clipboard 操作。
- Design Tokens 的可见说明不含 AI 文案。
- `aiSelectionReference.ts` 仍可作为未挂载的纯 helper 编译；本任务不因保留它而恢复任何 UI 调用。
- 工程、history、revision、dirty、Schema 和 IPC 行为均不变。

**定向验证**：

```powershell
npx vitest run tests/unit/designTokens.test.tsx
npm run typecheck
```

再显式运行 `rg` 审计 Workspace 中的可见 AI 短语/`navigator.clipboard`，以及 Design Tokens 中不再含 AI 文案。

### P5-01 — V9 稳定选择/上下文接口合同（非可见）

**可见结果**：教师界面保持不变，没有 AI 菜单、按钮、Clipboard 操作或字段选择器；核心保留一个可测试的纯 V9 上下文接口，供未来经确认的外部协作调用。

**必读文件**：

- `src/shared/courseProjectModel.ts` 的 authoring inventory
- `src/shared/authoringAddress.ts`
- `src/renderer/course/CourseStudioApp.tsx` 中 `inventoryFieldsForSelection/currentAiReference`，只作纯逻辑参考
- `src/renderer/authoring/aiSelectionReference.ts`，注意它主要服务旧 ProjectDocument，不能直接误用于 V9
- `src/main/courseSelectionBridge.ts`，只审计现有桥，不在本任务接入 App

**主要修改文件**：

- 新建 `src/renderer/authoring/courseAiHandoff.ts`，只含纯类型和纯上下文构造函数
- 新建 `tests/unit/courseAiHandoff.test.ts`

不得修改 `src/renderer/App.tsx`、工具栏、右栏、Clipboard、文件选择或现有 IPC；若现有 inventory 已能无损表达接口，可只增加窄 adapter 与测试，避免抽象化。

**实现合同**：

1. 使用 `deriveCourseProjectAuthoringInventorySnapshot`，不得手拼 JSON Pointer 或以 `hitId` 定位。
2. 根据显式 selection source、surface/scene 和 stable layer/block ID 过滤字段，返回 project/revision、location、target 与字段的结构化引用；该引用不是 UI packet，也不写入剪贴板。
3. Slide、Flow、Spatial 和全局控制器共用一个纯 helper，不复制四套地址解析。
4. 接口必须能让未来调用方识别 project/revision、location label/kind、target source/ID/label，以及字段 label、address、valueKind、currentValue。
5. `updateCurrentCourseSelection`、`CourseStudioApp` 和旧 ProjectDocument 逻辑只能作为兼容性审计对象；本任务不发布实时选择，不扩 IPC。
6. 不把接口结果持久化进工程、不触发 history、不调用网络或模型。

**必须补的断言**：

- 四类目标得到稳定地址，保存重开后地址不变。
- structural edit 导致 revision 变化时新接口返回新 revision，旧引用不会被默认为当前引用。
- 同 ID 不同 source 的目标不会串线。
- hitId 改变不影响 authoringAddress。
- 测试中没有挂载 App，也不出现 Clipboard 或可见 AI 文案。

**定向验证**：

```powershell
npx vitest run tests/unit/courseAiHandoff.test.ts tests/unit/authoringAddress.test.ts tests/unit/courseSelectionBridge.test.ts tests/unit/courseProjectProtocol.test.ts
npm run typecheck
```

### P5-02 — 单目标 Patch 安全边界接口（非可见）

**可见结果**：教师界面保持不变；未来调用方可使用纯 parser/预检接口判断一个窄单目标 Patch 是否能安全进入已有模型边界，但当前不选择文件、不确认、不应用。

**必读文件**：

- `src/renderer/course/courseStudioModel.ts` 的 `applyCourseAuthoringPatch`
- `src/renderer/course/CourseStudioApp.tsx` 的 Patch parser，仅作可提取参考
- `src/shared/ipcTypes.ts` 现有 `selectCourseAuthoringPatch`，只审计，不接入
- `src/renderer/store/editorStore.ts` V9 history wrapper

**主要修改文件**：

- 新建 `src/renderer/authoring/courseAiPatch.ts`，只含纯解析、预检和影响摘要类型
- 对应单测

不得修改 `App.tsx`、`TopToolbar.tsx`、`ConfirmDialog.tsx`、文件选择 IPC 或 Store action；不得新增实际调用 `applyCourseAuthoringPatch` 的产品路径。

**实现合同**：

1. parser 只接受当前单目标 `op="replace"` 的窄输入形状，拒绝未知字段形状、数组/多操作输入、负 revision 和无效地址；不读取文件、不访问网络。
2. 预检从当前 inventory 解析教师可读目标与字段，但只返回结构化影响摘要和拒绝原因，不显示确认框或内部路径。
3. 预检必须覆盖 expectedRevision、expectedValue、目标存在和 target unlocked；任一失败都不修改工程、history 或 dirty。
4. 纯接口与现有 `applyCourseAuthoringPatch` 使用同一 `authoringAddress`、revision 与锁定语义；不得另造 Patch 协议、Store 或 history。
5. 实际应用、Undo/Redo、文件导入和界面提示留待用户另行授权的功能任务。

**必须补的断言**：

- 有效单目标输入可得到确定的非持久化影响摘要。
- stale revision、locked 项、expectedValue 不符、非法地址和多操作输入均被预检拒绝且工程完全不变。
- 预检不产生 history/revision/dirty 变化，也不调用文件、网络或 UI API。
- 现有模型级 Patch 测试继续证明未来边界可以保持一次 mutation/一次 history 的语义，但不把它接入产品入口。

**定向验证**：

```powershell
npx vitest run tests/unit/courseStudioModel.test.ts tests/unit/courseProjectPatchCli.test.ts tests/unit/courseAiPatch.test.ts tests/unit/editorStoreV9Ownership.test.ts
npm run typecheck
```

### P5-03 — 批量外部协作占位边界（不实现协议）

**可见结果**：教师界面和工程协议保持不变；计划明确批量外部协作尚未实施，避免把未经真实用例验证的 batch 格式、文件入口或 UI 当作已支持能力。

**开始条件**：本任务不以设计通用 batch 格式为目标。只有用户提供真实、至少跨两个 location 的外部协作用例并单独授权可见工作流后，才新建后续计划；不得在当前任务猜测 `CourseAuthoringPatchBatchV1`、新增 IPC、Schema 或脚本格式。

**实现合同**：

1. 保持 P5-01/P5-02 的单目标纯接口窄且未接入产品；不新增 batch 类型、parser、文件格式或批处理 Store action。
2. 不新增“选择多页、套模板、批量应用”构造器、文件选择、影响确认或后台队列。
3. `scripts/patch-course-project.ts` 不因接口预留而扩展；编辑器打开且 dirty 时既有磁盘旁路保护继续有效。
4. P5-00 已清除当前可见 AI/批处理入口；本任务只防止重新引入，不删除历史或 donor 文件。

**必须补的断言**：

- P5-01/P5-02 的公开接口只表达单目标上下文/预检，不暗含 batch 操作。
- 当前 V9 `App.tsx`、工具栏和右栏没有新增 AI 或 batch 入口；单目标 parser 明确拒绝多操作输入。
- 没有新的 AI 网络请求、IPC channel、Schema 字段或持久化状态。

**定向验证**：

```powershell
npx vitest run tests/unit/courseAiHandoff.test.ts tests/unit/courseAiPatch.test.ts tests/unit/courseProjectPatchCli.test.ts
npm run typecheck
```

### P5-G — 外部 AI 接口预留 Gate

完成以下非可见验证：

1. 用 Slide、Flow、Spatial 和全局控制器的 fixture 构造稳定选择/上下文引用，验证重开、revision 和 source 隔离。
2. 对单目标纯预检输入验证 valid、stale、locked、expectedValue 不符和非法地址；所有拒绝路径均不写工程。
3. 审查正式 `App.tsx`、`Workspace.tsx`、工具栏、右栏和 `DesignTokensEditor.tsx`：没有 AI 上下文复制、Clipboard、Patch 导入、影响确认、应用、聊天、模型入口或可见 AI 文案。

Gate 额外检查：

- 编辑器没有任何模型网络请求、账号、Provider 或对话状态。
- 没有新 IPC、Schema、持久化状态、批量协议或手工批处理面板。
- P5 不宣称用户已经能够经 AI 完成单改或批改；接口只为未来单独授权的接入保留。

## 11. P6：发布、导出与产品收尾

### P6-01 — Mixed 与发布导出真实样例

**可见结果**：一个代表 Mixed 工程从编辑、Trial、整课预览到适用导出都使用同一内容真相。

**必读入口**：

- `src/renderer/export/course/**`
- `src/player/PublishedCourseApp.ts`
- `tests/e2e/v9TrialRun.spec.ts`
- `tests/unit/multiSurfaceExports.test.ts`
- 历史 `docs/plans/M7_M8_DELIVERY_HARDENING_PLAN.md` 仅作已有能力核对

**验收矩阵**：

| 路径 | 必须验证 |
|---|---|
| 保存重开 | 单一 global controller、稳定 ID、Flow 文本、Spatial camera 均一致 |
| HTML/网页包 | Slide/Flow/Spatial 可导航，目录完整，离线资源可用 |
| PDF | 适用内容真实生成；动态内容按已有差异说明静态化 |
| PPTX | Slide 路径保持既有可编辑/静态后备合同 |
| DOCX | Flow 语义结构与最新正文一致 |
| 静态控制器 | 遵守 `includeInStaticExports`，默认不误导性导出交互控制条 |

不为不适用的 Surface 强行伪造可编辑导出；失败必须给教师可读说明。

### P6-02 — 同步文档、Skill、能力卡与死入口事实

**主要文件**：

- `README.md`
- `PROJECT_COGNITION_INDEX.md`
- `COURSEWARE_DEVELOPMENT_PLAN.md` 的阶段状态
- `.agents/skills/**` 中直接声明产品能力的文件
- `agent-kit/capabilities/index.json` 及其生成源（仅在能力真实变化时）

**实现合同**：

1. 只声明真实可达能力；测试存在但 UI 不可达的能力不能写“已支持”。
2. 明确当前编辑器只保留非可见外部协作接口，删除任何暗示内置模型或可见 AI 工作流已经存在的说明。
3. 说明全局控制器可从任意页面修改，但底层仍只有一份 global item。
4. 运行 import graph/`rg` 确认 `CourseStudioApp` 等 donor 入口不可达；默认只记录事实，不删除文件。
5. 删除历史或 donor 文件属于破坏性操作，必须单独获得用户确认。
6. 若能力卡由脚本生成，修改生成源并运行 check，不手改生成产物来过门禁。

**定向验证**：

```powershell
npm run check:ai-capabilities
npm run test:agent-kit
git diff --check
```

### P6-G — 最终工程与体验 Gate

**工程 Gate**：

```powershell
npm run check:ai-capabilities
npm run typecheck
npm test
npm run test:compat
npm run build:desktop
npm run prepare:e2e
npx playwright test tests/e2e/v9GlobalControllerAndHealth.spec.ts tests/e2e/v9SpatialAuthoring.spec.ts tests/e2e/v9TrialRun.spec.ts
```

只有阶段合并或发布候选才运行 `npm run verify:full`；若它包含与当前 V9 路径无关的 preservation 门禁，必须分别报告，不得用旧 V8 视觉门禁替代当前体验复核。

**真实体验 Gate**：

- 四种代表工程在 1366×768 完成“找到 → 修改 → 试运行 → Undo → 保存”。
- Mixed 目录可到达三类 location。
- 同一控制器跨三类 Surface 一致，Trial session 不污染工程。
- Flow 正文输入流畅，中文输入法不误提交。
- 外部协作预留接口的目标隔离、revision/lock 拒绝和批量拒绝成立，且普通界面无 AI 控件。
- 适用导出真实打开，不只断言文件存在。

**结果口径**：

- 全部机器验证通过：`engineering candidate`。
- 代表课例完成真实视觉与互动复核：可以提议 `art candidate`。
- 只有用户明确验收：`accepted`。

## 12. 计划维护规则

以下串行状态规则只用于追溯 P0–P2。P3–P6 的状态、文件归属、最小测试和最终全量 Gate 以并行执行索引为准。

1. 任务开始时把该任务改为 `IN_PROGRESS`；完成全部验收后改为 `DONE`，并把唯一直接后继改为 `READY`。
2. 不在本文堆积长日志。每个任务只追加一行完成记录：日期、commit/工作树标识、验证摘要和已知风险。
3. 源码事实变化时，先更新 §3 和受影响任务，不保留互相矛盾的旧步骤。
4. 新需求先用总纲判断是否属于轻量编辑器；只有属于当前路线时才拆成本文任务。
5. 需要启用可见 AI 交互、内置 AI、模板系统、重型手工排版或协议大迁移时，新建大版本研究计划，不塞进本文。

### 完成记录

| 日期 | 任务 | 代码标识 | 验证摘要 | 风险 |
|---|---|---|---|---|
| 2026-08-16 | P0-01 | `85dd3cd` / 工作树 | 七项源码事实仍成立；5 个定向 Vitest 文件、20 个用例通过 | P1 三项生产接线仍未闭合，尚未进行真实 Player 复核 |
| 2026-08-16 | P1-01 | 工作树 | Published Spatial 控制器接通 live audio/progress；定向 8 测试、typecheck、Player build 通过 | Mixed 目录与相机时序仍待 P1-02/P1-03；真实 Trial 留给 P1-G |
| 2026-08-16 | P1-02 | 工作树 | Mixed 目录列出三类 location 并走统一守卫；定向 30 测试、typecheck、Player build 通过 | Spatial 相机时序仍待 P1-03；真实 Trial 留给 P1-G |
| 2026-08-16 | P1-03 | 工作树 | 同一 Spatial surface 的 frame A→B 保持会话 pose；定向 5 测试、typecheck、Electron 相机保存/跨 surface reset 回归通过 | P1-G 仍需真实 Mixed Trial/Player 纵切 |
| 2026-08-16 | P1-G | 工作树 | 43 项 P1 定向测试、typecheck、Player build、prepare:e2e 与 4 条 Electron 回归通过；Mixed Trial 真实 iframe 覆盖 Spatial 音频/进度/三类目录 | 自动化证据为 engineering candidate；视觉质量仍需后续真实体验复核 |
| 2026-08-16 | P2-01 | 工作树 | 专用 global-controller target/命令与 Store 包装层；41 项定向测试、typecheck 通过 | P2-02 至 P2-04 尚需把显式来源接入三类作者 UI |
| 2026-08-16 | P2-02 | 工作树 | Slide scene snapshot 用显式 `source: global` proxy 接入单一控制器；77 项相关单测、typecheck 通过 | 自动化为 engineering candidate；Flow/Spatial 作者入口仍待 P2-03/P2-04 |
| 2026-08-16 | P2-03 | 工作树 | Flow overlay/右栏用显式 source target 接入控制器选择、pointer-up 单次变换与共用属性；43 项相关单测、typecheck 通过 | 自动化为 engineering candidate；Spatial 屏幕层作者入口仍待 P2-04 |
| 2026-08-16 | P2-04 | 工作树 | Spatial 以 world 外的屏幕控制器代理接入全局选择、单次 pointer-up 变换和共用属性；56 项相关单测、typecheck 通过 | 自动化为 engineering candidate；共享层入口收敛仍待 P2-05 |
| 2026-08-16 | P2-05 | 工作树 | V9 隐藏独立共享层入口，三类当前页列表保留显式来源/只读影响查看与控制器定位；32 项定向测试、V8 兼容、typecheck 通过，归档字节语义回归覆盖 | 自动化为 engineering candidate；跨 Surface E2E Gate 仍待 P2-G |
| 2026-08-16 | P2-G | 工作树 | Mixed Electron Gate 覆盖单一 global 控制器的 Slide/Flow/Spatial 修改、非 1× 固定屏、Undo/Redo、保存重开和 Trial 隔离；49 项 P2 单测、typecheck、prepare:e2e、3 条迁移后 E2E 通过 | 自动化为 engineering candidate；P3 开始前仍无真实教师视觉验收 |
