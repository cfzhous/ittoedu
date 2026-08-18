HANDOFF
- task: R8-B
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 关闭 `PRE-R8-02` 的 lane 实现：左栏统一课树恢复同一父级拖排。顶层 page 走薄 store `reorderCourseSurfaces`；同一 Slide 页 scene 映射 `sceneId` 后走已有 `reorderScenes`；同一「本页镜头」camera 走已有 `runSpatialCommand` + `reorderSpatialCameraFramesInSession`。flow-heading/section 不可拖。命令写入 V9 工程且可撤销。未改 Workspace / App / `courseTreeView` / CSS。未 commit。未开始 R8-E。无 Electron。
- owned files changed (product worktree):
  - `src/renderer/ui/ScenePanel.tsx`（`@dnd-kit` `DndContext` / `useSortable` / `GripVertical` / `PointerSensor` `distance: 5` + `KeyboardSensor`；导出 `planCourseTreeReorder`）
  - `src/renderer/store/editorStore.ts`（仅：import `reorderCourseSurfaces as applyReorderCourseSurfaces`；接口与实现增加薄 `reorderCourseSurfaces(surfaceIds)` → `persistCourseProjectCommand(...)`）
  - `tests/unit/courseLocationCommands.test.ts`（追加 mixed surface reorder / 拒绝不完整列表）
  - `tests/unit/scenePanelReorder.test.tsx`（新建：testid/grip、跨父级拒绝、page/scene/camera 写入与 undo）
  计划侧：本 HANDOFF
- donor files/functions consulted:
  - `git show f272756:src/renderer/ui/ScenePanel.tsx` → `DndContext` / `useSortable` / `GripVertical` / `reorderScenes` / `activationConstraint: { distance: 5 }`（未整文件覆盖）
  - 产品 `NodesTab.tsx` 的 grip + `drag-handle` class
  - 已有 `reorderCourseSurfaces`（`courseLocationCommands.ts`，未重写）
  - 已有 `reorderScenes`、`reorderSpatialCameraFramesInSession`、`persistCourseProjectCommand`、`addCourseContent`
  - `10_R8` §11.3、`artifacts/R6_R8_EXECUTION_PLAYBOOK.md`、共享合同
- focused validation command:
  ```
  npx vitest run tests/unit/courseLocationCommands.test.ts tests/unit/scenePanelReorder.test.tsx
  git add -N tests/unit/courseLocationCommands.test.ts tests/unit/scenePanelReorder.test.tsx
  git diff --check -- src/renderer/ui/ScenePanel.tsx src/renderer/store/editorStore.ts tests/unit/courseLocationCommands.test.ts tests/unit/scenePanelReorder.test.tsx
  git reset -- tests/unit/courseLocationCommands.test.ts tests/unit/scenePanelReorder.test.tsx
  ```
- validation result: Vitest 2 files / 11 tests passed。`git diff --check` 无输出、exit 0。随后 pathspec `git reset`，新测试文件保持未跟踪。
- validation entry / fixture / backend:
  - entry: `planCourseTreeReorder`；store `reorderCourseSurfaces` / `reorderScenes` / `runSpatialCommand(reorderSpatialCameraFramesInSession)`；`buildCourseTreeView` 渲染 testid
  - fixture: `createBlankCourseProject` mixed add Flow+Spatial；默认 V9 Slide session；`createNewSpatialProject` + 额外 camera
  - backend: in-memory Course Project V9（Slide candidate / Spatial session）；未接真实窗口
- validation proves / does not prove:
  - proves: 同一父级 page → `reorderCourseSurfaces` 一次 revision 且 undo 恢复；同一 slide-page 下 scene 映射全部 `sceneId` 后 `reorderScenes` 且 undo 恢复；同一 camera-group 下 camera → `reorderSpatialCameraFramesInSession` 且 undo 恢复；跨父级与 flow-heading 计划为 `null`；`course-page-tree` / `scene-item-*` / `flow-heading-*` / `spatial-camera-*` / `add-content-primary` 仍在；grip 在 page/scene/camera，不在 heading
  - does not prove: 未跑真实指针拖动手势 / Electron / 保存重开窗口；未跑 typecheck、全量 Vitest、build、E2E、三视口、17 项体验
- narrow UI smoke, if authorized: 未授权；本 lane 无 Electron（槽由 R8-A 占用）。窗口证明留给以后。
- INTEGRATION_REQUESTS:
  ```
  INTEGRATION_REQUEST
  - requester task: 教师 / R8-B
  - target stage integrator: R8-B（本 lane 已接线 ScenePanel + 薄 store；窗口证明不在本 lane）
  - target hotspot file: src/renderer/ui/ScenePanel.tsx
  - exported symbol / callback: planCourseTreeReorder；useEditorStore.reorderCourseSurfaces；reorderScenes；reorderSpatialCameraFramesInSession
  - required user-visible behavior: 左栏统一课树可拖排同一父级页面/场景/镜头；命令写入 V9 工程；可撤销；跨父级放置拒绝；flow heading/section 不可拖
  - focused test proving lane side: tests/unit/scenePanelReorder.test.tsx；tests/unit/courseLocationCommands.test.ts
  - exact wiring requested: 无额外中央接线。R8-A/H 窗口证明拖排手势与保存重开。
  - risk if omitted: 教师在真实窗口看不到拖排或撤销
  - id: PRE-R8-02
  - status: implemented
  ```
- DECISION_REQUESTS: 无
- remaining risks / untested full checks:
  - 未跑 `npm run typecheck` / `npm test` / `npm run build` / `npm run build:desktop` / `npm run test:e2e` / 三视口 / 17 项体验 / `npm run verify`（R8-C/D/E/F/G/H；禁止本 lane 跑）
  - 在 Flow/Spatial session 拖 Slide scene 时，ScenePanel 会先 `activateCourseLocation` 再调用已有 `reorderScenes`（后者只接 Slide candidate backend）；未做窗口手势验证
  - jsdom 未模拟 `@dnd-kit` 指针拖满距离；证明靠 `planCourseTreeReorder` + 真实 store 命令
- rollback point: 还原产品 worktree `ScenePanel.tsx` 与 `editorStore.ts` 本任务三处薄改；删除 `tests/unit/scenePanelReorder.test.tsx`；去掉 `courseLocationCommands.test.ts` 本任务追加用例。基线仍为 `f272756`。
- execution state: lane_candidate
- integration state: pending（`PRE-R8-02` → implemented；verified 需窗口）
- quality state: unverified
