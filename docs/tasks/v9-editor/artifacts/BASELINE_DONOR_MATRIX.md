# T01 恢复基线与 Git 供体矩阵

> 审计日期：2026-08-17
> 工作区：`C:\Users\74755\Documents\HTML课件编辑器`
> 生产代码：只读；本文件为唯一新建产出
> 结论：**恢复基线 = `e2e34aa29ddb72abb2c691e414a4d8f461f35b2c`**
> 条件回退：`7f04a8a4286280209e7cb04982001bf047d09126`（当前不触发）
> 当前脏工作树：仅取证与局部供体，禁止 reset / 整体当补丁

## 0. SHA 验证（`git cat-file -e <sha>^{commit}`）

| 候选 | 完整 SHA | 对象 | 单行说明 | 日期 |
|---|---|---|---|---|
| 首选基线 | `e2e34aa29ddb72abb2c691e414a4d8f461f35b2c` | 存在 | docs(plan): mark P1/P2 closure tasks integrated and record Gate evidence | 2026-08-16 14:16:42 +0800 |
| 条件回退 | `7f04a8a4286280209e7cb04982001bf047d09126` | 存在 | integrate(T-CSTATE): replay/restart single entry and M4-E recovery contracts | 2026-08-16 01:44:47 +0800 |
| V8/早期 V9 供体 | `3e41ec058627d38c4b9f5439b454cc72331e1485` | 存在 | feat: rebuild courseware authoring around Project V9 | 2026-08-14 10:54:06 +0800 |
| V8 视觉基线 | `378c195f74e562f3ad5e47c494b94e709ccb57dd` | 存在 | test(contracts): freeze V8 editor visual baseline | 2026-08-14 23:45:57 +0800 |
| V8 行为合同 | `14890bb76d5743189114f0ff2d42c85a5aa8a4a2` | 存在 | test(contracts): map protected V8 editor behavior | 2026-08-14 23:57:21 +0800 |
| Slide 纵切 | `636164114ea46a72671acf4851236ff9f0ce7bf8` | 存在 | integrate(T-GEST): property-to-canvas sync and one-gesture-one-history across scopes | 2026-08-16 01:12:21 +0800 |

祖先关系（`git merge-base --is-ancestor` 均为 0）：

```text
3e41ec0 → … → 378c195 → 14890bb → … → 6361641 → 7f04a8a → e2e34aa → HEAD
```

`378c195` 是 `14890bb` 的祖先（`git merge-base` = `378c195`）。

未猜测任何替代提交。未运行 typecheck / build / 全量测试 / E2E。未跑定向 Vitest：入口链、`createNewProject` vs `createNewCourseProject`、键盘桩和文件是否存在均可由 `git show` / 工作区源码直接证明。

---

## 1. 工作区与 Git 事实

### 1.1 当前仓库

| 项 | 事实 |
|---|---|
| branch | `codex/v9-editor-v8-base`（跟踪 `origin/codex/v9-editor-v8-base`，ahead 2） |
| HEAD | `85dd3cd60a5f04beccf235c1ebab21d4badae286` |
| HEAD 说明 | `revert(plan): restore plan documents to closure-round state per user request`（2026-08-16 16:57:04 +0800） |
| 工作树 | 脏；未执行 reset / checkout 覆盖 / 清理 |

`git status --short`（审计开始时）：60 个已跟踪修改 + 未跟踪文档/任务包/AI 预留接口/布局策略。代表性已跟踪源码：

- 热点：`src/renderer/App.tsx`、`store/editorStore.ts`、`ui/Workspace.tsx`、`ScenePanel.tsx`、`RightSidebar.tsx`、`TopToolbar.tsx`、`styles/globals.css`
- 作者：`v9SlideVerticalSlice.ts`、`flowEditorView.ts`、`FlowWorkspace.tsx`、`SpatialWorkspace.tsx`、`workspaceSlideAuthoring.ts`、`stageViewportTransform.ts`
- Player：`PublishedCourseApp.ts`、`SpatialSurfaceHost.ts`
- 合同/测试：`tests/contracts/v8-behavior-map.json`、三张 V8 壳层 PNG + `geometry.json`、多份 unit/e2e

未跟踪源码（局部供体，不是基线）：

- `src/renderer/course/courseEditorLayout.ts`（纯 locations→layout 推导，无 `projectMode`）
- `src/renderer/authoring/courseAiHandoff.ts`、`courseAiPatch.ts`（文件头写明未挂载纯接口，不得被产品 import）
- 对应测试与 `tests/e2e/v9MixedTrialRun.spec.ts`

### 1.2 `e2e34aa..HEAD`（已提交）

```text
568a537 docs(plan): record M5/M6 closure-round audit and follow-up task board
85dd3cd revert(plan): restore plan documents to closure-round state per user request
```

`git diff --name-only e2e34aa..HEAD -- src tests scripts agent-kit .agents package.json`：**空**。

