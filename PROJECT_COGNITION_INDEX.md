# 项目认知索引

> SOURCE_BASELINE: `e2e34aa29ddb72abb2c691e414a4d8f461f35b2c`
> PRODUCT_CHECKPOINT: `7f04a8a4286280209e7cb04982001bf047d09126`
> UPDATED: 2026-08-17
> PURPOSE: 帮助新 Agent 用最少上下文进入真实代码

本文件是导航，不是源码替代品。若索引与源码、Schema 或可复现证据冲突，以源码事实为准并在同一变更中修正索引。

结构化入口位于 [`repo-index/`](repo-index/README.md)。当前只维护 modules、features 和 tests，不建设全量符号图、依赖图、热点系统或知识图谱服务。

## 1. 新 Agent 的最短启动顺序

1. 阅读 [`AGENTS.md`](AGENTS.md)。
2. 阅读唯一总纲 [`COURSEWARE_DEVELOPMENT_PLAN.md`](COURSEWARE_DEVELOPMENT_PLAN.md) 的目标、恢复基线、能力底线、实施 Gate 与完成定义（§1、§3、§5、§8、§11）。
3. 从当前任务入口 [`docs/tasks/v9-editor/00_INDEX.md`](docs/tasks/v9-editor/00_INDEX.md) 领取一个任务，并阅读共享合同与该任务文档。
4. `docs/plans/AI_NATIVE_*` 与旧 M3–M8 计划只作历史取证，不是当前执行入口；不得从中恢复“隐藏共享层、禁用既有能力或只做 FINAL”的旧路线。
5. 运行 `git status --short`，保留所有不属于当前任务的修改和未跟踪文件。
6. 从本文件“改什么看哪里”进入相关源码，不先遍历全仓库。
7. 修改前确认当前源码，而不是照搬索引中的示例或 donor 路径；只运行任务文档列出的最小验证。

## 2. 真相优先级

1. 用户当前明确要求与最近的 `AGENTS.md`。
2. `src/shared/*Schema.ts`、当前源码和可复现运行证据。
3. [`COURSEWARE_DEVELOPMENT_PLAN.md`](COURSEWARE_DEVELOPMENT_PLAN.md) 的产品决策和执行路线。
4. 本索引及 `repo-index/*.json`。
5. 历史阶段计划、评估原稿、旧截图、示例构建脚本和 donor 代码。

索引基准 SHA 不必与每次 docs-only 提交完全相同。使用前运行：

```powershell
git diff --name-only e2e34aa29ddb72abb2c691e414a4d8f461f35b2c..HEAD -- src tests scripts agent-kit .agents package.json
```

若输出触及本任务对应模块，先核对实际代码并更新相关索引条目；文档提交本身不会使整个索引失效。

## 3. 正式入口链

### Electron 与 Renderer

```text
src/main/index.ts
  → src/main/createWindow.ts
  → src/preload/index.ts
  → src/renderer/main.tsx
  → src/renderer/ProductApp.tsx
  → src/renderer/App.tsx
```

`ProductApp.tsx` 只能进入原 `App.tsx`。任何新 Shell、CourseStudioApp、V9EditorShell 或第二产品入口都违反根计划。

### 编辑工程真相

```text
Course Project V9 Schema/Types
  → editorStore.courseSession
  → v9SlideVerticalSlice / slideEditorView / slideEditorCommands
  → App 组装窄 documentControl / slideAuthoring 输入
  → 原 UI 与原 Workspace
```

兼容的 V8 fields/actions 仍可能存在于 `editorStore.ts`，但不能成为默认新建、保存、恢复、发布或已接 V9 UI 的写入目标。

### Slide 作者画布

```text
V9 Course session
  → buildV9SlideWorkspaceSnapshot
  → WorkspaceSlideAuthoringInput
  → Workspace.tsx
  → EditorPhaserBridge / EditorScene / ProxyNodeAdapter
  → Phaser 负责命中和几何

同一 V9 snapshot
  → Published/authoring preview projection
  → Player host
  → Player 负责视觉真相
```

不要让 Phaser proxy 成为保存或视觉数据源，也不要从 Player DOM/Canvas 反建工程。

### Published 运行与导出

```text
CourseProjectArchiveData
  → buildPublishedCourseV2Payload
  → PublishedCourseApp
  → CoursePlayer
  → SlideSurfaceHost / FlowSurfaceHost / SpatialSurfaceHost

同一 producer
  → buildCoursePackages / buildCoursePptx / buildCoursePrintArtifacts
```

## 4. 稳定模块地图

