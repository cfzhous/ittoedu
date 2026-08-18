HANDOFF
- task: R8-FIX-TSC-TABS
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 清掉 R8-C 记在 `PropertiesTab.tsx` 的 **2** 条、`NodesTab.tsx` 的 **1** 条 `tsc --noEmit` 错误。Properties：用 `content.nativeType === 'teacher-controller'` 收窄后再交给 `teacherControllerPropertiesPreview`；`fitSpatialSessionToWorldContent` 补上编辑画布视口 `{ viewportWidth: CANVAS_WIDTH, viewportHeight: CANVAS_HEIGHT }`（1280×720，与 `spatialCameraCommands` 单测一致，不是导出 1120×760）。Nodes：图层行只取 `Pick<SceneNode, 'id' | 'name' | 'type' | 'visible' | 'locked'>`，去掉无效的 `as SceneNode` fallback。未用 `as any`。未改教师可见交互、图层语义、CUT 默认 V9。未改 `editorStore.ts`、`Workspace.tsx`、`ScenePanel.tsx`、`App.tsx`。未领取 R8-E。未 commit。
- owned files changed:
  - 产品 worktree：
    - `src/renderer/ui/PropertiesTab.tsx`（nativeType 收窄；fit 补第二参）
    - `src/renderer/ui/NodesTab.tsx`（`NodesTabRowNode` Pick；合法 fallback）
  - 计划侧：本 HANDOFF；`00_INDEX.md` 本行状态改为 `lane_candidate`
- donor files/functions consulted:
  - `teacherControllerPropertiesPreview` / `TeacherControllerLayoutSource`（`v9TeacherControllerAuthoring.ts`、`teacherControllerLayout.ts`）
  - `isCourseTeacherControllerLayerItem`（只读，未改；本任务用 `nativeType` discriminant）
  - `fitSpatialSessionToWorldContent` / `SpatialWorldContentFitInput`（`spatialCameraCommands.ts`）
  - `CANVAS_WIDTH` / `CANVAS_HEIGHT`
  - `courseLayerItemToSceneNode`、`EffectiveLayerProjectionRow`
  - [`R8-C.md`](R8-C.md)、[`R8-C-TRIAGE.md`](R8-C-TRIAGE.md)
- focused validation command:
  ```
  npx tsc --noEmit --pretty false
  npx vitest run tests/unit/v9GlobalLayerUiAdapter.test.tsx tests/unit/v9SlideProductIntegration.test.tsx
  git diff --check -- src/renderer/ui/PropertiesTab.tsx src/renderer/ui/NodesTab.tsx
  ```
  工作目录：产品 worktree。Windows PowerShell。`tsc` 只用来确认本任务文件不再出现，**不是**全仓库 Gate。
- validation result:

  ### 开始前环境（产品 worktree）

  | 项 | 值 |
  |---|---|
  | `git branch --show-current` | `codex/v8-to-v9-rebuild` |
  | `git rev-parse HEAD` | `f27275658c6dfaa12f2ce35cd9368dcdebe99451` |
  | `node --version` | `v24.14.0` |
  | `npm --version` | `11.9.0` |
  | `git status --short`（本任务文件） | 两文件已是 `M`（R3–R7 未提交接线 + 本任务类型对齐） |

  修复前同一次 `tsc --noEmit --pretty false` 过滤本任务文件：**3** 条。
  - `PropertiesTab.tsx(1200,47)` TS2345：`NativeNodeData<…>` 联合不能赋给 `TeacherControllerLayoutSource`
  - `PropertiesTab.tsx(1972,65)` TS2554：`fitSpatialSessionToWorldContent` 缺第二参
  - `NodesTab.tsx(232,50)` TS2352：fallback 对象 `as SceneNode` 与 `SceneNode` 不重叠

  ### 修复后

  | # | 命令 | exit | 结果 |
  |---|---|---:|---|
  | 1 | `npx tsc --noEmit --pretty false` 过滤 `PropertiesTab.tsx` / `NodesTab.tsx` | 过滤器无匹配 | 本任务文件 **0** 条 `error TS`。同一次 tsc 仍有 **49** 条错误在 store/壳层/其他测试，**未宣称全仓库已绿**。 |
  | 2 | `npx vitest run tests/unit/v9GlobalLayerUiAdapter.test.tsx tests/unit/v9SlideProductIntegration.test.tsx` | **0** | 2 files / **10** tests passed，3.56s。两文件都会 render `NodesTab` / `PropertiesTab`。 |
  | 3 | `git diff --check -- src/renderer/ui/PropertiesTab.tsx src/renderer/ui/NodesTab.tsx` | **0** | 无输出。文件已 tracked，未 `git add -N`。 |

  结束后 HEAD 未变，未 commit。

- validation entry / fixture / backend:
  - entry: `PropertiesTab` 控制器 layout preview、Spatial「适配全部内容」、`NodesTab` 有效图层行投影
  - fixture: `v9GlobalLayerUiAdapter.test.tsx` / `v9SlideProductIntegration.test.tsx` 既有 V9 candidate 工程
  - backend: Course Project V9 candidate；jsdom Vitest；未接 Electron
- validation proves / does not prove:
  - proves: 授权两文件 3 条 typecheck 错误已用合法 narrowing / 类型对齐消失；上述 10 项会渲染 Nodes/Properties 的单测仍过
  - does_not_prove: 全仓库 `tsc` / `npm run typecheck`（electron/e2e 项目未作为本任务 Gate）；`v9GlobalLayerUiAdapter.test.tsx`（1）与 `v9SlideProductIntegration.test.tsx`（4）测试文件自身仍有 TS 错误，属其他簇；真实图层拖排、控制器预览窗口、Spatial 适配按钮手感
- narrow UI smoke, if authorized: 未授权，未开 App / Electron。
- INTEGRATION_REQUESTS: 无。本任务只修授权 Tab 类型，不接线。
- DECISION_REQUESTS: 无。
- remaining risks / untested full checks:
  - 全仓库 `tsc --noEmit` 仍有 **49** 条：`editorStore.ts` 20、`v9SlideTextTransaction.test.ts` 13、`Workspace.tsx` 7，以及若干 v9 测试。热点归 R8-FIX-STORE / R8-FIX-PREVIEW / R8-FIX-SHELL。复跑全量 typecheck 归 R8-C-RECHECK。
  - Spatial「适配全部内容」现按编辑画布 1280×720 计算 AABB zoom；未接 Workspace 实时窗口尺寸。未改导出视口 1120×760。
  - 未跑 `npm run typecheck` 链式 electron/e2e tsconfig、`npm test`、`build:desktop`、E2E、视觉。未领取 R8-E。
- rollback point: 产品 worktree HEAD 仍为 `f272756`。回滚本任务 = 还原上述两文件里的 nativeType 收窄、`CANVAS_*` fit 第二参、`NodesTabRowNode` Pick（不要整文件还原，两文件含其他 lane 未提交接线）。
- execution state: `lane_candidate`
- integration state: `n/a`
- quality state: `unverified`

禁止用语核对：未写 `art candidate` / `accepted`；未把本任务标成项目级 `engineering candidate`。
