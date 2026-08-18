HANDOFF
- task: R5-C
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 在产品 worktree 落地 Spatial **path / relation / semantic zoom 命令**与未挂壳的轻量专用控件。path/relation 用稳定 item ID + `makeAuthoringAddress`，不持久化 hitId。删除世界元素走 R5-A 已有级联并给出人话摘要；复制两端齐全的关系可再复制一份。camera 帧顺序与 path 途经点顺序可保存、撤销、schema/Published V2 round-trip。semantic zoom 只改可见策略，不改数据或选区。G1 镜头框开关是会话字段，不写 revision。未改 App / store / Workspace / ScenePanel / RightSidebar / PropertiesTab / NodesTab，未创建 SpatialLayerInspector，未开始 R5-B/D/Z，未 commit。本 lane 为 integration candidate。不宣称 Spatial UI 已可用。
- owned files changed (product worktree, new):
  - `src/renderer/course/spatialPathCommands.ts`
  - `src/renderer/course/spatialRelationCommands.ts`
  - `src/renderer/course/spatialSemanticZoom.ts`
  - `src/renderer/ui/SpatialCameraPanel.tsx`
  - `src/renderer/ui/SpatialPathEditor.tsx`
  - `tests/unit/spatialPathCommands.test.ts`
  - `tests/unit/spatialPathPipeline.test.ts`
  计划侧：本 HANDOFF。未改 `07_R5`、账本、R5-A 文件、热点 UI。
- donor files/functions consulted:
  - `git show 4755034:src/renderer/course/spatialPathCommands.ts`（path/relation CRUD、校验、一次 history）
  - 断言意图：`spatialPathCommands.test.ts`（schema 增量、dangling 拒绝、undo/redo）；**未**迁入 `spatialPathPipeline.test.ts` 的 SpatialWorkspace / Player host / 打印 / 小地图
  - 供体 `SpatialCameraPanel.tsx` / `SpatialPathEditor.tsx` 的字段与缓冲输入；丢掉整页 inspector、替换 Properties、Nodes 假图层
  - 供体 `spatialCameraCommands.ts` semantic zoom CRUD 形状；`spatialModel.isSpatialItemSemanticallyVisible` 的可见规则（不迁 viewport cull / minimap）
  - 产品只读：R5-A `spatialEditorCommands.ts` / `spatialCameraCommands.ts` / `spatialAuthoringHistory.ts`；`courseProjectTypes` `SpatialPathDocument` / relations / `semanticZoom`；`makeAuthoringAddress`
- donor 舍弃部分:
  - `courseStudioModel` / CourseStudio
  - `SpatialWorkspace`、独立缩放条、小地图、粉色矩形、`SpatialLayerInspector`
  - 把 `SpatialCameraPanel` 整页替换 RightSidebar / Properties
  - Player `SpatialSurfaceHost` / `renderSpatialSvgMarkup` / 打印管线作为本 lane 证明
  - 改 App/store/Workspace/Phaser（R5-Z / R5-B）
- focused validation command:
  ```
  npx vitest run tests/unit/spatialPathCommands.test.ts tests/unit/spatialPathPipeline.test.ts
  git diff --check -- src/renderer/course/spatialPathCommands.ts src/renderer/course/spatialRelationCommands.ts src/renderer/course/spatialSemanticZoom.ts src/renderer/ui/SpatialCameraPanel.tsx src/renderer/ui/SpatialPathEditor.tsx tests/unit/spatialPathCommands.test.ts tests/unit/spatialPathPipeline.test.ts
  ```
- validation result: Vitest 2 files / 10 tests passed，5.49s。`git diff --check` 无输出、exit 0（新文件先 `git add -N` 再 check，随后 `git reset`，仍为 untracked）。
- validation entry / fixture / backend:
  - entry: `addSpatialPathInSession` / `updateSpatialPathInSession` / `addSpatialRelationInSession` / `setSpatialShowCameraFrames` / `resolveSpatialPlaybackSchedule` / `deleteSpatialWorldLayersReportingReferences` / `addCopiedSpatialRelationsInSession` / `isSpatialItemSemanticallyVisible` / `SpatialPathEditor` / `SpatialCameraPanel`
  - fixture: 内存 V9 纯 Spatial（无限 world；`world-a` / `world-b`；首页镜头）
  - backend: 纯 Spatial domain / in-memory + jsdom 控件；Published V2 producer 只作数据拷贝；未接 Workspace / Phaser / Player host
- validation proves / does not prove:
  - proves: path/relation 一次动作一次 revision；authoringAddress 稳定且无 hitId；dangling/空路径/自环关系返回人话并拒绝写入；删除世界元素后 R5-A 级联清理 path/relation；两端都复制才复制关系；camera 帧顺序与 path 途经点顺序经 schema/undo/Published V2 round-trip；semantic zoom 隐藏不删数据、不改选区；G1 开关不写 revision；专用控件默认不渲染，选中 path 才出路径字段，且不含元素「文本/通用」
  - does not prove: 未接真实 Workspace / PropertiesTab / 画布命中 / Player 相机动画；未跑 typecheck/build/E2E/视觉；**不**证明 Spatial 编辑器 UI 已可用