`git diff --stat e2e34aa..HEAD` 仅 3 个示例 `course.html`（±181，无产品逻辑）。HEAD 相对首选基线 **没有 src/tests 提交**。真实产品偏差全部在脏工作树。

### 1.3 工作区相对 `e2e34aa`（真实 diff）

`git diff --stat e2e34aa`：60 个已跟踪文件，**+9906 / −3892**。其中 `src/tests/scripts` 相对 HEAD 为 51 文件、**+9278 / −3354**。最大块：

| 路径 | 相对 e2e34aa |
|---|---|
| `src/renderer/App.tsx` | +1013 行级 diff；文件 3253 → 3997 行 |
| `src/renderer/ui/FlowWorkspace.tsx` | +647；467 → 917 行 |
| `src/renderer/ui/SpatialWorkspace.tsx` | +345；946 → 1270 行 |
| `src/renderer/course/v9SlideVerticalSlice.ts` | +334（全局控制器 target/transform/patch） |
| `src/renderer/ui/RightSidebar.tsx` | +279 |
| `src/renderer/ui/ScenePanel.tsx` | +258 |
| `src/renderer/store/editorStore.ts` | +76（`selectCourseGlobalController` 等包装） |
| `tests/contracts/v8-behavior-map.json` | 整文件重写；172 → 178 展开用例 |
| V8 壳层 PNG + `geometry.json` | 二进制/几何被重捕 |

这就是根总纲说的「轻量化脏改动」：壳层、测试合同和截图基线一起变，不能当恢复主干。

### 1.4 `7f04a8a..e2e34aa`（已闭合、已在首选基线内）

约 36 个提交。产品向包括：Flow/Spatial 读模型与命令、App 壳接线、store 命令、Player Spatial host、试运行、课程位置导航、Flow 统一图层。`git diff --stat 7f04a8a e2e34aa` 仅热点已是：

- `App.tsx` +683
- `editorStore.ts` +1058
- `ScenePanel.tsx` +294
- `Workspace.tsx` +217

`7f04a8a` **没有** `FlowWorkspace.tsx` / `SpatialWorkspace.tsx` / `flowEditorView.ts` / `spatialEditorView.ts`。Player 三 Host 文件在 `3e41ec0` 已存在；作者 UI 在 M5/M6 才进原 App。

---

## 2. 正式入口链（当前工作区 = `e2e34aa` = `7f04a8a`）

```text
src/renderer/main.tsx
  → resolveEditorStartupBackend(search)
       ? activateV9SlideFixture()          // 仅 ?editor-backend=v9-slide-test
       : createNewCourseProject()          // 默认产品
  → ProductApp.tsx
  → App.tsx
```

证据：

- 工作区 / `e2e34aa` / `7f04a8a` 的 `ProductApp.tsx` 均为 `return <App />`，无 `CourseStudioApp`、无 `?editor=legacy-v8`。
- `3e41ec0` 的 `ProductApp.tsx` 默认 `CourseStudioApp`，`?editor=legacy-v8` 才进原 `App`。切换发生在 `dc190ed`（2026-08-15，`refactor(renderer): make original App the only product entry`），已是 `7f04a8a`/`e2e34aa` 祖先。
- `CourseStudioApp.tsx` 在上述提交仍存在，但是死代码入口。`tests/unit/editorPreservationGuard.test.ts` 禁止 `ProductApp` 再 import 它。
- `createNewCourseProject()` → `createV9CourseEditorState()` → `createCourseProject({ title: '未命名课件' })`：单一 Slide location/surface + 默认教师控制器 `globalLayerItems`。无 `projectMode`（全 `src` 无匹配）。
- `createNewProject()` 仍把 `courseSession: null` 并写入 V8 `state.project`。`App.tsx` **不调用**它。默认产品不走这条。
- 保存：`App.handleSave` 在 `courseSession === null` 时抛错；成功路径 `captureV9SlideVerticalSliceArchive` → `createCourseProjectArchiveAsync` → `desktopApi().saveProject` → `completeCourseProjectSave`。
- 打开/恢复/V8 显式导入：`loadCourseProject` / `importProjectV8ArchiveAsCourseProjectAsync`。
- Player：`buildPublishedCourseV2Payload` → `PublishedCourseApp` → `SlideSurfaceHost` / `FlowSurfaceHost` / `SpatialSurfaceHost`。`e2e34aa` 与 `7f04a8a` 均已 import 三 Host。
- 导出：同一 producer → `buildPublishedCourseStandaloneHtml` / `buildCoursePackages` / `buildCoursePptx` / `buildCoursePrintArtifacts`。`buildHtml()` 仅在 `courseSession === null` 时回落 V8 `buildExportPayload`（非默认）。
- 试运行：`trialRunOverlay.ts` 对 `slide-scene` / `flow-block` / `spatial-camera` 均 `trialRunSupportedForLocation === true`，payload 来自 `buildPublishedCourseV2Payload`。

