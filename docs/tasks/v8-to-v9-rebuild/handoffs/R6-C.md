HANDOFF
- task: R6-C
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 交付跨 surface 动作路由薄层与 `courseAuthoringSession` token。`routeEditorAction` 按 `scope + surfaceKind` 选择 `global | slide | flow | spatial` adapter；Flow delete 子路由 `document | overlay` 供 R6-Z 接线 `executeFlowDelete` / `executeFlowSharedDelete` 语义。切页 bump `generation`、清空 `itemIds`；composing 未提交拒绝切页；陈旧 token 回调拒绝。未改 App/store/Workspace/RightSidebar/ScenePanel/R4/R5 命令。未 commit。未开始 R6-A/B/Z。
- owned files changed:
  - `src/renderer/course/editorActionTypes.ts`（新建）
  - `src/renderer/course/editorActionRouting.ts`（新建）
  - `src/renderer/authoring/courseAuthoringSession.ts`（新建）
  - `tests/unit/editorActionRouting.test.ts`（新建）
  - `tests/unit/courseAuthoringSession.test.ts`（新建）
  - 计划包 `handoffs/R6-C.md`
- donor files/functions consulted:
  - `git show 4755034:src/renderer/course/editorActionRouting.ts`
  - `git show 4755034:src/renderer/course/editorActionTypes.ts`
  - `artifacts/R6_R8_EXECUTION_PLAYBOOK.md` §2.5
  - `08_R6_MIXED_AND_COURSE_STRUCTURE.md` §5
  - `01_SHARED_EXECUTION_CONTRACT.md` §4–6、§10
  - 只读：`executeSlideSceneAction`、`executeFlowDelete`、`executeFlowSharedDelete`、`deleteSpatialWorldLayersInSession`、`effectiveLayerCommands` / `globalLayerCommands`、`resolveFlowTextHistoryAction`（composing 语义对齐）
- donor 舍弃部分:
  - CourseStudio `EditorAuthoringOwner` 全表与 `global|surface` 二选一 adapter 模型
  - `interpretEditorEntry` / 完整右键菜单 availability 矩阵（R6-Z 按需接线）
  - Player 上一/下一 / `MixedCourseNavigator`（R7-B）
- focused validation command:
  ```
  npx vitest run tests/unit/editorActionRouting.test.ts tests/unit/courseAuthoringSession.test.ts
  git add -N src/renderer/course/editorActionRouting.ts src/renderer/course/editorActionTypes.ts src/renderer/authoring/courseAuthoringSession.ts tests/unit/editorActionRouting.test.ts tests/unit/courseAuthoringSession.test.ts
  git diff --check -- src/renderer/course/editorActionRouting.ts src/renderer/course/editorActionTypes.ts src/renderer/authoring/courseAuthoringSession.ts tests/unit/editorActionRouting.test.ts tests/unit/courseAuthoringSession.test.ts
  git reset
  ```
- validation result: Vitest 2 files / 11 tests passed。`git diff --check` 无输出、exit 0。
- validation entry / fixture / backend:
  - entry: `routeEditorAction`、`switchCourseAuthoringLocation`、`guardCourseAuthoringSessionCallback`
  - fixture: mock adapters + `createBlankFlowSurface` + `enterFlowTextEditing` → `executeFlowDelete`
  - backend: Course Project V9 命令只读调用，无 UI
- validation proves / does not prove:
  - proves: 切 location 后 `itemIds` 清空且 `generation` bump；slide/flow/spatial/global delete 走不同 adapter；Flow text focus delete 走 `document` 路由且不触发 overlay adapter；stale token 拒绝；三类 surface 均可 `scope: global`；锁定项写操作拒绝；1 个真实 Flow text delete fixture 调通 `executeFlowDelete`
  - does not prove: 未接 App 快捷键/Delete/复制；未接真实 slide/spatial adapter 实现；未跑 typecheck/build/E2E；Player 切页仍属 R7-B
