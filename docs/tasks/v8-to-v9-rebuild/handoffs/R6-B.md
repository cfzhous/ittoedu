HANDOFF
- task: R6-B
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 在产品 worktree 落地只读课树投影 `buildCourseTreeView(project)`：固定共享内容 → 全局层（全课）；`pages[]` 按 surface/location 出现顺序为每个 surface 生成父节点（id = surfaceId）；Slide 子节点为无 stateId 的 scene location；Flow 子节点调用 `listFlowCourseTreePages` 的 heading/section；Spatial 子节点为「本页镜头」分组 + camera frame location。未改 ScenePanel / App / store / Workspace / flowEditorView / spatialEditorView / courseEditorLayout。未 commit。未开始 R6-A/C/Z。
- owned files changed (product worktree, new):
  - `src/renderer/course/courseTreeView.ts`
  - `tests/unit/courseTreeView.test.ts`
  计划侧：本 HANDOFF。
- donor files/functions consulted:
  - `git show 4755034:src/renderer/course/courseEditorLayout.ts` → `buildCourseStructureViewModel` / `CoursePageTreeNode` shape、`SHARED_CONTENT_SECTION_ID` / `GLOBAL_LAYER_ENTRY_ID`、slide scene 过滤、spatial camera 分组
  - 产品只读：`src/renderer/course/flowEditorView.ts` → `listFlowCourseTreePages`
  - 产品只读：`src/shared/courseProjectTypes.ts` → CourseLocation / surfaces
- focused validation command:
  ```
  npx vitest run tests/unit/courseTreeView.test.ts
  git add -N src/renderer/course/courseTreeView.ts tests/unit/courseTreeView.test.ts
  git diff --check -- src/renderer/course/courseTreeView.ts tests/unit/courseTreeView.test.ts
  git reset
  ```
- validation result: Vitest 1 file / 6 tests passed。`git diff --check` 无输出、exit 0（新文件先 `git add -N` 再 check，随后 `git reset`）。
- validation entry / fixture / backend:
  - entry: `buildCourseTreeView`、`collectCourseTreeNodeIds`
  - fixture: `createBlankCourseProject` + `addSlideScene`（两 scene）；`createBlankFlowCourseProject` + heading-only blocks + `syncFlowCourseLocations`；`createBlankSpatialCourseProject` + `addSpatialCameraFrameFromSession`（≥2 镜头）；双 Slide surface + `mixedPrintPlan`；22 scene location 单 surface
  - backend: 纯 in-memory Course Project V9；未接 ScenePanel / store
- validation proves / does not prove:
  - proves: 固定 `shared`/`globalEntry` 非 location、不写 history；Slide/Flow/Spatial 三类 pages 层级与稳定 id；Flow 只投影 heading/section；Spatial 保留「本页镜头」分组；两套 Slide surface 均出现；20+ location 时 id 唯一
  - does not prove: 未接 ScenePanel 渲染/滚动；未测像素滚动；未跑 typecheck/build/E2E/视觉
- narrow UI smoke, if authorized: 未授权；未启动 App。
- INTEGRATION_REQUESTS:
  ```
  INTEGRATION_REQUEST
  - requester task: R6-B
  - target stage integrator: R6-Z
  - target hotspot file: src/renderer/ui/ScenePanel.tsx
  - exported symbol / callback: buildCourseTreeView
  - required user-visible behavior: 左栏一棵课树同时显示 Slide 场景、Flow 页+标题、Spatial 页+「本页镜头」镜头列表；共享内容 → 全局层固定在最上；切页仍走现有 location 激活；paragraph / world item 不上树。
  - focused test proving lane side: tests/unit/courseTreeView.test.ts
  - exact wiring requested: ScenePanel 用 `buildCourseTreeView(project)` 替换/合并现有三套纯态树；pages 按 `view.pages` 渲染 surface 父节点与子节点；`view.shared.globalEntry` 驱动全局层入口；Spatial 保留 `cameras:${surfaceId}` 分组与 `add-spatial-camera` 按钮（R6-Z 接线，不在本 lane 改 ScenePanel）。
  - risk if omitted: Mixed 工程左栏仍分裂为三套互不通信的树；新增 surface 后旧 scene/page/camera 可能从 UI 消失
  - status: implemented
  ```
- DECISION_REQUESTS: 无
- remaining risks / untested full checks:
  - 未跑 `npm run typecheck` / `npm test` / `npm run build` / E2E / 视觉回归（R8）
  - Flow section 嵌套在 `listFlowCourseTreePages` 返回扁平 headings 时以同级节点投影（与当前 ScenePanel Flow 树一致）；R6-Z 若需层级缩进需消费 `level` 字段
  - 无 location 的 orphan surface 会出现在 `pages[]` 但 children 为空
- rollback point: 删除产品 worktree 中上述 2 个未跟踪文件与计划侧本 HANDOFF。基线仍为 `f272756`。
- execution state: lane_candidate
- integration state: pending
- quality state: unverified

## 冻结接口（实际导出名）

### `src/renderer/course/courseTreeView.ts`

| 符号 | 角色 |
|---|---|
| `buildCourseTreeView(project)` | 只读课树 view model |
| `collectCourseTreeNodeIds(view)` | 测试/helper：收集树上全部稳定 id |
| `SHARED_CONTENT_SECTION_ID` / `GLOBAL_LAYER_ENTRY_ID` / `SPATIAL_CAMERA_GROUP_LABEL` | 稳定 id 与分组文案常量 |

### View model 字段

```ts
CourseTreeViewModel {
  shared: {
    id: 'shared-content'
    kind: 'shared-content'
    label: '共享内容'
    globalEntry: {
      id: 'global-layer'
      kind: 'global-layer'
      label: '全局层'
      rangeLabel: '全课'
      isLocation: false
      writesHistory: false
    }
    entries: [globalEntry]
  }
  pages: CourseTreeNode[]  // 每个 surface 一个父节点，id = surfaceId
}

CourseTreeNode {
  id, kind, surfaceId, surfaceType, label, locationId,
  isLocation, writesHistory, children
}
```

| surface.type | 父节点 kind | children |
|---|---|---|
| slide | `slide-page` | `slide-scene`（无 stateId 优先） |
| flow | `flow-page` | `flow-heading` / `flow-section`（来自 `listFlowCourseTreePages`） |
| spatial-2d | `spatial-page` | 一个 `spatial-camera-group`（label「本页镜头」）→ `spatial-camera` |

Surface 顺序：先按 `project.locations` 首次出现的 surfaceId，再追加 `project.surfaces` 中尚未出现的 surface。