`e2e34aa` **满足**「V9 单一工程真相 + 原 App 壳」。不触发条件回退（未违反单一真相、保存链未断、也不是多子系统都要推倒）。

---

## 3. 测试打在哪条路径

| 层 | 启动/夹具 | 实际验证的后端 | 含义 |
|---|---|---|---|
| 产品 `main.tsx` | 无 query | `createNewCourseProject()` → `courseSession` | 默认 V9 |
| `tests/e2e/v9DefaultBoundary.spec.ts` | 无 fixture query | 标题「未命名课件」、拒绝普通打开 V8 | **默认 V9 路径** |
| `tests/e2e/v9SlideVerticalSlice.spec.ts` | 默认 `?editor-backend=v9-slide-test` | `activateV9SlideFixture()` | V9，但是纵切夹具，不是空白新建 |
| 其他 `tests/e2e/v9*.spec.ts` | `launchEditor()` 无 legacy query | 默认或夹具 V9 | 不是 `legacy-v8` 路由 |
| `14890bb` / `e2e34aa` 行为图 12+1 套 | `editorStore.test.ts` 等 `beforeEach` → `createNewProject()` | `courseSession === null`，写 V8 `state.project` | **遗留 V8 store 路径**，不是默认产品 |
| `editorStoreV9Ownership.test.ts` | 先 `createNewProject()`，用例内再 `createNewCourseProject()` | 证明 V9 命令不污染 V8 truth | 所有权测试，不是 V8 合同本身 |
| `tests/e2e/editor.spec.ts` | 行为图仍列出 | **3e41ec0 起文件已删除**（最后出现在 3e41ec0 之前的 V8 历史） | 合同悬空 |
| `scripts/verify-editor-preservation.ts` | `entryMode === 'transition'` 仍 `goto ...?editor=legacy-v8` | 产品路由已无此开关 | 历史残留，不能当 V9 无回退证据 |
| 工作区 `globalLayerUi.test.tsx` / `scenePanelDocumentControl.test.tsx` | 出现 `hideSharedLayerEntries: true` | 把「隐藏全局入口」写进期望 | **合同污染**，勿带入恢复分支 |

结论：`14890bb` 仍是最低行为清单，但当前自动化 **没有** 在默认 V9 路径上重跑这 172 例。Wave 1/2 不得宣称「V8 合同已在 V9 通过」。`?editor=legacy-v8` 产品路由在 `dc190ed` 已拆除；真正的分叉是 store 的 `createNewProject()` vs `createNewCourseProject()`。

---

## 4. 基线选择与否决

### 4.1 选择：`e2e34aa`

可验证理由：

1. `ProductApp` → 唯一 `App`；`main.tsx` 默认 `createNewCourseProject()`（与 `7f04a8a` 相同，优于 `3e41ec0`）。
2. 保存/打开/导入已走 `courseSession` + Course Project V9 archive（`App.tsx` `handleSave` / `loadCourseProject`）。
3. 已含 Flow/Spatial 作者文件并把它们接到原壳（`7f04a8a` 没有这些文件）。
4. Player 三 Host + 发布 producer 已在；M5/M6 收口提交（试运行、位置导航、Flow 图层）已合入。
5. 早于本轮脏工作树；`e2e34aa..HEAD` 无 src/tests。从它建干净恢复 worktree 不会带上 `hideSharedLayerEntries`、行为图重写或重捕截图。
6. 缺口是已知入口退化（复制/粘贴桩、Delete 限制、无右键、新建只有 Slide），不是「V9 真相破裂」或「多子系统需重写」。符合根总纲 §3.4，不触发回退到 `7f04a8a`。

### 4.2 否决：当前工作区作基线

- 60 个已跟踪 + 44 个未跟踪同时改 UI、实现、`v8-behavior-map`（172→178）和 V8 壳层截图。
- `App.tsx` 对 Slide `documentControl` 设 `hideSharedLayerEntries: true`，`ScenePanel` 因此不渲染「全局层 / 当前内容共用」。`e2e34aa`/`7f04a8a` 无此字段。违反产品不变量。
- `onAddFlowSurface` / `onAddSpatialSurface` 被 `courseEditorLayout` 限制：纯 Slide 时回调为 `undefined`。`e2e34aa` 始终提供两个入口。
- 未跟踪 `courseAi*` 即使未挂载，也不能进入「当前基线能力」。
- 不是一个 commit，无法安全恢复。

### 4.3 否决：`7f04a8a` 作主基线（保留为条件回退）

