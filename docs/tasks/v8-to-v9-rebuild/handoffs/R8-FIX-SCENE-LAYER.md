HANDOFF
- task: R8-FIX-SCENE-LAYER
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 产品最短刀清零两条已知红。slide-scene 行按镜头删除模式加 `icon-button--danger` + `ConfirmDialog`（`confirmLabel="删除场景"`），同页场景数 > 1 才可删，确认调用 `useEditorStore.getState().deleteScene(sceneId)`。NodesTab 键盘/碰撞跳过跨 owner 的教师控制器，落到下一同 owner 行再 `reorderNodes`；丢到控制器不再 `moveCandidateLayerOwner`。store 仅加拒绝跨 owner 丢到控制器的早退。流程 1/3 定向 2 绿。未 skip，未藏控制器，未改 LASTSCENE / `planCourseTreeReorder` / `reorderCourseSurfaces` / Workspace preview / 点选切 tab / 默认 backend / `App.tsx`。未 commit。未领取 R8-G。两条都绿 → `lane_candidate`。不是 art/accepted。不是项目级 engineering candidate。
- owned files changed (product worktree):
  - `src/renderer/ui/ScenePanel.tsx`（slide-scene 危险按钮 + `pendingDeleteSceneId` 确认框）
  - `src/renderer/ui/NodesTab.tsx`（跳过教师控制器的键盘坐标 / 碰撞；同 owner 吸附后 `reorderNodes`）
  - `src/renderer/store/editorStore.ts`（仅 `moveCandidateLayerOwner` 三处拒绝跨 owner 丢到/拖出教师控制器）
  - `tests/e2e/editor.spec.ts`（`slideSceneTreeNodes` 收到 `[data-kind="slide-scene"]`，避免父级 slide-page 因后代 scene-item 被算进 nth）
  - `tests/unit/scenePanelReorder.test.tsx`（补删除场景；该文件在产品 HEAD 上仍是 untracked）
  计划侧：本 HANDOFF；`00_INDEX.md` 本行。
  **未改**：`Workspace.tsx` preview、`workspaceSlideAuthoring.ts`、默认 backend、`App.tsx`、`deleteScene` 早退、`planCourseTreeReorder` / `reorderCourseSurfaces`。
- donor files/functions consulted:
  - V8 `git show f272756:src/renderer/ui/ScenePanel.tsx`：`icon-button--danger`、`canDelete={scenes.length > 1}`、`confirmLabel="删除场景"`、`event.stopPropagation()`、`deleteScene(id)`
  - 现产品镜头删除：`pendingDeleteCameraId` + `ConfirmDialog`
  - `effectiveLayerProjection.ts`：跨 owner 丢到控制器不得假装控制器变成 scene item
  - [`handoffs/R8-FIX-SELECT-TAB.md`](R8-FIX-SELECT-TAB.md) 流程 1/3 缺口
- donor 舍弃部分:
  - 课树退回 V8 `.scene-item` class
  - 从图层列表藏教师控制器；把 spec 改成不排序
  - 重写 persist / `deleteScene` 早退 / `reorderCourseSurfaces`
  - 重开属性 tab / blob iframe / catalog 图层计数
- focused validation command:
  ```
  npx playwright test tests/e2e/editor.spec.ts -g "流程 1：场景新增|流程 3：节点层级"
  git diff --check -- src/renderer/ui/ScenePanel.tsx src/renderer/ui/NodesTab.tsx src/renderer/store/editorStore.ts tests/e2e/editor.spec.ts tests/unit/scenePanelReorder.test.tsx
  npx vitest run tests/unit/scenePanelReorder.test.tsx
  ```
  工作目录：产品 worktree。Windows PowerShell。A 前 `npm run build:renderer`（只重建 renderer，未跑 `build:desktop`）。`VITE_DEV_SERVER_URL` unset，未抢 `:5173`（仍为 PID 19296）。`--user-data-dir` 用 spec 已有 `electron-profile-${pid}`。未另开手工 App。未跑全量 `test:e2e` / `verify` / typecheck / `npm test`。
