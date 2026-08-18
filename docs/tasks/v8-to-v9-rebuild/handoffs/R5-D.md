HANDOFF
- task: R5-D
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 在产品 worktree **新建独立** Spatial Player host。从 Published Course V2（或等价 in-memory published spatial document）读取已有 `world` / `camera` / `path` / `relation` 字段；运行相机从首页镜头开始，上一/下一走本页 frames 或所选 path，**不回写**工程。global / 教师控制器 / 课程 UI 固定 viewport（G3）。控制器复用 R3 `TeacherControllerDom` + `getRenderedStageBounds`（舞台=Spatial viewport CSS，不是控制器框）。未改 `PlayerApp.ts` / App / store / Workspace / `courseProjectTypes.ts`，未做粉色矩形、小地图、inverse-scale。未开始 R5-B/C/Z。未 commit。本 lane 为 integration candidate。
- owned files changed (product worktree, new):
  - `src/player/surfaces/spatial/spatialModel.ts`
  - `src/player/surfaces/spatial/spatialRuntimeSession.ts`（运行会话 helper：进入从 Published pose 重建相机，离开丢弃运行相机）
  - `src/player/surfaces/spatial/SpatialSurfaceHost.ts`
  - `tests/unit/spatialSurfaceHost.test.ts`
  - `tests/unit/spatialSurfaceHostCtrl.test.ts`
  计划侧：本 HANDOFF。未改 `07_R5`、账本、App/store/Workspace/PlayerApp。
- donor files/functions consulted:
  - `git show 4755034:src/player/surfaces/spatial/spatialModel.ts`（`spatialCameraFromPose`、world↔screen、semantic zoom 可见性）
  - `git show 4755034:src/player/surfaces/spatial/SpatialSurfaceHost.ts`（world 组 transform、screen-layer 控制器、location `visibility.mode + locationIds`、TeacherControllerDom 挂载意图）
  - 产品只读：`publishedCourseTypes.ts` / `courseProjectTypes.ts` spatial-2d；R5-A world vs viewport；R3-C `teacherControllerDom.ts` / `renderTeacherController.ts` / `teacherControllerRuntimeSession.ts`；`globalLayerVisibility.ts`（V8 `sceneIds`，本 host 用 V2 `locationIds` 同语义）
- donor 舍弃部分:
  - `SurfaceHost` / `SlideSurfaceHost` / `DomPlaybackFreeze` / component-runtime capture 工厂（产品尚无 `src/player/surfaces/` 框架，禁止借本任务建通用 adapter）
  - `buildSpatialMinimap`、运行态 `spatial-controls` 缩放条、独立缩放 chrome
  - 把控制器画进 world `foreignObject` 再 inverse-scale
  - 粉色 / `#fef2f2` 矩形控制器
  - `spatialSurfaceHostCtrl.test.ts` 里 Alt+ArrowDown `24px → 32px` 的错误坐标（把控制器框当 stage）
  - 改 `PlayerApp.ts` / 试运行 iframe / `buildStandaloneHtml`
  - 改 `courseProjectTypes.ts` 或等待 R5-C path 命令
- focused validation command:
  ```
  npx vitest run tests/unit/spatialSurfaceHost.test.ts tests/unit/spatialSurfaceHostCtrl.test.ts
  git diff --check -- src/player/surfaces/spatial tests/unit/spatialSurfaceHost.test.ts tests/unit/spatialSurfaceHostCtrl.test.ts
  ```
- validation result: Vitest 2 files / 5 tests passed，1.79s。`git diff --check` 无输出、exit 0（新文件先 `git add -N` 再 check，随后 `git reset`，仍为 untracked）。
- validation entry / fixture / backend:
  - entry: `SpatialSurfaceHost.fromPublishedCourse`、`openSpatialRuntimeSession`、`goNext` / `goPrevious` / `setPlaybackPath`、`setLocationId`、`suspend` / `resume`、`setRuntimeCamera`、`getRenderedStageBounds`、`TeacherControllerDom`
  - fixture: 内存 Published Course V2 纯 Spatial（`world.bounds.mode = infinite`；world 项负坐标；`paths`/`relations`；camera home + frames；global HUD `include` + surface 注记 `exclude`；global 真实教师控制器）
  - backend: 独立 Spatial host / jsdom；未接 PlayerApp / 试运行 iframe / Workspace