- `git cat-file`：无 `FlowWorkspace.tsx`、`SpatialWorkspace.tsx`、`flowEditorView.ts`、`spatialEditorView.ts`。
- `App.tsx` 无 `addCourseSurface`；`editorStore.ts` 无该 action。
- 键盘与 `e2e34aa` 同样：`courseSession` 下「复制/粘贴暂不可用」，Delete 仅单选 Slide 非 global。回退 **不会** 修好 P0。
- 它 **没有** 违反 V9 单一真相（入口与新建已是 V9）。否决原因是会丢掉已闭合的 Flow/Spatial/壳接线，且重放 `7f04a8a..e2e34aa` 必须改 T10 热点，不能整串 cherry-pick。
- 仅当独立恢复 worktree 证明 `e2e34aa` 保存/重开断裂，或 Slide+Flow+Spatial 都要推倒时才用。

### 4.4 否决：`3e41ec0` 作产品基线

- `ProductApp` 默认 `CourseStudioApp`，原 `App` 只在 `?editor=legacy-v8`。这是根总纲明确要消除的双表面。
- `main.tsx` 不调用 `createNewCourseProject()`。
- 其后 74+ 个提交才到 `7f04a8a`，再加 M5/M6 才到 `e2e34aa`。当基线等于丢掉 Slide 纵切、M4 恢复/控制器、Flow/Spatial。
- 用途：V8 表面实现、早期 CourseStudio Flow/Spatial 参考、行为图 `sourceCommit`。

### 4.5 否决：`378c195` / `14890bb` / `6361641` 作恢复 HEAD

- `378c195`：三张 PNG + `geometry.json`。视觉对照，不是编辑器主干。
- `14890bb`：只新增 `v8-behavior-map.json`。合同，且 `editor.spec.ts` 已不存在。
- `6361641`：已是 `7f04a8a` 祖先（随后 `ac073cf`…`7f04a8a`）。Slide 手势/属性同步供体；cherry-pick 到 `e2e34aa` 为空或冲突。

不建议整体重写。不把 Focusky 或可见 AI 扩入基线。全局层在 `e2e34aa` 保留为可见入口。

---

## 5. 不可直接 cherry-pick 与人工移植热点

### 5.1 禁止整串 / 整提交 cherry-pick

| 提交或范围 | 原因 |
|---|---|
| `3e41ec0` | 312 文件级重建 + 双入口。只能窄路径摘实现。 |
| `dc190ed` 及更早 ProductApp 双路由 | 已在基线内；反方向会恢复 `CourseStudioApp`。 |
| `82dbd39` `01a8141` `8344987` `c9c3a94` `11ef31e` `6c9fac5` | 已在 `e2e34aa`。若误从 `7f04a8a` 重放，它们改 `App.tsx` / `editorStore.ts` / `Workspace.tsx` / `ScenePanel.tsx`，属 T10 热点，必须人工接线。 |
| `31f9f64` | 已在 `e2e34aa` 的 V8 壳层重捕。工作区再次改写 PNG/`geometry.json`，两者都不要当「新基线」。 |
| `85dd3cd` `568a537` | 计划文档往返 + 示例 HTML。无 src。 |
| 当前脏工作树 | 不是 commit。禁止 `git add -A` 式恢复。 |
| `14890bb` | 仅 JSON；展开数/行号被工作区改过。用 `e2e34aa` 副本作合同原文。 |
| `378c195` | 二进制。对照用，不当代码补丁。 |
| `6361641` | 已祖先。T05 读当时 `v9SlideVerticalSlice`/`Workspace` diff，不 cherry-pick。 |
| 未跟踪 `docs/plans/AI_NATIVE_*`、`courseAiHandoff`/`courseAiPatch` | 取证/预留。不进当前基线，不新增调用点。 |

### 5.2 Wave 1/2 人工移植热点（按 owner）

从 **`e2e34aa` 干净树** 起步。热点文件只读，lane 出 `INTEGRATION_REQUEST`。