- narrow UI smoke, if authorized: 未授权；未启动 App。控件未 import 进 App / RightSidebar。
- INTEGRATION_REQUESTS:
  ```
  INTEGRATION_REQUEST
  - requester task: R5-C
  - target stage integrator: R5-Z
  - target hotspot file: src/renderer/ui/PropertiesTab.tsx（只加分段，不改元素页签）
  - exported symbol / callback: SpatialCameraPanel、SpatialPathEditor、spatialPathEditorMode、setSpatialShowCameraFrames、addSpatialPathInSession、updateSpatialPathInSession、reorderSpatialPathWaypointsInSession、deleteSpatialPathInSession、addSpatialRelationInSession、updateSpatialRelationInSession、deleteSpatialRelationInSession、addSpatialSemanticZoomRuleInSession、updateSpatialSemanticZoomRuleInSession、deleteSpatialSemanticZoomRuleInSession、addCopiedSpatialRelationsInSession、deleteSpatialWorldLayersReportingReferences
  - required user-visible behavior: 选区为空或选中页面父节点时，属性页显示折叠段「路径与关系」（默认收起）与「语义缩放」（默认收起）；「镜头调度」可复用 SpatialCameraPanel（含 G1「显示镜头框」、播放路径下拉）。画布命中 path/relation 后，在同一属性页签增加对应轻量分段（名称/端点/箭头/线型），不要换成整页 SpatialPathEditor，也不要改「元素」页签。path/relation 不是图层行，不进 NodesTab z-order。
  - focused test proving lane side: tests/unit/spatialPathPipeline.test.ts（默认 hidden；selectedPathId 才出路径字段；G1 不写 revision）
  - exact wiring requested: 见下方「R5-Z 接线」。
  - risk if omitted: 教师看不到路径/关系/语义缩放；或再次用面板顶替普通元素 Properties
  - status: open
  ```

  ```
  INTEGRATION_REQUEST
  - requester task: R5-C
  - target stage integrator: R5-D
  - target hotspot file: src/player/surfaces/spatial/spatialModel.ts、SpatialSurfaceHost.ts（本任务不改 Player）
  - exported symbol / callback: resolveSpatialPlaybackSchedule、SpatialPlaybackStop、isSpatialItemSemanticallyVisible、spatialSemanticZoomWorldVisibility；工程/Published 字段 `world.paths`、`world.relations`、`semanticZoom`、`camera.frames`
  - required user-visible behavior: 无编辑 UI。运行态：playbackPathId 为空则按 camera.frames 顺序；否则按该 path 的 layerItemIds 顺序飞镜头。semantic zoom 只决定可见，不回写工程。
  - focused test proving lane side: tests/unit/spatialPathCommands.test.ts（resolveSpatialPlaybackSchedule 镜头顺序 vs path 途经点）；tests/unit/spatialPathPipeline.test.ts（Published V2 拷贝 paths/relations；semantic zoom 不删数据）
  - exact wiring requested: 见下方「R5-D 接线」。
  - risk if omitted: Player 只能走镜头顺序，忽略教师选的播放路径；或把 semantic zoom 当成删除
  - status: open
  ```
- DECISION_REQUESTS: 无。Schema 没有 `playbackPathId` 字段；选用哪条 path 播放目前只能作为会话/回调传给 `resolveSpatialPlaybackSchedule`。途经点顺序本身已随 `SpatialPathDocument.layerItemIds` 保存。若教师验收要求「选中的播放路径」跨保存重开，由协调者另开 schema 增量，本 lane 不改协议文件。
- remaining risks / untested full checks:
  - 未跑 `npm run typecheck` / `npm test` / `npm run build` / E2E / 视觉回归（R8）
  - 未接画布命中 path/relation；未接真实 Properties
  - `makeAuthoringAddress` 没有 path/relation carrier：实体 id 放在 `layerItemId`，`scope=surface`，`carrier=native`，`field` 为 `world.paths` / `world.relations` / `semanticZoom` / `camera.frames`。这不是图层行。
  - 产品 worktree 已有其他 lane 的 App/store/Workspace 改动与 `spatialWorldAuthoring.ts`（R5-B）；本任务未读写那些文件
- rollback point: 删除产品 worktree 中上述 7 个未跟踪文件。其他 lane 文件保持不动。基线仍为 `f272756`。
- execution state: lane_candidate
- integration state: pending
- quality state: unverified

## 命令形状（实际导出名）

### Path（`spatialPathCommands.ts`）

