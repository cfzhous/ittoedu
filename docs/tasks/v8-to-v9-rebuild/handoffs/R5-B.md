HANDOFF
- task: R5-B
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 在产品 worktree 落地 Spatial **world authoring adapter**：把 R2 命中/选择/八向/旋转/文字双击接到 R5-A 的 world-to-screen。world 项与选择框共用 `createSpatialWorldViewTransform(viewport, sessionCamera)`（sessionCamera 就是视图，`fitScale = 1`，禁止再叠 1280×720 页缩放）。教师控制器与其它 global HUD 共用 `createSpatialViewportOverlayTransform(viewport)`，不乘 sessionCamera，禁止 inverse-scale。pointermove 只预览；pointerup 一次 `transformSpatialWorldLayersInSession`。空白拖动画布是会话 pan，不写 revision。未改 App / store / Workspace / ScenePanel / RightSidebar / TopToolbar / globals.css / Phaser 场景 / R5-A 命令文件 / `stageViewportTransform.ts`。未实现 path/relation 面板。未 commit。未开始 R5-C/D/Z。本 lane 为 integration candidate。不宣称 Spatial 编辑器已可用。
- owned files changed (product worktree, new):
  - `src/renderer/authoring/spatialWorldAuthoring.ts`（必须新建；controller + Spatial 文字/公式内容会话）
  - `src/renderer/phaser/v9SpatialHitAdapter.ts`（窄命中 adapter，仿 `v9SlideHitAdapter.ts`）
  - `tests/unit/spatialWorkspaceAuthoring.test.ts`
  - `tests/unit/spatialWorldViewTransform.test.ts`
  计划侧：本 HANDOFF。未改 `07_R5`、账本、App/store/Workspace。未新建 `spatialWorldViewTransform.ts`（直接 import R5-A 导出）。
- donor files/functions consulted:
  - 计划仓库 `src/renderer/ui/spatialWorkspaceAuthoring.ts`（world group / screenControlRect / pan 方向；**未**整文件迁入）
  - 产品 `workspaceSlideAuthoring.ts`（controller 形状：pointerDown/Move/Up、preview、overlay、selectFromLayerIds）
  - 产品 `v9SlideHitAdapter.ts`、`v9SlideContentEdit.ts`（调用形状：begin/commit/draft/resolvers）、`v9TeacherControllerAuthoring.ts`（viewport 控制器不走 world 变换）
  - R5-A 只读：`createSpatialWorldViewTransform` / `createSpatialViewportOverlayTransform` / `makeSpatialAuthoringTarget` / `transformSpatialWorldLayersInSession` / insert 命令
- donor 舍弃部分:
  - 弱化 `SpatialWorkspace` / 独立缩放条 / 小地图 / 粉色矩形 / `SpatialLayerInspector` / textarea 文字
  - `clampZoom` 0.25–4 供体范围、`fitWorkspaceCamera(finiteBounds)`、`buildWorkspaceMinimap`
  - 改 App/store/Workspace/Phaser 场景（R5-Z）
  - path/relation 命中与面板（R5-C）
- focused validation command:
  ```
  npx vitest run tests/unit/spatialWorkspaceAuthoring.test.ts tests/unit/spatialWorldViewTransform.test.ts
  git diff --check -- src/renderer/authoring/spatialWorldAuthoring.ts src/renderer/phaser/v9SpatialHitAdapter.ts tests/unit/spatialWorkspaceAuthoring.test.ts tests/unit/spatialWorldViewTransform.test.ts
  ```
- validation result: Vitest 2 files / 7 tests passed，1.41s。`git diff --check` 无输出、exit 0（新文件先 `git add -N` 再 check，随后 `git reset`，仍为 untracked）。
- validation entry / fixture / backend:
  - entry: `createSpatialWorldAuthoringController`、`createSpatialWorldViewTransform` / `createSpatialViewportOverlayTransform`、`hitTestV9SpatialLayerItems`、`beginSpatialWorldContentEdit` / `commitSpatialWorldContentEdit`、`transformSpatialWorldLayersInSession`、R5-A insert、`makeSpatialAuthoringTarget` / `makeAuthoringAddress`
  - fixture: 内存 V9 纯 Spatial（infinite world；负坐标/大范围；image/video/component/runtime；global HUD + teacher-controller；surface 共享层）
  - backend: 纯 in-memory `SpatialAuthoringSession` host（getSession/setSession）；未接 store / Workspace / Phaser 游戏循环