| 热点 | 从哪摘 | 不要整文件覆盖 | Owner |
|---|---|---|---|
| `App.tsx` 键盘 | `e2e34aa` 已有桩：「复制/粘贴暂不可用」；Delete 仅 Slide 单选非 global。V8 分支 `copySelectedNodes`/`pasteNodes`/`deleteSelectedNodes` 仍在同文件 `courseSession === null` 时可用 | 工作区 +1013（折叠、`hideSharedLayerEntries`、纯 Slide 藏创建） | T02 定语义 → T10 接线 |
| `editorStore.ts` V8 剪贴板 | 同文件 `clipboardNodes` / `copySelectedNodes` / `pasteNodes`；`editorStore.test.ts` 仍测这条 | 不要把 V8 `createNewProject` 变回默认 | T02/T05/T09B |
| `ScenePanel.tsx` 全局入口 | **保留 `e2e34aa` 可见「全局层」「当前内容共用」** | 工作区 `hideSharedLayerEntries` | T04/T06；T10 不得再藏 |
| `Workspace.tsx` / `workspaceSlideAuthoring.ts` | `e2e34aa` Slide 画布；`6361641` 单手势 | 工作区与折叠/试运行缠在一起 | T05 → T10 |
| 右键 | **全历史 `src` 无 `onContextMenu`/`contextmenu` 编辑实现** | 无 donor | T04 新增窄路由 |
| `courseEditorLayout.ts` | 工作区未跟踪；纯推导、无持久化 mode | `App.tsx` 用它关掉纯 Slide 的 Flow/Spatial 创建 | T03 收文件；T10 只接「显示」不接「隐藏创建」 |
| 全局控制器 session API | 工作区 `v9SlideVerticalSlice.ts` + `editorStore` 包装 | 不要连带藏全局入口 | T06 → T10 |
| Player 目录 | 工作区 `PublishedCourseApp`：`#pickerLocations()` 取代仅 Slide `#pickerScenes()` | 与 Spatial `setLocationId` 回滚一起审 | T09 |
| Flow 就地/结构 | `e2e34aa` 已有 outline/commands；工作区 `FlowWorkspace` +450 行需逐段审 | 不要整文件盖过 `e2e34aa` | T07 |
| Spatial 画布/镜头 | `e2e34aa` 已有 workspace/camera/path/relation；工作区 +345 行需逐段审 | 同上 | T08 |
| 声音 | `App.tsx` `importSounds` 仍是 V8 store action；默认 `courseSession` 下未闭合到 V9 media | V8 `mediaTab.test.tsx` 合同 | T06/T09A |
| 测试 | 新 V9 测试可留在 lane；**不要**带工作区行为图/PNG/`hideSharedLayerEntries` 期望 | `14890bb`@`e2e34aa` 原文 | 各 lane + T11/T12 |

若协调者按总纲 §3.4 从 `e2e34aa` 建 `codex/v9-parity-reconstruction` worktree：本工作区保持不动。

---

## 6. 能力矩阵

每行：`能力` | `当前工作区事实` | `e2e34aa` | `7f04a8a` | `最佳 donor` | `现有测试` | `风险` | `建议 owner`

### 6.1 单一 App/Shell/Store 与 V9 默认新建/保存

| 能力 | 当前事实 | e2e34aa | 7f04a8a | 最佳 donor | 现有测试 | 风险 | 建议 owner |
|---|---|---|---|---|---|---|---|
| 单一 ProductApp→App | 是 | 是 | 是 | 已在基线（`dc190ed`） | `editorPreservationGuard` | 勿再引入 CourseStudio | T10 / T09B |
| 默认新建 V9 | `main`→`createNewCourseProject()`；仅 Slide+全局控制器 | 同左 | 同左 | `e2e34aa` `courseStudioModel.createCourseProject` | `v9DefaultBoundary`（「未命名课件」） | 无三类空白工程菜单 | T09B / T03 |
| 保存/重开 | `courseSession` 必有；V9 archive | 同左 | 同左 | `e2e34aa` `App.handleSave` | `editorStoreV9Ownership`、`v9DefaultBoundary` | `createNewProject()` 仍能把 session 置 null | T09B |
| V8 显式导入 | `handleImportLegacy`→`loadCourseProject(..., markDirty)` | 同左 | 同左 | `e2e34aa` | `v9DefaultBoundary` | 普通打开须继续拒绝 V8 | T09B |
| 第二 Store/App | 无；V8 字段残留 | 同左 | 同左 | 保持 `e2e34aa` | ownership 测试 | 行为图仍打 V8 字段 | T10 不双写 |

### 6.2 V8 壳层与 Slide 表面

