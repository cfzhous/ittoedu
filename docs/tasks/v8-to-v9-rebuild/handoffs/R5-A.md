HANDOFF
- task: R5-A
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 在产品 worktree 落地 Spatial **world/camera 模型与命令**。显式区分 world vs viewport 坐标；camera frame / home / 运行顺序是工程数据；临时 pan/zoom 是会话数据。「适合窗口」= 回首页镜头（G2）；内容 AABB 适配是另一条会话命令。未改 App / store / Workspace / ScenePanel / 任何 UI 热点，未实现 path/relation 面板，未 commit。未开始 R5-B/C/D/Z。本 lane 为 integration candidate。
- owned files changed (product worktree, new):
  - `src/renderer/course/spatialEditorView.ts`
  - `src/renderer/course/spatialAuthoringHistory.ts`（必要纯 helper：history / session / revision）
  - `src/renderer/course/spatialEditorCommands.ts`
  - `src/renderer/course/spatialCameraCommands.ts`
  - `tests/unit/spatialEditorCommands.test.ts`
  - `tests/unit/spatialCameraCommands.test.ts`
  计划侧：本 HANDOFF。未改 `07_R5`、账本、App/store/Workspace。
- donor files/functions consulted:
  - `git show 4755034:src/renderer/course/spatialEditorCommands.ts`（world insert/transform/delete、选择、一次手势一次 history）
  - `git show 4755034:src/renderer/course/spatialEditorView.ts`（layer source / authoring address）
  - `git show 4755034:src/renderer/course/spatialCameraCommands.ts`（frame CRUD、home、location 修复）
  - 断言意图：`spatialEditorCommands.test.ts`、`spatialCameraCommands.test.ts`（未整文件迁入）
  - 产品只读：`courseProjectTypes.ts` spatial-2d / world / camera；`authoringAddress.ts`；R2 `stageViewportTransform.ts`；R2-A `slideEditorCommands` / `v9SlideVerticalSlice` session 形状；R3-C 控制器必须走 viewport 矩阵
- donor 舍弃部分:
  - `courseStudioModel` / CourseStudio
  - `spatialFiniteBounds` 当作者世界边界；把 1280×720 放大成伪无限
  - `executeSpatialEditorAction` 的 path/relation/semantic-zoom 分发与 `fitSpatialCamera(finiteBounds)` 当缩放条「适合窗口」
  - `SpatialWorkspace` / 独立缩放条 / 小地图 / 粉色矩形控制器 / `SpatialLayerInspector`
  - 改 App/store/Workspace/Phaser（R5-B/Z）
- focused validation command:
  ```
  npx vitest run tests/unit/spatialEditorCommands.test.ts tests/unit/spatialCameraCommands.test.ts
  git diff --check -- src/renderer/course/spatialEditorCommands.ts src/renderer/course/spatialEditorView.ts src/renderer/course/spatialCameraCommands.ts tests/unit/spatialEditorCommands.test.ts tests/unit/spatialCameraCommands.test.ts
  ```
- validation result: Vitest 2 files / 10 tests passed，1.78s。`git diff --check` 无输出、exit 0（新文件先 `git add -N` 再 check，随后 `git reset`，仍为 untracked）。helper `spatialAuthoringHistory.ts` 一并 check，无空白错误。
- validation entry / fixture / backend:
  - entry: `openSpatialAuthoringSession`、`buildSpatialAuthoringSnapshot`、`makeSpatialAuthoringTarget`、`createSpatialWorldViewTransform` / `createSpatialViewportOverlayTransform`、world insert/transform/delete、camera frame/home/session pan/zoom、`fitSpatialSessionToHomeCamera`、`fitSpatialSessionToWorldContent`
  - fixture: 内存 V9 纯 Spatial（`world.bounds.mode = infinite`；world 项在负坐标/大范围；global HUD + teacher-controller；surface 共享层）
  - backend: 纯 Spatial domain / in-memory；未接 Workspace / Phaser / Player
- validation proves / does not prove:
  - proves: world/surface 为 world 坐标，global（含非控制器 HUD）与控制器为 viewport；world 变换可写负值与大范围且不裁回 1280×720；一次手势一次 revision；session pan/zoom 不进工程；「适合窗口」回 `camera.home` 且不写 revision；AABB 适配是另一条会话命令；snapshot/target 无 hitId、无 path/relation 符号；authoringAddress 只用 `makeAuthoringAddress`
  - does not prove: 未接真实 Workspace / 选择框 / 双击 / Phaser / Player；未证明 path/relation/semantic zoom；未跑 typecheck/build/E2E/视觉
- narrow UI smoke, if authorized: 未授权；未启动 App。
- INTEGRATION_REQUESTS:
  ```
  INTEGRATION_REQUEST
  - requester task: R5-A
  - target stage integrator: R5-B
  - target hotspot file: src/renderer/authoring/spatialWorldAuthoring.ts（新建；本任务不改 Workspace / Phaser）
  - exported symbol / callback: createSpatialWorldViewTransform、createSpatialViewportOverlayTransform、spatialWorldPointerDeltaToWorld、buildSpatialEditorView、isSpatialViewportLayer、makeSpatialAuthoringTarget；复用 R2 worldToClient / clientToWorld / clientDeltaToWorld / stageSelectionOverlayGeometry / resizeWorldFrameFromHandle
  - required user-visible behavior: 无（R5-A 无 UI）。R5-B 接上后：world 元素的选择/八向/双击与对象共用同一 world-to-screen（sessionCamera 就是视图，禁止再叠 1280×720 页缩放）。教师控制器与其它 global HUD 使用 viewport overlay 矩阵，不乘 world sessionCamera。
  - focused test proving lane side: tests/unit/spatialEditorCommands.test.ts（world vs viewport；zoom=2 时 40 CSS px = 20 world；overlay 与 R2 stage 矩阵一致且不随 world pan/zoom）
  - exact wiring requested: 见下方「R5-B 接线」。
  - risk if omitted: 选择框跟世界脱节；控制器随世界缩放被 inverse-scale 修补；双击走第二套坐标
  - status: open
  ```