| 命令 | 写入 | 说明 |
|---|---|---|
| `addSpatialPath` / `addSpatialPathInSession` | 工程 +1 revision | 稳定 `path-*` id；`layerItemIds` 必须是已有 **world** 项且不重复 |
| `updateSpatialPath` / `updateSpatialPathInSession` | 工程 +1 或 no-op | id 不变；空途经点拒绝：「路径至少需要经过一个世界图层」 |
| `deleteSpatialPath` / `deleteSpatialPathInSession` | 工程 +1 | |
| `reorderSpatialPathWaypoints(InSession)` | 工程 | 即更新 `layerItemIds` 顺序，这就是 path 播放顺序 |
| `setSpatialShowCameraFrames` | **会话 only** | G1；`historyEntry: false` |
| `resolveSpatialPlaybackSchedule(project, surfaceId, playbackPathId \| null)` | 只读 | `null` → camera.frames 顺序；否则 path 途经点 |
| `deleteSpatialWorldLayersReportingReferences` | 调用 R5-A 删除 | 返回 `cleanupSummary` 人话 |
| `makeSpatialPathAuthoringTarget` | 无 | `makeAuthoringAddress`，禁止 hitId |

### Relation（`spatialRelationCommands.ts`）

| 命令 | 说明 |
|---|---|
| `add/update/deleteSpatialRelation(InSession)` | 两端必须是不同 world 项；人话拒绝悬空/自环 |
| `planSpatialGraphAfterWorldCopy` / `addCopiedSpatialRelations(InSession)` | 仅当 **两端都被复制** 才复制关系；路径仍指向原图层 |
| `makeSpatialRelationAuthoringTarget` | 稳定 relation id |

### Semantic zoom（`spatialSemanticZoom.ts`）

| 命令 | 说明 |
|---|---|
| `add/update/deleteSpatialSemanticZoomRule(InSession)` | 规则写入工程 |
| `isSpatialItemSemanticallyVisible` | `zoom ∈ [min, max)` 的规则全为 visible 才显示；无匹配规则则可见 |
| `spatialSemanticZoomWorldVisibility` | 只返回 Map，不改 `layerItems` / 选区 |
| `spatialSemanticZoomKeepsSelection` | 选区 id 原样返回 |

path / relation **不是** 图层行，不得写入 `selection.selectionIds`（那是 world/global/surface 元素）。

## 引用清理语义

1. **删除 world item**：继续用 R5-A `deleteSpatialWorldLayersInSession` 的 `cascadeWorldReferences`（同一 revision）：path 去掉已删点，空 path 删除；缺任一端点的 relation 删除；semantic zoom 同样过滤，空规则删除。本任务 `summarizeSpatialWorldReferenceCleanup` 给出人话，供 UI 展示。
2. **专用 path/relation 写命令**：发现悬空引用时 **拒绝并返回人话**，不写 history（与级联删除互补：作者主动改 path 时不允许脏数据）。
3. **复制 world item**：不自动改 path。仅当一条 relation 的两端都在 `copiedIdMap` 里，才新增一条指向副本的 relation。

## R5-Z 接线

不要改元素页签。不要 `import` 进 `App.tsx` / `RightSidebar.tsx` 当整页替换。

```ts
import { SpatialCameraPanel } from './SpatialCameraPanel'
import { SpatialPathEditor } from './SpatialPathEditor'
import { setSpatialShowCameraFrames } from '../course/spatialPathCommands'

// 页面属性（选区为空 / 页面父节点）：
//   SpatialCameraPanel = 「镜头调度」默认展开；G1 checkbox → setSpatialShowCameraFrames
//   SpatialPathEditor pageSection → 「路径与关系」<details> 默认折叠
//   SpatialCameraPanel 内「语义缩放」已是 <details> 默认折叠
// 画布命中 path：<SpatialPathEditor selectedPathId={id} /> 只出路径字段
// 画布命中 relation：<SpatialPathEditor selectedRelationId={id} /> 只出关系字段
// 选中普通文字/图片：不要挂 SpatialPathEditor（默认 hidden）
```

播放路径下拉：`onPlaybackPathIdChange`。当前 Schema 无持久化字段；会话值交给 `resolveSpatialPlaybackSchedule`。镜头调度按钮接 R5-A `addSpatialCameraFrameFromSession` 等。

## R5-D 接线

```ts
import {
  resolveSpatialPlaybackSchedule,
  type SpatialPlaybackStop,
} from '../../renderer/course/spatialPathCommands'
import { isSpatialItemSemanticallyVisible } from '../../renderer/course/spatialSemanticZoom'

const stops: SpatialPlaybackStop[] = resolveSpatialPlaybackSchedule(
  publishedOrProject,
  surfaceId,
  playbackPathId, // null = 镜头顺序
)
// camera-frame → 用 stop.pose
// path-waypoint → 用该 world item 的 frame 中心飞镜头（本 lane 不实现动画）
// 可见性：isSpatialItemSemanticallyVisible(itemId, camera.zoom, surface.semanticZoom)
// 禁止回写工程
```

Published V2 已由现有 producer 拷贝 `world.paths` / `world.relations` / `semanticZoom` / `camera`。