| 能力 | 当前事实 | e2e34aa | 7f04a8a | 最佳 donor | 现有测试 | 风险 | 建议 owner |
|---|---|---|---|---|---|---|---|
| 原 App 壳几何 | 工作区重捕 PNG/`geometry.json` | `31f9f64` 后的壳层基线 | 更早壳 | **视觉对照用 `378c195`；恢复代码用 `e2e34aa`，不要用工作区截图** | `verify-editor-preservation`（脚本仍含 legacy URL） | 工作区截图把轻量化写成合同 | T10 / T12 |
| 场景/state | V9 scene/state 命令在 store；左栏场景列表仍在 | 同左 | 同左（无 Flow/Spatial 导航） | `e2e34aa` + `6361641` | `v9SlideVerticalSlice`、`v9SlideSceneSession`；V8 `editorStore.test.ts` 不证明 V9 | 最后一页不可删已有 V9 命令，须确认 UI | T05 / T03 |
| 画布选择/变换 | Phaser + `workspaceSlideAuthoring`；工作区有额外 viewport/controller 接线 | 已有 V9 snapshot→Workspace | M4 Slide 闭合 | `6361641` 手势 + `e2e34aa` Workspace | `workspaceSlideAuthoring`、`v9SlideVerticalSlice`、`stageViewportTransform` | 工作区 +187 Workspace 需审 | T05 |
| 文字/公式 | V9 可加 text/formula；就地编辑仍是已知 P0 | 同左 | 同左 | `e2e34aa` 画布；V8 `editorFormattingUi` 合同 | `v9Slide*`、`formulaEditorBridge` | 双击/IME/保存重开未在默认路径闭合 | T05 |
| 媒体 | V9 `addV9SlideMediaLayers`；替换在 V9 键盘路径仍「素材替换暂不可用」 | 同左 | 同左 | `e2e34aa` 添加；V8 MediaTab 替换/裁剪 | `v9SlideMediaLayerSession`、`mediaTab.test.tsx`（V8） | 替换/拖放未迁完 | T05 / T09A |
| 声音 | `importSounds` 仍绑 V8 store | 同左 | 同左 | V8 `MediaTab` + `editorStore.importSounds`（`3e41ec0`/`e2e34aa` 残留） | `mediaTab.test.tsx` | 默认 V9 会话可能听不见/存不下 | T06 |
| 图层 | 有效层列表存在；global 排序在 slice 仍抛「全局层暂不能调整顺序」 | 同左 | 同左 | `e2e34aa` NodesTab；工作区 NodesTab +148 仅供审 | `v9SlideLayer*`、`globalLayerUi`（工作区已改期望） | 跨 owner 假排序；工作区测试不可信 | T04 / T06 |
| 属性 | Slide 属性已接 V9；Flow/Spatial 专属在 e2e34aa 已有 tab | 工作区补了更多 controller/Flow 属性 | M4 以 Slide 为主 | `6361641` + `e2e34aa` Flow/Spatial props | `propertiesTabDocumentControl` | 工作区 +36 需与 T10 协调 | T05 / T07 / T08 |
| 互动 | V9 `deleteCourseInteractionRule` 等已接；完整 V8 规则编辑未必迁完 | 同左 | 同左 | V8 `interactionEditor.test.tsx` + `e2e34aa` App 接线 | 行为图 interaction 套件（V8 路径） | 只改测试会假绿 | T09A |
| 控制器 | 默认工程带全局教师控制器；工作区加了 locate/select/transform API | 可添加/选择；无工作区 locate 会话 | M4 `T-CTRL` 运行时合同 | `7f04a8a` 运行时 + 工作区 `captureCourseGlobalControllerTarget`（人工摘） | `v9GlobalControllerAndHealth`、`teacherController*` | 工作区「定位」与总纲 6.4「删除无意义定位」冲突，摘 API 不摘多余动作 | T06 / T09 |
| 试运行/导出 | overlay + `buildPublishedCourseV2Payload`；HTML/PPTX/印刷 | 同左；Player 目录偏 Slide scene | 同左，无 Flow/Spatial 作者试运行按钮（`6c9fac5` 之后才有） | `e2e34aa` 作者链；工作区 Player location picker 可摘 | `v9TrialRun`、`coursePublishPipeline`、`multiSurfaceExports` | 工作区 pipeline 测试 +296 可能绑新 UI | T09 |

### 6.3 右键、Delete/Backspace、多选、剪贴板

| 能力 | 当前事实 | e2e34aa | 7f04a8a | 最佳 donor | 现有测试 | 风险 | 建议 owner |
|---|---|---|---|---|---|---|---|
| 右键 | `src` 无 `onContextMenu`/`contextmenu` 编辑 | 无 | 无 | **无历史实现；必须新增** | 无 | 不要建命令框架 | T04 / T02 |
| Delete/Backspace | 非 Slide / global / 多选被挡住并 `setStatus` | **同一限制**（源码级） | **同一限制** | 语义：V8 `deleteSelectedNodes`（多选原子）；路由：新写 `deleteCurrentSelection` | V8 `editorStore.test.ts`；V9 无对等默认路径 E2E | 数据层能删，入口不能删 | T02 / T05 / T07 / T08 |
| 多选 | 画布可多选；键盘复制/删除拒绝 length≠1 | 同左 | 同左 | V8 store 多选剪贴板 | `editorStore.test.ts` clipboard | 右键/图层/键盘必须同一 snapshot | T02 / T05 |
| 剪贴板 | V9：`Ctrl+C/V` →「复制/粘贴暂不可用」；`Ctrl+D` 仅 Slide 单选非 global | 同左 | 同左 | V8 `copySelectedNodes`/`pasteNodes`/`clipboardNodes` 仍在 `e2e34aa` store | `editorStore.test.ts` 约 L1377 | 直接复用会写入 V8 `project` | T02 / T05 / T09B |

### 6.4 全局层与 surface 共享作者入口

| 能力 | 当前事实 | e2e34aa | 7f04a8a | 最佳 donor | 现有测试 | 风险 | 建议 owner |
|---|---|---|---|---|---|---|---|
| 左栏全局层 | **被 `hideSharedLayerEntries: true` 藏起**；`onActivateGlobal` 仍在但 UI 不画 | **可见**「全局层」+ 可选「当前内容共用」 | **可见**（Slide） | **`e2e34aa` ScenePanel，不要工作区** | `e2e34aa` `globalLayerUi`；工作区测试已改成隐藏 | 工作区+测试一起合入会永久丢掉入口 | T06 / T04 / T10 |
| `globalLayerItems` 数据 | 仍在 Schema/新建/Player merge | 同左 | 同左 | 保持，禁止 V10 迁移 | publish/player 测试 | 扁平有效层不能替代入口 | T06 |
| 共享层编辑 | 排序/复制/删除 global 仍受限 | 同左 | 同左 | `e2e34aa` slice 错误信息 + V8 global store | `v9SlideLayerSession` | ownership-aware 未完成前保留 V8 式双入口 | T06 |

