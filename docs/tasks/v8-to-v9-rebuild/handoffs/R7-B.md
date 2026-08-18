HANDOFF
- task: R7-B
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 在产品 worktree **只新建组装文件**，把已有 Flow/Spatial host 与最小 Slide V2 adapter 编成 `CoursePlayer` + Mixed **location** 导航。`next`/`previous` 走 Published V2 `locations` 顺序；切 surface 时 `releaseSurfaceSession`（实质 `suspend`/`destroy` 由 host 释放相机与会话）；global 显隐调用现有 `isGlobalLayerItemVisible` / host `setLocationId`，不重写内核。运行会话只吃 V2 payload，不回写 `CourseProjectDocument`。未改 App / store / Workspace / ScenePanel / TopToolbar / PlayerApp / FlowSurfaceHost / SpatialSurfaceHost / `buildStandaloneHtml` / `buildWebPackage` / `SurfaceRuntimeAuthoring`。未开始 R7-A/C/D/E/Z、R6、R8。未 commit。本 lane 为 integration candidate。
- owned files changed (product worktree):
  - `src/player/surfaces/SurfaceHost.ts`（新建，薄接口）
  - `src/player/surfaces/CoursePlayer.ts`（新建）
  - `src/player/surfaces/mixed/MixedCourseNavigator.ts`（新建）
  - `src/player/surfaces/publishedDynamicHosts.ts`（新建，薄工厂；**不是**供体 899 行 compositor）
  - `src/player/surfaces/slide/SlidePublishedAdapter.ts`（新建，最小 V2 Slide adapter）
  - `tests/unit/publishedCourseNavigation.test.ts`（新建）
  - `tests/unit/playerHostActions.test.ts`（追加 CoursePlayer 会话断言；保留原 component host actions 用例）
  计划侧：本 HANDOFF。未改账本（`R7B-R7Z-01` / 整课预览 verified 仍归 R7-Z）。
- donor files/functions consulted:
  - `git show 4755034:src/player/surfaces/CoursePlayer.ts`（`releaseSurfaceSession` = suspend；切 active 先释放上一 surface）
  - `git show 4755034:src/player/surfaces/mixed/MixedCourseNavigator.ts`（状态机骨架；改为 **location** 顺序，不再只按 surface 下一页）
  - `git show 4755034:src/player/surfaces/SurfaceHost.ts`（薄类型；补 `setLocationId?`）
  - 产品只读：`FlowSurfaceHost` / `SpatialSurfaceHost.fromPublishedCourse`、`flowLocationTryRun` / `spatialLocationTryRun`、`buildPublishedCourseV2Payload`、`addCourseFlowPage` / `addCourseSpatialPage` / `addCourseScene`、`isGlobalLayerItemVisible`
- donor 舍弃部分:
  - 整文件供体 `publishedDynamicHosts.ts`（~899 行，依赖不存在的 `SlideSurfaceHost` / `SurfaceRuntimeAuthoring`）
  - 供体 `PublishedCourseApp.ts` 第二播放器
  - 覆盖 `PlayerApp.ts`；把三类都投影成 `buildStandaloneHtml`
  - import 正在由 R7-E 写的 `SurfaceRuntimeAuthoring.ts`
  - 改现有 host 内部、试运行按钮、Workspace 预览
- focused validation command:
  ```
  npx vitest run tests/unit/publishedCourseNavigation.test.ts tests/unit/playerHostActions.test.ts
  git add -N src/player/surfaces/CoursePlayer.ts src/player/surfaces/SurfaceHost.ts src/player/surfaces/mixed/MixedCourseNavigator.ts src/player/surfaces/publishedDynamicHosts.ts src/player/surfaces/slide/SlidePublishedAdapter.ts tests/unit/publishedCourseNavigation.test.ts
  git diff --check -- src/player/surfaces/CoursePlayer.ts src/player/surfaces/SurfaceHost.ts src/player/surfaces/mixed/MixedCourseNavigator.ts src/player/surfaces/publishedDynamicHosts.ts src/player/surfaces/slide/SlidePublishedAdapter.ts tests/unit/publishedCourseNavigation.test.ts tests/unit/playerHostActions.test.ts
  git reset -- src/player/surfaces/CoursePlayer.ts src/player/surfaces/SurfaceHost.ts src/player/surfaces/mixed/MixedCourseNavigator.ts src/player/surfaces/publishedDynamicHosts.ts src/player/surfaces/slide/SlidePublishedAdapter.ts tests/unit/publishedCourseNavigation.test.ts
  ```
