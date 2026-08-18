HANDOFF
- task: R6-Z
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 将 R6-A/B/C 接到成熟 V8 App：统一课树（`buildCourseTreeView`）、工程内 `add-content-primary` + `add-content-menu`、`addCourseContent` / `activateCourseLocation` / `courseAuthoringSession`、`routeEditorAction` Delete 路由；Mixed 纵切一次 Electron 冒烟做成（证据 `output/r6-z-smoke/`）。未改 Schema / PlayerApp / TopToolbar 三类空白工程 / FlowSurfaceHost / SpatialSurfaceHost 内部。未 commit。未开始 R7。
- owned files changed (product worktree):
  - `src/renderer/ui/ScenePanel.tsx`（统一课树 + 工程内新增；Spatial `add-spatial-camera` 保留在「本页镜头」分组）
  - `src/renderer/ui/AddCourseContentMenu.tsx`（新建）
  - `src/renderer/store/editorStore.ts`（`addCourseContent`、`activateCourseLocation`、`courseAuthoringSession`、`routeEditorAction`；`addScene` 委托 R6-A）
  - `src/renderer/App.tsx`（Delete 走 `routeEditorAction`）
  - `src/renderer/ui/Workspace.tsx`（切页 `key` 刷新；保留 Flow/Spatial 分支）
  - `src/renderer/styles/globals.css`（课树 + 菜单避让）
  计划侧：本 HANDOFF
- donor files/functions consulted:
  - `artifacts/R6_R8_EXECUTION_PLAYBOOK.md` §0、§2.1、§2.6
  - `08_R6_MIXED_AND_COURSE_STRUCTURE.md` §6
  - `01_SHARED_EXECUTION_CONTRACT.md`
  - `handoffs/R6-A.md`、`R6-B.md`、`R6-C.md`、`R4-Z.md`、`R5-Z.md`
  - R6-A `deriveCourseEditorLayout`、`addCourse*`；R6-B `buildCourseTreeView`；R6-C `routeEditorAction`、`switchCourseAuthoringLocation`
  - donor `4755034` ScenePanel / AddContentMenu 布局意图（未整文件覆盖）
- focused validation command:
  ```
  npx vitest run tests/unit/courseLocationCommands.test.ts tests/unit/courseTreeView.test.ts
  git add -N src/renderer/ui/AddCourseContentMenu.tsx
  git diff --check -- src/renderer/App.tsx src/renderer/store/editorStore.ts src/renderer/ui/ScenePanel.tsx src/renderer/ui/Workspace.tsx src/renderer/ui/AddCourseContentMenu.tsx src/renderer/styles/globals.css
  git reset src/renderer/ui/AddCourseContentMenu.tsx
  ```
- validation result: Vitest 2 files / 12 tests passed。`git diff --check` 无输出、exit 0。
- validation entry / fixture / backend:
  - entry: `addCourseScene`/`addCourseFlowPage`/`addCourseSpatialPage`；`buildCourseTreeView`；`routeEditorAction('delete')`；`AddCourseContentMenu` testid
  - fixture: 默认 Slide 工程 → 下拉 Mixed；in-memory V9 + Electron 真实窗口
  - backend: 成熟 V8 App + Course Project V9 sessions（slide / flow / spatial 分支）
- validation proves / does not prove:
  - proves: 工程内主按钮+下拉；Mixed 课树同时含 Slide scene / Flow 页+heading / Spatial 页+「本页镜头」；跨页 `activateCourseLocation` + session token；Delete 经 `routeEditorAction`（Flow document/overlay 语义保留）；顶栏 `new-spatial-project` / `new-flow-project` 仍在；paragraph/world item 不上树
  - does not prove: 未跑 typecheck/build/E2E/视觉回归；Mixed 试运行上一/下一仍缺（记 `R6Z-R7B-01`）；冒烟中切到新 Spatial 页后 `add-spatial-camera` 需先激活该页才可见（05b 未绿，主路径 05 已绿）
- narrow UI smoke, if authorized: **做成。** Vite `http://127.0.0.1:5174` + Playwright `_electron.launch`（`--user-data-dir=output/r6-z-smoke/electron-profile`，`--remote-debugging-port=9347`）。无 `VITE_V9_CANDIDATE_SMOKE`。证据：`output/r6-z-smoke/`（`01`–`08` 截图、`smoke.mjs`、控制台步骤日志）。步骤：Slide 主按钮两 scene（旧 scene 可回）→ 下拉 Flow+Spatial → Flow/Spatial 主按钮各加一页 → 三类切换+全局层 → 保存（desktopAPI）→ 顶栏空白工程入口仍在；试运行 Mixed 导航记 `R6Z-R7B-01`。
- INTEGRATION_REQUESTS:
  ```
  INTEGRATION_REQUEST
  - requester task: R6-A
  - target stage integrator: R6-Z
  - id: R6A-R6Z-01
  - status: integrated
  - suggested next: verified（Mixed 冒烟：主按钮 scene/flow/spatial 页新增；旧 location 仍在树）
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R6-B
  - target stage integrator: R6-Z
  - id: R6B-R6Z-01
  - status: integrated
  - suggested next: verified（统一课树渲染；全局层固定顶；Spatial 镜头分组 + `add-spatial-camera`）
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R6-C
  - target stage integrator: R6-Z
  - id: R6C-R6Z-01
  - status: integrated
  - suggested next: verified（App Delete → routeEditorAction；切页 session generation）
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R6-Z
  - target stage integrator: R7-B
  - id: R6Z-R7B-01
  - status: open
  - required user-visible behavior: Player / 试运行 Mixed 上一/下一/目录
  ```
- DECISION_REQUESTS: 无
- remaining risks / untested full checks:
  - Mixed 工程下 `panelLayoutForActiveLocation` 在 ScenePanel 按激活 surface 推导主按钮（`deriveCourseEditorLayout` 仍表驱动 pure/mixed kind，未改 R6-A 文件）
  - 未跑 `npm run typecheck` / build / E2E / 视觉回归（R8）
  - 冒烟 05b：`add-spatial-camera` 仅在 Spatial session 激活页显示（需树节点激活后再点 +）
- rollback point: 还原上述壳层热点；删除 `AddCourseContentMenu.tsx`
- execution state: engineering candidate for this stage
- integration state: pending（R6A/B/C-R6Z-01 → integrated；verified 由协调者改）
- quality state: unverified

## 热点接线摘要

| 热点 | 做法 |
|---|---|
| `ScenePanel.tsx` | `buildCourseTreeView` 单树；`AddCourseContentMenu`；Mixed 时按激活 surface 主按钮；`add-spatial-camera` 保留 |
| `editorStore.ts` | `addCourseContent` → R6-A 命令 + `activateCourseLocation`；`courseAuthoringSession`；`routeEditorAction` adapters |
| `App.tsx` | Delete/Backspace → `createLiveEditorSelectionSnapshot` + `routeEditorAction('delete')` |
| `Workspace.tsx` | `locationId:generation` key 强制切页刷新；第三分支不变 |
| `TopToolbar.tsx` | **未改**（三类空白工程仍在） |