### 6.5 Flow

| 能力 | 当前事实 | e2e34aa | 7f04a8a | 最佳 donor | 现有测试 | 风险 | 建议 owner |
|---|---|---|---|---|---|---|---|
| 创建 | 模型 `addCourseSurface('flow')`；**纯 Slide 壳策略下按钮被拿掉**；无「空白流式工程」 | 左栏 **始终** `onAddFlowSurface`；新建仍只有 Slide | **无 UI/store action** | 创建命令：`e2e34aa` store；三类空白：T03 新做 | `flowStructuralEntry`、`scenePanelSurfaceNav` | 工作区策略与总纲 4.1 冲突 | T03 / T07 |
| 页面—标题树 | `buildFlowEditorView` outline = heading+section 平铺；location 绑单个 `blockId` | 同左（`flowEditorView` 仅 +10） | 无 | `e2e34aa` 读模型；树合同要新做 | `flowEditorView.test.ts`、`flowWorkspace` | 工作区 +647 可能混入非树 UI | T07 |
| 编辑 | 结构工具条/键盘/属性在 e2e34aa 已有；工作区加就地与图层 | 有 `T-FIX-FLOW-ENTRY` / `T-FLOW-*` | 无作者 UI | `e2e34aa` 为底，工作区逐段摘 | `flowWorkspace`、`flowUnifiedLayerEntry` | 整文件覆盖会带回壳策略耦合 | T07 |
| Player/导出 | `FlowSurfaceHost` + producer | 同左 | Host 文件在，作者试运行未接 | `e2e34aa` + `3b073c4` | `coursePublishPipeline`、player flow 测试 | Mixed 目录用工作区 picker 需 T09 审 | T07 / T09 |

### 6.6 Spatial

| 能力 | 当前事实 | e2e34aa | 7f04a8a | 最佳 donor | 现有测试 | 风险 | 建议 owner |
|---|---|---|---|---|---|---|---|
| 创建 | 同 Flow：模型有，纯 Slide 下入口被藏；无空白无限画布工程 | 左栏始终 `onAddSpatialSurface` | 无 | `e2e34aa` `addCourseSurface('spatial-2d')`；`world.bounds.mode='infinite'` | `spatialWorkspaceAuthoring`、`spatialCameraSession` | 与 T03 三类创建绑定 | T03 / T08 |
| 无限画布 | 创建为 infinite；view 用 `spatialFiniteBounds` 算显示包围 | 同左 | 无 workspace | `e2e34aa` `spatialEditorView` / `SpatialWorkspace` | `spatialEditorCommands`、e2e `v9SpatialAuthoring` | 工作区 +345 需审 world/viewport 分离 | T08 |
| 镜头/路径/关系 | session 命令在 store；工作区补 inspector/负坐标等（部分已在 e2e34aa 收口提交） | 已有 camera/path/relation 全链 | 无 | `e2e34aa`（`9d92f00`/`6ee0bc6`/`91221e4` 等已合入） | `spatialPathPipeline`、`spatialCameraCommands` | 不要从 7f04a8a 重放这些 integrate | T08 |
| Player/导出 | Host 在；工作区修 `setLocationId` 失败回滚 + 进度源 | Host 在，picker 仍偏 scene | Host 在 | `e2e34aa` 为底；工作区 `PublishedCourseApp`/`SpatialSurfaceHost` 窄摘 | `publishedCourseSpatial`、`spatialSurfaceHost*` | 与 T09 目录合同重叠 | T08 / T09 |

### 6.7 Pure/Mixed 与跨 surface 目录

| 能力 | 当前事实 | e2e34aa | 7f04a8a | 最佳 donor | 现有测试 | 风险 | 建议 owner |
|---|---|---|---|---|---|---|---|
| 推导 | 未跟踪 `deriveCourseEditorLayout`：按被引用 surface type 去重，≥2 为 mixed；不写工程 | 无独立模块；`courseLocations` 始终传给 ScenePanel | 无跨 surface 左栏 | **工作区 `courseEditorLayout.ts`（只收纯函数）** | `courseEditorLayout.test.ts`（未跟踪） | App 用结果 **隐藏** 创建入口 — 拒绝该用法 | T03 |
| 无 `projectMode` | `src` 无该字段 | 无 | 无 | 保持 | — | 勿把 layout 写入 archive | T03 / T09B |
| 跨 surface 目录 | 工作区 Player 改为全部 location；作者左栏 mixed 才 `showCourseLocationNav` | 作者侧已有 `v9ScenePanelCourseLocations` + `c9c3a94` | 无 | 作者：`e2e34aa`；Player：工作区 `#pickerLocations` | `scenePanelSurfaceNav`、工作区 e2e | 两套目录语义必须与 locations 顺序一致 | T03 / T09 / T10 |
| 三类空白新建 | **没有**；New 只有 Slide；`addCourseSurface('slide')` 模型有、App 未接 | 同「没有空白 Flow/Spatial 工程」 | 更没有 | 新做，不要 CourseStudio 菜单 | 无默认路径测试 | 只靠导入形成 Mixed 违反总纲 | T03 / T09B |