- validation proves / does not prove:
  - proves: 命中顺序 viewport/global → world；镜头框可返回交给 R5-C 的 unimplemented，不抢 world 元素；对象/选择框/八向/旋转柄共用 world 矩阵；非 1280×720 视口下 world `scale === sessionCamera.zoom` 且 `fitScale === 1`，不等于 R2 页 fit×zoom；控制器 overlay 不随 world pan/zoom；zoom=2 时西向拖 40 CSS px = 20 world 且原点左移；pointermove 不写 revision，pointerup 一次 history；空白拖是会话 pan；双击文字/公式得到 Spatial target（无 hitId），镜头框/空白/图片不进内容会话；insert 后可命中选择
  - does not prove: 未接真实 Workspace / 缩放条 / PropertiesTab / Player；未实现 viewport 控制器拖缩写入（只证明命中与 overlay 矩阵）；未证明 path/relation 命中；未跑 typecheck/build/E2E/视觉
- narrow UI smoke, if authorized: 未授权；未启动 App。
- INTEGRATION_REQUESTS:
  ```
  INTEGRATION_REQUEST
  - requester task: R5-A
  - target stage integrator: R5-B
  - target hotspot file: src/renderer/authoring/spatialWorldAuthoring.ts
  - exported symbol / callback: createSpatialWorldViewTransform、createSpatialViewportOverlayTransform、makeSpatialAuthoringTarget
  - required user-visible behavior: 无
  - focused test proving lane side: tests/unit/spatialWorldViewTransform.test.ts
  - exact wiring requested: R5-A 接线合同已由本任务消费：world 选择/八向走 worldTransform；控制器 overlay 走 viewport 矩阵。
  - risk if omitted: （已消费）
  - status: implemented（lane 侧已满足；待 R5-Z 接到 Workspace）
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R5-B
  - target stage integrator: R5-Z
  - target hotspot file: src/renderer/ui/Workspace.tsx（本任务不改）
  - exported symbol / callback: createSpatialWorldAuthoringController、beginSpatialWorldContentEdit、commitSpatialWorldContentEdit、spatialWorldSelectionOverlay、spatialViewportHudOverlay
  - required user-visible behavior: 教师仍只看到成熟 V8 Workspace。Spatial 页复用本 controller，不渲染第二套弱画布。world 项走 worldTransform；控制器与其它 global HUD overlay 走 viewport 矩阵，不乘 sessionCamera，禁止 inverse-scale。
  - focused test proving lane side: tests/unit/spatialWorkspaceAuthoring.test.ts
  - exact wiring requested: 见下方「R5-Z：Workspace 应如何调用」。
  - risk if omitted: 选择框跟世界脱节；控制器随世界缩放；双击走第二套 textarea；空白拖误写 revision
  - status: open
  ```
- DECISION_REQUESTS: 无
- remaining risks / untested full checks:
  - 未跑 `npm run typecheck` / `npm test` / `npm run build` / E2E / 视觉回归（R8）
  - viewport/global 项可命中、可选中、overlay 走 viewport 矩阵；拖缩写入仍用 R3 `v9TeacherControllerAuthoring` / R5-Z，本 controller 不把 HUD 手势送进 `transformSpatialWorldLayersInSession`
  - 本页 `surfaceLayerItems` 按 world 坐标可命中，但 R5-A world 写命令要求 `scope === 'world'`，画布点中 surface 项不会开始 world 变换
  - 空白拖默认是会话 pan；`additive` 空白拖才是框选。空格/中键抓手留给 R5-Z 把 `canvas-view-controls` 绑到 `zoomSession` / pan
  - path/relation 命中恒不抢 world，返回交给 R5-C