- validation result: Vitest 2 files / 6 tests passed，2.30s。`git diff --check` 无输出、exit 0。新文件随后 `git reset`，仍为 untracked（`playerHostActions.test.ts` 保持已跟踪修改）。
- validation entry / fixture / backend:
  - entry: `createPublishedCourseSession`、`CoursePlayer.mountSurface/activateSurface/releaseSurfaceSession/destroy`、`MixedCourseNavigator.next/previous/goToLocation/goToIndex/listCatalog/getProgress`
  - fixture: `createBlankCourseProject` + `addCourseScene` + `addCourseFlowPage` + `addCourseSpatialPage` + `buildPublishedCourseV2Payload`；global 文本 `include` 仅首页 location；fake `SurfaceHost` 记录调用顺序
  - backend: Published Course V2 in-memory + jsdom；未接 Workspace / App 预览按钮 / Electron
- validation proves / does not prove:
  - proves: Mixed location 顺序与目录索引；`next`/`previous` 边界返回 `null`；进度 `index/total/ratio`；同 surface 切 location **不** `suspend`；跨 surface 调用 `releaseSurfaceSession`（`suspend`）再 activate；`destroy` 拆掉全部 host；global 显隐随 active location（Slide adapter 调 `isGlobalLayerItemVisible`；Flow/Spatial 走现有 `setLocationId`）；导航后 `CourseProjectDocument` 与 V2 `locations` 未被回写
  - does not prove: 未接顶栏整课预览 / Slide 试运行按钮（R7-Z）；未改 iframe `buildStandaloneHtml`；未跑 typecheck/build/E2E/视觉；未证明 Phaser `PlayerApp` 场景
- narrow UI smoke, if authorized: 未授权；未启动 App。**不宣称整课预览已挂上。**
- INTEGRATION_REQUESTS:
  ```
  INTEGRATION_REQUEST
  - requester task: R7-B
  - target stage integrator: R7-Z
  - id: R7B-R7Z-01
  - target hotspot file: src/renderer/App.tsx, src/renderer/ui/Workspace.tsx, src/renderer/ui/TopToolbar.tsx（本任务不改）
  - exported symbol / callback: createPublishedCourseSession, PublishedCourseSession.next, PublishedCourseSession.previous, PublishedCourseSession.mount, PublishedCourseSession.destroy, CoursePlayer.releaseSurfaceSession, MixedCourseNavigator.goToLocation
  - required user-visible behavior: 整课预览与仍缺的 Slide 试运行挂 CoursePlayer 组装，消费 buildPublishedCourseV2Payload，停止用 buildStandaloneHtml 冒充三类 Player。Flow/Spatial 当前位置试运行已走真实 host，不要回退。
  - focused test proving lane side: tests/unit/publishedCourseNavigation.test.ts；tests/unit/playerHostActions.test.ts
  - exact wiring requested: 见下方「R7-Z 接线」。
  - risk if omitted: 顶栏预览/Slide 试运行仍投影派生 V8 HTML；Mixed 上一/下一在编辑器里不可达
  - status: open
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R7-B
  - target stage integrator: R7-Z
  - id: R3CUT-R7B-01
  - target hotspot file: Player iframe / Workspace 预览（本任务已完成生产者/组装；UI 接线属 R7-Z）
  - exported symbol / callback: createPublishedCourseSession；buildPublishedCourseV2Payload（已有，未改）
  - required user-visible behavior: 试运行与发布同一 V2。组装层已可从 V2 挂三类 host。
  - focused test proving lane side: tests/unit/publishedCourseNavigation.test.ts
  - exact wiring requested: 关闭本请求的生产者/组装部分为 implemented；verified 仅在 R7-Z 挂上预览 UI 且不再用派生 V8 HTML 冒充三类 Player 之后。
  - risk if omitted: CUT 已产 V2 但教师仍只看到 V8 HTML Player
  - status: implemented
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R7-B
  - target stage integrator: R7-Z / R6-Z 若仍接 Mixed 试运行上一/下一
  - id: R6Z-R7B-01
  - target hotspot file: 不要改 PlayerApp.ts。Mixed 试运行控制器/快捷键走 session.next/previous
  - exported symbol / callback: PublishedCourseSession.next, PublishedCourseSession.previous, MixedCourseNavigator.next, MixedCourseNavigator.previous
  - required user-visible behavior: Mixed 试运行上一/下一按 location 顺序，切 surface 释放上一 host 会话
  - focused test proving lane side: tests/unit/playerHostActions.test.ts（同 surface 不 suspend；跨 surface suspend）
  - exact wiring requested: 教师控制器 scene.next/previous 或试运行 chrome 调用 session.next()/previous()，不要在 PlayerApp 里做第二套导航
  - risk if omitted: Mixed 试运行只能停在当前 surface
  - status: implemented
  ```