### 6.8 当前工作区新增回归与可保留实现

| 能力 | 当前事实 | e2e34aa | 7f04a8a | 最佳 donor | 现有测试 | 风险 | 建议 owner |
|---|---|---|---|---|---|---|---|
| 隐藏全局入口 | 回归 | 无此回归 | 无 | **不要** | 工作区测试已适应回归 | 最高 | T06/T10 恢复可见 |
| 纯 Slide 藏 Flow/Spatial 创建 | 回归 | 无 | N/A | **不要** | `editorShellMultiSurface` 工作区改写 | 与 T03 冲突 | T03/T10 |
| 壳折叠 | session-only useState，未进 store | 无 | 无 | 可保留思路，不得藏能力 | `editorShellCollapse.test.tsx` 未跟踪 | 与热点 CSS 缠在一起 | T10 以后 |
| 全局控制器 session | 可保留 API | 无这批 export | 无 | 工作区 `v9SlideVerticalSlice` 窄摘 | 工作区 `v9SlideLayerSession` +76 store 测试 | 勿带「定位」产品动作 | T06 |
| Player 全 location 目录 | 可保留 | scene 去重 picker | 更旧 | 工作区 `PublishedCourseApp` | `publishedCourseSpatial` 工作区 +92 | 与作者目录对齐 | T09 |
| `courseEditorLayout` | 可保留纯函数 | 无 | 无 | 工作区新文件 | 自带 unit | 禁止持久化 | T03 |
| `courseAiHandoff`/`Patch` | 未挂载；产品未 import | 无 | 无 | **不纳入基线** | 自带 unit | 宣传成可用工作流违规 | 无（T11 只标 reserved） |
| 行为图 172→178 + 截图重捕 | 合同污染 | 172 keep | 同 e2e34aa 合同 | **丢弃工作区版本** | 工作区 map | T12 会假绿或假红 | T11/T12 |
| Flow/Spatial 大段 UI | 部分可摘 | 已有可用版本 | 无 | 先 `e2e34aa`，再 diff 工作区 | 工作区大量 + 行测试 | 与壳/折叠耦合 | T07/T08 |

---

## 7. Wave 1 冻结输入（给 T02/T03/T04）

1. **恢复 HEAD**：`e2e34aa29ddb72abb2c691e414a4d8f461f35b2c`。本工作区保留不动。
2. **V9 单一真相已成立**；不要为了 V8 表面再开 `CourseStudioApp` 或 `?editor=legacy-v8`。
3. **全局层入口以 `e2e34aa` 为准（可见）**；工作区隐藏是回归。
4. **右键无 donor**；Delete/剪贴板 donor 是同仓库 V8 store 方法，必须改写成 V9 command，不能 `createNewProject()`。
5. **`14890bb` 用例名是底线**，文件内容以 `e2e34aa` 的 JSON 为准（172 例）；不得采用工作区 178 例图。
6. **三类创建、页面—标题树、右键** 在 `e2e34aa` 均未完成，属新工作，不是 cherry-pick。
7. **Focusky / 可见 AI** 不在本轮；`courseAi*` 保持未挂载。
8. 热点文件所有权见 `00_INDEX.md` §5；本审计不改它们。

---

## 8. 取证命令（已执行）

```powershell
git status --short
git branch --show-current
git rev-parse HEAD
git log --oneline e2e34aa29ddb72abb2c691e414a4d8f461f35b2c..HEAD
git diff --stat e2e34aa29ddb72abb2c691e414a4d8f461f35b2c
git cat-file -e 'e2e34aa29ddb72abb2c691e414a4d8f461f35b2c^{commit}'
git cat-file -e '7f04a8a4286280209e7cb04982001bf047d09126^{commit}'
git cat-file -e '3e41ec0^{commit}'
git cat-file -e '378c195^{commit}'
git cat-file -e '14890bb^{commit}'
git cat-file -e '6361641^{commit}'
git show e2e34aa:src/renderer/ProductApp.tsx
git show 3e41ec0:src/renderer/ProductApp.tsx
git diff --name-only 7f04a8a e2e34aa -- src/renderer/ui src/renderer/course src/player
```

未运行 Vitest / typecheck / build / E2E。