- rollback point: 删除产品 worktree 中上述 4 个未跟踪文件。其他 lane 文件保持不动。基线仍为 `f272756`。
- execution state: lane_candidate
- integration state: pending
- quality state: unverified

## 冻结接口（实际导出名）

### `src/renderer/authoring/spatialWorldAuthoring.ts`

| 符号 | 角色 |
|---|---|
| `createSpatialWorldAuthoringController(host)` | 主 controller。`host = { getSession, setSession }`，不读 editorStore |
| `pointerDown` / `pointerMove` / `pointerUp` | 命中、预览、一次 transform 或会话 pan |
| `doubleClick` | 仅 world 文字/公式 → `beginSpatialWorldContentEdit` |
| `overlayGeometry` / `viewportOverlayGeometry` | world 选择框 vs HUD overlay |
| `worldTransform` / `viewportTransform` | 直接转发 R5-A 两套矩阵 |
| `insertWorldImage` 等 | 调用 R5-A insert |
| `beginSpatialWorldContentEdit` / `commitSpatialWorldContentEdit` / `commitSpatialWorldTextRunStyle` | R2-C 同类内容会话，target 为 `makeSpatialAuthoringTarget` |
| `resolveSpatialWorldContentKeyDown` 等 | 复用 `v9SlideContentEdit` resolvers |
| `hitTestSpatialDeferredOverlays` | 镜头框 → `{ kind: 'unimplemented', overlay: 'camera-frame', reason: 'handed-to-R5-C' }`；path/relation 不在此抢 hit |

结果里始终带 `worldTransform` 与 `viewportTransform`。target 无 `hitId`。

### `src/renderer/phaser/v9SpatialHitAdapter.ts`

`adaptV9SpatialLayerHit`、`hitTestV9SpatialLayerItems`（先 viewport 再 world）、`marqueeHitV9SpatialWorldLayerItems`。

### 命中顺序

```
pointerdown
  → viewport/global（控制器 + HUD）
  → world（world.layerItems + 本页 surface 共享层）
  → 镜头框 unimplemented / 交给 R5-C（不抢 world）
  → 空白：会话 pan（不写 revision）；additive 空白拖：框选
```

双击只对已命中的可编辑 world 文字/公式。镜头框、空白、图片不进内容会话。

## R5-Z：Workspace 应如何调用

本任务不改 `Workspace.tsx`。R5-Z 在同一 V8 Workspace 内接入，不要第二套 Spatial 画布。

```ts
import { createSpatialWorldAuthoringController } from '../authoring/spatialWorldAuthoring'

const spatialAuthoring = createSpatialWorldAuthoringController({
  getSession: () => spatialSession,
  setSession: (next) => { spatialSession = next },
})

const viewport = { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
const result = spatialAuthoring.pointerDown({ x: clientX, y: clientY, additive }, viewport)

// world 项：对象、选择框、八向、旋转柄都用 result.worldTransform
//   === createSpatialWorldViewTransform(viewport, session.sessionCamera)
// 教师控制器与其它 global HUD：result.viewportOverlay / result.viewportTransform
//   === createSpatialViewportOverlayTransform(viewport)
// 禁止把 sessionCamera 乘进 overlay；禁止 inverse-scale 修补控制台
// 禁止再叠 1280×720 页缩放
```

- `pointerMove` 只读 `preview` / `previewCamera`，不得在 move 里再调 transform。
- `pointerUp` 已在控制器内一次 `transformSpatialWorldLayersInSession` 或 `panSpatialSessionCamera`。
- 双击：`spatialAuthoring.doubleClick(...)` → `contentEdit.ok` 时用 `commitSpatialWorldContentEdit`；失败则不要打开 textarea。
- 缩放条改 `spatialAuthoring.zoomSession(zoom, viewport)`（只改 sessionCamera）。
- 成功 command 后需要让 React 订阅刷新（本 lane 无 store）。
- 未接本 controller 时必须继续现有路径，禁止 no-op 假成功。