- validation proves / does not prove:
  - proves: host 从 V2 字段读取 world/camera/path/relation；viewport 不是 1280×720 Slide 页；运行相机从 home 起，上一/下一走 frames 或所选 path，且不改 published `camera`；`visibility.mode + locationIds` 对 global/surface 生效；离开/重进丢弃运行 pan/zoom，忽略传入的编辑态 `sessionCamera`；教师控制器是 R3 `slide-native-teacher-controller`（上一/下一），world zoom 0.5/1/2 与 pan 时屏幕 left/top/width/height 不变；`getRenderedStageBounds` = viewport 400×240，不是控制器 180×48
  - does not prove: 未接真实试运行 / Published Player / Workspace；未跑 typecheck/build/E2E/视觉；未证明 Phaser Slide 页上的 Spatial（本任务明确不塞）
- narrow UI smoke, if authorized: 未授权；未启动 App。**不宣称试运行已接上。**
- INTEGRATION_REQUESTS:
  ```
  INTEGRATION_REQUEST
  - requester task: R5-D
  - target stage integrator: R5-Z
  - target hotspot file: src/renderer/ui/Workspace.tsx 试运行覆盖层 / src/player/PlayerApp.ts（本任务不改）
  - exported symbol / callback: SpatialSurfaceHost.fromPublishedCourse、SpatialSurfaceHost.mount/activate/suspend/resume、goNext/goPrevious、createSpatialPlayerSessionSources、getRenderedStageBounds
  - required user-visible behavior: Spatial 试运行与整课预览走真实 SpatialSurfaceHost（无限 world + 工程相机调度 + viewport 真实教师控制台）。禁止 `buildStandaloneHtml` / `projectCandidatePreviewDocument` 把 Spatial 派生成 V8 1280×720 Slide。
  - focused test proving lane side: tests/unit/spatialSurfaceHost.test.ts；tests/unit/spatialSurfaceHostCtrl.test.ts
  - exact wiring requested: 见下方「R5-Z 接线」。
  - risk if omitted: 教师在 Spatial 试运行里仍看到假 Slide 页；控制器随 world 缩放或变成粉框；离开页面泄漏运行相机
  - status: open
  ```
- DECISION_REQUESTS: 无
- remaining risks / untested full checks:
  - 未跑 `npm run typecheck` / `npm test` / `npm run build` / E2E / 视觉回归（R8）
  - 未挂 component/runtime 真实 host（world 内为占位绘制）；R5-Z/R7 可注入，本任务不建 SlideSurfaceHost 工厂
  - 全课 iframe 仍派生 V8 HTML（`R3CUT-R7B-01`），与本 host 正交；本任务不改试运行 iframe
- rollback point: 删除产品 worktree 中上述 5 个未跟踪文件（`src/player/surfaces/spatial/` 与两个测试）。其他 lane 文件保持不动。基线仍为 `f272756`。
- execution state: lane_candidate
- integration state: pending
- quality state: unverified

## 冻结接口（实际导出名）

### 构造

| 入口 | 作用 |
|---|---|
| `SpatialSurfaceHost.fromPublishedCourse(course, viewport, options?)` | 从 Published Course V2 抽出 `spatial-2d` + `globalLayerItems` + `spatial-camera` locations |
| `new SpatialSurfaceHost(input \| course, viewport, options?)` | `input` 为等价 in-memory published spatial document（`PublishedSpatialRuntimeInput`） |
| `publishedSpatialInputFromCourse` / `openSpatialRuntimeSession` | 纯数据；运行相机只活在 session |