- validation result: Playwright 1.61.1。**流程 1：场景新增、排序与删除 1 passed（15.5s）**；**流程 3：节点层级排序与撤销 1 passed（54.7s）**；合计 2 passed / 1.2m。`git diff --check` 对 owned 文件无输出、exit 0。Vitest：`scenePanelReorder.test.tsx` **1 file / 4 tests passed**（31.87s）。Electron 槽已释放。
- validation entry / fixture / backend:
  - entry: Electron 编辑器（spec `launchEditor`）
  - fixture: 空白 Course Project V9
  - backend: 默认 `v9-slide-candidate`；未切回 V8
- validation proves / does not prove:
  - proves: 新增两幕后可键盘排序；nth(1) 危险按钮 +「删除场景」确认后剩「场景 3」「场景 2」；图层键盘上移跳过教师控制器，authored 名称反序且可撤销；控制器仍出现在图层列表
  - does not prove: 全量 `npm run test:e2e`（留给下一轮 R8-F-RECHECK）；typecheck；全量 Vitest；`build:desktop`；三视口；17 项体验
- narrow UI smoke, if authorized: 未授权手工窗口。
- INTEGRATION_REQUESTS:
  ```
  INTEGRATION_REQUEST
  - requester task: R8-FIX-SCENE-LAYER
  - target stage integrator: 协调者（账本 / 下一轮 R8-F-RECHECK）
  - target hotspot file: artifacts/FINAL_GATE_REPORT.md 行 R8F-SCENE-DEL-01、R8F-LAYER-DND-01
  - exported symbol / callback: ScenePanel deleteScene 确认；NodesTab 同 owner 键盘排序（跳过教师控制器）
  - required user-visible behavior: 同页多于一幕时可删除场景；图层同一来源内键盘/拖动排序；教师控制器留在全课
  - focused test proving lane side: editor.spec 流程 1 + 流程 3 共 2 绿
  - exact wiring requested: 将 R8F-SCENE-DEL-01、R8F-LAYER-DND-01 标为 implemented；全量 e2e 由下一轮 R8-F-RECHECK 关闭为 verified。不要领取 R8-G。
  - risk if omitted: 协调者仍按流程 1/3 红分类这两条
  - status: implemented
  ```
- DECISION_REQUESTS: 无。
- remaining risks / untested full checks:
  - 未跑：全量 `npm run test:e2e`、`typecheck`、`npm test`、`build:desktop`、三视口、17 项体验、`verify`
  - spec `slideSceneTreeNodes` 从「含 scene-item 后代的 `.course-page-tree__node`」收到 `[data-kind="slide-scene"]`；父级 slide-page 也会含 scene-item 后代，不收则 nth(1) 会点到页面行
  - `scenePanelReorder.test.tsx` 在产品 HEAD 上仍 untracked（重建脏树既有）；回滚需还原该文件本轮删除用例，不能只 `git checkout`
  - `editorStore.ts` 含 STORE/SHELL 等其他 lane 未提交改动；回滚本任务只还原 `refusesTeacherControllerOwnerMove` 三处早退，不要整文件 checkout
- rollback point: 产品 HEAD 仍为 `f27275658c6dfaa12f2ce35cd9368dcdebe99451`。回退本 lane：还原 `ScenePanel.tsx` 的 slide-scene 删除按钮与 `pendingDeleteSceneId` 对话框；还原 `NodesTab.tsx` 键盘/碰撞跳过与 onDragEnd 吸附；还原 `moveCandidateLayerOwner` 三处守卫；还原 `editor.spec.ts` 的 `slideSceneTreeNodes`；还原 `scenePanelReorder.test.tsx` 本轮删除用例。
- execution state: `lane_candidate`
- integration state: `pending`（流程 1/3 定向 e2e 绿；全量 e2e 待下一轮 R8-F-RECHECK）
- quality state: `unverified`

禁止用语核对：未写 `art candidate` / `accepted`；未把本任务标成项目级 `engineering candidate`；未领取 R8-G。