- DECISION_REQUESTS: 无
- remaining risks / untested full checks:
  - 未跑 `npm run typecheck` / `npm test` / `npm run build` / E2E / 视觉回归（R8）
  - 删除世界元素若工程里已有 path/relation/semantic-zoom 引用，会在同一 revision 内做最小级联清理以保持 schema 有效；R5-A 不提供 path/relation API
  - `makeAuthoringAddress` 没有 `world` scope，world 项使用 `surface` scope；坐标空间仍是 world，写在 target.coordinateSpace
  - finite `world.bounds` 只在 view 中原样报告，R5 作者命令从不按它裁剪
- rollback point: 删除产品 worktree 中上述 6 个未跟踪文件。其他 lane 文件保持不动。基线仍为 `f272756`。
- execution state: lane_candidate
- integration state: pending
- quality state: unverified

## 冻结接口（实际导出名）

### 坐标空间

| 对象 | `source` | `coordinateSpace` | 变换 |
|---|---|---|---|
| `world.layerItems` | `world` | `world` | `createSpatialWorldViewTransform(viewport, sessionCamera)` → R2 `worldToClient` |
| 本页 `surfaceLayerItems` | `surface` | `world` | 同上 |
| `globalLayerItems`（含非控制器 HUD） | `global` | `viewport` | `createSpatialViewportOverlayTransform(viewport)` = R2 `createStageViewportTransform`，**不乘** sessionCamera |
| 教师控制器 | 任意错误挂载也强制 | `viewport` | 同上 |

World 公式：`sessionCamera` 是视口中心的世界点；`scale = zoom`；禁止「页面 zoom × 相机 zoom」。  
Viewport 公式：pointer CSS 位移 = viewport 位移，禁止 `/ worldZoom`。

### 工程数据 vs 会话数据

| 数据 | 存哪 | 命令 |
|---|---|---|
| `camera.home`、`camera.frames[]`、对应 `spatial-camera` location、运行镜头顺序 | 工程 / history / revision | `addSpatialEditorCameraFrame`、`updateSpatialCameraFramePose`、`setSpatialCameraHome`、rename/reorder/delete |
| `sessionCamera` pan/zoom、`showCameraFrames`（G1 默认 true） | 会话，不进 revision | `setSpatialSessionCamera` / pan / zoom；`fitSpatialSessionToHomeCamera`（G2）；`activateSpatialCameraFrame` |
| 内容 AABB 适配 | 会话 | `fitSpatialSessionToWorldContent`（**不是**缩放条适合窗口） |

### Session / snapshot

`openSpatialAuthoringSession`、`buildSpatialAuthoringSnapshot`、`makeSpatialAuthoringTarget`。  
Snapshot 字段：`sessionId` / `locationId` / `surfaceId` / `activeCameraFrameId` / `scope` / `selection` / `revision` / `sessionCamera` / `showCameraFrames` / `worldBoundsMode`。不含 `paths`、`relations`、`hitId`。

World 写命令要求 `scope === 'world'`。global/surface 变换返回 `wrong-owner`。locked → `locked`；陈旧 revision → `stale-revision`。一次成功 mutation：`historyEntry: true`，`revision + 1`。identity no-op 不写 history。pointer 类 pan/zoom 不写 history。

默认插入：当前会话相机中心 + V8 20px 错开（世界单位），不 clamp 到 1280×720。

## R5-B 接线

R5-A 不改 Workspace/Phaser。请 R5-B 只读本 lane 导出，用 R2 选择/双击内核：

```ts
import {
  createSpatialWorldViewTransform,
  createSpatialViewportOverlayTransform,
  isSpatialViewportLayer,
  makeSpatialAuthoringTarget,
} from '../course/spatialEditorCommands'
import {
  worldToClient,
  clientToWorld,
  clientDeltaToWorld,
  stageSelectionOverlayGeometry,
  resizeWorldFrameFromHandle,
} from './stageViewportTransform'

const worldTransform = createSpatialWorldViewTransform(viewport, session.sessionCamera)
const overlayTransform = createSpatialViewportOverlayTransform(viewport)

// world 项：对象、选择框、八向、旋转柄都走 worldTransform
// viewport/global（控制器 + HUD）：走 overlayTransform，不要传入 sessionCamera
// pointer CSS / sessionCamera.zoom = world 位移（已有 spatialWorldPointerDeltaToWorld）
// pointermove 只预览；pointerup 一次 transformSpatialWorldLayersInSession
```

命中顺序：先 viewport/global，再 world。双击只对可编辑文字/公式。禁止第二套坐标、inverse-scale 修补控制器、把 Slide 页放大冒充无限。