`options.sessionCamera` **不是** API，传入会被忽略。运行相机只读 `surface.camera.home` / frames / 所选 path。

### 运行相机（不回写）

| 数据 | 存哪 |
|---|---|
| `camera.home`、`camera.frames[]`、`world.paths`、`world.relations` | Published V2，host 只 clone 读取 |
| 运行 `camera`、`tourIndex` | `spatialRuntimeSession`，离开时 `camera = null` |
| 教师控制器 offset/collapse | host 会话 map，不写工程 |

- 打开：相机 = **首页镜头** `camera.home`
- `goNext` / `goPrevious`：无 `playbackPathId` 时走 `camera.frames`（并切到对应 `spatial-camera` location）；有 path 时走该 path 的 layer 中心点（zoom = home.zoom）
- 端点返回 `{ atBoundary: true }`，不跳到别的 surface
- `setRuntimeCamera` 只改 session；`publishedCameraSnapshot()` 仍等于打开时的工程相机
- `suspend` = `leaveSpatialRuntimeLocation`（丢弃运行相机）；`resume` = `reopenSpatialRuntimeSession`（按当前 location 的 **Published pose** 重建，不带上一次 pan/zoom，也不带编辑 sessionCamera）

### 坐标空间（G3）

| 对象 | 层 | 随 world pan/zoom |
|---|---|---|
| `world.layerItems`、非控制器的 `surfaceLayerItems`、path/relation | `[data-spatial-world]` | 是 |
| `globalLayerItems`、任意教师控制器 | `.spatial-screen-layer` `data-coordinate-space=viewport` | **否** |

世界 SVG `viewBox` = host viewport（测试 400×240），不是 1280×720 页。`world.bounds.mode = infinite` 时不画页面矩形。

### 教师控制器

复用 `TeacherControllerDom` + `teacherControllerDomNode`。`canvas` 与 `getRenderedStageBounds()` 都是 **Spatial viewport CSS 尺寸**（jsdom 下回退到构造 viewport），禁止控制器自身 `getBoundingClientRect`。播放时上一/下一默认调用 host `goNext`/`goPrevious`；若传入 `executeTeacherControllerAction` 则完全交给课程 pipeline。

## R5-Z 接线

本任务 **没有** 把 host 挂上 Player / Workspace。请 R5-Z：

```ts
import {
  SpatialSurfaceHost,
  createSpatialPlayerSessionSources,
} from '../../player/surfaces/spatial/SpatialSurfaceHost'

const host = SpatialSurfaceHost.fromPublishedCourse(publishedV2, {
  width: viewportCssWidth,
  height: viewportCssHeight,
}, {
  locationId: activeSpatialLocationId,
  playbackPathId: selectedPathId ?? null,
  playbackControls: publishedV2.playback.controls,
  initialMuted: publishedV2.media.audio.defaultMuted,
  ...createSpatialPlayerSessionSources({ audioChangeSource, courseProgressSource }),
})
await host.mount(runContainer)
await host.activate()
// 离开当前 Spatial location：await host.suspend()
// 重进：await host.resume()  —— 不要把 editor sessionCamera 或上一次运行相机传回去
```

- 试运行覆盖中央工作区时，Spatial location **必须**挂本 host。
- **不要** `projectCandidatePreviewDocument` → `buildStandaloneHtml` 把 Spatial 投影成 V8 Slide。
- 不要再画一套粉框或 Slide 页控制器；host 已创建真实 DOM 控制台。
- 不要改本 lane 文件来「顺便」接 PlayerApp。

## R7-B 可记

本 host 已按 Published Course V2 字段消费 `world` / `camera` / `paths` / `relations` / `globalLayerItems` / `locations`。与账本 `R3CUT-R7B-01`（全课 iframe 仍派生 V8 HTML）**正交**：不要在 R5-D 改试运行 iframe；R7-B 接全课 Player 时用本 host 播 Spatial，不要再为 Spatial 派生 V8 HTML。