| 模块 | 主要文件 | 负责什么 |
|---|---|---|
| V9 工程合同 | `src/shared/courseProjectTypes.ts`, `courseProjectSchema.ts`, `courseProjectModel.ts` | 工程类型、校验、纯模型与引用一致性 |
| Published 合同 | `src/shared/publishedCourseTypes.ts`, `publishedCourseSchema.ts` | 发布 payload 的类型与校验 |
| 编辑会话 | `src/renderer/store/editorStore.ts` | 当前 backend、V9 session、history、文件/UI session action |
| Slide 模型 | `src/renderer/course/v9SlideVerticalSlice.ts`, `slideEditorView.ts`, `slideEditorCommands.ts` | location/scope/selection、只读投影与原子 command |
| 原产品壳 | `src/renderer/App.tsx`, `src/renderer/ui/**`, `src/renderer/styles/globals.css` | 教师可见工作流和原 UI |
| Phaser 作者链 | `src/renderer/ui/Workspace.tsx`, `workspaceSlideAuthoring.ts`, `src/renderer/phaser/**` | 命中、选择、变换、viewport 和作者代理 |
| 文件生命周期 | `src/renderer/project/courseProjectArchive.ts`, `recoveryWriteCoordinator.ts`, `src/main/projectPersistence.ts`, `src/main/ipc.ts` | 打开、保存、sidecar、恢复、最近工程和关闭 |
| Published Player | `src/player/PublishedCourseApp.ts`, `src/player/surfaces/**` | 课程会话、表面 Host、导航和视觉运行 |
| 互动与动态运行 | `src/player/InteractionEngine.ts`, `CourseEventBus.ts`, `DeclarativeCourseState.ts`, Runtime/Component hosts | 事件、条件、动作、运行时和组件会话 |
| 发布导出 | `src/renderer/export/course/**` | producer、HTML/网页包、PPTX、PDF/DOCX |
| Builder/能力卡 | `.agents/skills/**`, `agent-kit/**`, `courseware-capabilities/**` | 课件策划、构建、能力发现和验证 |

详细机器可读版本见 [`repo-index/modules.json`](repo-index/modules.json)。

## 5. 改什么看哪里

| 任务 | 首先查看 | 同时核对 | 不要做 |
|---|---|---|---|
| 新建/打开/保存/关闭/恢复 | `App.tsx`, `editorStore.ts`, `courseProjectArchive.ts` | main IPC、persistence、recent、sidecar | 回落 `saveProjectAsync` 或双写 V8 |
| Slide scene/state/scope command | `v9SlideVerticalSlice.ts` | `slideEditorView.ts`, Store wrapper, Schema | 从 V8 view 反建 V9 |
| 画布选择/拖动/缩放 | `Workspace.tsx`, `workspaceSlideAuthoring.ts` | Phaser bridge、stage viewport transform | 新建 Slide Workspace |
| 图层/属性/元素 UI | 对应原 `*Tab.tsx` | App documentControl、Store target token | 受控路径读取 hidden V8 project |
| 教师控制器作者态 | V9 slice、Workspace、Nodes/Properties | teacher controller layout、preview projection | 编辑态执行导航 |
| 教师控制器播放态 | `PublishedCourseApp.ts`, `SlideSurfaceHost.ts` | runtime session、picker、course state | SurfaceHost 和 App 双执行动作 |
| Slide 互动 | producer、`InteractionEngine.ts`, Published App/Slide Host | event bus、状态与 destroy | 用 Runtime 热点永久绕行 |
| Runtime/Component | shared contracts、player hosts、Developer/Components/Properties | asset/package sidecar、authoringAddress | 复制 CourseStudio 动态编辑器 |
| Flow | V9 model/view、原壳适配、`FlowSurfaceHost.ts` | PDF/DOCX、统一课程状态 | 复制 FlowBlockEditor UI |
| Spatial | viewport/relations model、原壳适配、`SpatialSurfaceHost.ts` | world/viewport 坐标分离 | inverse-scale 补偿控制器 |
| HTML/网页包 | `buildPublishedCourse.ts`, `buildCoursePackages.ts` | Player bundle、资源清单 | 恢复 `.course-nav` |
| PPTX/PDF/DOCX | 对应 `buildCourse*.ts` | print plan、fallback、真实打开 | 只断言文件存在 |
| 能力说明 | docs、Skill、Agent Kit capability index | 当前正式 UI 和 tests | 声明尚不可达能力 |

## 6. 当前阶段与首要风险

当前长期方案与执行任务包已就绪，产品代码执行尚未开始。第一领取项是 `T01`“恢复基线与 Git 供体审计”，不是发布 FINAL。首选恢复候选是 `e2e34aa`，条件回退点是 `7f04a8a`；当前含大量未提交轻量化改动的工作区只作取证和局部代码供体，不在原地 hard reset 或继续堆叠修复。

