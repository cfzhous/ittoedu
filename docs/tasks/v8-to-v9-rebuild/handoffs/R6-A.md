HANDOFF
- task: R6-A
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 在产品 worktree 落地工程内 location/surface 新增命令与 Pure/Mixed 布局推导（`deriveCourseEditorLayout` + 四条 add + duplicate/rename/reorder/delete）。一次成功动作一次 `revision+1`；连续 `addCourseScene` 与跨类型 add 均保留旧 location。未改 App/store/Workspace/ScenePanel/TopToolbar 或 R4/R5 命令文件。未 commit。未开始 R6-B/C/Z、R4-Z、R7。
- owned files changed (product worktree, new):
  - `src/renderer/course/courseLocationCommands.ts`
  - `src/renderer/course/courseEditorLayout.ts`
  - `tests/unit/courseLocationCommands.test.ts`
  - `tests/unit/courseEditorLayout.test.ts`
  计划侧：本 HANDOFF。
- donor files/functions consulted:
  - `git show 4755034:src/renderer/course/courseLocationCommands.ts`（delete/reorder 意图；丢弃 courseStudioModel）
  - `git show 4755034:src/renderer/course/courseEditorLayout.ts`（location 引用 surface 集合推导 kind；丢弃 buildCourseStructureViewModel / 四模式）
  - 只读 `v9SlideVerticalSlice.ts` 私有 `mutateAddSlideScene`（location + mixedPrintPlan 语义）
  - 产品工厂：`createBlankCourseProject`、`createBlankFlowCourseProject`、`appendBlankFlowPage`、`createBlankSpatialCourseProject`、`createBlankFlowSurface`
  - `commitSlideProjectMutation`、`rejectIfStaleDocument`、`courseProjectDocumentSchema`
- focused validation command:
  ```
  npx vitest run tests/unit/courseLocationCommands.test.ts tests/unit/courseEditorLayout.test.ts
  git add -N src/renderer/course/courseLocationCommands.ts src/renderer/course/courseEditorLayout.ts tests/unit/courseLocationCommands.test.ts tests/unit/courseEditorLayout.test.ts
  git diff --check -- src/renderer/course/courseLocationCommands.ts src/renderer/course/courseEditorLayout.ts tests/unit/courseLocationCommands.test.ts tests/unit/courseEditorLayout.test.ts
  git reset
  ```
- validation result: Vitest 2 files / 16 tests passed。`git diff --check` 无输出、exit 0（新文件先 `git add -N` 再 check，随后 `git reset`）。
- validation entry / fixture / backend:
  - entry: `deriveCourseEditorLayout`；`addCourseScene` / `addCourseSlidePage` / `addCourseFlowPage` / `addCourseSpatialPage`；`deleteCourseLocation`；`duplicateCourseLocation` / `renameCourseLocation` / `reorderCourseSurfaces` / `deleteCourseSurface`
  - fixture: `createBlankCourseProject` / `createBlankFlowCourseProject` / `createBlankSpatialCourseProject` 组合 mixed；`courseProjectDocumentSchema.parse`
  - backend: in-memory V9 Course Project；未接 ScenePanel / store / Player
- validation proves / does not prove:
  - proves: 七组合 kind/primary/dropdown 表驱动全绿；同一 Slide surface 连续两次 `addCourseScene` 旧 scene location 仍在且可激活；add Flow/Spatial 后旧 location 仍在；删最后 location 中文拒绝；stale `expectedRevision` 拒绝；multi-surface 自动维护 `mixedPrintPlan`；禁止 courseStudioModel / projectMode
  - does not prove: 未接左栏 UI / 课树（R6-B）/ 跨 surface 路由（R6-C）/ 真实 Mixed 冒烟（R6-Z）；未跑 typecheck/build/E2E/视觉
- narrow UI smoke, if authorized: 未授权；未启动 App。
- INTEGRATION_REQUESTS:
  ```
  INTEGRATION_REQUEST
  - requester task: R6-A
  - target stage integrator: R6-Z
  - target hotspot file: src/renderer/ui/ScenePanel.tsx（左栏课程结构标题旁主按钮+下拉）
  - exported symbol / callback: deriveCourseEditorLayout；addCourseScene；addCourseSlidePage；addCourseFlowPage；addCourseSpatialPage
  - required user-visible behavior: 按 deriveCourseEditorLayout().kind 显示主按钮文案与 testid（playbook §2.1）；主按钮走 primary.action 对应 add 命令；下拉 add-content-menu 显示 dropdown 中未占用类型（add-slide-page / add-flow-page / add-spatial-page）；新增后旧 scene/page/camera location 全部仍在课树
  - focused test proving lane side: tests/unit/courseEditorLayout.test.ts（七组合）；tests/unit/courseLocationCommands.test.ts（连续 add scene、跨类型 add、删最后 location）
  - exact wiring requested: ScenePanel（或等价左栏壳层）读取 deriveCourseEditorLayout(project, activeLocationId)；主按钮 dispatch 对应 add* 命令并激活 returned activatedLocationId；下拉项 dispatch 其余 add*；不要新建 projectMode 或第四数据类型
  - risk if omitted: 工程内新增仍分散在旧 add-scene / add-flow-page 按钮；Mixed 主按钮语义错误；新增后旧 location 从树消失
  - status: implemented
  ```
- DECISION_REQUESTS: 无
- remaining risks / untested full checks:
  - 未跑 `npm run typecheck` / `npm test` / `npm run build` / E2E / 视觉回归（R8）
  - `addCourseFlowPage` 在单次 revision 内内联 `appendBlankFlowPage` 的 surface/location push 并补 `mixedPrintPlan`（上游 `appendBlankFlowPage` 单独调用在 2-surface 时会 schema 失败；测试已记录）
  - Flow location 删除仍委托 Flow 编辑器；Spatial 单镜头删 surface 级联
  - duplicate/rename/reorder 仅覆盖 Slide scene 为主路径；R6-Z 接线前无 UI
- rollback point: 删除产品 worktree 中上述 4 个未跟踪文件。基线仍为 `f272756`。
- execution state: lane_candidate
- integration state: pending
- quality state: unverified

## 冻结导出（实际导出名）

### courseEditorLayout.ts

- `deriveCourseEditorLayout(project, activeLocationId?)` → `{ kind, primary, dropdown, activeSurfaceId }`
- 类型：`CourseEditorLayoutKind`、`CourseEditorPrimaryAction`、`CourseEditorDropdownAction`、`CourseEditorLayoutResult`

### courseLocationCommands.ts

- `COURSE_LAST_LOCATION_REASON`
- `CourseLocationCommandResult` / `CourseLocationCommandOptions`
- `addCourseScene(project, { surfaceId, title?, expectedRevision?, now? })`
- `addCourseSlidePage(project, { title?, expectedRevision?, now? })`
- `addCourseFlowPage(project, { title?, expectedRevision?, now? })` — 同 `appendBlankFlowPage` push + `mixedPrintPlan`
- `addCourseSpatialPage(project, { title?, expectedRevision?, now? })`
- `deleteCourseLocation` / `deleteCourseSurface`
- `duplicateCourseLocation` / `renameCourseLocation` / `reorderCourseSurfaces`