- DECISION_REQUESTS: 无
- remaining risks / untested full checks:
  - 未跑 `npm run typecheck` / `npm test` / `npm run build` / E2E / 视觉回归（R8）
  - Slide 组装是最小 DOM adapter，不是 Phaser `PlayerApp`；完整 Slide 视觉/互动属 R7-Z/R8
  - 当前位置 Flow/Spatial 试运行未改；整课 iframe 仍可能 `buildStandaloneHtml`，直到 R7-Z 接线
  - jsdom 无 `scrollIntoView`：导航测试在 beforeAll 补了空实现，未改 FlowSurfaceHost
- rollback point: 删除产品 worktree 上述 6 个新建文件，还原 `tests/unit/playerHostActions.test.ts`。不要删除 `src/player/surfaces/flow/` 或 `spatial/`。基线仍为 `f272756`。未改热点。
- execution state: lane_candidate
- integration state: pending
- quality state: unverified

## 冻结导出（实际导出名）

### CoursePlayer.ts

| 入口 | 作用 |
|---|---|
| `new CoursePlayer(hosts, { services, onFailure? })` | 序列化各 surface 生命周期 |
| `mountSurface` / `activateSurface` / `suspendSurface` / `resumeSurface` | 宿主生命周期 |
| `releaseSurfaceSession(surfaceId)` | 切 Mixed surface 时释放会话（suspend，不 destroy host） |
| `setSurfaceLocation(surfaceId, locationId)` | 调用 host `setLocationId`（global 显隐随 location） |
| `destroySurface` / `destroy` | 拆掉 host，不泄漏 |

### MixedCourseNavigator.ts

| 入口 | 作用 |
|---|---|
| `mixedCourseDefinitionFromPublished(payload)` | V2 `locations[]` → 导航目录 |
| `new MixedCourseNavigator(definition, player)` | location 状态机 |
| `start` / `goToLocation` / `goToIndex` | 激活 surface + `setSurfaceLocation`；跨 surface 先 `releaseSurfaceSession` |
| **`next()` / `previous()`** | Mixed 试运行上一/下一；边界 `null` |
| `listCatalog()` | `{ index, id, surfaceId, kind, label }[]` |
| `getProgress()` | `{ index, total, locationId, surfaceId, ratio, atStart, atEnd }` |
| `buildMixedDeepLink` / `parseMixedDeepLink` | `#location=` |

### publishedDynamicHosts.ts

| 入口 | 作用 |
|---|---|
| `publishedDynamicHostKind(type)` | `slide \| flow \| spatial-2d` → `slide \| flow \| spatial` |
| `createPublishedSurfaceHost` / `createPublishedSurfaceHosts` | 薄工厂 → 已有 Flow/Spatial host 或 `SlidePublishedAdapter` |
| `createPublishedCourseSession(payload, options?)` | 克隆 V2，组装 player+navigator |
| `PublishedCourseSession.mount(container)` | 每 surface 一个 slot，然后 `navigator.start()` |
| **`session.next()` / `session.previous()`** | 给 Mixed 试运行 / 教师控制器 |
| `session.destroy()` | `CoursePlayer.destroy()` |

Slide 适配器实名：`src/player/surfaces/slide/SlidePublishedAdapter.ts`。

## R7-Z 接线

1. 整课预览与仍走 `buildStandaloneHtml` 的 **Slide** 试运行：
   ```ts
   const published = buildPublishedCourseV2Payload({ project, assetFiles, components })
   const session = createPublishedCourseSession(published, {
     viewport: { width, height },
   })
   await session.mount(previewRoot)
   // unmount:
   await session.destroy()
   ```
2. Mixed 上一/下一（`R6Z-R7B-01`）：`session.next()` / `session.previous()`；目录 `session.listCatalog()`；进度 `session.getProgress()`。不要改 `PlayerApp.ts`。
3. **不要**回退 `flowLocationTryRun` / `spatialLocationTryRun`。不要把 Flow/Spatial 再投影成 `buildStandaloneHtml`。
4. HTML 壳嵌入 V2 JSON 仍属 R7-C；真正 `mount` CoursePlayer 属本请求。
5. 本任务 **未** 把 `R7B-R7Z-01` 标为 verified。