M4 的 Slide Player、Runtime API 2/3、Component API 4 和课程状态基础，以及 `e2e34aa` 已集成的 Flow/Spatial/store/原 App 壳，都是可复用工程资产。但已有绿灯没有覆盖右键、完整 Delete、V8 默认表面等价和真实体验，因此不能把旧 integration candidate 当成完成状态。

当前优先顺序：

1. 先执行任务包 Wave 0，固定基线与 donor 矩阵。
2. 按索引 Wave 1/2 以文件独占方式并行闭合统一动作、课程结构、Slide、global/surface/controller/audio、Flow、Spatial 与 Player/导出。
3. 由 T10 串行接入 App/store/Workspace/shell 热点，T12 最终统一运行全量验证。
4. 当前编辑器内仍没有可见 AI；`courseAiHandoff` / `courseAiPatch` 只是 internal/reserved，不参与本轮编辑器完成判定。

当前结果不能高于 `engineering candidate`；真实 UI 与关键互动未复核前不称 `art candidate`。

## 7. 关键不变量

- 原 App、原 Workspace、原 UI 文件和 Phaser 链保持正式可达。
- 一个当前工程、一个 Store 生命周期、一个 V9 写入真相。
- 一次用户操作一次 command/history/revision。
- 选择和异步提交使用 session/location/state/scope/layer 的稳定 target，拒绝陈旧回调。
- editor view、authoring proxy、Player preview 各自是只读投影，不可互相反序列化。
- global/surface 作者态可显示 base 对象；Player 必须遵守 effective visibility。
- global/surface 继续作为 V9 存储、作者与运行能力；四态左栏固定提供“共享内容 → 全局层（全课）”，统一有效图层不能取代该可见入口。
- 纯 Slide/Flow/Spatial 与 Mixed 从 `locations/surfaces` 推导，不新增 `projectMode` 或 V10 迁移；新建工程和课程结构必须有三类 surface 的直接创建入口。
- “轻量”只控制默认信息密度和渐进披露，不得删除、禁用或隐藏到不可发现 V8 已有能力。
- 编辑态控制器 inert；试运行控制器可执行但只改会话。
- Spatial world 与 viewport 控件使用不同坐标空间。
- HTML/网页包无画布外旧导航。
- 普通教师 UI 不暴露内部协议词和 ID。

功能级不变量见 [`repo-index/features.json`](repo-index/features.json)。

## 8. 验证选择

优先查询 [`repo-index/tests.json`](repo-index/tests.json)。通用原则：

- docs/index：只查链接、JSON、diff。
- 单函数/组件：只运行任务文档列出的 1–4 个最相关 Vitest 文件。
- T01–T11 不运行全量 typecheck、build、Vitest、Electron/Playwright 或 preservation visual，也不重捕截图。
- 只有 [`T12`](docs/tasks/v9-editor/13_FINAL_FULL_GATE.md) 在最终整合后统一运行 `verify:full`、全部 V9 Playwright、course cases 和真实体验矩阵。

不要因为存在 `npm run verify:full` 就在开发循环运行它；中间类型或构建风险记录到 HANDOFF，由最终 Gate 一次性验证。

## 9. 高风险文件提示

这些文件职责多、调用链长，修改前先找窄边界，但“高风险”不等于必须先重构：

- `src/renderer/App.tsx`
- `src/renderer/store/editorStore.ts`
- `src/renderer/ui/Workspace.tsx`
- `src/renderer/course/v9SlideVerticalSlice.ts`
- `src/player/PublishedCourseApp.ts`
- `src/player/surfaces/slide/SlideSurfaceHost.ts`
- `src/shared/courseProjectModel.ts`
- `src/renderer/export/course/buildPublishedCourse.ts`

只做当前结果需要的最小改动。没有当前消费者时，不抽象 adapter、service、command framework 或插件层。

## 10. Donor、旧协议与生成物

不可作为正式前端母体：

- `src/renderer/course/CourseStudioApp.tsx`
- `CourseSurfaceCanvas.tsx`
- `V9EditorShell.tsx`
- `course-studio.css`
- donor 的整套 Flow/Spatial/互动/播放 UI

V8 类型、schema、archive 和测试仍可能服务显式导入与兼容验证；不能按文件名批量删除。

不要手工修改 `dist-player/`、`dist-renderer/`、`dist-electron/`、`output/`、`test-results/` 或示例内生成的 `course.html`。只有对应源码变化且任务要求刷新时才运行生成脚本。

## 11. 工作树卫生

- `git status --short` 中已有修改默认属于用户或其他工作，不得覆盖、回退或顺手提交。
- 若工作树出现 `PLAN_EVALUATION_REPORT.md` 等未跟踪评估材料，默认视为用户自有文件；除非用户明确要求，不读取、修改或纳入提交。
- 不使用 `git reset --hard`、批量 checkout 或递归删除来清理工作树。
- 提交前只暂存本任务明确修改的文件。