- narrow UI smoke, if authorized: 无（R6-Z）
- INTEGRATION_REQUESTS:
  ```
  INTEGRATION_REQUEST
  - requester task: R6-C
  - target stage integrator: R6-Z
  - id: R6C-R6Z-01
  - target hotspot file: src/renderer/App.tsx, src/renderer/store/editorStore.ts
  - exported symbol / callback: routeEditorAction, createCourseAuthoringSession, switchCourseAuthoringLocation, guardCourseAuthoringSessionCallback, selectionSnapshotFromSession
  - required user-visible behavior: Delete/复制/剪切/粘贴/重复/undo 快捷键与顶栏动作改走 routeEditorAction；切页时 switchCourseAuthoringLocation 换 session token 并清 selection itemIds；异步回调带 generation 校验
  - focused test proving lane side: tests/unit/editorActionRouting.test.ts, tests/unit/courseAuthoringSession.test.ts
  - exact wiring requested: App/store 捕获 EditorSelectionSnapshot → adapters 注入各 surface 现有命令；Flow delete 按 resolveFlowDeleteRoute 选 executeFlowDelete vs executeFlowSharedDelete
  - risk if omitted: Mixed 切页 selection/Delete/快捷键串页
  - status: implemented
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R6-C
  - target stage integrator: R7-B
  - id: R6Z-R7B-01
  - target hotspot file: src/player/**, 整课预览壳层
  - exported symbol / callback: n/a（本 lane 未实现 Player 导航）
  - required user-visible behavior: Player 上一/下一/目录/声音路由到现有课程会话；不要在 R6 做第二套 Navigator
  - focused test proving lane side: n/a
  - exact wiring requested: R7-B 组装 Mixed 试运行与整课预览
  - risk if omitted: 试运行只能单 surface，不能 Mixed 纵切
  - status: open
  ```
- DECISION_REQUESTS: 无
- remaining risks / untested full checks:
  - 未跑 `npm run typecheck` / build / E2E / 视觉回归（R8）
  - R6-Z 需实现真实 slide/spatial/global adapter 绑定，本 lane 仅导出路由与 session API
  - undo/redo 路由 id 已预留，具体 history 绑定留给 R6-Z 与各 surface workspace
- rollback point: 删除上述 5 个源/测试文件与本 HANDOFF
- execution state: lane_candidate
- integration state: n/a
- quality state: unverified

## 路由表

| 条件 | adapter |
|---|---|
| `snapshot.scope === 'global'` | `adapters.global` |
| `surfaceKind === 'slide'` | `adapters.slide` |
| `surfaceKind === 'flow'` | `adapters.flow` |
| `surfaceKind === 'spatial-2d'` | `adapters.spatial` |

Flow delete 子路由（`resolveFlowDeleteRoute`）：

| focus / scope | route | R6-Z 目标语义 |
|---|---|---|
| `text` / `block` | `document` | `executeFlowDelete` 文档/块 |
| `overlay` | `overlay` | `executeFlowSharedDelete` 浮层 |
| `global` 且非 overlay | `refuse` | 拒绝 |

守卫：

- `focus === 'text'` + slide/spatial → 拒绝图层 delete（Flow 除外，走 document）
- 锁定 `itemIds` → 拒绝写动作
- `switchCourseAuthoringLocation({ composing: true })` → 拒绝切页

## Session token 形状

```ts
interface CourseAuthoringSessionToken {
  locationId: string
  surfaceType: 'slide' | 'flow' | 'spatial-2d'
  revision: number
  generation: number  // switchLocation 时 +1
}

interface CourseAuthoringSession {
  token: CourseAuthoringSessionToken
  itemIds: string[]   // 切页清空
}
```

`selectionSnapshotFromSession` 把 token 投影为 `EditorSelectionSnapshot`（含 `sessionGeneration`）供路由层使用。

## 未改热点确认

未修改：`App.tsx`、`editorStore.ts`、`Workspace.tsx`、`RightSidebar.tsx`、`ScenePanel.tsx`、R4 Flow 命令、R5 Spatial 命令、`src/renderer/authoring` 下 Spatial world authoring 文件。
